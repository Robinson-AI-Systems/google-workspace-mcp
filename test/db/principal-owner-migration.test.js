import crypto from 'node:crypto';
import pg from 'pg';
import {describe,it,expect,beforeAll,afterAll,vi} from 'vitest';
const holder=vi.hoisted(()=>({pool:null}));
vi.mock('@neondatabase/serverless',()=>({neon:()=>async(strings,...values)=>{
 let query=strings[0];for(let i=0;i<values.length;i++)query+='$'+(i+1)+strings[i+1];
 return (await holder.pool.query(query,values)).rows;
}}));
const url=process.env.TEST_DATABASE_URL;
if(!url)console.warn('[P10 owner migration SQL] TEST_DATABASE_URL unavailable: real DB tests SKIPPED, not passed.');
describe.skipIf(!url)('P10-7 owner identity mapping and replay-safe proof, actual disposable PostgreSQL',()=>{
 let admin,pool,schema,db,store,migrate,prior,priorKey;
 const issuer='https://accounts.google.com',ownerSub='actual-owner-subject';
 const metadata={clientId:'registered-legacy-client',redirectUri:'https://agent.example.test/callback',
  resource:'https://workspace.example.test/api/mcp',codeChallenge:'C'.repeat(43),
  clientState:'original-oauth-state'};
 beforeAll(async()=>{
  prior=process.env.DATABASE_URL;priorKey=process.env.TOKEN_ENCRYPTION_KEY;
  process.env.DATABASE_URL=url;process.env.TOKEN_ENCRYPTION_KEY=crypto.randomBytes(32).toString('base64');
  admin=new pg.Client({connectionString:url});await admin.connect();
  schema='owner_'+crypto.randomBytes(6).toString('hex');await admin.query('CREATE SCHEMA '+schema);
  pool=holder.pool=new pg.Pool({connectionString:url,max:8,options:'-c search_path='+schema});
  db=await import('../../src/db.js');store=await import('../../src/principals/store.js');
  migrate=await import('../../src/principals/owner-migration.js');
  await db.initSchema();await db.initSchema();
  await db.saveGoogleTokensFor('original-owner@example.test',{access_token:'owner-oauth-access',refresh_token:'owner-oauth-refresh'});
  await db.createAccessToken({accessToken:'longstanding-owner-bearer',refreshToken:'longstanding-owner-refresh',
   clientId:'original-client',googleAccount:'original-owner@example.test',profile:'read_only',areas:['mail']});
 });
 afterAll(async()=>{
  await pool?.end();
  if(admin){try{if(schema)await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');}finally{await admin.end();}}
  if(prior===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=prior;
  if(priorKey===undefined)delete process.env.TOKEN_ENCRYPTION_KEY;else process.env.TOKEN_ENCRYPTION_KEY=priorKey;
 });
 it('dry-run counts and two schema upgrades never decrypt, reissue or alter existing owner access',async()=>{
  const before=await migrate.ownerMigrationSnapshot();
  expect(before).toMatchObject({owner_accounts:1,encrypted_accounts:1,
   active_owner_connections:1,linked_owner_google_subjects:0,dryRun:true,
   grantsChanged:false,connectionsRevoked:0});
  const grants=(await pool.query('SELECT tokens_enc FROM google_accounts')).rows;
  await db.initSchema();await db.initSchema();
  expect((await pool.query('SELECT tokens_enc FROM google_accounts')).rows).toEqual(grants);
  expect((await store.legacyOwnerContext('longstanding-owner-bearer')).principal_kind).toBe('legacy_owner');
  expect((await db.getTokenByRefreshToken('longstanding-owner-refresh')).profile).toBe('read_only');
 });
 it('rejects an existing user subject, then links owner only by verified issuer/sub and stays idempotent',async()=>{
  const user=await store.bindVerifiedIdentity({issuer,sub:'distinct-user-sub',verifiedEmail:'user@example.test'});
  expect(user).toBeTruthy();
  await expect(migrate.linkVerifiedOwner({issuer,sub:'distinct-user-sub',email:'user@example.test'}))
   .rejects.toThrow('identity_owned_elsewhere');
  await expect(migrate.linkVerifiedOwner({issuer,sub:'a',email:'owner@example.test'}))
   .rejects.toThrow('invalid_verified_identity');
  expect(await migrate.isVerifiedOwner(issuer,'distinct-user-sub')).toBe(false);
  expect(await migrate.linkVerifiedOwner({issuer,sub:ownerSub,email:'owner-recovery@example.test'}))
   .toMatchObject({linked:true,grantsMoved:false,connectionsRevoked:0});
  expect(await migrate.linkVerifiedOwner({issuer,sub:ownerSub,email:'owner-recovery@example.test'}))
   .toMatchObject({linked:true,idempotent:true});
  const after=await migrate.ownerMigrationSnapshot();
  expect(after).toMatchObject({owner_accounts:1,active_owner_connections:1,
   linked_owner_google_subjects:1,separate_user_principals:1});
  expect(after.accounts).toEqual(expect.arrayContaining([
    expect.objectContaining({email:'original-owner@example.test',encrypted:true})]));
  expect(after.connections).toEqual(expect.arrayContaining([
    expect.objectContaining({client_id:'original-client',profile:'read_only'})]));
  expect(after.linkedOwnerIdentities).toHaveLength(1);
  expect(after.linkedOwnerIdentities[0].subjectFingerprint).toMatch(/^[a-f0-9]{32}$/);
  expect(JSON.stringify(after)).not.toContain('owner-oauth-refresh');
  expect(JSON.stringify(after)).not.toContain('longstanding-owner-bearer');
  expect((await pool.query("SELECT principal_id FROM principal_google_identities WHERE google_sub=$1",[ownerSub])).rows[0].principal_id)
   .toBe('00000000-0000-4000-8000-000000000001');
  expect((await db.getTokenByRefreshToken('longstanding-owner-refresh')).areas).toEqual(['mail']);
 });
 it('proof is linked-owner only, strongly bound, single-use across concurrent pooled sessions',async()=>{
  await expect(migrate.issueOwnerLoginProof({issuer,sub:'distinct-user-sub'},metadata))
    .rejects.toThrow('owner_identity_unlinked');
  const proof=await migrate.issueOwnerLoginProof({issuer,sub:ownerSub},metadata);
  expect(proof).toMatch(/^p10owner_/);
  expect(await migrate.inspectOwnerLoginProof(proof,{...metadata,clientId:'foreign-client'})).toBe(false);
  expect(await migrate.consumeOwnerLoginProof(proof,{...metadata,clientState:'forged-oauth-state'})).toBe(false);
  expect(await migrate.inspectOwnerLoginProof(proof,metadata)).toBe(true);
  const raced=await Promise.all([migrate.consumeOwnerLoginProof(proof,metadata),
    migrate.consumeOwnerLoginProof(proof,metadata)]);
  expect(raced).toEqual(expect.arrayContaining([true,false]));
  expect(await migrate.consumeOwnerLoginProof(proof,metadata)).toBe(false);
  expect(await migrate.inspectOwnerLoginProof(proof,metadata)).toBe(false);
  expect((await pool.query("SELECT count(*)::int AS n FROM principal_owner_login_proofs WHERE consumed_at IS NOT NULL")).rows[0].n).toBe(1);
 });
 it('explicit mapping unlink rolls back owner Google sign-in without touching original grants or user principals',async()=>{
  const snapshot=await migrate.ownerMigrationSnapshot();
  expect(await migrate.isVerifiedOwner(issuer,ownerSub)).toBe(true);
  await expect(migrate.unlinkVerifiedOwner('0'.repeat(32))).rejects.toThrow('owner_mapping_not_found');
  expect(await migrate.unlinkVerifiedOwner(snapshot.linkedOwnerIdentities[0].subjectFingerprint))
   .toMatchObject({unlinked:true,connectionsRevoked:0,grantsMoved:false});
  expect(await migrate.isVerifiedOwner(issuer,ownerSub)).toBe(false);
  expect(await migrate.isVerifiedOwner(issuer,'distinct-user-sub')).toBe(false);
  expect((await store.legacyOwnerContext('longstanding-owner-bearer')).principal_kind).toBe('legacy_owner');
  expect((await db.getTokenByRefreshToken('longstanding-owner-refresh')).areas).toEqual(['mail']);
  expect((await migrate.ownerMigrationSnapshot()).linked_owner_google_subjects).toBe(0);
  await migrate.linkVerifiedOwner({issuer,sub:ownerSub,email:'owner-recovery@example.test'});
 });
 it('legacy-new-login switch is separate from durable old bearer and scoped user grants',async()=>{
  expect(migrate.legacyNewLoginEnabled({})).toBe(true);
  expect(migrate.legacyNewLoginEnabled({LEGACY_OWNER_SIGNIN_ENABLED:'false'})).toBe(false);
  expect(()=>migrate.legacyNewLoginEnabled({LEGACY_OWNER_SIGNIN_ENABLED:'insecure'})).toThrow();
  expect(await store.legacyOwnerContext('longstanding-owner-bearer')).not.toBeNull();
  expect(await migrate.isVerifiedOwner(issuer,ownerSub)).toBe(true);
  const subjects=(await pool.query('SELECT kind,count(*)::int AS count FROM principals GROUP BY kind ORDER BY kind')).rows;
  expect(subjects).toEqual(expect.arrayContaining([{kind:'legacy_owner',count:1},{kind:'user',count:1}]));
 });
});
