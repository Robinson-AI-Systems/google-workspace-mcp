// RTC 1 HTTPS door, sharing the exact wrapped handlers used by /api/mcp.
// Existing legacy MCP tool names remain untouched; HTTPS uses workspace_ aliases.
import { registry } from '../src/tools/index.js';
import { RTC_AREAS,RTC_META,allowedTool,listedTools,toolMetadata,isWrite } from '../src/rtc/catalog.js';
import { initSchema,getRtcPass,rtcPassFailureCode,chargeRtcPass,getAllowedDomains } from '../src/db.js';
import { onceSuccessful } from '../src/once.js';
import { buildHostedApiClients } from '../src/auth/google-auth-hosted.js';
import { readStoredResult } from '../src/rtc/results.js';
const schemaReady=onceSuccessful(initSchema);
const prefix='workspace_';
export const toExternal=name=>name.startsWith(prefix)?name:prefix+name;
export function toInternal(name){
 if(typeof name!=='string'||!name.startsWith(prefix))return null;
 if(Object.hasOwn(registry.handlers,name))return name;
 const candidate=name.slice(prefix.length);
 return Object.hasOwn(registry.handlers,candidate)?candidate:null;
}
const expose=t=>({...toolMetadata(t),name:toExternal(t.name)});
// A service-issued pass must never appear in any RTC JSON success or
// provider error, including batch responses or retrieved stored results.
const SERVICE_PASS_RE=/rtc_pass_[A-Za-z0-9_-]{43}/g;
const redactPass=value=>String(value).replace(SERVICE_PASS_RE,'[redacted service pass]');
function reply(res,status,data,retryAfter){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(retryAfter)res.setHeader('Retry-After',String(retryAfter));
 return res.status(status).json(data);
}
const success=(res,result,mode='test')=>{
 const data={ok:true,result,mode};
 if(result&&typeof result==='object'&&typeof result.handle==='string'){
   data.handle=result.handle;
   data.count=result.count;
   data.summary=result.summary;
 }
 // Check the entire serialized envelope, not only direct POST tool results:
 // batch-read and result-handle paths can contain nested provider text.
 if(SERVICE_PASS_RE.test(JSON.stringify(data))){
  SERVICE_PASS_RE.lastIndex=0;
  return fail(res,403,'refused_by_guard','Sensitive service pass cannot be returned.');
 }
 SERVICE_PASS_RE.lastIndex=0;
 return reply(res,200,data);
};
const fail=(res,status,code,what,todo='',retryAfter)=>reply(res,status,{ok:false,error:{
 what:redactPass(what),cause:'',todo:redactPass(todo),technical:'',code}},retryAfter);
