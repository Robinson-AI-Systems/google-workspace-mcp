// RAS MCP Standard D-006 MC-7 (owner-approved 2026-11-09): a browser that has
// just come back from Google but arrives without the sign-in it was handed
// gets a plain page saying so, never a silent trip back to Google (the
// Workspace account-picker loop). Duplicate cookies never read as signed-out.
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {createHash} from 'node:crypto';
const sha=v=>createHash('sha256').update(String(v)).digest('hex');
const h=vi.hoisted(()=>({tx:null,sessions:new Map(),proofOk:new Set(),issued:0}));
vi.mock('../../src/db.js',async importActual=>({...(await importActual()),initSchema:async()=>{},
 listGoogleAccounts:async()=>[{email:'owner@example.test',label:'Owner'}],createAuthCode:async()=>{},
 recordLoginAttempt:async()=>{},countRecentFailedLogins:async()=>0,markLoginAttemptSucceeded:async()=>{}}));
vi.mock('../../src/auth/google-auth-hosted.js',()=>({ensureMigrated:async()=>null}));
vi.mock('../../src/principals/store.js',()=>({
 getPrincipal:async()=>null,listAccounts:async()=>[{id:'44444444-4444-4444-8444-444444444444',email:'me@example.test'}],
 issuePrincipalCode:async()=>{h.issued++;return 'p10c_'+'c'.repeat(43);},
 createSession:async()=>({secret:'p10s_'+'n'.repeat(43),csrf:'p10x_'+'n'.repeat(43)}),revokeSession:async()=>0,
 readSession:async secret=>h.sessions.get(secret)||null,
 consumeTransaction:async({purpose})=>h.tx&&h.tx.purpose===purpose?(()=>{const t=h.tx;h.tx=null;return t;})():null,
 bindVerifiedIdentity:async()=>'33333333-3333-4333-8333-333333333333',
 getBoundFullPrincipal:async()=>({id:'33333333-3333-4333-8333-333333333333'}),getBoundGraduatingPrincipal:async()=>null,
 getBoundOwnerPrincipal:async()=>null,classifyBoundIdentity:async()=>null,upsertLinkedAccount:async()=>null,
 recordLinkDenial:async()=>{},recordSigninDenial:async()=>'d'
}));
vi.mock('../../src/principals/google.js',async importActual=>({...(await importActual()),publicGoogleClient:()=>({}),
 verifyGoogleCode:async()=>({issuer:'https://accounts.google.com',sub:'pilot-subject',email:'me@example.test',scopeList:[],tokens:{}})}));
vi.mock('../../src/principals/owner-migration.js',async importActual=>({...(await importActual()),
 issueOwnerLoginProof:async()=>'p10op_fresh',inspectOwnerLoginProof:async proof=>h.proofOk.has(proof),
 consumeOwnerLoginProof:async proof=>h.proofOk.has(proof),legacyNewLoginEnabled:()=>false}));
vi.mock('../../src/oauth/login-guard.js',()=>({clientIp:()=>'',LOCKOUT_WINDOW_MINUTES:15,evaluateLogin:async()=>({status:'wrong',attemptsLeft:4})}));
const {default:authorize}=await import('../../api/oauth/authorize.js');
const {default:callback}=await import('../../api/auth/google/callback.js');
const {readCookies}=await import('../../src/principals/security.js');

const BASE='https://workspace.example.test',DOC=BASE+'/.well-known/muse-client.json',CB='https://agent.meta.ai/api/hatch/oauth/callback';
const res=()=>{const x={statusCode:200,headers:{},body:null};x.setHeader=(k,v)=>{x.headers[k]=v;};x.getHeader=k=>x.headers[k];
 x.status=n=>{x.statusCode=n;return x;};x.send=v=>{x.body=String(v);return x;};x.json=v=>{x.body=v;return x;};
 x.writeHead=(n,o={})=>{x.statusCode=n;Object.assign(x.headers,o);};x.end=()=>x;return x;};
const get=async(handler,query,cookie='')=>{const out=res();await handler({method:'GET',query,headers:{cookie,host:'workspace.example.test'},url:'/'},out);return out;};
const ask={client_id:DOC,redirect_uri:CB,response_type:'code',state:'muse-state',code_challenge:'c'.repeat(43),
 code_challenge_method:'S256',resource:BASE+'/api/mcp'};
let env;
beforeEach(()=>{env={...process.env};process.env.PUBLIC_BASE_URL=BASE;process.env.PUBLIC_SIGNIN_MODE='pilot';
 process.env.PUBLIC_PILOT_GOOGLE_SUBJECTS='pilot-subject';h.tx=null;h.sessions.clear();h.proofOk.clear();h.issued=0;});
afterEach(()=>{process.env=env;});

