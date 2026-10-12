import { summarizeGoogleResult } from './summary.js';
// RTC 1 result shaping: no silent data loss, short-lived connection-isolated retrieval.
import crypto from 'node:crypto';
import { storeRtcResult, getRtcResult } from '../db.js';
import { isWrite, RTC_META } from './catalog.js';
import { ok, errorResult } from '../tools/util.js';
export const INLINE_BYTES = 8192;
function pick(value,parts) {
 if (!parts.length) return value;
 if (Array.isArray(value)) return value.map(x=>pick(x,parts));
 if (!value||typeof value!=='object') return undefined;
 if (!Object.hasOwn(value,parts[0]))return undefined;
 return {[parts[0]]:pick(value[parts[0]],parts.slice(1))};
}
function merge(dst,part){
 if(!dst||typeof dst!=='object'||Array.isArray(dst)||!part||typeof part!=='object'||Array.isArray(part))return part;
 for(const [k,v] of Object.entries(part))dst[k]=Object.hasOwn(dst,k)?merge(dst[k],v):v;
 return dst;
}
export function projectFields(data,fields){
 if(!fields)return data;
 const names=Array.isArray(fields)?fields:String(fields).split(',');
 if(names.length>30)throw new Error('invalid_args: too many fields');
 let projected={};
 for(const name of names){
  const parts=String(name).trim().split('.');
  if(parts.some(x=>!x||x==='__proto__'||x==='constructor'||x==='prototype')||parts.length>12)throw new Error('invalid_args: bad field path');
  const fragment=pick(data,parts);
  if(fragment!==undefined)projected=merge(projected,fragment);
 }
 return projected;
}
export function resultCount(v){
 if(Array.isArray(v))return v.length;
 if(v&&typeof v==='object')return Object.values(v).find(x=>Array.isArray(x))?.length ?? 1;
 return 1;
}
export async function shapeReadResult(output,args,connection,store=storeRtcResult){
 if(output?.isError||!output?.content?.[0]||output.content[0].type!=='text')return output;
 const raw=output.content[0].text;
 let data;try{data=JSON.parse(raw)}catch{data=raw}
 if(args?.fields)data=projectFields(data,args.fields);
 const full=typeof data==='string'?data:JSON.stringify(data);
 const bytes=Buffer.byteLength(full,'utf8');
 const compactData=args?.detail==='full'||args?.fields?data:summarizeGoogleResult(args?.toolName,data);
 if(bytes<=INLINE_BYTES){
   return args?.fields||args?.detail!=='full'&&compactData!==data?ok(compactData):output;
 }
 if(!connection)return errorResult(new Error('Result too large with no connection owner.'));
 const handle='rtc_result_'+crypto.randomBytes(24).toString('base64url');
 await store({handle,connection,payload:{data,bytes}});
 const summary=compactData===data?'Stored for 24 hours for this connection; call workspace_get_result.':'Compact object summary, with full result available for 24 hours.';
 return ok({handle,bytes,count:resultCount(data),summary,
   ...(compactData!==data?{data:compactData}:{}),
   preview:compactData===data?full.slice(0,768):undefined});
}

export async function readStoredResult({handle,page=null,fields}={},connection,read=getRtcResult){
 if(typeof handle!=='string'||!/^rtc_result_[a-zA-Z0-9_-]{32}$/.test(handle))return errorResult(new Error('invalid_args: invalid handle'));
 const saved=await read(handle,connection);
 if(!saved)return errorResult(new Error('not_found: expired, missing or different connection'));
 const data=fields?projectFields(saved.data,fields):saved.data;
 const serialized=typeof data==='string'?data:JSON.stringify(data);
 if(page==null)return ok({handle,bytes:saved.bytes,payload:serialized});
 const n=Number(page);
 if(!Number.isInteger(n)||n<1||n>100000)return errorResult(new Error('invalid_args: invalid page'));
 const bytes=4096,pages=Math.max(1,Math.ceil(serialized.length/bytes));
 if(n>pages)return errorResult(new Error('not_found: page does not exist'));
 return ok({handle,page:n,pages,bytes:saved.bytes,content:serialized.slice((n-1)*bytes,n*bytes),next:n<pages?n+1:null});
}
export function applyResultRules(registry){
 registry.tools=registry.tools.map(tool=>{
  if(isWrite(tool.name)||RTC_META.has(tool.name))return tool;
  const props={...(tool.inputSchema?.properties||{})};
  if(!props.fields)props.fields={type:'string',description:'Optional comma-separated dotted paths.'};
  if(!props.detail)props.detail={type:'string',enum:['summary','full'],default:'summary'};
  const original=registry.handlers[tool.name];
  registry.handlers[tool.name]=async(args={},clients)=>{
   const {fields,detail,...input}=args;
   try{return await shapeReadResult(await original(input,clients),{fields,detail,toolName:tool.name},clients?.connection);}
   catch(e){return errorResult(e);}
  };
  return {...tool,inputSchema:{...tool.inputSchema,properties:props}};
 });
 return registry;
}
