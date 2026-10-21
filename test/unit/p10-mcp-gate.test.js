import {describe,it,expect,vi} from 'vitest';
const h=vi.hoisted(()=>({googleCalls:0,authenticated:true}));
vi.mock('../../src/db.js',()=>({
 initSchema:async()=>{},getAccessToken:async()=>null,
 touchAccessToken:async()=>{},connectionId:()=>'',getAllowedDomains:async()=>[]
}));
vi.mock('../../src/principals/store.js',()=>({
 readPrincipalAccess:async()=>h.authenticated?Object.freeze({
  principalId:'11111111-1111-4111-8111-111111111111',
  principalKind:'user',accountId:'22222222-2222-4222-8222-222222222222',profile:'full'}):null,
 legacyOwnerContext:async()=>null
}));
vi.mock('../../src/auth/google-auth-hosted.js',()=>({
 ensureMigrated:async()=>null,
 buildHostedApiClients:async()=>{h.googleCalls++;throw Error('V2 must never build owner Google clients');}
}));
vi.mock('../../src/tools/index.js',()=>({registry:{tools:[],handlers:{}}}));
const {default:handler,publicToolDispatchReady}=await import('../../api/mcp.js');
const res=()=>{
 const x={statusCode:200,headers:{},body:null};
 x.setHeader=(k,v)=>x.headers[k]=v;
 x.status=n=>{x.statusCode=n;return x};
 x.json=v=>{x.body=v;return x};
 return x;
};
describe('P10-B public bearer recognition never dispatches owner provider tools',()=>{
 it('requires both the owner-authorized pilot mode and explicit checked tenant execution flag',()=>{
   const env={PUBLIC_SIGNIN_MODE:'off',PUBLIC_P10_TOOL_EXECUTION_VERIFIED:'true'};
   expect(publicToolDispatchReady(env)).toBe(false);
   expect(publicToolDispatchReady({...env,PUBLIC_SIGNIN_MODE:'pilot',
      PUBLIC_P10_TOOL_EXECUTION_VERIFIED:'false'})).toBe(false);
   expect(publicToolDispatchReady({...env,PUBLIC_SIGNIN_MODE:'pilot'})).toBe(true);
   expect(publicToolDispatchReady({...env,PUBLIC_SIGNIN_MODE:'public'})).toBe(true);
   expect(publicToolDispatchReady({...env,PUBLIC_SIGNIN_MODE:'bad-mode'})).toBe(false);
 });
 it('recognizes signed-in user bearer but fails 403 at the P10-4 isolation gate',async()=>{
  h.authenticated=true;
  const r=res();await handler({headers:{authorization:'Bearer p10a_'+'a'.repeat(43)}},r);
  expect(r).toMatchObject({statusCode:403,body:{error:'public_dispatch_not_enabled'}});
  expect(h.googleCalls).toBe(0);
 });
 it.each(['bearer ','BEARER\t','bEaReR  '])('keeps user credentials on their isolated path with scheme %j',async prefix=>{
  h.authenticated=true;
  const r=res();await handler({headers:{authorization:prefix+'p10a_'+'a'.repeat(43)}},r);
  expect(r.statusCode).toBe(403);expect(r.body.error).toBe('public_dispatch_not_enabled');
  expect(h.googleCalls).toBe(0);
 });
 it('rejects unrecognized/forged user and owner bearer without owner fallback',async()=>{
  h.authenticated=false;
  const a=res();await handler({headers:{authorization:'Bearer p10a_'+'a'.repeat(43)}},a);
  expect(a.statusCode).toBe(401);
  const b=res();await handler({headers:{authorization:'Bearer p10r_'+'a'.repeat(43)}},b);
  expect(b.statusCode).toBe(401);
  const c=res();await handler({headers:{authorization:'Bearer unrecognized-legacy'}},c);
  expect(c.statusCode).toBe(401);
  expect(h.googleCalls).toBe(0);
 });
});
