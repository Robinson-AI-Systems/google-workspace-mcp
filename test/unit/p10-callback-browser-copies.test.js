// The Google callback gate under duplicate flow cookies (D-006 MC-7.3).
//
// On 2026-11-09 a real sign-in died at this gate with "Invalid Google
// sign-in." even though the start had issued the browser a fresh cookie:
// the browser held TWO copies of p10_google_browser (a stale copy from an
// earlier attempt beside the current one) and the gate's strict
// single-copy read (readCookie) refuses whenever more than one copy
// arrives. The server's other value-verifying doors already accept any
// matching copy (requireSession, the owner-proof door in authorize.js);
// this suite pins the callback gate to the same rule, against a mock
// store that — like the real one — only ever consumes a transaction for
// the cookie copy that flow actually issued.
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
const s=vi.hoisted(()=>({tx:null,used:false}));
vi.mock('../../src/db.js',()=>({initSchema:async()=>{}}));
vi.mock('../../src/principals/store.js',()=>({
 consumeTransaction:async()=>null,
 consumeBrowserTransaction:async({state,browsers,purpose})=>{
  for(const browser of browsers){
   if(s.used||s.tx?.state!==state||s.tx?.browser!==browser||purpose!==s.tx?.purpose)continue;
   s.used=true;return {...s.tx,principal_id:null,
    nonce_hash:'signed-nonce',verifier:'PKCE-verifier',policy:s.tx.policy};
  }
  return null;
 },
 bindVerifiedIdentity:async()=>'principal-x',
 upsertLinkedAccount:async()=>'account-x'
}));
vi.mock('../../src/principals/google.js',()=>({
 PUBLIC_SCOPE_GROUPS:{mail:['gmail-scope']},
 publicGoogleClient:()=>({}),
 verifyGoogleCode:async()=>({issuer:'https://accounts.google.com',sub:'verified-subject-345',
  email:'tester@example.test',scopeList:['openid','email','profile'],
  tokens:{access_token:'SHOULD-NOT-RENDER',refresh_token:'NOT-AN-AGENT-GRANT'}})
}));
vi.mock('../../src/principals/session.js',()=>({
 BROWSER_COOKIE:'p10_google_browser',
 setSession:async()=>{},
 requireSession:async()=>null
}));
vi.mock('../../src/principals/owner-migration.js',()=>({
 previewLegacyPilotMigration:async()=>({legacyAccount:false,migrationRequired:false,
  ownerConnectionsChanged:0,grantsChanged:false,principalCreated:false}),
 linkVerifiedOwner:async()=>true,
 issueOwnerLoginProof:async()=>'proof'
}));
import callback from '../../api/auth/google/callback.js';

function res(){
 const r={statusCode:200,headers:{},body:null,ended:false};
 r.setHeader=(k,v)=>{r.headers[k]=v;};
 r.getHeader=k=>r.headers[k];
 r.status=n=>{r.statusCode=n;return r;};
 r.send=v=>{r.body=v;r.ended=true;return r;};
 r.writeHead=(n,h)=>{r.statusCode=n;Object.assign(r.headers,h);};
 r.end=()=>{r.ended=true;return r;};
 return r;
}
const request=cookieHeader=>({
 method:'GET',
 query:{state:'good-state',code:'google-signed-test-code'},
 headers:cookieHeader===undefined?{}:{cookie:cookieHeader}
});
let before;
beforeEach(()=>{
 before={...process.env};process.env.PUBLIC_BASE_URL='https://mcp.example.test';
 process.env.PUBLIC_SIGNIN_MODE='off';
 s.tx={state:'good-state',browser:'fresh-browser',purpose:'login',policy:{pilotProbe:true}};
 s.used=false;
});
afterEach(()=>{process.env=before;});
describe('P10 Google callback gate with duplicate browser cookies (MC-7.3)',()=>{
 it('accepts the flow when a stale copy rides ahead of the fresh one',async()=>{
  const out=res();
  await callback(request('p10_google_browser=stale-browser; p10_google_browser=fresh-browser'),out);
  expect(out.statusCode).toBe(200);
  expect(out.body).toContain('verified-subject-345');
  expect(s.used).toBe(true);
 });
 it('accepts the flow when the fresh copy comes first',async()=>{
  const out=res();
  await callback(request('p10_google_browser=fresh-browser; p10_google_browser=stale-browser'),out);
  expect(out.statusCode).toBe(200);
  expect(out.body).toContain('verified-subject-345');
  expect(s.used).toBe(true);
 });
 it('accepts a single copy, as before',async()=>{
  const out=res();
  await callback(request('p10_google_browser=fresh-browser'),out);
  expect(out.statusCode).toBe(200);
  expect(s.used).toBe(true);
 });
 it('still refuses when no copy matches a live transaction',async()=>{
  const out=res();
  await callback(request('p10_google_browser=stale-browser; p10_google_browser=other-browser'),out);
  expect(out.statusCode).toBe(400);
  expect(out.body).toBe('Sign-in or account-link verification failed; restart the protected flow.');
  expect(s.used).toBe(false);
 });
 it('still refuses when the browser sends no flow cookie at all',async()=>{
  const out=res();
  await callback(request(undefined),out);
  expect(out.statusCode).toBe(400);
  expect(out.body).toBe('Invalid Google sign-in.');
  expect(s.used).toBe(false);
 });
});
