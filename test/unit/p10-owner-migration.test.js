import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {Readable} from 'node:stream';
const h=vi.hoisted(()=>({auth:'wrong',tx:null,used:false,subject:'linked-owner',
  links:0,proof:null,proofUsed:false,accountsRead:0,codes:[],sessions:0,
  count:0,modes:[],migrationChecks:0}));
vi.mock('../../src/db.js',()=>({
 initSchema:async()=>{},
 getOAuthClient:async id=>id==='registered'?{client_id:id,redirect_uris:['https://agent.test/return']}:null,
 listGoogleAccounts:async()=>{h.accountsRead++;return [{email:'original-owner@example.test',label:'Existing mailbox'}];},
 createAuthCode:async data=>{h.codes.push(data);},
 recordLoginAttempt:async()=>1,countRecentFailedLogins:async()=>0,markLoginAttemptSucceeded:async()=>{}
}));
vi.mock('../../src/auth/google-auth-hosted.js',()=>({ensureMigrated:async()=>null}));
vi.mock('../../src/oauth/login-guard.js',()=>({
 clientIp:()=> 'test-ip',LOCKOUT_WINDOW_MINUTES:15,
 evaluateLogin:async()=>({status:h.auth})
}));
vi.mock('../../src/principals/store.js',()=>({
 isLegacyPilotIdentityPrincipal:async()=>false,
 createTransaction:async p=>{h.tx=p;h.used=false;return true;},
 consumeTransaction:async({state,browser,purpose})=>{
  if(h.used||!h.tx||h.tx.state!==state||h.tx.browser!==browser||h.tx.purpose!==purpose)return null;
  h.used=true;return {purpose,policy:h.tx.policy,principal_id:h.tx.principalId||null,
   nonce_hash:'verified-nonce',verifier:h.tx.verifier,client_id:h.tx.clientId,
   redirect_uri:h.tx.redirectUri,resource:h.tx.resource,code_challenge:h.tx.codeChallenge};
 },
 bindVerifiedIdentity:async()=>{h.sessions++;return 'public-principal';},
 upsertLinkedAccount:async()=>{},
 listAccounts:async()=>[],issuePrincipalCode:async()=>null,
 readSession:async()=>null,createSession:async()=>({secret:'',csrf:''}),revokeSession:async()=>0,
 getPrincipal:async()=>null
}));
vi.mock('../../src/principals/owner-migration.js',()=>({
 ownerMigrationSnapshot:async()=>({owner_accounts:2,active_owner_connections:3,
  encrypted_accounts:2,linked_owner_google_subjects:1,dryRun:true,grantsChanged:false}),
 linkVerifiedOwner:async()=>{h.links++;return {linked:true};},
 issueOwnerLoginProof:async(identity,meta)=>{
  if(identity.sub!=='linked-owner')throw Error('owner_identity_unlinked');
  h.proof={token:'p10owner_'+'a'.repeat(43),meta};h.proofUsed=false;
  return h.proof.token;
 },
 inspectOwnerLoginProof:async(proof,meta)=>{
  h.migrationChecks++;
  return !!h.proof&&!h.proofUsed&&proof===h.proof.token&&
    JSON.stringify(meta)===JSON.stringify(h.proof.meta);
 },
 consumeOwnerLoginProof:async(proof,meta)=>{
  if(!h.proof||h.proofUsed||proof!==h.proof.token||
    JSON.stringify(meta)!==JSON.stringify(h.proof.meta))return false;
  h.proofUsed=true;return true;
 },
 unlinkVerifiedOwner:async()=>({unlinked:true,grantsMoved:false,connectionsRevoked:0}),
 legacyNewLoginEnabled:(env=process.env)=>env.LEGACY_OWNER_SIGNIN_ENABLED!=='false'
}));
vi.mock('../../src/principals/google.js',()=>({
 publicGoogleClient:()=>({}),
 providerUrl:({state})=>'https://accounts.google.com/proof?state='+state,
 verifyGoogleCode:async()=>({issuer:'https://accounts.google.com',
  sub:h.subject,email:'verified@example.test',tokens:{access_token:'google-only'}}),
 PUBLIC_SCOPE_GROUPS:{}
}));
const {default:migration}=await import('../../api/owner/migration.js');
const {default:start}=await import('../../api/auth/google/start.js');
const {default:callback}=await import('../../api/auth/google/callback.js');
const {default:authorize}=await import('../../api/oauth/authorize.js');
const base={client_id:'registered',redirect_uri:'https://agent.test/return',
 response_type:'code',state:'original-client-state',code_challenge:'c'.repeat(43),
 code_challenge_method:'S256',resource:'https://workspace.test/api/mcp'};
