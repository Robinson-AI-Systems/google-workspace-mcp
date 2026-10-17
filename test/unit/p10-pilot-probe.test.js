import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
const s=vi.hoisted(()=>({tx:null,used:false,bound:0,stored:0,session:0,owner:0,
  sub:'verified-subject-345',email:'tester@example.test'}));
vi.mock('../../src/db.js',()=>({initSchema:async()=>{}}));
vi.mock('../../src/principals/store.js',()=>({
 consumeTransaction:async({state,browser,purpose})=>{
  if(s.used||s.tx?.state!==state||s.tx?.browser!==browser||purpose!==s.tx?.purpose)return null;
  s.used=true;return {...s.tx,principal_id:null,
   nonce_hash:'signed-nonce',verifier:'PKCE-verifier',policy:s.tx.policy};
 },
 bindVerifiedIdentity:async()=>{s.bound++;return 'principal-x';},
 upsertLinkedAccount:async()=>{s.stored++;return 'account-x';}
}));
vi.mock('../../src/principals/google.js',()=>({
 PUBLIC_SCOPE_GROUPS:{mail:['gmail-scope']},
 publicGoogleClient:()=>({}),
 verifyGoogleCode:async()=>({issuer:'https://accounts.google.com',sub:s.sub,
   email:s.email,scopeList:['openid','email','profile'],
   tokens:{access_token:'SHOULD-NOT-RENDER',refresh_token:'NOT-AN-AGENT-GRANT'}})
}));
vi.mock('../../src/principals/session.js',()=>({
 BROWSER_COOKIE:'p10_google_browser',
 setSession:async()=>{s.session++;},
 requireSession:async()=>null
}));
vi.mock('../../src/principals/owner-migration.js',()=>({
 linkVerifiedOwner:async()=>{s.owner++;return true;},
 issueOwnerLoginProof:async()=>{s.owner++;return 'proof';}
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
const request=(browser='safe-browser',state='good-state')=>({
 method:'GET',query:{state,code:'google-signed-test-code'},
 headers:{cookie:'p10_google_browser='+browser}
});
let before;
beforeEach(()=>{
 before={...process.env};process.env.PUBLIC_BASE_URL='https://mcp.example.test';
 process.env.PUBLIC_SIGNIN_MODE='off';
 s.tx={state:'good-state',browser:'safe-browser',purpose:'login',policy:{pilotProbe:true}};
 s.used=false;s.bound=0;s.stored=0;s.session=0;s.owner=0;
 s.sub='verified-subject-345';s.email='tester@example.test';
});
afterEach(()=>{process.env=before;});
describe('P10-6 protected verified OIDC subject preview is never public enrollment',()=>{
 it('shows only verified identity with no access token, credential, session or principal write',async()=>{
  const out=res();await callback(request(),out);
  expect(out.statusCode).toBe(200);
  expect(out.body).toContain('verified-subject-345');
  expect(out.body).toContain('tester@example.test');
  expect(out.body).toContain('PUBLIC_PILOT_GOOGLE_SUBJECTS');
  expect(out.body).not.toContain('SHOULD-NOT-RENDER');
  expect(out.body).not.toContain('NOT-AN-AGENT-GRANT');
  expect(out.headers['Cache-Control']).toBe('no-store');
  expect(out.headers['Content-Security-Policy']).toContain("default-src 'none'");
  expect([s.bound,s.stored,s.session,s.owner]).toEqual([0,0,0,0]);
  expect(process.env.PUBLIC_SIGNIN_MODE).toBe('off');
 });
 it('one-use state plus bound browser rejects second and foreign attempts',async()=>{
  const foreign=res();await callback(request('foreign'),foreign);
  expect(foreign.statusCode).toBe(400);
  expect(s.used).toBe(false);
  const accepted=res();await callback(request(),accepted);
  expect(accepted.statusCode).toBe(200);
  const second=res();await callback(request(),second);
  expect(second.statusCode).toBe(400);
  expect([s.bound,s.stored,s.session,s.owner]).toEqual([0,0,0,0]);
 });
 it('escapes verified profile identifiers, not caller-provided names',async()=>{
  s.email='attacker<script>alert(1)</script>@example.test';
  s.sub='subject"><img src=x>';
  const out=res();await callback(request(),out);
  expect(out.statusCode).toBe(200);
  expect(out.body).not.toContain('<img');
  expect(out.body).not.toContain('<script>');
  expect(out.body).toContain('&lt;img');
  expect([s.bound,s.stored,s.session,s.owner]).toEqual([0,0,0,0]);
 });
 it('refuses contradictory forged transaction purpose or owner-proof metadata',async()=>{
  s.tx.policy={pilotProbe:true,ownerProof:'link'};
  const both=res();await callback(request(),both);
  expect(both.statusCode).toBe(400);
  s.used=false;s.tx.purpose='mcp_authorize';s.tx.policy={pilotProbe:true};
  const other=res();await callback(request(),other);
  expect(other.statusCode).toBe(400);
  expect([s.bound,s.stored,s.session,s.owner]).toEqual([0,0,0,0]);
 });
});
