import {describe,it,expect,vi,beforeAll,afterAll} from 'vitest';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createFakeDb} from '../helpers/fake-db.js';

const holder=vi.hoisted(()=>({db:null,writes:0,labels:new Map()}));
vi.mock('../../src/db.js',async importActual=>{
 const real=await importActual();
 return Object.fromEntries(Object.keys(real).map(name=>[name,(...args)=>holder.db[name](...args)]));
});
vi.mock('../../src/auth/google-auth-hosted.js',()=>({
 buildHostedApiClients:async email=>({actingAs:email,gmail:{users:{getProfile:async()=>({data:{emailAddress:email}}),
  messages:{send:async()=>{holder.writes++;return {data:{id:'sent'}};}},
  labels:{
   create:async ({requestBody})=>{holder.writes++;const row={id:'Label_http',...requestBody};holder.labels.set(row.id,row);return {data:row};},
   get:async ({id})=>{const row=holder.labels.get(id);if(!row)throw Object.assign(Error('missing'),{code:404});return {data:row};},
   delete:async ({id})=>{holder.writes++;holder.labels.delete(id);return {data:{}};}
  }}}})
}));
const {default:gateway}=await import('../../api/rtc-gateway.js');
const {registry}=await import('../../src/tools/index.js');
const config=JSON.parse(await readFile(new URL('../../vercel.json',import.meta.url),'utf8'));
let server,origin,token,passId,wideToken;
function route(url){
 // Apply the *checked-in* Vercel rewrites, not invented independent routes.
 for(const rewrite of config.rewrites){
  const parts=rewrite.source.split('/').filter(Boolean);
  const actual=url.pathname.split('/').filter(Boolean);
  if(parts.length!==actual.length)continue;
  const params={};let matches=true;
  for(let i=0;i<parts.length;i++){
   if(parts[i].startsWith(':'))params[parts[i].slice(1)]=actual[i];
   else if(parts[i]!==actual[i])matches=false;
  }
  if(!matches)continue;
  const destination=new URL(rewrite.destination,'https://internal.invalid');
  const query=Object.fromEntries(destination.searchParams.entries());
  for(const [key,value] of Object.entries(query))if(value.startsWith(':'))query[key]=params[value.slice(1)];
  // Vercel/Node query decoders preserve repeated keys as arrays; a
  // test adapter that overwrites them would miss parameter-smuggling bugs.
  for(const [key,value] of url.searchParams){
   if(Object.hasOwn(query,key)){
    const old=query[key];query[key]=Array.isArray(old)?[...old,value]:[old,value];
   }else query[key]=value;
  }
  return {pathname:destination.pathname,query};
 }
 return {pathname:'',query:{}};
}
async function request(path,{method='GET',bearer=token,body}={}){
 const resp=await fetch(origin+path,{method,headers:{...(bearer?{authorization:'Bearer '+bearer}:{}),
  ...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'error'});
 return {status:resp.status,headers:resp.headers,value:await resp.json()};
}
beforeAll(async()=>{
 holder.db=createFakeDb();
 process.env.RTC_TEST_ACCOUNT_EMAILS='ops@example.test';
 await holder.db.saveGoogleTokensFor('ops@example.test',{access_token:'fixture-not-a-real-token'});
 ({token,id:passId}=await holder.db.createRtcPass({googleAccount:'ops@example.test',areas:['workspace'],rateLimit:120}));
 ({token:wideToken}=await holder.db.createRtcPass({googleAccount:'ops@example.test',rateLimit:600}));
 server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  const matched=route(url);
  if(matched.pathname!=='/api/rtc-gateway'){res.statusCode=404;res.end('not found');return;}
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  let body={};if(chunks.length){try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{res.statusCode=400;res.end();return;}}
  req.query=matched.query;req.body=body;
  res.status=function(n){this.statusCode=n;return this;};
  res.json=function(value){this.end(JSON.stringify(value));return this;};
  try{await gateway(req,res);}catch{res.statusCode=500;res.end(JSON.stringify({ok:false,error:{code:'unexpected'}}));}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 origin='http://127.0.0.1:'+server.address().port;
});
afterAll(async()=>{if(server)await new Promise(resolve=>server.close(resolve));});
describe('real Node HTTP to Workspace gateway using checked-in Vercel route table',()=>{
 it('serves a public raw manifest without secret material',async()=>{
  const r=await request('/api/contract',{bearer:null});
  expect(r.status).toBe(200);
  expect(r.value).toMatchObject({rtc:1,prefix:'workspace'});
  expect(r.headers.get('cache-control')).toBe('no-store');
  expect(JSON.stringify(r.value)).not.toContain('rtc_pass_');
 });
 it('does not authorize a tool catalog or identity without the service pass',async()=>{
  for(const path of ['/api/whoami','/api/tools']){
   const r=await request(path,{bearer:null});
   expect(r.status).toBe(401);expect(r.value.ok).toBe(false);
  }
  const r=await request('/api/whoami',{bearer:'unrelated-connector-token'});
  expect(r.status).toBe(401);
 });
 it('proves the actual route returns scoped identity and a usable read catalog',async()=>{
  const who=await request('/api/whoami');
  expect(who.value.result).toMatchObject({account:'ops@example.test',profile:'read_only',mode:'test',allow_writes:false});
  const tools=await request('/api/tools?listing=catalog&limit=2');
  expect(tools.status).toBe(200);
  expect(tools.value.result.tools).toHaveLength(2);
  expect(tools.value.result.next).toBe('2');
 });
 it('searches the full permitted catalog for compact connections',async()=>{
  const result=await request('/api/tools?q=workspace_gmail_get_label',{bearer:wideToken});
  expect(result.value.result.tools.some(t=>t.name==='workspace_gmail_get_label')).toBe(true);
  const denied=await request('/api/tools?q=workspace_gmail_get_label');
  expect(denied.value.result.tools).toEqual([]);
 });
 it('permits the read-only meta dispatcher only for the exact authorized read',async()=>{
  const direct=await request('/api/tools/workspace_list_accounts',{method:'POST',body:{}});
  const nested=await request('/api/tools/workspace_call',{method:'POST',body:{name:'workspace_list_accounts',args:{}}});
  expect(direct.status).toBe(200);
  expect(nested.status).toBe(200);
  expect(nested.value.result).toEqual(direct.value.result);
  expect(holder.writes).toBe(0);
 });
 it('rejects nested writes, out-of-area targets, recursion and raw unprefixed names',async()=>{
  for(const name of ['workspace_gmail_send_email','workspace_drive_create_folder',
   'workspace_call','workspace_batch','gmail_list_messages','workspace_not_real']){
   const r=await request('/api/tools/workspace_call',{method:'POST',body:{name,args:{confirm:true}}});
   expect(r.status,name).toBe(403);
  }
  const write=await request('/api/tools/workspace_gmail_send_email',{method:'POST',body:{confirm:true}});
  expect(write.status).toBe(403);expect(holder.writes).toBe(0);
 });
 it('describes the read-only meta dispatcher without authorizing nested writes',async()=>{
   const before=holder.writes;
   const detail=await request('/api/tools/workspace_call');
   expect(detail.status).toBe(200);
   expect(detail.value.result.name).toBe('workspace_call');
   expect(holder.writes).toBe(before);
   const denied=await request('/api/tools/workspace_call',{method:'POST',
     body:{name:'workspace_gmail_send_email',args:{confirm:true}}});
   expect(denied.status).toBe(403);
   expect(holder.writes).toBe(before);
 });
 it('refuses malformed batch entries before provider execution',async()=>{
   const before=holder.writes;
   for(const calls of [[null],[42],['x'],[{}],[{name:'workspace_list_accounts',args:null}],
       [{name:'workspace_list_accounts',args:[]}],[{name:'workspace_list_accounts',args:'bad'}]]) {
     const r=await request('/api/tools/_batch',{method:'POST',body:{calls}});
     expect(r.status,JSON.stringify(calls)).toBe(400);
     expect(r.value.error.code).toBe('invalid_args');
     expect(holder.writes).toBe(before);
   }
 });
 it('reports malformed owned result projection as 400 without a response or provider leak',async()=>{
   const handle='rtc_result_'+'b'.repeat(32);
   await holder.db.storeRtcResult({handle,connection:passId,payload:{data:{items:[{id:'x'}]},bytes:22}});
   const r=await request('/api/results/'+handle+'?fields=__proto__.polluted');
   expect(r.status).toBe(400);
   expect(r.value.error.code).toBe('invalid_args');
   expect(r.value.result).toBeUndefined();
 });
 it('refuses mixed read/write batches before any execution',async()=>{
  const r=await request('/api/tools/_batch',{method:'POST',body:{calls:[
   {name:'workspace_list_accounts'}, {name:'workspace_gmail_send_email',args:{confirm:true}}
  ]}});
  expect(r.status).toBe(403);expect(holder.writes).toBe(0);
 });
 it('denies unknown route and invalid result handle without changing state',async()=>{
  expect((await request('/api/tools/workspace_missing')).status).toBe(404);
  const result=await request('/api/results/not-a-valid-handle');
  expect(result.status).toBe(400);
  expect(result.value.error.code).toBe('invalid_args');
  expect(holder.writes).toBe(0);
  const missing=await request('/api/results/rtc_result_'+'z'.repeat(32));
  expect(missing.status).toBe(404);
  expect(missing.value.error.code).toBe('not_found');
 });

 it('blocks accidental service-pass disclosure through direct, nested and batch reads',async()=>{
  const original=registry.handlers.workspace_list_accounts;
  registry.handlers.workspace_list_accounts=async()=>({content:[{type:'text',text:JSON.stringify({pass:token})}]});
  try{
   for(const [path,body] of [
    ['/api/tools/workspace_list_accounts',{}],
    ['/api/tools/workspace_call',{name:'workspace_list_accounts'}],
    ['/api/tools/_batch',{calls:[{name:'workspace_list_accounts'}]}]
   ]){
    const r=await request(path,{method:'POST',body});
    expect(r.status,path).toBe(403);
    expect(r.value.error.code).toBe('refused_by_guard');
    expect(JSON.stringify(r.value)).not.toContain(token);
   }
  }finally{registry.handlers.workspace_list_accounts=original;}
 });
 it('redacts a service pass even if a provider-shaped error includes one',async()=>{
  const original=registry.handlers.workspace_list_accounts;
  registry.handlers.workspace_list_accounts=async()=>({
   isError:true,content:[{type:'text',text:'service_error: unexpected '+token}]});
  try{
   const r=await request('/api/tools/workspace_list_accounts',{method:'POST',body:{}});
   expect(r.status).toBe(503);
   expect(JSON.stringify(r.value)).not.toContain(token);
   expect(r.value.error.what).toContain('[redacted service pass]');
  }finally{registry.handlers.workspace_list_accounts=original;}
 });
 it('blocks sensitive values retrieved through a valid connection-owned result handle',async()=>{
  const handle='rtc_result_'+'a'.repeat(32);
  await holder.db.storeRtcResult({handle,connection:passId,payload:{data:{accidentalPass:token},bytes:55}});
  const r=await request('/api/results/'+handle);
  expect(r.status).toBe(403);expect(r.value.error.code).toBe('refused_by_guard');
  expect(JSON.stringify(r.value)).not.toContain(token);
 });


 it('rejects fractional, zero, negative, repeated, huge and nonnumeric pagination',async()=>{
  for(const input of ['limit=0','limit=1.5','limit=-1','limit=101','limit=Infinity',
    'limit=abc','limit=2&limit=3','page=0','page=-1','page=1.2',
    'page=100001','page=Infinity','page=abc','page=1&page=2']){
   const r=await request('/api/tools?'+input,{bearer:wideToken});
   expect(r.status,input).toBe(400);
   expect(r.value.error.code).toBe('invalid_args');
  }
 });
 it('recovers every available service tool exactly once through bounded catalog pages',async()=>{
  const {listedTools}=await import('../../src/rtc/catalog.js');
  const {toExternal}=await import('../../api/rtc-gateway.js');
  const pass=await holder.db.getRtcPass(wideToken);
  const expected=listedTools(registry.tools,pass,'catalog').map(t=>toExternal(t.name));
  const actual=[];
  for(let page=1;page<100;page++){
   const r=await request('/api/tools?listing=catalog&limit=7&page='+page,{bearer:wideToken});
   expect(r.status).toBe(200);
   expect(r.headers.get('cache-control')).toBe('no-store');
   const found=r.value.result.tools;
   expect(found.length).toBeLessThanOrEqual(7);
   actual.push(...found.map(t=>t.name));
   if(r.value.result.next===null)break;
   expect(r.value.result.next).toBe(String(page+1));
  }
  expect(actual.length).toBeGreaterThan(100);
  expect(new Set(actual).size).toBe(actual.length);
  expect(actual).toEqual(expected);
 });

 it('rejects an oversized batch before executing its otherwise valid reads',async()=>{
  const before=holder.writes;
  const r=await request('/api/tools/_batch',{method:'POST',body:{calls:[
   {name:'workspace_list_accounts',args:{oversize:'x'.repeat(70000)}}
  ]}});
  expect(r.status).toBe(413);
  expect(r.value.error.code).toBe('invalid_args');
  expect(holder.writes).toBe(before);
 });
 it('keeps large read batches behind private 24-hour handles instead of returning them inline',async()=>{
  const original=registry.handlers.workspace_list_accounts;
  registry.handlers.workspace_list_accounts=async()=>({
   content:[{type:'text',text:JSON.stringify({value:'🦉'.repeat(6000)})}]});
  try{
   const r=await request('/api/tools/_batch',{method:'POST',
    body:{calls:[{name:'workspace_list_accounts'}]}});
   expect(r.status).toBe(200);
   expect(Buffer.byteLength(JSON.stringify(r.value),'utf8')).toBeLessThanOrEqual(8192);
   const handle=r.value.handle;
   expect(handle).toMatch(/^rtc_result_/);
   expect(r.value.result.handle).toBe(handle);
   const page=await request('/api/results/'+handle+'?page=1');
   expect(page.status).toBe(200);
   expect(page.value.result.page).toBe(1);
   expect(Buffer.byteLength(page.value.result.content,'utf8')).toBeLessThanOrEqual(4096);
   const defaultPage=await request('/api/results/'+handle);
   expect(defaultPage.status).toBe(200);
   expect(defaultPage.value.result).toMatchObject({page:1,next:page.value.result.next});
   expect(defaultPage.value.result).not.toHaveProperty('payload');
   expect(Buffer.byteLength(JSON.stringify(defaultPage.value),'utf8')).toBeLessThanOrEqual(8192);
   const stranger=await request('/api/results/'+handle+'?page=1',{bearer:wideToken});
   expect(stranger.status).toBe(404);
  }finally{registry.handlers.workspace_list_accounts=original;}
 });
 it('serves the complete public OpenAPI contract on the actual rewrite without a bearer',async()=>{
  const result=await request('/api/openapi.json',{bearer:null});
  expect(result.status).toBe(200);
  expect(result.value.openapi).toBe('3.1.0');
  expect(result.value.paths['/api/tools/{name}'].post.requestBody.required).toBe(true);
  expect(result.value.paths['/api/results/{handle}'].get.parameters.map(x=>x.name)).toEqual(['handle','page','fields']);
  expect(result.value.components.schemas.Error.required).toEqual(['ok','error']);
 });
 it('rejects malformed JSON argument objects and ambiguous catalog filters with no Google writes',async()=>{
  const before=holder.writes;
  for(const body of [null,[],true,42,'text']){
   const r=await fetch(origin+'/api/tools/workspace_gmail_create_label',{method:'POST',
    headers:{authorization:'Bearer '+wideToken,'content-type':'application/json'},body:JSON.stringify(body)});
   expect(r.status).toBe(400);
   expect((await r.json()).error.code).toBe('invalid_args');
  }
  for(const query of ['area=invalid','audience=invalid','listing=invalid','area=mail&area=files','q=a&q=b']){
   const r=await request('/api/tools?'+query,{bearer:wideToken});
   expect(r.status).toBe(400);
   expect(r.value.error.code).toBe('invalid_args');
  }
  expect(holder.writes).toBe(before);
 });
 it('returns the same guarded label lifecycle through direct MCP registry, broker and actual HTTPS',async()=>{
  const pass=await holder.db.createRtcPass({googleAccount:'ops@example.test',allowWrites:true,
   confirmedAccount:'ops@example.test',areas:['mail'],rateLimit:600});
  // This is exactly the final registry used by api/mcp.js, with a fake Google
  // provider and durable fake audit store, not invented success handlers.
  const {buildHostedApiClients}=await import('../../src/auth/google-auth-hosted.js');
  const clients=await buildHostedApiClients('ops@example.test');
  clients.connection=pass.id;clients.allowedDomains=['example.test'];
  clients.rtcPolicy=await holder.db.getRtcPass(pass.token);
  const decode=r=>JSON.parse(r.content[0].text);
  const invokeDoor=async(door,name,args)=>{
   if(door==='mcp')return decode(await registry.handlers[name](args,clients));
   if(door==='broker')return decode(await registry.handlers.workspace_call({name,args},clients));
   const r=await request('/api/tools/'+(door==='http'?'workspace_'+name:'workspace_call'),{
    method:'POST',bearer:pass.token,body:door==='http'?args:{name:'workspace_'+name,args}});
   expect(r.status).toBe(200);return r.value.result;
  };
  for(const door of ['mcp','broker','http','http-broker']){
   const before=holder.writes;
   const receipt=door.startsWith('http')?{id:expect.any(Number)}:true;
   const preview=await invokeDoor(door,'gmail_create_label',{name:'rtc-http-preview',dryRun:true});
   expect(preview).toMatchObject({done:false,dryRun:true,logged:receipt});
   expect(holder.writes).toBe(before);
   const create=await invokeDoor(door,'gmail_create_label',{name:'rtc-http-label'});
   expect(create).toMatchObject({done:true,confirmed:true,logged:receipt,after:{id:'Label_http',name:'rtc-http-label'}});
   expect(holder.writes).toBe(before+1);
   const fenced=await invokeDoor(door,'gmail_delete_label',{labelId:'Label_http'});
   expect(fenced).toMatchObject({done:false,needsConfirmation:true});
   expect(holder.writes).toBe(before+1);
   const remove=await invokeDoor(door,'gmail_delete_label',{labelId:'Label_http',confirm:true});
   expect(remove).toMatchObject({done:true,confirmed:true,logged:receipt,after:{exists:false}});
   expect(holder.writes).toBe(before+2);
   expect(holder.labels.size).toBe(0);
  }
 });
 it('encodes thrown provider failures with a safe RTC envelope and preserves possible-write uncertainty',async()=>{
  const original=registry.handlers.workspace_list_accounts;
  try{
   for(const [code,status,errorCode] of [[401,401,'permission'],[403,403,'permission'],[429,429,'rate_limited'],[500,503,'service_error']]){
    registry.handlers.workspace_list_accounts=async()=>{throw Object.assign(Error('private-provider-detail '+wideToken),{code});};
    const out=await request('/api/tools/workspace_list_accounts',{method:'POST',bearer:wideToken,body:{}});
    expect(out.status).toBe(status);
    expect(out.value).toMatchObject({ok:false,error:{code:errorCode}});
    expect(Object.keys(out.value.error).sort()).toEqual(['cause','code','technical','todo','what']);
    expect(JSON.stringify(out.value)).not.toContain('private-provider-detail');
    expect(JSON.stringify(out.value)).not.toContain(wideToken);
   }
  }finally{registry.handlers.workspace_list_accounts=original;}
 });
 it('enforces immediate revocation over HTTP',async()=>{
  await holder.db.revokeRtcPass(passId);
  const r=await request('/api/whoami');
  expect(r.status).toBe(401);expect(r.value.error.code).toBe('pass_revoked');
 });
});
