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
 it('previews previously approved legacy testing mailbox without mutating live owner grants or connections',async()=>{
  const migration=await import('../../src/principals/owner-migration.js');
  const identity={issuer:'https://accounts.google.com',sub:'historical-test-sub-0001',
   verifiedEmail:'legacy-tester@example.test'};
  await db.saveGoogleTokensFor(identity.verifiedEmail,
   {access_token:'legacy-test-access',refresh_token:'legacy-test-refresh'});
  await db.createAccessToken({accessToken:'legacy-test-bearer',refreshToken:'legacy-test-mcp-refresh',
   clientId:'test-original-client',googleAccount:identity.verifiedEmail,profile:'read_only'});
  const before=(await pool.query(
   "SELECT email,is_default,tokens_enc FROM google_accounts WHERE email='legacy-tester@example.test'")).rows;
  const tokenBefore=(await pool.query(
   "SELECT access_token,refresh_token,revoked_at FROM oauth_tokens WHERE access_token='legacy-test-bearer'")).rows;
  expect(before).toHaveLength(1);expect(before[0].is_default).toBe(false);
  const impact=await migration.previewLegacyPilotMigration(identity);
  expect(impact).toMatchObject({legacyAccount:true,migrationRequired:true,isDefault:false,
   encryptedOwnerGrantPresent:true,liveOwnerConnections:1,unrevokedRefreshConnections:1,
   pendingOwnerAuthorizations:0,ownerConnectionsChanged:0,grantsChanged:false,principalCreated:false});
  expect(JSON.stringify(impact)).not.toContain(identity.verifiedEmail);
  expect(JSON.stringify(impact)).not.toContain(identity.sub);
  const defaultImpact=await migration.previewLegacyPilotMigration({...identity,verifiedEmail:'owner@example.test'});
  expect(defaultImpact.legacyAccount).toBe(true);
  expect(defaultImpact.isDefault).toBe(true);
  expect(defaultImpact.liveOwnerConnections).toBeGreaterThanOrEqual(1);
  const independent=await migration.previewLegacyPilotMigration({...identity,verifiedEmail:'unconnected@example.test'});
  expect(independent).toMatchObject({legacyAccount:false,migrationRequired:false});
  expect((await pool.query(
   "SELECT email,is_default,tokens_enc FROM google_accounts WHERE email='legacy-tester@example.test'")).rows)
   .toEqual(before);
  expect((await pool.query(
   "SELECT access_token,refresh_token,revoked_at FROM oauth_tokens WHERE access_token='legacy-test-bearer'")).rows)
   .toEqual(tokenBefore);
  expect((await pool.query("SELECT count(*)::int AS n FROM principal_google_identities WHERE google_sub='historical-test-sub-0001'")).rows[0].n).toBe(0);
  await expect(migration.previewLegacyPilotMigration({...identity,issuer:'forged.example.test'}))
   .rejects.toThrow('invalid_verified_identity');
 });
 it('signs in the expressly approved legacy tester without moving legacy Google grants or owner refresh/bearers',async()=>{
  const oldEnv={PUBLIC_SIGNIN_MODE:process.env.PUBLIC_SIGNIN_MODE,
    PUBLIC_PILOT_GOOGLE_SUBJECTS:process.env.PUBLIC_PILOT_GOOGLE_SUBJECTS,
    PUBLIC_PILOT_LEGACY_SUBJECTS:process.env.PUBLIC_PILOT_LEGACY_SUBJECTS,
    PUBLIC_P10_TOOL_EXECUTION_VERIFIED:process.env.PUBLIC_P10_TOOL_EXECUTION_VERIFIED};
  const subject='123456789012345678901',identity={issuer:'https://accounts.google.com',
    sub:subject,verifiedEmail:'legacy-tester@example.test'};
  const initial=(await pool.query("SELECT email,is_default,tokens_enc FROM google_accounts ORDER BY email")).rows;
  const tokenInitial=(await pool.query(
    "SELECT access_token,refresh_token,google_account,revoked_at FROM oauth_tokens ORDER BY access_token")).rows;
  try{
   process.env.PUBLIC_SIGNIN_MODE='pilot';
   process.env.PUBLIC_PILOT_GOOGLE_SUBJECTS='987654321098765432109,'+subject;
   delete process.env.PUBLIC_P10_TOOL_EXECUTION_VERIFIED;
   delete process.env.PUBLIC_PILOT_LEGACY_SUBJECTS;
   await expect(store.bindVerifiedIdentity(identity)).rejects.toThrow('reserved_identity');
   process.env.PUBLIC_PILOT_LEGACY_SUBJECTS=subject;
   await expect(store.bindVerifiedIdentity(identity)).rejects.toThrow('reserved_identity');
   const pilot=await store.bindVerifiedIdentity({...identity,identityOnlyPilot:true});
   expect(pilot).not.toBe('00000000-0000-4000-8000-000000000001');
   expect(await store.bindVerifiedIdentity({...identity,identityOnlyPilot:true})).toBe(pilot);
   const browser=await store.createSession(pilot);
   expect((await store.readSession(browser.secret)).principal_id).toBe(pilot);
   expect(await store.listAccounts(pilot)).toHaveLength(0);
   expect(await store.isLegacyPilotIdentityPrincipal(pilot)).toBe(true);
   expect((await pool.query('SELECT legacy_pilot_identity_only FROM principals WHERE id=$1',[pilot])).rows[0].legacy_pilot_identity_only).toBe(true);
   await expect(store.upsertLinkedAccount({principalId:pilot,issuer:'https://accounts.google.com',
     sub:'987654321098765432109',verifiedEmail:'fresh-account@example.test',scopeList:[],
     tokens:{access_token:'foreign-token'}})).rejects.toThrow('legacy_pilot_identity_only');
   await expect(store.upsertLinkedAccount({principalId:pilot,issuer:identity.issuer,
     sub:subject,verifiedEmail:identity.verifiedEmail,scopeList:[],
     tokens:{access_token:'old-grant-no'}})).rejects.toThrow('legacy_pilot_identity_only');
   process.env.PUBLIC_P10_TOOL_EXECUTION_VERIFIED='true';
   await expect(store.bindVerifiedIdentity({...identity,identityOnlyPilot:true})).rejects.toThrow('reserved_identity');
   process.env.PUBLIC_P10_TOOL_EXECUTION_VERIFIED='false';
   process.env.PUBLIC_SIGNIN_MODE='public';
   await expect(store.bindVerifiedIdentity({...identity,identityOnlyPilot:true})).rejects.toThrow('reserved_identity');
   process.env.PUBLIC_SIGNIN_MODE='pilot';
   process.env.PUBLIC_PILOT_LEGACY_SUBJECTS='987654321098765432109';
   await expect(store.bindVerifiedIdentity({...identity,identityOnlyPilot:true})).rejects.toThrow('reserved_identity');
   expect((await pool.query("SELECT email,is_default,tokens_enc FROM google_accounts ORDER BY email")).rows)
     .toEqual(initial);
   expect((await pool.query(
     "SELECT access_token,refresh_token,google_account,revoked_at FROM oauth_tokens ORDER BY access_token")).rows)
     .toEqual(tokenInitial);
   expect((await db.getTokenByRefreshToken('legacy-test-mcp-refresh')).client_id).toBe('test-original-client');
   expect((await store.legacyOwnerContext('legacy-test-bearer')).principal_kind).toBe('legacy_owner');
   expect((await pool.query("SELECT count(*)::int AS n FROM principal_google_accounts WHERE principal_id=$1",[pilot])).rows[0].n).toBe(0);
   // The original owner may later remove this legacy mailbox. The pilot's
   // identity-only authorization boundary must not disappear with that row.
   await pool.query('DELETE FROM google_accounts WHERE email=$1',[identity.verifiedEmail]);
   expect(await store.isLegacyPilotIdentityPrincipal(pilot)).toBe(true);
   await expect(store.upsertLinkedAccount({principalId:pilot,issuer:identity.issuer,
     sub:'222222222222222222222',verifiedEmail:'fresh-account@example.test',
     scopeList:[],tokens:{access_token:'must-never-persist'}}))
     .rejects.toThrow('legacy_pilot_identity_only');
  }finally{
   for(const [key,value] of Object.entries(oldEnv)){
    if(value===undefined)delete process.env[key];else process.env[key]=value;
   }
  }
 });
 it('preserves original owner ciphertext and bearer when the historical tester obtains its own freshly consented V2 grant',async()=>{
  const envKeys=['PUBLIC_SIGNIN_MODE','PUBLIC_PILOT_GOOGLE_SUBJECTS',
    'PUBLIC_PILOT_LEGACY_SUBJECTS','PUBLIC_PILOT_LEGACY_FRESH_GRANT_ENABLED',
    'PUBLIC_P10_TOOL_EXECUTION_VERIFIED'];
  const saved=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
  const email='independent-historical-tester@example.test';
  const sub='123456789098765432109';
  const identity={issuer:'https://accounts.google.com',sub,verifiedEmail:email};
  try{
   await db.saveGoogleTokensFor(email,{access_token:'legacy-original-only',
     refresh_token:'owner-original-refresh'});
   await db.createAccessToken({accessToken:'owner-original-live-bearer',
     refreshToken:'owner-original-live-refresh',clientId:'owner-original-client',
     googleAccount:email,profile:'read_only'});
   const original=(await pool.query('SELECT email,is_default,tokens_enc FROM google_accounts WHERE email=$1',[email])).rows;
   const oldBearer=(await pool.query('SELECT access_token,refresh_token,revoked_at FROM oauth_tokens WHERE access_token=$1',['owner-original-live-bearer'])).rows;
   process.env.PUBLIC_SIGNIN_MODE='pilot';
   process.env.PUBLIC_PILOT_GOOGLE_SUBJECTS='987654321012345678901,'+sub;
   process.env.PUBLIC_PILOT_LEGACY_SUBJECTS=sub;
   delete process.env.PUBLIC_PILOT_LEGACY_FRESH_GRANT_ENABLED;
   delete process.env.PUBLIC_P10_TOOL_EXECUTION_VERIFIED;
   const user=await store.bindVerifiedIdentity({...identity,identityOnlyPilot:true});
   expect(await store.isLegacyPilotIdentityPrincipal(user)).toBe(true);
   expect(await store.canLegacyPilotStartFreshConsent(user)).toBe(false);
   const args={principalId:user,...identity,scopeList:['scope:mail'],
     tokens:{access_token:'new-only-v2-consent',refresh_token:'new-only-refresh'}};
   await expect(store.upsertLinkedAccount(args)).rejects.toThrow('legacy_pilot_identity_only');
   expect(await store.listAccounts(user)).toHaveLength(0);
   process.env.PUBLIC_PILOT_LEGACY_FRESH_GRANT_ENABLED='true';
   expect(await store.canLegacyPilotStartFreshConsent(user)).toBe(true);
   process.env.PUBLIC_PILOT_LEGACY_SUBJECTS='987654321012345678901';
   // Global config may target another subject; THIS stored pilot user is not eligible.
   expect(await store.canLegacyPilotStartFreshConsent(user)).toBe(false);
   process.env.PUBLIC_PILOT_LEGACY_SUBJECTS=sub;
   expect(await store.canLegacyPilotStartFreshConsent(user)).toBe(true);
   await expect(store.upsertLinkedAccount({...args,sub:'999999999999999999999'}))
     .rejects.toThrow('legacy_pilot_identity_only');
   await expect(store.upsertLinkedAccount({...args,verifiedEmail:'another@example.test'}))
     .rejects.toThrow('legacy_pilot_identity_only');
   const linkedId=await store.upsertLinkedAccount(args);
   expect((await store.listAccounts(user)).map(x=>x.id)).toEqual([linkedId]);
   expect(await store.getLinkedGrant(user,linkedId)).toMatchObject(args.tokens);
   expect(await store.isLegacyPilotIdentityPrincipal(user)).toBe(false);
   expect((await pool.query('SELECT legacy_pilot_identity_only,legacy_pilot_fresh_grant FROM principals WHERE id=$1',[user])).rows[0])
     .toEqual({legacy_pilot_identity_only:true,legacy_pilot_fresh_grant:true});
   const foreign=await store.bindVerifiedIdentity({issuer:'https://accounts.google.com',
     sub:'other-independent-user-sub',verifiedEmail:'other-independent@example.test'});
   expect(await store.getLinkedGrant(foreign,linkedId)).toBeNull();
   process.env.PUBLIC_PILOT_LEGACY_FRESH_GRANT_ENABLED='false';
   expect(await store.bindVerifiedIdentity({...identity,identityOnlyPilot:true})).toBe(user);
   expect(await store.canLegacyPilotStartFreshConsent(user)).toBe(false);
   expect((await pool.query('SELECT email,is_default,tokens_enc FROM google_accounts WHERE email=$1',[email])).rows).toEqual(original);
   expect((await pool.query('SELECT access_token,refresh_token,revoked_at FROM oauth_tokens WHERE access_token=$1',['owner-original-live-bearer'])).rows).toEqual(oldBearer);
   expect((await store.legacyOwnerContext('owner-original-live-bearer')).principal_kind).toBe('legacy_owner');
   expect((await db.getTokenByRefreshToken('owner-original-live-refresh')).client_id).toBe('owner-original-client');
  }finally{
   for(const [k,v] of Object.entries(saved)){
    if(v===undefined)delete process.env[k];else process.env[k]=v;
   }
  }
 });
 it('verifies stable Google subject, reserves owner and blocks foreign account use',async()=>{
  a=await store.bindVerifiedIdentity({issuer:'https://accounts.google.com',sub:'subject-aaa1',verifiedEmail:'a@example.test'});
  b=await store.bindVerifiedIdentity({issuer:'https://accounts.google.com',sub:'subject-bbb2',verifiedEmail:'b@example.test'});
  expect(a).not.toBe(b);
  expect(await store.isLegacyPilotIdentityPrincipal(a)).toBe(false);
  expect(await store.isLegacyPilotIdentityPrincipal(b)).toBe(false);
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
  const ctx=await store.readPrincipalAccess(issued.accessToken);
  expect(ctx.principalId).toBe(a);
  expect((await store.scopedStore(ctx).listAccounts()).map(x=>x.id)).toContain(aa);
  expect(()=>store.scopedStore(Object.freeze({...ctx,principalId:b}))).toThrow('invalid_scoped_context');
  const settings={clientId:'mcp-client',resource:options.resource};
  const two=await Promise.all([1,2].map(()=>store.rotatePrincipalRefresh(issued.refreshToken,settings)));
  expect(two.filter(Boolean)).toHaveLength(1);
  expect(await store.rotatePrincipalRefresh(issued.refreshToken,settings)).toBeNull();
  expect(await store.readPrincipalAccess(two.find(Boolean).accessToken)).toBeNull();
  expect(await store.revokeSession(secret.secret)).toBe(1);
  expect(await store.readSession(secret.secret)).toBeNull();
 });
 it('turns off broad Google access, revokes the exact account agent and safely relinks the same Google subject narrowly',async()=>{
  expect(await store.disconnectAccount(b,aa)).toBe(0);
  expect(await store.deletionPreview(a)).toMatchObject({previewOnly:true,deleted:false});
  expect(await store.requestDeletion(a)).toMatchObject({pending:true,irreversible:false});
  expect(await store.cancelDeletion(a)).toMatchObject({cancelled:true,deleted:false});
  const current=await store.findAccount(a,aa);
  const verifier=crypto.randomBytes(48).toString('base64url');
  const challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
  const credentials={principalId:a,accountId:aa,clientId:'godmode-test-agent',
    redirectUri:'https://client.test/godmode-callback',
    resource:'https://service.test/api/mcp',codeChallenge:challenge,profile:'full'};
  const code=await store.issuePrincipalCode(credentials);
  const verified=await store.consumePrincipalCode({code,clientId:credentials.clientId,
    redirectUri:credentials.redirectUri,resource:credentials.resource,verifier});
  expect(verified).toBeTruthy();
  const issued=await store.issuePrincipalConnection(verified);
  expect((await store.readPrincipalAccess(issued.accessToken)).principalId).toBe(a);
  expect(await store.disconnectAccount(a,aa)).toBe(1);
  expect(await store.findAccount(a,aa)).toBeNull();
  expect(await store.readPrincipalAccess(issued.accessToken)).toBeNull();
  expect(await store.rotatePrincipalRefresh(issued.refreshToken,{clientId:credentials.clientId,resource:credentials.resource})).toBeNull();
  expect(await store.findAccount(b,bb)).not.toBeNull();

  const restored=await store.upsertLinkedAccount({
    principalId:a,issuer:'https://accounts.google.com',sub:'subject-aaa1',
    verifiedEmail:'a@example.test',scopeList:['scope-selected-only'],
    tokens:{access_token:'new-narrow-consented-token',refresh_token:'new-independent-refresh'}});
  expect(restored).toBe(aa); // stable owned account ID; no duplicate unique-subject collision
  expect((await store.findAccount(a,aa)).token_version).toBeGreaterThan(current.token_version);
  expect((await store.listAccounts(a))[0].scope_list).toEqual(['scope-selected-only']);
  expect((await store.getLinkedGrant(a,aa)).refresh_token).toBe('new-independent-refresh');
  expect(await store.readPrincipalAccess(issued.accessToken)).toBeNull(); // never resurrect old agent family
  expect(await store.findAccount(b,bb)).not.toBeNull();
 });

 it('revokes only a registered legacy OAuth client family, leaving all other owner refreshes alive',async()=>{
  const owner='oauth-revoke-owner-client',other='oauth-revoke-other-client';
  await db.createAccessToken({accessToken:'revocable-access-1',refreshToken:'revocable-refresh-1',
    clientId:owner,googleAccount:'owner@example.test',profile:'read_only'});
  await db.createAccessToken({accessToken:'revocable-access-2',refreshToken:'revocable-refresh-1',
    clientId:owner,googleAccount:'owner@example.test',profile:'read_only'});
  await db.createAccessToken({accessToken:'other-access',refreshToken:'other-refresh',
    clientId:other,googleAccount:'owner@example.test',profile:'read_only'});
  expect(await db.revokeClientOAuthToken('revocable-refresh-1',other)).toBe(0);
  expect(await db.getAccessToken('revocable-access-1')).toBeTruthy();
  expect(await db.revokeClientOAuthToken('revocable-access-1',owner)).toBe(2);
  expect(await db.getAccessToken('revocable-access-1')).toBeNull();
  expect(await db.getAccessToken('revocable-access-2')).toBeNull();
  expect(await db.getTokenByRefreshToken('revocable-refresh-1')).toBeNull();
  await expect(db.createAccessToken({accessToken:'revocable-late-access',
   refreshToken:'revocable-refresh-1',clientId:owner,
   googleAccount:'owner@example.test',profile:'read_only'}))
   .rejects.toThrow('refresh_family_revoked');
  expect(await db.getAccessToken('revocable-late-access')).toBeNull();
  expect(await db.revokeClientOAuthToken('revocable-refresh-1',owner)).toBe(0);
  expect(await db.getAccessToken('other-access')).toBeTruthy();
  expect(await db.getTokenByRefreshToken('other-refresh')).toBeTruthy();
  expect(await db.getTokenByRefreshToken('legacy-owner-refresh')).toBeTruthy();
 });
 it('revokes only the exact V2 access/refresh family, never another principal or client',async()=>{
  const make=async(sub,email,clientId)=>{
   const principalId=await store.bindVerifiedIdentity({issuer:'https://accounts.google.com',
    sub,verifiedEmail:email});
   const accountId=await store.upsertLinkedAccount({principalId,issuer:'https://accounts.google.com',
    sub,verifiedEmail:email,scopeList:['https://www.googleapis.com/auth/tasks.readonly'],
    tokens:{access_token:'scratch-'+sub}});
   const verifier=crypto.randomBytes(48).toString('base64url');
   const codeChallenge=crypto.createHash('sha256').update(verifier).digest('base64url');
   const resource='https://service.test/api/mcp';
   const redirectUri='https://client.test/return';
   const code=await store.issuePrincipalCode({principalId,accountId,clientId,redirectUri,
    resource,codeChallenge,profile:'read_only'});
   const record=await store.consumePrincipalCode({code,clientId,redirectUri,resource,verifier});
   return store.issuePrincipalConnection(record);
  };
  const x=await make('revoke-principal-one','revoke-one@example.test','v2-client-one');
  const y=await make('revoke-principal-two','revoke-two@example.test','v2-client-two');
  expect(await store.revokeClientPrincipalToken(x.accessToken,'v2-client-two')).toBe(0);
  expect(await store.readPrincipalAccess(x.accessToken)).toBeTruthy();
  expect(await store.revokeClientPrincipalToken(x.refreshToken,'v2-client-one')).toBe(1);
  expect(await store.readPrincipalAccess(x.accessToken)).toBeNull();
  expect(await store.rotatePrincipalRefresh(x.refreshToken,{
   clientId:'v2-client-one',resource:'https://service.test/api/mcp'})).toBeNull();
  expect(await store.revokeClientPrincipalToken(x.accessToken,'v2-client-one')).toBe(0);
  expect(await store.readPrincipalAccess(y.accessToken)).toBeTruthy();
 });


 it('consumes a legacy owner OAuth code exactly once across competing SQL sessions',async()=>{
  const verifier=crypto.randomBytes(48).toString('base64url');
  const challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
  const code='owner-once-'+crypto.randomBytes(16).toString('base64url');
  const clientId='owner-race-client',redirectUri='https://client.test/return';
  await db.createAuthCode({code,clientId,redirectUri,codeChallenge:challenge,
    codeChallengeMethod:'S256',googleAccount:'owner@example.test'});
  const original=()=>db.consumeAuthCode(code,{clientId,redirectUri,verifier});
  expect(await db.consumeAuthCode(code,{clientId:'attacker',redirectUri,verifier})).toBeNull();
  expect(await db.consumeAuthCode(code,{clientId,redirectUri,verifier:'X'.repeat(43)})).toBeNull();
  const results=await Promise.all([original(),original()]);
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(await original()).toBeNull();
 });

});
