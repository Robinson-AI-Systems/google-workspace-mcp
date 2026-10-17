import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
const h=vi.hoisted(()=>({enumerations:0,issued:0,accounts:[],csrf:'p10x_'+'b'.repeat(43),loggedIn:false}));
vi.mock('../../src/db.js',()=>({
 initSchema:async()=>{},getOAuthClient:async id=>id==='registered'?{client_id:id,
  redirect_uris:['https://client.example.test/return']}:null,
 listGoogleAccounts:async()=>{h.enumerations++;return [{email:'owner-private@example.test',label:'Private owner mailbox'}];},
 createAuthCode:async()=>{},recordLoginAttempt:async()=>{},countRecentFailedLogins:async()=>0,markLoginAttemptSucceeded:async()=>{}
}));
vi.mock('../../src/auth/google-auth-hosted.js',()=>({ensureMigrated:async()=>null}));
vi.mock('../../src/principals/store.js',()=>({
 getPrincipal:async()=>null,
 createSession:async()=>({secret:'',csrf:''}),revokeSession:async()=>0,
 listAccounts:async()=>h.accounts,
 issuePrincipalCode:async()=>{h.issued++;return 'p10c_'+'c'.repeat(43);},
 readSession:async()=>h.loggedIn?{principal_id:'33333333-3333-4333-8333-333333333333',
   csrf_hash:createHash('sha256').update(h.csrf).digest('hex'),kind:'user'}:null
}));
vi.mock('../../src/oauth/login-guard.js',()=>({
 clientIp:()=>'',LOCKOUT_WINDOW_MINUTES:15,evaluateLogin:async()=>({status:'wrong',attemptsLeft:4})
}));
const {default:handler}=await import('../../api/oauth/authorize.js');
const res=()=>{
 const x={statusCode:200,headers:{},body:null};
 x.setHeader=(k,v)=>x.headers[k]=v;
 x.status=n=>{x.statusCode=n;return x};
 x.send=v=>{x.body=String(v);return x};
 x.writeHead=(n,hdr={})=>{x.statusCode=n;Object.assign(x.headers,hdr)};
 x.end=()=>x;
 return x;
};
const base={client_id:'registered',redirect_uri:'https://client.example.test/return',
 response_type:'code',state:'mcp-original-csrf',code_challenge:'c'.repeat(43),
 code_challenge_method:'S256',resource:'https://mcp.example.test/api/mcp'};
const browser='p10_session=p10s_'+'a'.repeat(43)+'; p10_csrf='+h.csrf;
async function call(method,params,cookie=''){
 const req=method==='GET'?{method,query:params,headers:{cookie}}:Readable.from([new URLSearchParams(params).toString()]);
 if(method==='POST'){req.method='POST';req.query={};req.headers={cookie,'content-type':'application/x-www-form-urlencoded'};}
 const out=res();await handler(req,out);return out;
}
let env;
beforeEach(()=>{
 env={...process.env};
 process.env.PUBLIC_BASE_URL='https://mcp.example.test';
 process.env.PUBLIC_SIGNIN_MODE='pilot';
 h.enumerations=0;h.issued=0;h.accounts=[{id:'44444444-4444-4444-8444-444444444444',email:'linked@example.test'}];h.loggedIn=false;
});
afterEach(()=>{process.env=env;});
describe('P10 MCP user authorization and original owner mailbox privacy',()=>{
 it('anonymous owner choice never enumerates connected private mailboxes',async()=>{
  const page=await call('GET',base);
  expect(page.statusCode).toBe(200);
  expect(page.body).toContain('passphrase');
  expect(page.body).not.toContain('owner-private@example.test');
  expect(h.enumerations).toBe(0);
  expect(page.body).toContain('Sign in with a separate Google account');
 });
 it('only the registered client and exact MCP resource/PKCE can start user auth',async()=>{
  const query={...base,auth_method:'google'};
  let out=await call('GET',{...query,redirect_uri:'https://foreign.example.test'});
  expect(out.statusCode).toBe(400);
  out=await call('GET',{...query,resource:'https://foreign.example.test/api/mcp'});
  expect(out.statusCode).toBe(400);
  out=await call('GET',{...query,code_challenge_method:'plain'});
  expect(out.statusCode).toBe(400);
  out=await call('GET',query);
  expect(out.statusCode).toBe(200);
  expect(out.body).toContain('/api/auth/google/start');
  expect(h.enumerations).toBe(0);
 });
 it('scopes Google agent code issuance to principal-owned account and CSRF',async()=>{
  h.loggedIn=true;
  const query={...base,auth_method:'google'};
  const page=await call('GET',query,browser);
  expect(page.statusCode).toBe(200);
  expect(page.body).toContain('linked@example.test');
  expect(page.body).not.toContain('owner-private@example.test');
  const denied=await call('POST',{...query,account_id:'foreign-uuid',csrf:h.csrf},browser);
  expect(denied.statusCode).toBe(403);expect(h.issued).toBe(0);
  const noCsrf=await call('POST',{...query,account_id:h.accounts[0].id},browser);
  expect(noCsrf.statusCode).toBe(403);expect(h.issued).toBe(0);
  const accepted=await call('POST',{...query,account_id:h.accounts[0].id,csrf:h.csrf},browser);
  expect(accepted.statusCode).toBe(302);
  const returned=new URL(accepted.headers.Location);
  expect(returned.searchParams.get('code')).toMatch(/^p10c_/);
  expect(returned.searchParams.get('state')).toBe(base.state);
  expect(h.issued).toBe(1);
  expect(h.enumerations).toBe(0);
 });
});
