// Compact discovery and dispatch share the exact same wrapped registry as MCP.
// A call cannot escape a connection's profile, areas, domain guards or write guards.
import { ok, errorResult } from './util.js';
import { readStoredResult } from '../rtc/results.js';
import { allowedTool, listedTools, toolMetadata, rtcArea, isWrite, RTC_META } from '../rtc/catalog.js';
const schema = (props,required=[])=>({type:'object',properties:props,required});
const str={type:'string'};
const callSchema=schema({name:str,args:{type:'object',description:'Arguments accepted by the selected tool.',additionalProperties:true}},['name']);
export const tools=[
 {name:'workspace_search_tools',description:'Search the Workspace tool catalog within this connection’s permissions.',inputSchema:schema({query:str,area:str,audience:{type:'string',enum:['builder','owner','operator']},limit:{type:'integer',default:10,minimum:1,maximum:30}})},
 {name:'workspace_describe_tool',description:'Describe the input schema and permissions for one allowed Workspace tool.',inputSchema:schema({name:str},['name'])},
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
 async workspace_get_result(args={},clients){return readStoredResult(args,clients?.connection);},
 async workspace_search_tools(args={},clients){
   const {tools}=await catalog();
   const query=String(args.query||'').trim().toLowerCase();
   const n=Math.min(30,Math.max(1,Number(args.limit)||10));
   const found=listedTools(tools,clients?.rtcPolicy||{},'catalog').map(toolMetadata).filter(t=>(!args.area||t.area===args.area)&&(!args.audience||t.audience.includes(args.audience))&&(!query||(t.name+' '+t.description).toLowerCase().includes(query))).slice(0,n);
   return ok({tools:found.map(({inputSchema,...metadata})=>metadata),count:found.length});
 },
 async workspace_describe_tool(args={},clients){
   const registry=await catalog();
   if(!registry.tools.some(t=>t.name===args.name)||!allowedTool(args.name,clients?.rtcPolicy||{}))return errorResult(new Error('outside_scope: Tool not available.'));
   return ok(toolMetadata(registry.tools.find(t=>t.name===args.name)));
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
