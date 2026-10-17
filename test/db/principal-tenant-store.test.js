// Genuine disposable Postgres contract, not a fake SQL return shape.
// Uses the same per-schema isolation as the existing P10 DB fixture.
import crypto from 'node:crypto';
import pg from 'pg';
import {describe,it,expect,beforeAll,afterAll,vi} from 'vitest';
import {spawn} from 'node:child_process';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
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
    resource:'https://service.test/api/mcp',profile:'full',listing:'compact',areas:null,cost_policy:{mode:'per_action'},mode:'live'});
  cb=await store.issuePrincipalConnection({principal_id:b,account_id:bb,client_id:'client-B',
    resource:'https://service.test/api/mcp',profile:'read_only',listing:'compact',areas:null,cost_policy:{mode:'per_action'},mode:'live'});
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



 it('CAS-persists rotated public Google tokens without changing account permissions',async()=>{
   const context=await store.readPrincipalAccess(ca.accessToken),version=context.accountVersion;
   const attempts=await Promise.all([
     store.persistPrincipalGoogleRefresh(context,{access_token:'token-r1',expiry_date:Date.now()+3600000}),
     store.persistPrincipalGoogleRefresh(context,{access_token:'token-r2',expiry_date:Date.now()+3600000})
   ]);
   expect(attempts.filter(Boolean)).toHaveLength(1);
   expect(attempts.filter(x=>!x)).toHaveLength(1);
   const row=await store.findAccount(a,aa),grant=await store.getLinkedGrant(a,aa);
   expect(row.token_version).toBe(version);
   expect(row.refresh_version).toBe(1);
   expect(grant.refresh_token).toBe('refresh-a');
   expect(['token-r1','token-r2']).toContain(grant.access_token);
   await expect(store.persistPrincipalGoogleRefresh(
     Object.freeze({...context,principalId:b}),{access_token:'evil',expiry_date:Date.now()+3600000}
   )).rejects.toThrow('invalid_scoped_context');
   expect(await store.readPrincipalAccess(ca.accessToken)).toMatchObject({principalId:a,accountId:aa});
 });
 it('raw PostgreSQL constraints refuse a foreign connection paired with a valid user and account',async()=>{
   const invalid=[
     ['result',`INSERT INTO principal_result_pages(handle,principal_id,account_id,
        connection_id,credential_version,payload,expires_at)
        VALUES($1,$2,$3,$4,0,'{}'::jsonb,now()+interval '1 hour')`,
        [resultHandle(),a,aa,cb.connectionId]],
     ['audit',`INSERT INTO principal_changes(principal_id,account_id,connection_id,
        acting_as,tool) VALUES($1,$2,$3,'a@example.test','synthetic')`,
        [a,aa,cb.connectionId]],
     ['rate',`INSERT INTO principal_rate_windows(principal_id,account_id,connection_id,
        credential_version,bucket,window_start,usage)
        VALUES($1,$2,$3,0,'synthetic',now(),1)`,
        [a,aa,cb.connectionId]]
   ];
   for(const [label,query,values] of invalid){
     let error;
     try{await pool.query(query,values);}catch(e){error=e;}
     expect(error?.code,label).toBe('23503');
   }
   expect((await ac.listChanges({limit:100})).every(x=>x.tool!=='synthetic')).toBe(true);
 });
 it('executes the same V2 scoped store in TWO independent Node OS processes against one disposable Postgres',async()=>{
   const spawnWorker=payload=>new Promise((resolve,reject)=>{
     const processWorker=spawn(process.execPath,
       [new URL('../helpers/p10-principal-child.mjs',import.meta.url).pathname],
       {env:{...process.env,P10_TEST_SCHEMA:schema},stdio:['pipe','pipe','pipe']});
     let output='',stderr='';
     processWorker.stdout.on('data',c=>{output+=c.toString();});
     processWorker.stderr.on('data',c=>{stderr+=c.toString().slice(0,1000);});
     processWorker.on('error',reject);
     processWorker.on('close',code=>{
       if(code!==0)return reject(Error('independent_worker_failed '+code+' '+stderr.slice(-800)));
       try{resolve(JSON.parse(output.trim()));}catch{reject(Error('invalid_independent_worker_result'));}
     });
     processWorker.stdin.end(JSON.stringify(payload));
   });
   const handleA=resultHandle(),handleB=resultHandle();
   const results=await Promise.all([
     spawnWorker({accessToken:ca.accessToken,foreignAccountId:bb,foreignHandle:handleB,
       ownedHandle:handleA,window:'2026-10-17T00:05:00.000Z'}),
     spawnWorker({accessToken:cb.accessToken,foreignAccountId:aa,foreignHandle:handleA,
       ownedHandle:handleB,window:'2026-10-17T00:05:00.000Z'})
   ]);
   expect(results).toEqual([
     {own:true,foreignAccountMissing:true,foreignGrantMissing:true,foreignResultMissing:true,
       resultWritten:true,rateAllowed:true},
     {own:true,foreignAccountMissing:true,foreignGrantMissing:true,foreignResultMissing:true,
       resultWritten:true,rateAllowed:true}
   ]);
   expect(await ac.getResult(handleA)).toMatchObject({data:{owner:a}});
   expect(await bc.getResult(handleB)).toMatchObject({data:{owner:b}});
   expect(await ac.getResult(handleB)).toBeNull();
   expect(await bc.getResult(handleA)).toBeNull();
 });

 it('actual native SDK and meta-dispatch share exact owner A/B boundaries with zero Google calls',async()=>{
  const env={PUBLIC_BASE_URL:process.env.PUBLIC_BASE_URL,
   PUBLIC_GOOGLE_OAUTH_CLIENT_ID:process.env.PUBLIC_GOOGLE_OAUTH_CLIENT_ID,
   PUBLIC_GOOGLE_OAUTH_CLIENT_SECRET:process.env.PUBLIC_GOOGLE_OAUTH_CLIENT_SECRET};
  process.env.PUBLIC_BASE_URL='https://service.test';
  process.env.PUBLIC_GOOGLE_OAUTH_CLIENT_ID='public-test-client-id';
  process.env.PUBLIC_GOOGLE_OAUTH_CLIENT_SECRET='public-test-client-secret';
  const connected=[];
  const start=async token=>{
    const context=await store.readPrincipalAccess(token);
    const {createIsolatedPrincipalServer}=await import('../../api/mcp.js');
    const server=createIsolatedPrincipalServer(context);
    const [serverTransport,clientTransport]=InMemoryTransport.createLinkedPair();
    const client=new Client({name:'p10-isolation-acceptance',version:'1.0.0'},{capabilities:{}});
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    connected.push({server,client});
    return client;
  };
  const parse=r=>JSON.parse(r.content[0].text);
  try{
   const A=await start(ca.accessToken),B=await start(cb.accessToken);
   const [listA,listB]=await Promise.all([A.listTools(),B.listTools()]);
   // Compact listings intentionally expose only meta discovery and workflows;
   // direct execution is independently authorized by the exact server policy.
   expect(listA.tools.some(t=>t.name==='workspace_search_tools')).toBe(true);
   expect(listB.tools.some(t=>t.name==='workspace_search_tools')).toBe(true);
   expect(listA.tools.some(t=>t.name==='workspace_dev_create_fixtures')).toBe(false);
   expect(listA.tools.some(t=>t.name==='dns_list_records')).toBe(false);
   const [a,b]=await Promise.all([
    A.callTool({name:'workspace_list_accounts',arguments:{}}),
    B.callTool({name:'workspace_call',arguments:{name:'workspace_list_accounts',args:{}}})
   ]);
   expect(parse(a).map(x=>x.id)).toEqual([aa]);
   expect(parse(b).map(x=>x.id)).toEqual([bb]);
   const results=await Promise.all([
    A.callTool({name:'workspace_call',arguments:{name:'workspace_list_connections',args:{}}}),
    B.callTool({name:'workspace_call',arguments:{name:'workspace_list_connections',args:{}}})
   ]);
   expect(parse(results[0]).map(x=>x.id)).toEqual([ca.connectionId]);
   expect(parse(results[1]).map(x=>x.id)).toEqual([cb.connectionId]);
   const denied=await A.callTool({name:'workspace_set_default_account',arguments:{email:'b@example.test'}});
   expect(denied.isError).toBe(true);
   const unavailable=await A.callTool({name:'workspace_describe_tool',
     arguments:{name:'workspace_dev_list_runs',includeUnavailable:true}});
   expect(parse(unavailable)).toMatchObject({available:false,
     needsReconnect:true,reason:'requires_customer_specific_setup'});
   const out=await B.callTool({name:'workspace_batch',arguments:{calls:[
     {name:'workspace_list_accounts',args:{}},{name:'workspace_list_connections',args:{}}
   ]}});
   const responses=parse(out).results;
   expect(parse(responses[0].response).map(x=>x.id)).toEqual([bb]);
   expect(parse(responses[1].response).map(x=>x.id)).toEqual([cb.connectionId]);
  }finally{
   await Promise.all(connected.map(async({client,server})=>{
    await client.close();await server.close();
   }));
   for(const [name,value] of Object.entries(env)){
    if(value===undefined)delete process.env[name];else process.env[name]=value;
   }
  }
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
