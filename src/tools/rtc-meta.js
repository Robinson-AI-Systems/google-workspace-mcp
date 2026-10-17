// Compact discovery and dispatch share the exact same wrapped registry as MCP.
// A call cannot escape a connection's profile, areas, domain guards or write guards.
import { ok, errorResult } from './util.js';
import { readStoredResult } from '../rtc/results.js';
import { allowedTool, listedTools, toolMetadata, rtcArea, isWrite, RTC_META, LEGACY_OWNER_ONLY_TOOLS } from '../rtc/catalog.js';
const schema = (props,required=[])=>({type:'object',properties:props,required});
const str={type:'string'};
const callSchema=schema({name:str,args:{type:'object',description:'Arguments accepted by the selected tool.',additionalProperties:true}},['name']);
export const tools=[
 {name:'workspace_search_tools',description:'Search permitted Workspace tools, or include unavailable capabilities with an explicit needsReconnect notice. Page with nextOffset.',inputSchema:schema({query:str,area:str,includeUnavailable:{type:'boolean'},audience:{type:'string',enum:['builder','owner','operator']},limit:{type:'integer',default:10,minimum:1,maximum:30},offset:{type:'integer',minimum:0,description:'Zero-based position in the filtered catalog. Pass nextOffset to continue.'}})},
 {name:'workspace_describe_tool',description:'Describe an allowed tool; optional unavailable capability metadata can explain why the user must reconnect.',inputSchema:schema({name:str,includeUnavailable:{type:'boolean'}},['name'])},
 {name:'workspace_call',description:'Invoke an allowed Workspace tool using the same safety and domain guards as MCP direct calls.',inputSchema:callSchema},
 {name:'workspace_get_result',description:'Read one page of an oversized result owned by this connection.',inputSchema:schema({handle:str,page:{type:'integer',minimum:1},fields:str},['handle'])},
 {name:'workspace_batch',description:'Run up to ten read-only tool calls with the same connection permissions and guards.',inputSchema:schema({calls:{type:'array',items:callSchema,minItems:1,maxItems:10}},['calls'])}
];
async function catalog(){return (await import('./index.js')).registry;}
async function lookup(name,clients,{readsOnly=false}={}){
 const registry=await catalog();
 if(typeof name!=='string'||!Object.hasOwn(registry.handlers,name)||RTC_META.has(name))throw new Error('Unknown or recursive tool.');
 if(!allowedTool(name,clients?.rtcPolicy||{}))throw new Error('outside_scope: This tool is not allowed by the connection.');
 if(readsOnly&&isWrite(name))throw new Error('refused_by_guard: Batch supports read-only tools only.');
 return registry.handlers[name];
}
export const handlers={
 async workspace_get_result(args={},clients){return readStoredResult(args,clients?.connection,clients?.store?.getResult ?? undefined);},
 async workspace_search_tools(args={},clients){
   const {tools}=await catalog();
   if(args.includeUnavailable!==undefined&&typeof args.includeUnavailable!=='boolean')throw new Error('invalid_args: includeUnavailable must be boolean.');
   if(args.query!==undefined&&typeof args.query!=='string')throw new Error('invalid_args: query must be a string.');
   if(args.area!==undefined&&typeof args.area!=='string')throw new Error('invalid_args: area must be a string.');
   if(args.audience!==undefined&&!['builder','owner','operator'].includes(args.audience))throw new Error('invalid_args: unknown audience.');
   if(args.limit!==undefined&&(!Number.isInteger(args.limit)||args.limit<1||args.limit>30))throw new Error('invalid_args: limit must be an integer from 1 through 30.');
   if(args.offset!==undefined&&(!Number.isSafeInteger(args.offset)||args.offset<0))throw new Error('invalid_args: offset must be a nonnegative safe integer.');
   const query=(args.query||'').trim().toLowerCase();
   const limit=args.limit??10, offset=args.offset??0;
   // Always restrict the catalog to authorized tools before counting or paging.
   const policy=clients?.rtcPolicy||{};
   const visible=args.includeUnavailable===true?tools:listedTools(tools,policy,'catalog');
   const matches=visible.map(t=>({...toolMetadata(t,policy),
     available:allowedTool(t.name,policy),
     ...(!allowedTool(t.name,policy)?{needsReconnect:true,reason:policy.principalKind==='user'&&LEGACY_OWNER_ONLY_TOOLS.has(t.name)?'requires_customer_specific_setup':'connection_policy_or_test_mode_restricts_capability'}:{})})).filter(t=>(!args.area||t.area===args.area)&&(!args.audience||t.audience.includes(args.audience))&&(!query||(t.name+' '+t.description).toLowerCase().includes(query)));
   const found=matches.slice(offset,offset+limit), next=offset+found.length;
   return ok({tools:found.map(({inputSchema,...metadata})=>metadata),count:found.length,totalMatched:matches.length,offset,nextOffset:next<matches.length?next:null});
 },
 async workspace_describe_tool(args={},clients){
   const registry=await catalog();
   if(args.includeUnavailable!==undefined&&typeof args.includeUnavailable!=='boolean')
     return errorResult(new Error('invalid_args: includeUnavailable must be boolean.'));
   const policy=clients?.rtcPolicy||{};
   const tool=registry.tools.find(t=>t.name===args.name);
   if(!tool||!allowedTool(args.name,policy)&&args.includeUnavailable!==true)
     return errorResult(new Error('outside_scope: Tool not available.'));
   const available=allowedTool(args.name,policy);
   return ok({...toolMetadata(tool,policy),available,...(!available?{
     needsReconnect:true,reason:policy.principalKind==='user'&&LEGACY_OWNER_ONLY_TOOLS.has(tool.name)?'requires_customer_specific_setup':'connection_policy_or_test_mode_restricts_capability'
   }:{})});
 },
 async workspace_call(args={},clients){
   try {const handler=await lookup(args.name,clients);return await handler(args.args||{},clients);}
   catch(e){return errorResult(e);}
 },
 async workspace_batch(args={},clients){
   if(!Array.isArray(args.calls)||!args.calls.length||args.calls.length>10)return errorResult(new Error('invalid_args: calls must have 1 to 10 items.'));
   try{
     const resolved=await Promise.all(args.calls.map(async c=>({name:c.name,args:c.args||{},handler:await lookup(c.name,clients,{readsOnly:true})})));
     const results=[];for(const c of resolved) results.push({name:c.name,response:await c.handler(c.args,clients)});
     return ok({results});
   }catch(e){return errorResult(e);}
 }
};