function decodeMcp(result){
 if(result?.isError){
  const text=result?.content?.find(x=>x.type==='text')?.text||'Tool failed';
  const found=/^(?:Error: )?([a-z_]+):/.exec(text);
  return {error:{what:text.slice(0,300),code:found?.[1]||'service_error'}};
 }
 const text=result?.content?.find(x=>x.type==='text')?.text;
 if(!text)return result?.structuredContent??null;
 try{return JSON.parse(text)}catch{return text}
}
const aliasArgs=(name,args)=>{
 if(name==='workspace_call'){
  return {...args,name:toInternal(args?.name)||'not_found'};
 }
 if(name==='workspace_batch'){
  return {...args,calls:Array.isArray(args?.calls)?args.calls.map(c=>({...c,name:toInternal(c.name)||'not_found'})):args?.calls};
 }
 return args;
};
export function manifest(){
 const metadata=registry.tools.map(expose);
 return {rtc:1,server:'google-workspace-mcp',prefix:'workspace_',version:'1.0.0',
  areas:RTC_AREAS,counts:{tools:metadata.length,writes:metadata.filter(t=>t.writes).length,money:0},
  profiles:['read_only','everyday','full'],listingModes:['catalog','compact'],modes:['test'],
  devTools:true,conformance:{status:'pending_real_D4_acceptance'},
  deployment:{sourceRevision:/^[a-f0-9]{40}$/.test(process.env.VERCEL_GIT_COMMIT_SHA||'')?process.env.VERCEL_GIT_COMMIT_SHA:null}};
}
export function openapi(){
 return {openapi:'3.1.0',info:{title:'Robinson Google Workspace RTC tools',version:'1.0.0'},servers:[{url:process.env.PUBLIC_BASE_URL||''}],
 paths:{'/api/contract':{get:{operationId:'contract'}},'/api/whoami':{get:{operationId:'whoami'}},
 '/api/tools':{get:{operationId:'searchTools'}},'/api/tools/{name}':{get:{operationId:'describeTool'},post:{operationId:'callTool'}},
 '/api/results/{handle}':{get:{operationId:'getResult'}},'/api/tools/_batch':{post:{operationId:'batchReads'}}}};
}
async function clientsFor(pass){
 const clients=await buildHostedApiClients(pass.google_account);
 clients.rtcPolicy=pass;
 clients.connection=pass.id;
 clients.allowedDomains=await getAllowedDomains(clients.actingAs);
 return clients;
}
export default async function handler(req,res){
 const door=String(req.query?.door||'');
 const name=typeof req.query?.tool==='string'?req.query.tool:null;
 const handle=typeof req.query?.result==='string'?req.query.result:null;
 if(req.method==='GET'&&door==='contract')return reply(res,200,manifest());
 if(req.method==='GET'&&door==='openapi')return reply(res,200,openapi());
 if(!['GET','POST'].includes(req.method))return fail(res,405,'invalid_args','Method is not supported.');
 await schemaReady();
 const authorization=req.headers.authorization||'';
 const token=authorization.startsWith('Bearer ')?authorization.slice(7):'';
 const pass=await getRtcPass(token);
 if(!pass)return fail(res,401,await rtcPassFailureCode(token),'Valid non-production RTC pass required.');
 if(!await chargeRtcPass(pass.id,pass.rate_limit_per_minute))return fail(res,429,'rate_limited','Pass call limit reached.','Retry after this minute.',60);
 if(req.method==='GET'&&door==='whoami')return success(res,{connection:pass.id,account:pass.google_account,profile:pass.profile,areas:pass.areas,listing:pass.listing,mode:pass.mode,allow_writes:pass.allow_writes});
 if(req.method==='GET'&&door==='tools'){
  const q=String(req.query?.q||'').toLowerCase(),area=req.query?.area,audience=req.query?.audience;
  const limit=Math.min(100,Math.max(1,Number(req.query?.limit)||10));
  const page=Math.max(1,Math.min(100000,Number(req.query?.page)||1));
  if(!Number.isInteger(page))return fail(res,400,'invalid_args','Page must be an integer.');
  const all=listedTools(registry.tools,pass,req.query?.listing||pass.listing)
   .map(expose).filter(t=>(!q||(t.name+' '+t.description).toLowerCase().includes(q))&&(!area||t.area===area)&&(!audience||t.audience.includes(audience)));
  const start=(page-1)*limit;
  const tools=all.slice(start,start+limit);
  return success(res,{tools,next:start+limit<all.length?String(page+1):null});
 }
 if(req.method==='GET'&&handle){
  const result=decodeMcp(await readStoredResult({handle,page:req.query?.page,fields:req.query?.fields},pass.id));
  return result?.error?fail(res,404,result.error.code,result.error.what):success(res,result);
 }
 if(name){
  if(name==='_batch'){
   if(req.method!=='POST')return fail(res,405,'invalid_args','Batch accepts POST only.');
   const args=aliasArgs('workspace_batch',req.body||{});
   if(!Array.isArray(args.calls)||!args.calls.length||args.calls.length>10)return fail(res,400,'invalid_args','Batch accepts 1–10 read calls.');
   for(const call of args.calls){
    if(!call.name||!allowedTool(call.name,pass)||isWrite(call.name))return fail(res,403,'refused_by_guard','Batch permits only authorized read tools.');
   }
   const result=decodeMcp(await registry.handlers.workspace_batch(args,await clientsFor(pass)));
   return result?.error?fail(res,403,result.error.code,result.error.what):success(res,result);
  }
  const internal=toInternal(name);
  if(!internal)return fail(res,404,'not_found','Unknown RTC tool.');
  // workspace_call is a dispatcher, not an unconditional write. For a read-only
  // pass authorize its exact target BEFORE building Google clients. The inner
  // registry dispatcher independently enforces profile, areas and no recursion.
  // A named write, unknown target or nested meta-tool must fail closed here.
  if(internal==='workspace_call'&&!pass.allow_writes){
   const target=toInternal(req.body?.name);
   if(!target||RTC_META.has(target)||isWrite(target)||!allowedTool(target,pass))
    return fail(res,403,'refused_by_guard','Only authorized reads are allowed through this pass.');
  }else if(isWrite(internal)&&!pass.allow_writes){
   return fail(res,403,'refused_by_guard','This pass is read only.');
  }
  if(!allowedTool(internal,pass))return fail(res,403,'outside_scope','Tool is outside the pass permissions.');
  if(req.method==='GET')return success(res,expose(registry.tools.find(t=>t.name===internal)));
  if(req.method!=='POST')return fail(res,405,'invalid_args','Tool invocation requires POST.');
  if(Buffer.byteLength(JSON.stringify(req.body||{}))>65536)return fail(res,413,'invalid_args','Arguments too large.');
  const result=decodeMcp(await registry.handlers[internal](aliasArgs(internal,req.body||{}),await clientsFor(pass)));
  return result?.error?fail(res,400,result.error.code,result.error.what):success(res,result);
 }
 return fail(res,404,'not_found','Unknown RTC route.');
}
