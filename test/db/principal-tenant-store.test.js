// Genuine disposable Postgres contract, not a fake SQL return shape.
// Uses the same per-schema isolation as the existing P10 DB fixture.
import crypto from 'node:crypto';
import pg from 'pg';
import {describe,it,expect,beforeAll,afterAll,vi} from 'vitest';
const holder=vi.hoisted(()=>({pool:null}));
vi.mock('@neondatabase/serverless',()=>({neon:()=>async(strings,...values)=>{
 let statement=strings[0];
 for(let i=0;i<values.length;i++)statement+='$'+(i+1)+strings[i+1];
 return (await holder.pool.query(statement,values)).rows;
}}));

const url=process.env.TEST_DATABASE_URL;
if(!url)console.warn('[P10 tenant SQL] TEST_DATABASE_URL missing: scoped real DB tests SKIPPED, not passed.');
describe.skipIf(!url)('P10: separate principal-owned result, audit and rate persistence',()=>{
 let admin,pool,schema,db,store,a,b,aa,bb,ca,cb,ac,bc,oldURL,oldKey;
 const resultHandle=()=> 'rtc_result_'+crypto.randomBytes(24).toString('base64url');
 beforeAll(async()=>{
  oldURL=process.env.DATABASE_URL;oldKey=process.env.TOKEN_ENCRYPTION_KEY;
  process.env.DATABASE_URL=url;
  process.env.TOKEN_ENCRYPTION_KEY=crypto.randomBytes(32).toString('base64');
  admin=new pg.Client({connectionString:url});await admin.connect();
  schema='p10tenant_'+crypto.randomBytes(6).toString('hex');
  await admin.query('CREATE SCHEMA '+schema);
  pool=holder.pool=new pg.Pool({connectionString:url,max:12,options:'-c search_path='+schema});
  db=await import('../../src/db.js');
  store=await import('../../src/principals/store.js');
  await db.initSchema();await db.initSchema();
  const issuer='https://accounts.google.com';
  a=await store.bindVerifiedIdentity({issuer,sub:'tenant-subject-a',verifiedEmail:'a@example.test'});
  b=await store.bindVerifiedIdentity({issuer,sub:'tenant-subject-b',verifiedEmail:'b@example.test'});
  aa=await store.upsertLinkedAccount({principalId:a,issuer,sub:'tenant-subject-a',
    verifiedEmail:'a@example.test',scopeList:['openid','scope.a'],
    tokens:{access_token:'access-a',refresh_token:'refresh-a'}});
  bb=await store.upsertLinkedAccount({principalId:b,issuer,sub:'tenant-subject-b',
    verifiedEmail:'b@example.test',scopeList:['openid','scope.b'],
    tokens:{access_token:'access-b',refresh_token:'refresh-b'}});
  ca=await store.issuePrincipalConnection({principal_id:a,account_id:aa,client_id:'client-A',
    resource:'https://service.test/api/mcp',profile:'full',mode:'live'});
  cb=await store.issuePrincipalConnection({principal_id:b,account_id:bb,client_id:'client-B',
    resource:'https://service.test/api/mcp',profile:'read_only',mode:'live'});
  ac=store.scopedStore(await store.readPrincipalAccess(ca.accessToken));
  bc=store.scopedStore(await store.readPrincipalAccess(cb.accessToken));
 });
 afterAll(async()=>{
  await pool?.end();
  if(admin){try{if(schema)await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');}
    finally{await admin.end();}}
  if(oldURL===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=oldURL;
  if(oldKey===undefined)delete process.env.TOKEN_ENCRYPTION_KEY;else process.env.TOKEN_ENCRYPTION_KEY=oldKey;
 });

 it('preserves legacy database rows and stores results under exact principal/account/connection',async()=>{
  const handle=resultHandle();
  expect(await ac.storeResult({handle,connection:'attacker-id',payload:{data:{owner:'A',rows:[1,2]},bytes:35}})).toBe(handle);
  expect(await ac.getResult(handle)).toMatchObject({data:{owner:'A',rows:[1,2]}});
  expect(await bc.getResult(handle)).toBeNull();
  expect(await bc.getResult('rtc_result_'+String(handle).slice(11))).toBeNull();
  expect(await db.getRtcResult(handle,'unrelated-owner')).toBeNull();
  await expect(ac.storeResult({handle:'bad',payload:{secret:true}})).rejects.toThrow('invalid_result');
  // Overlapping user-supplied result labels never become a cross-tenant upsert.
  await expect(bc.storeResult({handle,payload:{data:'B'}})).rejects.toThrow();
  expect(await ac.getResult(handle)).toMatchObject({data:{owner:'A'}});
 });

 it('keeps large, similarly named audit records invisible to foreign users',async()=>{
  const idA=await ac.recordChange({tool:'workspace_change',target:'shared-resource',summary:'A action',
    before:{value:'A-before'},after:{value:'A-after'}});
  const idB=await bc.recordChange({tool:'workspace_change',target:'shared-resource',summary:'B action',
    before:{value:'B-before'},after:{value:'B-after'}});
  expect(idA).not.toBe(idB);
  expect((await ac.listChanges({limit:10})).map(x=>x.id)).toContain(String(idA));
  expect((await bc.listChanges({limit:10})).map(x=>x.id)).toContain(String(idB));
  expect((await ac.listChanges({limit:10})).map(x=>x.id)).not.toContain(String(idB));
  expect(await bc.getOwnedChange(idA)).toBeNull();
  expect(await ac.getOwnedChange(idB)).toBeNull();
  expect(await ac.getOwnedChange(idA)).toMatchObject({target:'shared-resource',
    summary:'A action',acting_as:'a@example.test',connection:ca.connectionId});
  await expect(bc.listChanges({actingAs:'a@example.test'})).rejects.toThrow('outside_scope');
  expect(await db.getOwnedChange(idA,'a@example.test',ca.connectionId)).toBeNull();
 });

 it('atomically isolates rate windows for concurrent calls and credential versions',async()=>{
  const window=new Date('2026-10-17T00:00:00.000Z');
  const results=await Promise.all(Array.from({length:8},()=>ac.chargeRate('read:mail',window,3)));
  expect(results.filter(x=>x.allowed)).toHaveLength(3);
  expect(results.filter(x=>!x.allowed)).toHaveLength(5);
  expect(await bc.chargeRate('read:mail',window,3)).toMatchObject({allowed:true,usage:1});
  expect(await ac.chargeRate('read:calendar',window,3)).toMatchObject({allowed:true,usage:1});
  await expect(ac.chargeRate('other',new Date('bad'),3)).rejects.toThrow('invalid_rate');
 });

 it('rejects forged frozen tenant context and foreign account selectors',async()=>{
  const ctx=await store.readPrincipalAccess(ca.accessToken);
  expect(()=>store.scopedStore(Object.freeze({...ctx,principalId:b}))).toThrow('invalid_scoped_context');
  expect(await ac.getAccount(bb)).toBeNull();
  expect(await bc.getAccount(aa)).toBeNull();
  expect(await ac.getGrant(bb)).toBeNull();
  expect(await bc.getGrant(aa)).toBeNull();
  await expect(ac.setDefault(bb)).rejects.toThrow('outside_scope');
  expect((await ac.listAccounts()).map(a=>a.id)).toEqual([aa]);
  expect((await bc.listAccounts()).map(a=>a.id)).toEqual([bb]);
 });

 it('revocation blocks result and history reads without touching another user',async()=>{
  const handle=resultHandle();
  await ac.storeResult({handle,payload:{data:'A-only'}});
  expect(await store.revokeConnection(a,ca.connectionId)).toBe(1);
  expect(await ac.getResult(handle)).toBeNull();
  expect(await ac.getOwnedChange(1)).toBeNull();
  expect(await ac.listChanges({limit:10})).toEqual([]);
  expect(await ac.chargeRate('other',new Date('2026-10-17T00:00:00.000Z'),10)).toMatchObject({allowed:false});
  expect(await store.readPrincipalAccess(ca.accessToken)).toBeNull();
  expect(await store.readPrincipalAccess(cb.accessToken)).not.toBeNull();
  expect((await bc.listAccounts()).map(x=>x.id)).toEqual([bb]);
 });
});
