import crypto from 'node:crypto';
import pg from 'pg';
import {describe,it,expect,beforeAll,afterAll,vi} from 'vitest';
const holder=vi.hoisted(()=>({pool:null}));
vi.mock('@neondatabase/serverless',()=>({neon:()=>async(strings,...values)=>{
 let query=strings[0];for(let i=0;i<values.length;i++)query+='$'+(i+1)+strings[i+1];
 return (await holder.pool.query(query,values)).rows;
}}));
const url=process.env.TEST_DATABASE_URL;
if(!url)console.warn('[P10 SQL] TEST_DATABASE_URL missing: V2 PG tests SKIPPED, not passed.');
describe.skipIf(!url)('P10 encrypted V2 principal/legacy identity across isolated real Postgres',()=>{
 let admin,pool,schema,db,store,prior,priorKey,a,b,aa,bb;
 beforeAll(async()=>{
  prior=process.env.DATABASE_URL;priorKey=process.env.TOKEN_ENCRYPTION_KEY;
  process.env.DATABASE_URL=url;process.env.TOKEN_ENCRYPTION_KEY=crypto.randomBytes(32).toString('base64');
  admin=new pg.Client({connectionString:url});await admin.connect();
  schema='v2_'+crypto.randomBytes(6).toString('hex');
  await admin.query('CREATE SCHEMA '+schema);
  pool=holder.pool=new pg.Pool({connectionString:url,max:10,options:'-c search_path='+schema});
  db=await import('../../src/db.js');store=await import('../../src/principals/store.js');
  await db.initSchema();
 });
 afterAll(async()=>{
  await pool?.end();
  if(admin){try{if(schema)await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');}finally{await admin.end();}}
  if(prior===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=prior;
  if(priorKey===undefined)delete process.env.TOKEN_ENCRYPTION_KEY;else process.env.TOKEN_ENCRYPTION_KEY=priorKey;
 });
 it('retains original bearer, Hub TEST grant and encrypted bytes after two upgrades',async()=>{
  await db.saveGoogleTokensFor('owner@example.test',{access_token:'old-access',refresh_token:'old-refresh'});
  const before=(await pool.query("SELECT tokens_enc FROM google_accounts WHERE email='owner@example.test'")).rows;
  await db.createAccessToken({accessToken:'legacy-owner-bearer',refreshToken:'legacy-owner-refresh',
    clientId:'legacy-client',googleAccount:'owner@example.test',profile:'read_only',areas:['mail']});
  process.env.RTC_TEST_ACCOUNT_EMAILS='owner@example.test';
  const pass=await db.createRtcPass({googleAccount:'owner@example.test',hours:1});
  await db.initSchema();await db.initSchema();
  expect((await pool.query("SELECT tokens_enc FROM google_accounts WHERE email='owner@example.test'")).rows).toEqual(before);
  expect((await db.getTokenByRefreshToken('legacy-owner-refresh')).profile).toBe('read_only');
  expect((await store.legacyOwnerContext('legacy-owner-bearer')).principal_kind).toBe('legacy_owner');
  expect(await store.legacyOwnerContext('p10a_forged')).toBeNull();
  expect(await store.legacyOwnerContext('unknown')).toBeNull();
  expect((await db.getRtcPass(pass.token)).mode).toBe('test');
 });
 it('verifies stable Google subject, reserves owner and blocks foreign account use',async()=>{
  a=await store.bindVerifiedIdentity({issuer:'https://accounts.google.com',sub:'subject-aaa1',verifiedEmail:'a@example.test'});
  b=await store.bindVerifiedIdentity({issuer:'https://accounts.google.com',sub:'subject-bbb2',verifiedEmail:'b@example.test'});
  expect(a).not.toBe(b);
  expect(await store.bindVerifiedIdentity({issuer:'https://accounts.google.com',sub:'subject-aaa1',verifiedEmail:'a@example.test'})).toBe(a);
  await expect(store.bindVerifiedIdentity({issuer:'https://accounts.google.com',sub:'owner-xxxx',verifiedEmail:'owner@example.test'})).rejects.toThrow('reserved_identity');
  aa=await store.upsertLinkedAccount({principalId:a,issuer:'https://accounts.google.com',sub:'subject-aaa1',
    verifiedEmail:'a@example.test',scopeList:['scope-a'],tokens:{access_token:'a1',refresh_token:'ar'}});
  bb=await store.upsertLinkedAccount({principalId:b,issuer:'https://accounts.google.com',sub:'subject-bbb2',
    verifiedEmail:'b@example.test',scopeList:['scope-b'],tokens:{access_token:'b1',refresh_token:'br'}});
  expect(await store.findAccount(b,aa)).toBeNull();
  expect(await store.getLinkedGrant(b,aa)).toBeNull();
  await expect(store.setPrincipalDefault(b,aa)).rejects.toThrow('outside_scope');
  await expect(store.upsertLinkedAccount({principalId:b,issuer:'https://accounts.google.com',sub:'subject-aaa1',
    verifiedEmail:'a@example.test',scopeList:[],tokens:{access_token:'forged'}})).rejects.toThrow('identity_owned_elsewhere');
 });
 it('enforces refresh CAS and keeps omitted provider refresh token',async()=>{
  const results=await Promise.allSettled([1,2].map(n=>store.updateLinkedGrant({principalId:a,accountId:aa,version:0,
    scopeList:['scope-a'],tokens:{access_token:'new-'+n}})));
  expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);
  expect(results.filter(x=>x.status==='rejected')).toHaveLength(1);
  expect((await store.getLinkedGrant(a,aa)).refresh_token).toBe('ar');
 });
 it('atomically consumes browser state, principal code and rotated refresh across pool sessions',async()=>{
  const secret=await store.createSession(a);
  expect((await store.readSession(secret.secret)).principal_id).toBe(a);
  const state='state-'+crypto.randomBytes(32).toString('base64url'),browser='browser-1';
  await store.createTransaction({state,nonce:'nonce1',browser,verifier:'verifier1',purpose:'login'});
  expect(await store.consumeTransaction({state,browser:'foreign',purpose:'login'})).toBeNull();
  const tx=await Promise.all([1,2].map(()=>store.consumeTransaction({state,browser,purpose:'login'})));
  expect(tx.filter(Boolean)).toHaveLength(1);
  const verifier=crypto.randomBytes(48).toString('base64url');
  const challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
  const options={principalId:a,accountId:aa,clientId:'mcp-client',redirectUri:'https://client.test/cb',
    resource:'https://service.test/api/mcp',codeChallenge:challenge,profile:'read_only'};
  const code=await store.issuePrincipalCode(options);
  expect(await store.consumePrincipalCode({code,clientId:options.clientId,redirectUri:options.redirectUri,
    resource:options.resource,verifier:'wrong-verifier'})).toBeNull();
  const one=await Promise.all([1,2].map(()=>store.consumePrincipalCode({code,clientId:options.clientId,
    redirectUri:options.redirectUri,resource:options.resource,verifier})));
  expect(one.filter(Boolean)).toHaveLength(1);
  const issued=await store.issuePrincipalConnection(one.find(Boolean));
  expect((await store.readPrincipalAccess(issued.accessToken)).principal_id).toBe(a);
  const settings={clientId:'mcp-client',resource:options.resource};
  const two=await Promise.all([1,2].map(()=>store.rotatePrincipalRefresh(issued.refreshToken,settings)));
  expect(two.filter(Boolean)).toHaveLength(1);
  expect(await store.rotatePrincipalRefresh(issued.refreshToken,settings)).toBeNull();
  expect(await store.readPrincipalAccess(two.find(Boolean).accessToken)).toBeNull();
  expect(await store.revokeSession(secret.secret)).toBe(1);
  expect(await store.readSession(secret.secret)).toBeNull();
 });
 it('disconnects the chosen account without touching a foreign principal',async()=>{
  expect(await store.disconnectAccount(b,aa)).toBe(0);
  expect(await store.deletionPreview(a)).toMatchObject({previewOnly:true,deleted:false});
  expect(await store.disconnectAccount(a,aa)).toBe(1);
  expect(await store.findAccount(a,aa)).toBeNull();
  expect(await store.findAccount(b,bb)).not.toBeNull();
 });
});
