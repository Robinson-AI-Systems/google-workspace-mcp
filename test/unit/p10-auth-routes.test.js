import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
const h=vi.hoisted(()=>({
  started:null,consumed:false,accountLinks:[],codeConsumeCount:0,rotations:0,
  verifiedSub:'pilot-subject',linker:'principal-A',session:null,bindCalls:0
}));
vi.mock('../../src/db.js',()=>({
 initSchema:async()=>{},getOAuthClient:async id=>id==='registered-client'?{
   client_id:id,client_secret:'registered-secret',redirect_uris:['https://chat.example.test/cb']
 }:null,
 getAccessToken:async()=>null,consumeAuthCode:async()=>null,createAccessToken:async()=>null,
 getTokenByRefreshToken:async()=>null
}));
vi.mock('../../src/principals/store.js',()=>({
 createTransaction:async input=>{h.started=input;h.consumed=false;return true;},
 consumeTransaction:async({state,browser,purpose})=>{
   if(h.consumed||!h.started||h.started.state!==state||h.started.browser!==browser||h.started.purpose!==purpose)return null;
   h.consumed=true;
   return {...h.started,nonce_hash:createHash('sha256').update(h.started.nonce).digest('hex'),
     principal_id:h.started.principalId,policy:h.started.policy,verifier:h.started.verifier,
     client_id:h.started.clientId,redirect_uri:h.started.redirectUri,resource:h.started.resource,code_challenge:h.started.codeChallenge};
 },
 bindVerifiedIdentity:async identity=>{h.bindCalls++;return '33333333-3333-4333-8333-333333333333';},
 createSession:async()=>({secret:'p10s_'+'a'.repeat(43),csrf:'p10x_'+'b'.repeat(43)}),
 readSession:async secret=>secret==='p10s_'+'a'.repeat(43)?{
   principal_id:'33333333-3333-4333-8333-333333333333',
   csrf_hash:createHash('sha256').update('p10x_'+'b'.repeat(43)).digest('hex'),kind:'user'}:null,
 revokeSession:async()=>1,
 upsertLinkedAccount:async params=>{h.accountLinks.push(params);return 'account-a';},
 listAccounts:async()=>[],listConnections:async()=>[],deletionPreview:async()=>({previewOnly:true}),
 disconnectAccount:async()=>0,revokeConnection:async()=>0,setPrincipalDefault:async()=>null,
 issuePrincipalCode:async()=> 'p10c_'+'c'.repeat(43),
 consumePrincipalCode:async({code,verifier})=>{h.codeConsumeCount++;return code==='p10c_'+'c'.repeat(43)&&verifier==='valid-verifier'
   ?{principal_id:'33333333-3333-4333-8333-333333333333',account_id:'44444444-4444-4444-8444-444444444444',profile:'read_only',listing:'compact',areas:null,mode:'live',
     client_id:'registered-client',resource:'https://mcp.example.test/api/mcp',cost_policy:{mode:'per_action'}}:null;},
 issuePrincipalConnection:async()=>({accessToken:'p10a_test',refreshToken:'p10r_test'}),
 rotatePrincipalRefresh:async token=>{h.rotations++;return token==='p10r_test'?{accessToken:'p10a_new',refreshToken:'p10r_new'}:null;}
}));
vi.mock('../../src/principals/google.js',()=>({
 PUBLIC_SCOPE_GROUPS:{mail:['scope-mail']},
 publicGoogleClient:()=>({}),
 providerUrl:({state})=>'https://accounts.google.com/o/oauth2?state='+state,
 verifyGoogleCode:async({nonceHash})=>({issuer:'https://accounts.google.com',sub:h.verifiedSub,
   email:'user@example.test',scopeList:['scope-mail'],
   tokens:{access_token:'google-access',id_token:'validated-google-jwt',refresh_token:'google-refresh'}})
}));
const {default:start}=await import('../../api/auth/google/start.js');
const {default:callback}=await import('../../api/auth/google/callback.js');
const {default:token}=await import('../../api/oauth/token.js');
const {default:account}=await import('../../api/account.js');
const {default:logout}=await import('../../api/auth/logout.js');
const {default:session}=await import('../../api/auth/session.js');
function res(){
 const x={statusCode:200,headers:{},body:null,ended:false};
 x.setHeader=(key,v)=>{x.headers[key]=v;};
 x.getHeader=key=>x.headers[key];
 x.status=n=>{x.statusCode=n;return x;};
 x.json=v=>{x.body=v;return x;};
 x.send=v=>{x.body=v;return x;};
 x.writeHead=(n,o={})=>{x.statusCode=n;Object.assign(x.headers,o);};
 x.end=()=>{x.ended=true;return x;};
 return x;
}
const req=(method='GET',query={},cookie='',body={})=>({method,query,body,headers:{cookie}});
const sessCookie='p10_session=p10s_'+'a'.repeat(43)+'; p10_csrf=p10x_'+'b'.repeat(43);
const csrf='p10x_'+'b'.repeat(43);
let env;
beforeEach(()=>{
 env={...process.env};
 process.env.PUBLIC_BASE_URL='https://mcp.example.test';
 process.env.PUBLIC_GOOGLE_OAUTH_CLIENT_ID='public-only-google-app';
 process.env.PUBLIC_GOOGLE_OAUTH_CLIENT_SECRET='public-only-secret';
 process.env.TOKEN_ENCRYPTION_KEY='x'.repeat(44);
 process.env.PUBLIC_SIGNIN_MODE='pilot';
 process.env.PUBLIC_PILOT_GOOGLE_SUBJECTS='pilot-subject';
 h.started=null;h.accountLinks=[];h.bindCalls=0;h.consumed=false;h.rotations=0;h.codeConsumeCount=0;
 h.verifiedSub='pilot-subject';
});
afterEach(()=>{process.env=env;});
describe('P10 actual route one-use browser callback and independent principal MCP issuance',()=>{
 it('public flag OFF prevents new sign-in before creating state/provider calls',async()=>{
  process.env.PUBLIC_SIGNIN_MODE='off';
  const out=res();await start(req(),out);
  expect(out.statusCode).toBe(503);expect(h.started).toBeNull();
 });
 it('one browser-bound verified pilot login creates a session; replay and foreign cookie do not',async()=>{
  const started=res();await start(req(),started);
  expect(started.statusCode).toBe(302);
  const state=h.started.state,browser=h.started.browser;
  const wrong=res();await callback(req('GET',{state,code:'google-code'},'p10_google_browser=foreign'),wrong);
  expect(wrong.statusCode).toBe(400);expect(h.bindCalls).toBe(0);
  const good=res();await callback(req('GET',{state,code:'google-code'},'p10_google_browser='+browser),good);
  expect(good.statusCode).toBe(302);expect(h.bindCalls).toBe(1);
  expect(String(good.headers.Location)).toBe('/api/account');
  expect(JSON.stringify(good.headers['Set-Cookie'])).toContain('p10_session');
  const repeated=res();await callback(req('GET',{state,code:'google-code'},'p10_google_browser='+browser),repeated);
  expect(repeated.statusCode).toBe(400);expect(h.bindCalls).toBe(1);
 });
 it('pilot subject is enforced AFTER Google verification, not by request email or hostname',async()=>{
  const started=res();await start(req(),started);
  h.verifiedSub='not-enrolled';
  const out=res();await callback(req('GET',{state:h.started.state,code:'google'},'p10_google_browser='+h.started.browser),out);
  expect(out.statusCode).toBe(400);expect(h.bindCalls).toBe(0);
 });
 it('link requires same-origin CSRF and bound session and cannot claim owner global mailboxes',async()=>{
  const missing=res();await start(req('POST',{},sessCookie,{purpose:'link',group:'mail'}),missing);
  expect(missing.statusCode).toBe(400);expect(h.started).toBeNull();
  const begin=res();await start(req('POST',{},sessCookie,{purpose:'link',group:'mail',csrf}),begin);
  expect(begin.statusCode).toBe(302);
  const done=res();await callback(req('GET',{state:h.started.state,code:'google'},'p10_google_browser='+h.started.browser+'; '+sessCookie),done);
  expect(done.statusCode).toBe(302);
  expect(h.accountLinks).toHaveLength(1);
  expect(h.accountLinks[0]).toMatchObject({principalId:'33333333-3333-4333-8333-333333333333',scopeList:['scope-mail']});
 });
 it('MCP sign-in carries registered resource, S256, client state and redirect across Google',async()=>{
  const begin=res();
  const parameters={purpose:'mcp_authorize',client_id:'registered-client',redirect_uri:'https://chat.example.test/cb',
    code_challenge:'c'.repeat(43),resource:'https://mcp.example.test/api/mcp',state:'original-client-state'};
  await start(req('GET',parameters),begin);expect(begin.statusCode).toBe(302);
  const out=res();
  await callback(req('GET',{state:h.started.state,code:'google'},'p10_google_browser='+h.started.browser),out);
  expect(out.statusCode).toBe(302);
  const u=new URL(out.headers.Location);
  expect(u.pathname).toBe('/api/oauth/authorize');
  expect(u.searchParams.get('state')).toBe('original-client-state');
  expect(u.searchParams.get('code_challenge')).toBe(parameters.code_challenge);
  expect(u.searchParams.get('resource')).toBe(parameters.resource);
 });
 it('exact S256 code and resource permit V2 issue, never forward Google tokens',async()=>{
  const payload={grant_type:'authorization_code',client_id:'registered-client',client_secret:'registered-secret',
    code:'p10c_'+'c'.repeat(43),redirect_uri:'https://chat.example.test/cb',
    resource:'https://mcp.example.test/api/mcp',code_verifier:'valid-verifier'};
  async function call(data){
    const request=Readable.from([new URLSearchParams(data).toString()]);
    request.method='POST';request.headers={'content-type':'application/x-www-form-urlencoded'};
    const response=res();await token(request,response);return response;
  }
  expect((await call({...payload,resource:'https://evil.test/api/mcp'})).statusCode).toBe(400);
  expect((await call({...payload,code_verifier:'wrong'})).statusCode).toBe(400);
  const done=await call(payload);
  expect(done.statusCode).toBe(200);
  expect(done.body).toMatchObject({access_token:'p10a_test',refresh_token:'p10r_test'});
  expect(JSON.stringify(done.body)).not.toContain('google-access');
  expect(h.codeConsumeCount).toBe(2);
  const rotated=await call({grant_type:'refresh_token',client_id:'registered-client',
    client_secret:'registered-secret',refresh_token:'p10r_test',resource:payload.resource});
  expect(rotated.body.access_token).toBe('p10a_new');
  expect(h.rotations).toBe(1);
 });
 it('logout affects browser only; account listing is owned and requires CSRF for mutations',async()=>{
  const get=res();await session(req('GET',{},sessCookie),get);
  expect(get).toMatchObject({statusCode:200,body:{authenticated:true,linkedAccounts:[]}});
  const unauth=res();await account(req(),unauth);expect(unauth.statusCode).toBe(403);
  const read=res();await account(req('GET',{},sessCookie),read);
  expect(read.statusCode).toBe(200);expect(read.body).toContain('My Google Workspace MCP');
  const mutate=res();await account(req('POST',{},sessCookie,{action:'disconnect_account',id:'foreign'}),mutate);
  expect(mutate.statusCode).toBe(403);
  const log=res();await logout(req('POST',{},sessCookie,{csrf}),log);
  expect(log).toMatchObject({statusCode:200,body:{loggedOut:true,agentConnectionsRevoked:false}});
 });
});