describe('the Google return marks itself (MC-7.5)',()=>{
 it('the separate-account return sends the browser on with returned=1',async()=>{
  h.tx={purpose:'mcp_authorize',client_id:DOC,redirect_uri:CB,code_challenge:'c'.repeat(43),resource:BASE+'/api/mcp',
   verifier:'v',nonce_hash:'n',policy:{clientState:'muse-state'}};
  const out=await get(callback,{state:'p10st_x',code:'google-code'},'p10_google_browser=b');
  expect(out.statusCode).toBe(302);
  const next=new URL(out.headers.Location);
  expect(next.pathname).toBe('/api/oauth/authorize');
  expect(next.searchParams.get('returned')).toBe('1');
  expect(next.searchParams.get('auth_method')).toBe('google');
 });
 it('the linked-owner return sends the browser on with returned=1',async()=>{
  h.tx={purpose:'mcp_authorize',client_id:DOC,redirect_uri:CB,code_challenge:'c'.repeat(43),resource:BASE+'/api/mcp',
   verifier:'v',nonce_hash:'n',policy:{ownerProof:'login',clientState:'muse-state'}};
  const out=await get(callback,{state:'p10st_x',code:'google-code'},'p10_google_browser=b');
  expect(out.statusCode).toBe(302);
  const next=new URL(out.headers.Location);
  expect(next.searchParams.get('returned')).toBe('1');
  expect(next.searchParams.get('auth_method')).toBe('owner_google');
 });
});

describe('a return without its sign-in shows a plain page, never a loop (MC-7.2)',()=>{
 it('separate account: fresh start offers Google; a return with no session stops on the plain page',async()=>{
  const fresh=await get(authorize,{...ask,auth_method:'google'});
  expect(fresh.statusCode).toBe(200);expect(fresh.body).toContain('/api/auth/google/start');
  const back=await get(authorize,{...ask,auth_method:'google',returned:'1'});
  expect(back.statusCode).toBe(400);
  expect(back.body).toContain('Sign-in did not stick');
  expect(back.body).not.toContain('/api/auth/google/start');
 });
 it('linked owner: fresh start goes to Google; a return with no proof stops on the plain page',async()=>{
  const fresh=await get(authorize,{...ask,auth_method:'owner_google'});
  expect(fresh.statusCode).toBe(302);expect(fresh.headers.Location).toContain('/api/auth/google/start');
  const back=await get(authorize,{...ask,auth_method:'owner_google',returned:'1'});
  expect(back.statusCode).toBe(400);
  expect(back.body).toContain('Sign-in did not stick');
  expect(back.headers.Location).toBeUndefined();
 });
 it('a return that did keep its sign-in carries on normally',async()=>{
  h.proofOk.add('p10op_good');
  const owner=await get(authorize,{...ask,auth_method:'owner_google',returned:'1'},'p10_owner_proof=p10op_good');
  expect(owner.statusCode).toBe(200);expect(owner.body).not.toContain('Sign-in did not stick');
  const secret='p10s_'+'a'.repeat(43),csrf='p10x_'+'b'.repeat(43);
  h.sessions.set(secret,{principal_id:'33333333-3333-4333-8333-333333333333',csrf_hash:sha(csrf),kind:'user'});
  const pub=await get(authorize,{...ask,auth_method:'google',returned:'1'},`p10_session=${secret}; p10_csrf=${csrf}`);
  expect(pub.statusCode).toBe(200);expect(pub.body).toContain('Authorize this agent');
 });
});

describe('duplicate cookies never read as signed out (MC-7.3)',()=>{
 it('readCookies returns every copy',()=>{
  expect(readCookies({headers:{cookie:'a=1; b=2; a=3'}},'a')).toEqual(['1','3']);
  expect(readCookies({headers:{}},'a')).toEqual([]);
 });
 it('a stale session cookie beside the real one still signs you in, with the matching CSRF copy',async()=>{
  const secret='p10s_'+'a'.repeat(43),csrf='p10x_'+'b'.repeat(43);
  h.sessions.set(secret,{principal_id:'33333333-3333-4333-8333-333333333333',csrf_hash:sha(csrf),kind:'user'});
  const page=await get(authorize,{...ask,auth_method:'google'},
   `p10_session=p10s_${'z'.repeat(43)}; p10_csrf=p10x_${'y'.repeat(43)}; p10_session=${secret}; p10_csrf=${csrf}`);
  expect(page.statusCode).toBe(200);
  expect(page.body).toContain('Authorize this agent');
  expect(page.body).toContain('name="csrf" value="'+csrf+'"');
 });
 it('a stale owner proof beside the real one is skipped',async()=>{
  h.proofOk.add('p10op_good');
  const page=await get(authorize,{...ask,auth_method:'owner_google',returned:'1'},'p10_owner_proof=p10op_old; p10_owner_proof=p10op_good');
  expect(page.statusCode).toBe(200);expect(page.body).not.toContain('Sign-in did not stick');
 });
});
