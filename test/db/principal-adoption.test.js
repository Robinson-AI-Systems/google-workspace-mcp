// ADOPT-1 (owner-ordered, 2026-11-09): identity-proven adoption of
// legacy-held Google accounts. A public profile whose bound Google identity
// IS the identity a holding profile is bound to — proven by a live session
// plus a fresh verified consent for the exact mailbox — ADOPTS that mailbox
// instead of hitting reserved_identity / identity_owned_elsewhere. Anyone
// short of that proof gets today's refusals, byte for byte. Genuine
// disposable Postgres, the same fixture shape as the other principal tests.
import crypto from 'node:crypto';
import pg from 'pg';
import {describe,it,expect,beforeAll,afterAll,vi} from 'vitest';
const holder=vi.hoisted(()=>({pool:null}));
vi.mock('@neondatabase/serverless',()=>({neon:()=>async(strings,...values)=>{
 let query=strings[0];for(let i=0;i<values.length;i++)query+='$'+(i+1)+strings[i+1];
 return (await holder.pool.query(query,values)).rows;
}}));
const url=process.env.TEST_DATABASE_URL;
if(!url)console.warn('[ADOPT-1 SQL] TEST_DATABASE_URL missing: adoption DB tests SKIPPED, not passed.');
describe.skipIf(!url)('ADOPT-1: identity-proven adoption of legacy-held accounts',()=>{
 let admin,pool,schema,db,store,saved;
 const issuer='https://accounts.google.com';
 const OWNER='00000000-0000-4000-8000-000000000001';
 const later=Date.now()+3600_000;
 const SYS={sub:'adopt-systems-subject',email:'adopt-systems@example.test'};
 const RENT={sub:'adopt-rentals-subject',email:'adopt-rentals@example.test'};
 const PERS={sub:'adopt-personal-subject',email:'adopt-personal@example.test'};
 let me,meRentalsAccount,ownerRentalsRow,ownerPersonalRow,ownerConnection,legacyBefore;
 beforeAll(async()=>{
  saved={...process.env};
  process.env.DATABASE_URL=url;
  process.env.TOKEN_ENCRYPTION_KEY=crypto.randomBytes(32).toString('base64');
  process.env.PUBLIC_BASE_URL='https://service.test';
  admin=new pg.Client({connectionString:url});await admin.connect();
  schema='adopt1_'+crypto.randomBytes(6).toString('hex');
  await admin.query('CREATE SCHEMA '+schema);
  pool=holder.pool=new pg.Pool({connectionString:url,max:8,options:'-c search_path='+schema});
  db=await import('../../src/db.js');
  store=await import('../../src/principals/store.js');
  await db.initSchema();await db.initSchema();
  // The legacy world: systems is the default mailbox and the rentals
  // mailbox sits beside it, both in the legacy table (owner-mapped by
  // initPrincipalSchema). The owner principal's bound identity is the
  // systems identity (the owner-migration ceremony's binding).
  await db.createAccessToken({accessToken:'legacy-systems-bearer',refreshToken:'legacy-systems-refresh',
    clientId:'adopt-legacy-client',googleAccount:SYS.email,profile:'read_only'});
  await db.saveGoogleTokensFor(RENT.email,{['access_'+'token']:'legacy-rentals-access',['refresh_'+'token']:'legacy-rentals-refresh'});
  // Re-point the legacy bearer leg at the systems mailbox (it already
  // carries a refresh grant for it from the save above).
  await pool.query('UPDATE oauth_tokens SET google_account=$1 WHERE access_token=$2',[SYS.email,'legacy-systems-bearer']);
  await db.saveGoogleTokensFor(SYS.email,{['access_'+'token']:'legacy-systems-access',['refresh_'+'token']:'legacy-systems-refresh'});
  await pool.query(`INSERT INTO principal_google_identities(issuer,google_sub,principal_id,verified_email)
    VALUES ($1,$2,$3,$4)`,[issuer,SYS.sub,OWNER,SYS.email]);
  // The owner's live execution material: a legacy bearer connection (its
  // tokens ride oauth_tokens/google_account) and two V2 agent connections
  // over the rentals + personal account rows.
  await db.createAccessToken({accessToken:'adopt-owner-bearer',refreshToken:'adopt-owner-refresh',
    clientId:'adopt-owner-client',googleAccount:RENT.email,profile:'read_only'});
  ownerRentalsRow=await store.upsertLinkedAccount({principalId:OWNER,issuer,sub:RENT.sub,
    verifiedEmail:RENT.email,scopeList:['scope:mail','scope:drive'],
    tokens:{access_token:'owner-rentals-access',refresh_token:'owner-rentals-refresh',expiry_date:later}});
  ownerPersonalRow=await store.upsertLinkedAccount({principalId:OWNER,issuer,sub:PERS.sub,
    verifiedEmail:PERS.email,scopeList:['scope:mail'],
    tokens:{access_token:'owner-personal-access',refresh_token:'owner-personal-refresh',expiry_date:later}});
  const verifier=crypto.randomBytes(48).toString('base64url');
  const codeChallenge=crypto.createHash('sha256').update(verifier).digest('base64url');
  const resource='https://service.test/api/mcp',redirectUri='https://client.test/return';
  const code=await store.issuePrincipalCode({principalId:OWNER,accountId:ownerRentalsRow,
    clientId:'adopt-agent',redirectUri,resource,codeChallenge,profile:'full'});
  const record=await store.consumePrincipalCode({code,clientId:'adopt-agent',redirectUri,resource,verifier});
  ownerConnection=await store.issuePrincipalConnection(record);
  legacyBefore=(await pool.query('SELECT email,is_default,tokens,tokens_enc FROM google_accounts ORDER BY email')).rows;
  // The presenter: a public profile whose bound identity IS the systems
  // identity (bound off-band, exactly as the ceremony binds the owner's).
  me=crypto.randomUUID();
  await pool.query(`INSERT INTO principals(id,kind) VALUES ($1,'user')`,[me]);
  await pool.query(`INSERT INTO principal_google_identities(issuer,google_sub,principal_id,verified_email)
    VALUES ($1,$2,$3,$4)`,[issuer,SYS.sub,me,SYS.email]);
 });
 afterAll(async()=>{
  await pool?.end();
  if(admin){try{if(schema)await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');}finally{await admin.end();}}
  process.env=saved;
 });
 const link=(identity,tokens)=>store.upsertLinkedAccount({principalId:me,issuer,
  sub:identity.sub,verifiedEmail:identity.email,scopeList:['scope:mail','scope:drive'],
  tokens:tokens||{access_token:'fresh-'+identity.sub,refresh_token:'fresh-refresh-'+identity.sub,expiry_date:later}});

 it('(a) adopts the legacy-reserved bound-identity mailbox (systems) onto the presenter',async()=>{
  const id=await link(SYS);
  const accounts=await store.listAccounts(me);
  expect(accounts.map(x=>x.id)).toContain(id);
  expect(accounts.find(x=>x.id===id).email).toBe(SYS.email);
  expect(await store.getLinkedGrant(me,id)).toMatchObject({access_token:'fresh-'+SYS.sub});
  // The reservation MAPPING for THIS mailbox is retired; the legacy row
  // itself survives — it is the grant store the holder's legacy
  // connections read — and the other legacy mailbox is untouched.
  expect((await pool.query('SELECT count(*)::int AS n FROM principal_legacy_accounts WHERE lower(email)=lower($1)',[SYS.email])).rows[0].n).toBe(0);
  expect((await pool.query('SELECT count(*)::int AS n FROM google_accounts WHERE lower(email)=lower($1)',[SYS.email])).rows[0].n).toBe(1);
  // ...and it STAYS retired across a schema re-init: the seed must not
  // resurrect the mapping for a mailbox another profile actively holds.
  await store.initPrincipalSchema();
  expect((await pool.query('SELECT count(*)::int AS n FROM principal_legacy_accounts WHERE lower(email)=lower($1)',[SYS.email])).rows[0].n).toBe(0);
  expect((await pool.query('SELECT count(*)::int AS n FROM principal_legacy_accounts WHERE lower(email)=lower($1)',[RENT.email])).rows[0].n).toBe(1);
  expect((await pool.query('SELECT count(*)::int AS n FROM google_accounts WHERE lower(email)=lower($1)',[RENT.email])).rows[0].n).toBe(1);
 });

 it('(b) adopts an owner-held account (rentals): fresh grant lands, holder row retires',async()=>{
  // The rentals identity becomes the presenter's own too once Google has
  // verified the presenter controls it (the same off-band binding the
  // ceremony gives the holder) — adoption is keyed on that twin binding.
  await pool.query(`INSERT INTO principal_google_identities(issuer,google_sub,principal_id,verified_email)
    VALUES ($1,$2,$3,$4)`,[issuer,RENT.sub,me,RENT.email]);
  meRentalsAccount=await link(RENT);
  expect((await store.listAccounts(me)).map(x=>x.email)).toContain(RENT.email);
  expect(await store.getLinkedGrant(me,meRentalsAccount)).toMatchObject({access_token:'fresh-'+RENT.sub});
  const old=(await pool.query('SELECT status FROM principal_google_accounts WHERE id=$1',[ownerRentalsRow])).rows[0];
  expect(old.status).toBe('revoked');
  // The rentals reservation MAPPING retires with the adoption; the
  // legacy row (grant store) and the bearer material that rides the
  // mailbox name are untouched (asserted in (e)).
  expect((await pool.query('SELECT count(*)::int AS n FROM principal_legacy_accounts WHERE lower(email)=lower($1)',[RENT.email])).rows[0].n).toBe(0);
  expect((await pool.query('SELECT count(*)::int AS n FROM google_accounts WHERE lower(email)=lower($1)',[RENT.email])).rows[0].n).toBe(1);
  // The legacy grant for the adopted mailbox is still readable through
  // the legacy read path — the holder's connections keep working.
  expect(await db.getGoogleTokensFor(RENT.email)).toMatchObject({access_token:'legacy-rentals-access'});
 });

 it('(b2) adopts the owner-held non-legacy account (personal) the same way',async()=>{
  await pool.query(`INSERT INTO principal_google_identities(issuer,google_sub,principal_id,verified_email)
    VALUES ($1,$2,$3,$4)`,[issuer,PERS.sub,me,PERS.email]);
  const id=await link(PERS);
  expect((await store.listAccounts(me)).map(x=>x.email)).toContain(PERS.email);
  expect(await store.getLinkedGrant(me,id)).toMatchObject({access_token:'fresh-'+PERS.sub});
  const old=(await pool.query('SELECT status FROM principal_google_accounts WHERE id=$1',[ownerPersonalRow])).rows[0];
  expect(old.status).toBe('revoked');
 });

 it('(e) the holder\'s execution material is untouched by the adoptions',async()=>{
  // Legacy bearer path still resolves for the owner principal.
  expect((await store.legacyOwnerContext('adopt-owner-bearer')).principal_kind).toBe('legacy_owner');
  expect((await db.getTokenByRefreshToken('adopt-owner-refresh')).client_id).toBe('adopt-owner-client');
  // The owner's V2 agent connection still reads (execution resolves its
  // home through the retired row via the live-connection read path).
  expect((await store.listConnections(OWNER)).filter(x=>x.revoked_at===null)).toHaveLength(1);
  // The owner principal itself survives, and its identity binding is
  // still THE binding that resolves its sign-in (the widened key lets the
  // presenter's own binding coexist; the owner's row is untouched).
  const binding=(await pool.query('SELECT principal_id FROM principal_google_identities WHERE issuer=$1 AND google_sub=$2',[issuer,SYS.sub])).rows;
  expect(binding.map(x=>x.principal_id).sort()).toEqual([OWNER,me].sort());
  expect(await store.getVerifiedPrincipal(issuer,SYS.sub)).toBe(OWNER);
  expect((await pool.query('SELECT kind,status FROM principals WHERE id=$1',[OWNER])).rows[0])
    .toEqual({kind:'legacy_owner',status:'active'});
  // Both legacy mailbox rows survive adoption byte-for-byte (they are
  // the grant store); only their reservation mappings retired.
  const legacyAfter=(await pool.query('SELECT email,is_default,tokens,tokens_enc FROM google_accounts ORDER BY email')).rows;
  expect(legacyAfter).toEqual(legacyBefore);
 });

 it('(c) a stranger profile still gets reserved_identity for a legacy-held mailbox',async()=>{
  const stranger=await store.bindVerifiedIdentity({issuer,sub:'adopt-stranger-subject',verifiedEmail:'adopt-stranger@example.test'});
  await db.saveGoogleTokensFor('adopt-held@example.test',{access_token:'held-access',refresh_token:'held-refresh'});
  await expect(store.upsertLinkedAccount({principalId:stranger,issuer,sub:'adopt-held-subject',
    verifiedEmail:'adopt-held@example.test',scopeList:['scope:mail'],
    tokens:{access_token:'stranger-fresh',expiry_date:later}})).rejects.toThrow('reserved_identity');
  expect((await pool.query('SELECT count(*)::int AS n FROM google_accounts WHERE lower(email)=lower($1)',['adopt-held@example.test'])).rows[0].n).toBe(1);
 });

 it('(d) consent for a different mailbox cannot cross-claim the holder\'s accounts',async()=>{
  // A second public profile bound to the PERSONAL identity only: it may
  // adopt personal-shaped claims, never the owner's rentals row (already
  // adopted above, so re-prove against a fresh owner-held row).
  const other=crypto.randomUUID();
  await pool.query(`INSERT INTO principals(id,kind) VALUES ($1,'user')`,[other]);
  await pool.query(`INSERT INTO principal_google_identities(issuer,google_sub,principal_id,verified_email)
    VALUES ($1,$2,$3,$4)`,[issuer,PERS.sub,other,PERS.email]);
  const freshOwnerRow=await store.upsertLinkedAccount({principalId:OWNER,issuer,sub:'adopt-extra-subject',
    verifiedEmail:'adopt-extra@example.test',scopeList:['scope:mail'],
    tokens:{access_token:'owner-extra-access',refresh_token:'owner-extra-refresh',expiry_date:later}});
  await expect(store.upsertLinkedAccount({principalId:other,issuer,sub:'adopt-extra-subject',
    verifiedEmail:'adopt-extra@example.test',scopeList:['scope:mail'],
    tokens:{access_token:'cross-claim',expiry_date:later}})).rejects.toThrow('identity_owned_elsewhere');
  const row=(await pool.query('SELECT status,principal_id FROM principal_google_accounts WHERE id=$1',[freshOwnerRow])).rows[0];
  expect(row).toEqual({status:'active',principal_id:OWNER});
 });

 it('(f) an identity-only shell never wins sign-in resolution over a full profile',async()=>{
  // Review Second Shift finding on PR #301 (2026-11-09): getVerifiedPrincipal
  // filtered twin bindings on legacy_pilot_identity_only but its SELECT
  // never fetched that column, so the filter read undefined and the shell
  // counted as full — with a shell and a full profile both bound, the
  // 'shell never wins' rule silently collapsed into a tie (null). The
  // SELECT now fetches the column; this case pins the behavior.
  const twinSub='adopt-twin-subject',twinEmail='adopt-twin@example.test';
  const shell=crypto.randomUUID(),full=crypto.randomUUID();
  await pool.query(`INSERT INTO principals(id,kind,legacy_pilot_identity_only)
    VALUES ($1,'user',true)`,[shell]);
  await pool.query(`INSERT INTO principals(id,kind) VALUES ($1,'user')`,[full]);
  await pool.query(`INSERT INTO principal_google_identities(issuer,google_sub,principal_id,verified_email)
    VALUES ($1,$2,$3,$4)`,[issuer,twinSub,shell,twinEmail]);
  await pool.query(`INSERT INTO principal_google_identities(issuer,google_sub,principal_id,verified_email)
    VALUES ($1,$2,$3,$4)`,[issuer,twinSub,full,twinEmail]);
  expect(await store.getVerifiedPrincipal(issuer,twinSub)).toBe(full);
  expect(await store.getVerifiedPrincipalForEmail(issuer,twinSub,twinEmail)).toBe(full);
  // A LONE shell binding still resolves — the shell is a real sign-in
  // (the legacy-pilot shape); it loses only to a full profile.
  const loneSub='adopt-lone-shell-subject';
  await pool.query(`INSERT INTO principal_google_identities(issuer,google_sub,principal_id,verified_email)
    VALUES ($1,$2,$3,$4)`,[issuer,loneSub,shell,'adopt-lone@example.test']);
  expect(await store.getVerifiedPrincipal(issuer,loneSub)).toBe(shell);
 });
});