function response(){
 const r={statusCode:200,headers:{},body:null};
 r.setHeader=(key,v)=>{r.headers[key]=v;};
 r.getHeader=key=>r.headers[key];
 r.status=n=>{r.statusCode=n;return r;};
 r.json=b=>{r.body=b;return r;};
 r.send=b=>{r.body=b;return r;};
 r.writeHead=(n,headers={})=>{r.statusCode=n;Object.assign(r.headers,headers);return r;};
 r.end=()=>r;
 return r;
}
async function invoke(handler,method,params={},cookie=''){
 const req=(handler===authorize&&method==='POST')?Readable.from([new URLSearchParams(params).toString()]):
  {method,query:method==='GET'?params:{},body:method==='POST'?params:{},headers:{cookie}};
 req.method=method;req.headers={cookie,'content-type':'application/x-www-form-urlencoded'};
 if(handler===authorize&&method==='POST')req.query={};
 const r=response();await handler(req,r);return r;
}
let oldEnv;
beforeEach(()=>{
 oldEnv={...process.env};
 process.env.PUBLIC_SIGNIN_MODE='off';
 process.env.PUBLIC_BASE_URL='https://workspace.test';
 process.env.ADMIN_PASSPHRASE='owner-secret-for-test';
 h.auth='wrong';h.tx=null;h.used=false;h.subject='linked-owner';
 h.links=0;h.proof=null;h.proofUsed=false;h.accountsRead=0;h.codes=[];h.sessions=0;h.migrationChecks=0;
});
afterEach(()=>{process.env=oldEnv;});
describe('P10-7 protected owner migration and independent dual login',()=>{
 it('no anonymous dry-run, wrong password and absent link confirmation expose no owner counts or provider state',async()=>{
  let out=await invoke(migration,'GET');
  expect(out.body).toContain('passphrase');
  out=await invoke(migration,'POST',{action:'preview',passphrase:'bad'});
  expect(out.statusCode).toBe(401);expect(h.tx).toBeNull();
  h.auth='ok';
  out=await invoke(migration,'POST',{action:'preview',passphrase:'good'});
  expect(out.body).toMatchObject({owner_accounts:2,active_owner_connections:3,dryRun:true});
  out=await invoke(migration,'POST',{action:'link',passphrase:'good'});
  expect(out.statusCode).toBe(400);expect(h.tx).toBeNull();
  out=await invoke(migration,'POST',{action:'link',passphrase:'good',confirm:'yes'});
  expect(out.statusCode).toBe(302);
  expect(h.tx.policy).toMatchObject({ownerProof:'link'});
  expect(h.tx.purpose).toBe('login');
  expect(JSON.stringify(out)).not.toContain('owner-secret-for-test');
 });
 it('new owner link succeeds after fresh browser Google proof, no V2 session; replay and swapped browser refuse',async()=>{
  h.auth='ok';
  await invoke(migration,'POST',{action:'link',passphrase:'good',confirm:'yes'});
  let r=await invoke(callback,'GET',{state:h.tx.state,code:'google-code'},'p10_google_browser=wrong');
  expect(r.statusCode).toBe(400);expect(h.links).toBe(0);
  r=await invoke(callback,'GET',{state:h.tx.state,code:'google-code'},'p10_google_browser='+h.tx.browser);
  expect(r.statusCode).toBe(302);expect(r.headers.Location).toContain('/api/owner/migration');
  expect(h.links).toBe(1);expect(h.sessions).toBe(0);
  r=await invoke(callback,'GET',{state:h.tx.state,code:'google-code'},'p10_google_browser='+h.tx.browser);
  expect(r.statusCode).toBe(400);expect(h.links).toBe(1);
 });
 it('owner login can start while public enrollment OFF; signed proof is protocol-bound and one-use',async()=>{
  const query={...base,auth_method:'owner_google'};
  let out=await invoke(authorize,'GET',query);
  expect(out.statusCode).toBe(302);
  expect(new URL(out.headers.Location).searchParams.get('purpose')).toBe('owner_login');
  expect(h.accountsRead).toBe(0);
  out=await invoke(start,'GET',{...base,purpose:'owner_login'});
  expect(out.statusCode).toBe(302);
  expect(h.tx.policy.ownerProof).toBe('login');
  out=await invoke(callback,'GET',{state:h.tx.state,code:'google-code'},'p10_google_browser='+h.tx.browser);
  expect(out.statusCode).toBe(302);
  expect(JSON.stringify(out.headers['Set-Cookie'])).toContain('p10_owner_proof');
  const cookie='p10_owner_proof='+h.proof.token;
  const foreign=await invoke(authorize,'GET',{...query,code_challenge:'d'.repeat(43)},cookie);
  expect(foreign.statusCode).toBe(403);expect(h.accountsRead).toBe(0);
  const page=await invoke(authorize,'GET',query,cookie);
  expect(page.statusCode).toBe(200);
  expect(page.body).toContain('original-owner@example.test');
  expect(page.body).not.toContain('name="passphrase"');
  out=await invoke(authorize,'POST',{...query,google_account:'original-owner@example.test',
    cost_consent:'per_action'},cookie);
  expect(out.statusCode).toBe(302);
  expect(h.codes).toHaveLength(1);
  expect(h.codes[0]).toMatchObject({googleAccount:'original-owner@example.test',
   profile:'read_only',mode:'live'});
  expect(new URL(out.headers.Location).searchParams.get('state')).toBe(base.state);
  const replay=await invoke(authorize,'POST',{...query,google_account:'original-owner@example.test'},cookie);
  expect(replay.statusCode).toBe(403);expect(h.codes).toHaveLength(1);
 });
 it('retirement switch blocks NEW passphrase auth only; linked owner Google remains available',async()=>{
  process.env.LEGACY_OWNER_SIGNIN_ENABLED='false';
  h.auth='ok';
  const rejected=await invoke(authorize,'POST',{...base,google_account:'original-owner@example.test',passphrase:'owner-secret-for-test'});
  expect(rejected.statusCode).toBe(403);expect(h.codes).toHaveLength(0);
  const denied=await invoke(migration,'POST',{action:'link',confirm:'yes',passphrase:'owner-secret-for-test'});
  expect(denied.statusCode).toBe(403);
  const entry=await invoke(authorize,'GET',{...base,auth_method:'owner_google'});
  expect(entry.statusCode).toBe(302);
  expect(h.accountsRead).toBe(0);
 });
 it('unlinked/foreign verified Google principal cannot issue owner proof or expose owner accounts',async()=>{
  const query={...base,auth_method:'owner_google'};
  await invoke(start,'GET',{...base,purpose:'owner_login'});
  h.subject='foreign-user-sub';
  const callbackResult=await invoke(callback,'GET',{state:h.tx.state,code:'google-code'},
   'p10_google_browser='+h.tx.browser);
  expect(callbackResult.statusCode).toBe(400);
  expect(h.proof).toBeNull();expect(h.accountsRead).toBe(0);
  expect(h.codes).toHaveLength(0);
  const forged=await invoke(authorize,'POST',{...query,google_account:'original-owner@example.test'},'p10_owner_proof=forged');
  expect(forged.statusCode).toBe(403);expect(h.codes).toHaveLength(0);
 });
});
