// Bind the owner-started Google connection callback to the initiating
// browser. This prevents an unsolicited sign-in response from linking an
// attacker's mailbox to the Workspace MCP.
import crypto from 'node:crypto';
const NAME='google_setup_nonce',AGE=600;
export const clearGoogleSetupCookie=()=>NAME+'=; Path=/api/google/callback; Max-Age=0; HttpOnly; Secure; SameSite=Lax';
export function startGoogleSetup(label='') {
 const nonce=crypto.randomBytes(24).toString('base64url'),timestamp=Date.now();
 const state=new URLSearchParams({setup:'1',nonce,issued:String(timestamp),label:String(label).slice(0,80)}).toString();
 const cookie=NAME+'='+nonce+'; Path=/api/google/callback; Max-Age='+AGE+'; HttpOnly; Secure; SameSite=Lax';
 return {state,cookie};
}
export function verifyGoogleSetup(state,header,now=Date.now()) {
 if(typeof state!=='string'||state.length>1024||typeof header!=='string')return null;
 const p=new URLSearchParams(state);
 if(p.get('setup')!=='1'||p.getAll('nonce').length!==1||p.getAll('issued').length!==1||p.getAll('label').length!==1)return null;
 const nonce=p.get('nonce'),issued=Number(p.get('issued')),label=p.get('label');
 if(!/^[A-Za-z0-9_-]{32}$/.test(nonce)||!Number.isSafeInteger(issued)||issued>now+15000||issued<now-AGE*1000||label.length>80)return null;
 const values=header.split(';').map(x=>x.trim()).filter(x=>x.startsWith(NAME+'='));
 if(values.length!==1)return null;
 const cookieNonce=values[0].slice(NAME.length+1);
 if(!/^[A-Za-z0-9_-]{32}$/.test(cookieNonce))return null;
 const first=Buffer.from(nonce),second=Buffer.from(cookieNonce);
 return first.length===second.length&&crypto.timingSafeEqual(first,second)?{label}:null;
}
