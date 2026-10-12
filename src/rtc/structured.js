// P8-1: typed MCP outputs for verified JSON-returning read workflows.
// The same structured value is derived from the post-projection, post-handle
// response, never from the original oversized content.
import { errorResult } from '../tools/util.js';
const string={type:'string'},strings={type:'array',items:string};
const handle={required:['handle','bytes','count','summary']};
export const OUTPUT_SCHEMAS=Object.freeze({
 workflow_security_snapshot:{
   type:'object',properties:{totalUsers:{type:'integer'},usersWithout2StepVerification:strings,superAdmins:strings,recentAlerts:{type:'array',items:{type:'object'}}},
   anyOf:[{required:['totalUsers','usersWithout2StepVerification','superAdmins','recentAlerts']},handle],additionalProperties:true
 },
 workflow_audit_external_sharing:{
   type:'object',properties:{scanned:{type:'integer'},filesWithExternalOrPublicSharing:{type:'array',items:{type:'object'}}},
   anyOf:[{required:['scanned','filesWithExternalOrPublicSharing']},handle],additionalProperties:true
 },
 workspace_dev_check_integration:{
   type:'object',properties:{actingAs:string,checkedAt:string,status:{type:'string',enum:['ready','missing','not_readable']},checks:{type:'array',items:{type:'object'}},changesMade:{type:'boolean'}},
   anyOf:[{required:['actingAs','checkedAt','status','checks','changesMade']},handle],additionalProperties:true
 },
 workspace_admin_overview:{
   type:'object',properties:{account:{type:['string','null']},checkedAt:string,items:{type:'object'}},
   anyOf:[{required:['account','checkedAt','items']},handle],additionalProperties:true
 }
});
const array=v=>Array.isArray(v);
export function matchesStructuredShape(name,value){
 if(!value||typeof value!=='object'||array(value))return false;
 if(typeof value.handle==='string')
   return /^rtc_result_[A-Za-z0-9_-]{32}$/.test(value.handle)&&
     Number.isFinite(value.bytes)&&Number.isFinite(value.count)&&typeof value.summary==='string';
 switch(name){
 case 'workflow_security_snapshot':
   return Number.isInteger(value.totalUsers)&&array(value.usersWithout2StepVerification)&&array(value.superAdmins)&&array(value.recentAlerts);
 case 'workflow_audit_external_sharing':
   return Number.isInteger(value.scanned)&&array(value.filesWithExternalOrPublicSharing);
 case 'workspace_dev_check_integration':
   return typeof value.actingAs==='string'&&typeof value.checkedAt==='string'&&
     ['ready','missing','not_readable'].includes(value.status)&&array(value.checks)&&value.changesMade===false;
 case 'workspace_admin_overview':
   return (value.account===null||typeof value.account==='string')&&typeof value.checkedAt==='string'&&
     value.items!==null&&typeof value.items==='object'&&!array(value.items);
 default:return false;
 }
}
export function attachStructuredResult(name,response){
 if(!Object.hasOwn(OUTPUT_SCHEMAS,name)||response?.isError)return response;
 if(response?.structuredContent)return response;
 const raw=response?.content?.find(c=>c.type==='text')?.text;
 let parsed;
 try{parsed=JSON.parse(raw)}catch{return errorResult(new Error('Schema error: workflow returned non-JSON output.'))}
 if(!matchesStructuredShape(name,parsed))
   return errorResult(new Error('Schema error: workflow output does not satisfy its advertised structure.'));
 return {...response,structuredContent:parsed};
}
