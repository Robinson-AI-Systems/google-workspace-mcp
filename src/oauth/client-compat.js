// Client compatibility helpers (2026-11-09), so every major MCP client can
// connect the standard way: Claude (web, desktop, phone, Code), ChatGPT,
// Muse, Codex, Cursor, Windsurf, VS Code, Gemini CLI, MCP Inspector, Hermes.
import {redirectUriMatches} from './cimd.js';

// A visiting client card (CIMD) may list a loopback redirect without the
// ephemeral port native clients bind; every other client matches exactly.
export function redirectAllowed(client,requested){
 if(!client||typeof requested!=='string'||!Array.isArray(client.redirect_uris))return false;
 if(client.redirect_uris.includes(requested))return true;
 return client.cimd===true&&client.redirect_uris.some(registered=>redirectUriMatches(registered,requested));
}

// RFC 6749 §2.3.1: a client may send its id and secret as HTTP Basic
// credentials instead of in the form body. Fill them in when the body has
// none; a body value always wins, so nothing a client sends is overridden.
export function withBasicClientAuth(req,body){
 const header=String(req?.headers?.authorization||'');
 const match=/^Basic\s+([A-Za-z0-9+/=._-]+)\s*$/i.exec(header);
 if(!match)return body;
 let decoded;
 try{decoded=Buffer.from(match[1],'base64').toString('utf8');}catch{return body;}
 const split=decoded.indexOf(':');
 if(split<1)return body;
 const id=decodeURIComponent(decoded.slice(0,split).replace(/\+/g,'%20'));
 const secret=decodeURIComponent(decoded.slice(split+1).replace(/\+/g,'%20'));
 return {...body,client_id:body.client_id||id,client_secret:body.client_secret||secret};
}

// Browser-based MCP clients (MCP Inspector in a browser, web IDEs) need CORS
// on discovery, registration, token, revocation and the MCP endpoint. These
// endpoints are bearer- or form-authenticated and never read cookies, so any
// origin may call them. Returns true when it answered a preflight itself.
export function applyCors(req,res,methods='GET, POST, OPTIONS'){
 if(typeof res?.setHeader!=='function')return false;
 res.setHeader('Access-Control-Allow-Origin','*');
 res.setHeader('Access-Control-Allow-Methods',methods);
 res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID, Accept');
 res.setHeader('Access-Control-Expose-Headers','WWW-Authenticate, Mcp-Session-Id, MCP-Protocol-Version');
 res.setHeader('Access-Control-Max-Age','86400');
 if(req.method==='OPTIONS'){res.statusCode=204;res.end();return true;}
 return false;
}
