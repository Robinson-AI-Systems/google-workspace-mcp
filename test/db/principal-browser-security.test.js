import crypto from 'node:crypto';
import pg from 'pg';
import {describe,it,expect,beforeAll,afterAll,vi} from 'vitest';

// Replace the wire transport only: handlers, sessions, CSRF and stores are real.
const holder=vi.hoisted(()=>({pool:null}));
vi.mock('@neondatabase/serverless',()=>({neon:()=>async(strings,...values)=>{
 let text=strings[0];for(let i=0;i<values.length;i++)text+='$'+(i+1)+strings[i+1];
 return (await holder.pool.query(text,values)).rows;
}}));
const url=process.env.TEST_DATABASE_URL;
if(!url)console.warn('[P10 browser SQL] TEST_DATABASE_URL unavailable: SKIPPED, not passed.');
const response=()=>({statusCode:200,headers:{},body:null,
 setHeader(k,v){this.headers[k]=v;},getHeader(k){return this.headers[k];},
 status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;},
 send(v){this.body=v;return this;}});
const cookie=(browser,csrf=browser.csrf)=>
 'p10_session='+browser.secret+'; p10_csrf='+csrf;
const request=(method,headersCookie,body={})=>({method,query:{},body,
 headers:{cookie:headersCookie,host:'browser.example.test'}});

describe.skipIf(!url)('actual browser handlers and two-principal CSRF with real PostgreSQL',()=>{
 let admin,pool,schema,db,store,account,logout,session,prior,browsers,baseline;
 async function snapshot(){
  return {
   owners:(await pool.query('SELECT access_token,refresh_token,client_id,expires_at,revoked_at FROM oauth_tokens ORDER BY access_token')).rows,
   grants:(await pool.query('SELECT id,principal_id,scope_list,grant_ciphertext,status,token_version FROM principal_google_accounts ORDER BY id')).rows,
   agents:(await pool.query('SELECT id,principal_id,access_hash,refresh_hash,revoked_at FROM principal_connections ORDER BY id')).rows,
   deletions:(await pool.query('SELECT * FROM principal_deletion_requests')).rows
  };
 }
 beforeAll(async()=>{
  prior={...process.env};
  process.env.DATABASE_URL=url;
  process.env.TOKEN_ENCRYPTION_KEY=crypto.randomBytes(32).toString('base64');
  process.env.PUBLIC_BASE_URL='https://browser.example.test';
  process.env.PUBLIC_SIGNIN_MODE='pilot';
  admin=new pg.Client({connectionString:url});await admin.connect();
  schema='browser_'+crypto.randomBytes(6).toString('hex');await admin.query('CREATE SCHEMA '+schema);
  pool=holder.pool=new pg.Pool({connectionString:url,max:5,options:'-c search_path='+schema});
  db=await import('../../src/db.js');store=await import('../../src/principals/store.js');
  ({default:account}=await import('../../api/account.js'));
  ({default:logout}=await import('../../api/auth/logout.js'));
  ({default:session}=await import('../../api/auth/session.js'));
  await db.initSchema();
  await db.saveGoogleTokensFor('owner@example.test',{access_token:'fixture-owner-google',refresh_token:'fixture-owner-google-refresh'});
  await db.createAccessToken({accessToken:'fixture-original-bearer',refreshToken:'fixture-original-refresh',
   clientId:'fixture-owner-client',googleAccount:'owner@example.test',profile:'read_only'});
  browsers=[];
  for(const label of ['alpha','bravo']){
   const issuer='https://accounts.google.com',sub='fixture-'+label,email=label+'@example.test';
   const principal=await store.bindVerifiedIdentity({issuer,sub,verifiedEmail:email});
   const accountId=await store.upsertLinkedAccount({principalId:principal,issuer,sub,
    verifiedEmail:email,scopeList:['https://www.googleapis.com/auth/gmail.readonly'],
    tokens:{access_token:'fixture-google-'+label,refresh_token:'fixture-refresh-'+label}});
   const agent=await store.issuePrincipalConnection({principal_id:principal,account_id:accountId,
    client_id:'fixture-client-'+label,resource:'https://browser.example.test/api/mcp',
    profile:'read_only',listing:'compact',areas:['mail'],cost_policy:{mode:'deny'}});
   browsers.push({...await store.createSession(principal),principal,agent});
  }
  baseline=await snapshot();
 });
 afterAll(async()=>{
  await pool?.end();
  if(admin){try{if(schema)await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');}finally{await admin.end();}}
  if(prior){for(const key of Object.keys(process.env))if(!(key in prior))delete process.env[key];Object.assign(process.env,prior);}
 });
 it('accepts each owned valid session for preview only and returns its own account counts',async()=>{
  for(const browser of browsers){
   const out=response();await account(request('POST',cookie(browser),{action:'delete_preview',csrf:browser.csrf}),out);
   expect(out.statusCode).toBe(200);
   expect(out.body).toMatchObject({accounts:1,agent_connections:1,sessions:1,previewOnly:true,deleted:false});
  }
  expect(await snapshot()).toEqual(baseline);
 });
 it('refuses missing, wrong, short and foreign-session CSRF before deletion or logout mutation',async()=>{
  for(const [index,browser]of browsers.entries()){
   const foreign=browsers[1-index];
   const attacks=[
    {cookies:cookie(browser),csrf:undefined},
    {cookies:cookie(browser),csrf:foreign.csrf},
    {cookies:cookie(browser,foreign.csrf),csrf:foreign.csrf},
    {cookies:cookie(browser,'short'),csrf:'short'}
   ];
   for(const attack of attacks){
    const denied=response();await account(request('POST',attack.cookies,{action:'request_delete',csrf:attack.csrf}),denied);
    expect(denied.statusCode).toBe(403);
    const stopped=response();await logout(request('POST',attack.cookies,{csrf:attack.csrf}),stopped);
    expect(stopped).toMatchObject({statusCode:403,body:{error:'invalid_session_or_csrf'}});
    expect(await store.readSession(browser.secret)).toMatchObject({principal_id:browser.principal});
    expect(await store.readSession(foreign.secret)).toMatchObject({principal_id:foreign.principal});
    expect(await snapshot()).toEqual(baseline);
   }
  }
 });
 it('logs out exactly the submitting browser, refuses replay, and preserves owner and agent credentials',async()=>{
  for(const [index,browser]of browsers.entries()){
   const get=response();await logout(request('GET',cookie(browser)),get);
   expect(get.statusCode).toBe(405);
   expect(await store.readSession(browser.secret)).not.toBeNull();
   const out=response();await logout(request('POST',cookie(browser),{csrf:browser.csrf}),out);
   expect(out).toMatchObject({statusCode:200,body:{loggedOut:true,agentConnectionsRevoked:false}});
   const replay=response();await logout(request('POST',cookie(browser),{csrf:browser.csrf}),replay);
   expect(replay.statusCode).toBe(403);
   const anonymous=response();await session(request('GET',cookie(browser)),anonymous);
   expect(anonymous).toMatchObject({statusCode:401,body:{authenticated:false}});
   expect(await store.readSession(browser.secret)).toBeNull();
   if(index===0)expect(await store.readSession(browsers[1].secret)).not.toBeNull();
   expect(await store.readPrincipalAccess(browser.agent.accessToken)).toMatchObject({principalId:browser.principal});
   expect(await snapshot()).toEqual(baseline);
  }
  expect((await db.getTokenByRefreshToken('fixture-original-refresh')).client_id).toBe('fixture-owner-client');
 });
});
