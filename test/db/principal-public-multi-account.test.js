// Owner ruling 2026-11-09: Workspace is truly public. Anyone signs in with a
// Google account they control (no roster), and adds a second and third
// account inside the product. One connection then works with every account
// THAT person linked, never anyone else's. Also D-006 MC-7.0: the connect
// step's state is a one-use handle, never a browser cookie.
// Genuine disposable Postgres, the same fixture shape as the tenant tests.
import crypto from 'node:crypto';
import pg from 'pg';
import {describe,it,expect,beforeAll,afterAll,vi} from 'vitest';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
const holder=vi.hoisted(()=>({pool:null}));
vi.mock('@neondatabase/serverless',()=>({neon:()=>async(strings,...values)=>{
 let statement=strings[0];
 for(let i=0;i<values.length;i++)statement+='$'+(i+1)+strings[i+1];
 return (await holder.pool.query(statement,values)).rows;
}}));

const url=process.env.TEST_DATABASE_URL;
if(!url)console.warn('[public multi-account SQL] TEST_DATABASE_URL missing: real DB tests SKIPPED, not passed.');
describe.skipIf(!url)('public sign-in: one person, several Google accounts, one connection',()=>{
 let admin,pool,schema,db,store,a,b,a1,a2,b1,ca,saved;
 const issuer='https://accounts.google.com';
 const challenge='c'.repeat(43);
 beforeAll(async()=>{
  saved={...process.env};
  process.env.DATABASE_URL=url;
  process.env.TOKEN_ENCRYPTION_KEY=crypto.randomBytes(32).toString('base64');
  process.env.PUBLIC_BASE_URL='https://service.test';
  process.env.PUBLIC_GOOGLE_OAUTH_CLIENT_ID='public-test-client-id';
  process.env.GOOGLE_PUBLIC_OAUTH_CLIENT_SECRET='public-test-client-secret';
  admin=new pg.Client({connectionString:url});await admin.connect();
  schema='p10multi_'+crypto.randomBytes(6).toString('hex');
  await admin.query('CREATE SCHEMA '+schema);
  pool=holder.pool=new pg.Pool({connectionString:url,max:8,options:'-c search_path='+schema});
  db=await import('../../src/db.js');
  store=await import('../../src/principals/store.js');
  await db.initSchema();await db.initSchema();
  const later=Date.now()+3600_000;
  a=await store.bindVerifiedIdentity({issuer,sub:'multi-subject-a1',verifiedEmail:'a1@example.test'});
  b=await store.bindVerifiedIdentity({issuer,sub:'multi-subject-b1',verifiedEmail:'b1@example.test'});
  a1=await store.upsertLinkedAccount({principalId:a,issuer,sub:'multi-subject-a1',verifiedEmail:'a1@example.test',
   scopeList:['openid'],tokens:{access_token:'access-a1',refresh_token:'refresh-a1',expiry_date:later}});
  // The second account: a different Google identity, added by the same person.
  a2=await store.upsertLinkedAccount({principalId:a,issuer,sub:'multi-subject-a2',verifiedEmail:'a2@example.test',
   scopeList:['openid'],tokens:{access_token:'access-a2',refresh_token:'refresh-a2',expiry_date:later}});
  b1=await store.upsertLinkedAccount({principalId:b,issuer,sub:'multi-subject-b1',verifiedEmail:'b1@example.test',
   scopeList:['openid'],tokens:{access_token:'access-b1',refresh_token:'refresh-b1',expiry_date:later}});
  ca=await store.issuePrincipalConnection({principal_id:a,account_id:a1,client_id:'muse',
   resource:'https://service.test/api/mcp',profile:'full',listing:'compact',areas:null,cost_policy:{mode:'per_action'},mode:'live'});
 });
 afterAll(async()=>{
  await pool?.end();
  if(admin){try{if(schema)await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');}finally{await admin.end();}}
  process.env=saved;
 });

 it('a person holds both accounts; the other person holds only their own',async()=>{
  expect((await store.listAccounts(a)).map(x=>x.email).sort()).toEqual(['a1@example.test','a2@example.test']);
  expect((await store.listAccounts(b)).map(x=>x.email)).toEqual(['b1@example.test']);
  // A person's first account is their default until they pick another (2026-11-10 live test).
  expect((await store.listAccounts(b))[0].is_default).toBe(true);
  expect((await store.listAccounts(a)).filter(x=>x.is_default).map(x=>x.email)).toEqual(['a1@example.test']);
 });

 it('a call naming the second account acts as it, and keeps the connection as its home',async()=>{
  const context=await store.readPrincipalAccess(ca.accessToken);
  const same=await store.accountContext(context,a1);
  expect(same).toBe(context);
  const other=await store.accountContext(context,a2);
  expect(other).toMatchObject({principalId:a,accountId:a1,connectionId:ca.connectionId,
   googleAccountId:a2,actingAs:'a2@example.test'});
  const {buildPrincipalApiClients}=await import('../../src/principals/clients.js');
  const clients=await buildPrincipalApiClients(other);
  expect(clients.accountId).toBe(a2);
  expect(clients.actingAs).toBe('a2@example.test');
  expect(clients.allowedDomains).toEqual(['example.test']);
  // The change log stays on the connection and names the account acted as.
  const id=await store.scopedStore(other).recordChange({tool:'probe',target:'t',summary:'second account'});
  const row=(await pool.query('SELECT account_id,connection_id,acting_as FROM principal_changes WHERE id=$1',[id])).rows[0];
  expect(row).toEqual({account_id:a1,connection_id:ca.connectionId,acting_as:'a2@example.test'});
 });

 it("another person's account, or a forged context, is refused",async()=>{
  const context=await store.readPrincipalAccess(ca.accessToken);
  await expect(store.accountContext(context,b1)).rejects.toThrow('outside_scope');
  await expect(store.accountContext(Object.freeze({...context}),a2)).rejects.toThrow('invalid_scoped_context');
 });

 it('through the real MCP server: naming an account switches; a stranger account is refused',async()=>{
  const context=await store.readPrincipalAccess(ca.accessToken);
  const {createIsolatedPrincipalServer}=await import('../../api/mcp.js');
  const server=createIsolatedPrincipalServer(context);
  const [serverTransport,clientTransport]=InMemoryTransport.createLinkedPair();
  const client=new Client({name:'multi-account',version:'1.0.0'},{capabilities:{}});
  await server.connect(serverTransport);await client.connect(clientTransport);
  try{
   const parse=r=>JSON.parse(r.content[0].text);
   const mine=await client.callTool({name:'workspace_call',arguments:{name:'workspace_list_accounts',args:{},account:'a2@example.test'}});
   expect(mine.isError).toBeFalsy();
   expect(parse(mine).map(x=>x.email).sort()).toEqual(['a1@example.test','a2@example.test']);
   const theirs=await client.callTool({name:'workspace_call',arguments:{name:'workspace_list_accounts',args:{},account:'b1@example.test'}});
   expect(theirs.isError).toBe(true);
   expect(theirs.content[0].text).toContain('not one of the Google accounts linked here');
   expect(theirs.content[0].text.split('Linked accounts:')[1]).not.toContain('b1@example.test');
  }finally{await client.close();await server.close();}
 });

 it('connect handles: exact match only, spent once (MC-7.0)',async()=>{
  const expect_={clientId:'muse',redirectUri:'https://agent.meta.ai/api/hatch/oauth/callback',
   resource:'https://service.test/api/mcp',codeChallenge:challenge};
  const handle=await store.issueConnectHandle({principalId:a,...expect_,clientState:'s1'});
  expect(handle).toMatch(/^p10h_[A-Za-z0-9_-]{43}$/);
  expect(await store.readConnectHandle(handle,expect_)).toMatchObject({principal_id:a,client_state:'s1'});
  expect(await store.readConnectHandle(handle,{...expect_,redirectUri:'https://evil.test/cb'})).toBeNull();
  expect(await store.consumeConnectHandle(handle,{...expect_,codeChallenge:'d'.repeat(43)})).toBeNull();
  expect(await store.consumeConnectHandle(handle,expect_)).toMatchObject({principal_id:a});
  expect(await store.consumeConnectHandle(handle,expect_)).toBeNull();
  expect(await store.readConnectHandle(handle,expect_)).toBeNull();
  expect(await store.readConnectHandle('p10h_not-a-real-handle')).toBeNull();
 });

 it('only a transaction created cookie-free can be finished without the cookie',async()=>{
  const make=async policy=>{
   const state='p10st_'+crypto.randomBytes(32).toString('base64url');
   await store.createTransaction({state,nonce:'n'+state,browser:'b'+state,verifier:'v'.repeat(48),
    purpose:'mcp_authorize',clientId:'muse',redirectUri:'https://agent.meta.ai/api/hatch/oauth/callback',
    resource:'https://service.test/api/mcp',codeChallenge:challenge,policy});
   return state;
  };
  const bound=await make({group:'identity'});
  expect(await store.consumeCookieFreeTransaction({state:bound,purpose:'mcp_authorize'})).toBeNull();
  const free=await make({group:'complete',cookieFree:true});
  expect(await store.consumeCookieFreeTransaction({state:free,purpose:'link'})).toBeNull();
  expect(await store.consumeCookieFreeTransaction({state:free,purpose:'mcp_authorize'})).toMatchObject({client_id:'muse'});
  expect(await store.consumeCookieFreeTransaction({state:free,purpose:'mcp_authorize'})).toBeNull();
 });

 it('CONTROLS-1: a person changes an app\'s access level and pauses every change, enforced at the server',async()=>{
  const {createIsolatedPrincipalServer}=await import('../../api/mcp.js');
  const open=async()=>{
   const server=createIsolatedPrincipalServer(await store.readPrincipalAccess(ca.accessToken));
   const [st,ct]=InMemoryTransport.createLinkedPair();
   const client=new Client({name:'controls',version:'1.0.0'},{capabilities:{}});
   await server.connect(st);await client.connect(ct);return {server,client};
  };
  const writeRefused=async()=>{const {server,client}=await open();try{
    const r=await client.callTool({name:'workspace_call',arguments:{name:'workspace_set_default_account',args:{email:'a1@example.test'}}});
    return r.isError===true&&/not allowed by the connection|outside_scope/.test(r.content[0].text);
   }finally{await client.close();await server.close();}};
  expect(await writeRefused()).toBe(false);
  // Read only on this one connection.
  expect(await store.setConnectionProfile(a,ca.connectionId,'read_only')).toBe('read_only');
  expect((await store.readPrincipalAccess(ca.accessToken)).profile).toBe('read_only');
  expect(await writeRefused()).toBe(true);
  // Another person cannot change it, and nonsense levels are refused.
  await expect(store.setConnectionProfile(b,ca.connectionId,'full')).rejects.toThrow('outside_scope');
  await expect(store.setConnectionProfile(a,ca.connectionId,'root')).rejects.toThrow('invalid_profile');
  // Back to Full, then the person-wide pause: still refused, at every level.
  await store.setConnectionProfile(a,ca.connectionId,'full');
  expect(await writeRefused()).toBe(false);
  expect(await store.setWritesPaused(a,true)).toBe(true);
  expect((await store.readPrincipalAccess(ca.accessToken)).writesPaused).toBe(true);
  expect(await writeRefused()).toBe(true);
  expect(await store.getWritesPaused(b)).toBe(false);
  await store.setWritesPaused(a,false);
  expect(await writeRefused()).toBe(false);
 });

 it('CONTROLS-2: the person\'s agent flips their pause switch; it works even while paused and on Read only',async()=>{
  const {createIsolatedPrincipalServer}=await import('../../api/mcp.js');
  const call=async(name,args)=>{
   const server=createIsolatedPrincipalServer(await store.readPrincipalAccess(ca.accessToken));
   const [st,ct]=InMemoryTransport.createLinkedPair();
   const client=new Client({name:'pause',version:'1.0.0'},{capabilities:{}});
   await server.connect(st);await client.connect(ct);
   try{return await client.callTool({name:'workspace_call',arguments:{name,args}});}finally{await client.close();await server.close();}
  };
  const writeRefused=async()=>{const r=await call('workspace_set_default_account',{email:'a1@example.test'});return r.isError===true;};
  expect(await writeRefused()).toBe(false);
  const paused=await call('workspace_pause_changes',{paused:true});
  expect(paused.isError).toBeFalsy();
  expect(paused.content[0].text).toContain('"changesPaused": true');
  expect(await store.getWritesPaused(a)).toBe(true);
  expect(await store.getWritesPaused(b)).toBe(false);
  expect(await writeRefused()).toBe(true);
  // Still callable while paused; turning changes back on needs confirm.
  const noConfirm=await call('workspace_pause_changes',{paused:false});
  expect(noConfirm.content[0].text).toContain('"needsConfirmation": true');
  expect(await store.getWritesPaused(a)).toBe(true);
  const resumed=await call('workspace_pause_changes',{paused:false,confirm:true});
  expect(resumed.isError).toBeFalsy();
  expect(await store.getWritesPaused(a)).toBe(false);
  expect(await writeRefused()).toBe(false);
  // A Read-only connection can still pull the brake.
  await store.setConnectionProfile(a,ca.connectionId,'read_only');
  expect((await call('workspace_pause_changes',{paused:true})).isError).toBeFalsy();
  expect(await store.getWritesPaused(a)).toBe(true);
  await store.setWritesPaused(a,false);await store.setConnectionProfile(a,ca.connectionId,'full');
  // Both flips are in the change log, under this connection.
  const rows=(await pool.query("SELECT summary FROM principal_changes WHERE tool='workspace_pause_changes' AND connection_id=$1 AND NOT dry_run ORDER BY id",[ca.connectionId])).rows.map(r=>r.summary);
  expect(rows.some(x=>/Pause all changes/.test(x))).toBe(true);
  expect(rows.some(x=>/Allow changes again/.test(x))).toBe(true);
 });

 it('the sign-in address shown on the Approve page is the person\'s own',async()=>{
  expect(await store.principalSignInEmail(a)).toBe('a1@example.test');
  expect(await store.principalSignInEmail(b)).toBe('b1@example.test');
 });
});
