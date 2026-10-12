// P8-1: typed MCP outputs for verified JSON-returning read workflows.
// The same structured value is derived from the post-projection, post-handle
// response, never from the original oversized content.
import { errorResult } from '../tools/util.js';
const string={type:'string'},strings={type:'array',items:string};
const handle={required:['handle','bytes','count','summary']};
export const OUTPUT_SCHEMAS=Object.freeze({
 // P8-1 read-only typed results for the newly integrated Reports,
 // Postmaster and Cloud Identity policy features. Do not type writes by name.
 reports_activity:{
   type:'object',properties:{application:string,activities:{type:'array',items:{type:'object'}},nextPageToken:string},
   anyOf:[{required:['application','activities']},handle],additionalProperties:true
 },
 postmaster_list_domains:{
   type:'object',properties:{domains:{type:'array',items:{type:'object'}},count:{type:'integer'},nextPageToken:string,scopeFiltered:{type:'boolean'}},
   anyOf:[{required:['domains','count']},handle],additionalProperties:true
 },
 postmaster_list_traffic_stats:{
   type:'object',properties:{domain:string,stats:{type:'array',items:{type:'object'}},nextPageToken:string},
   anyOf:[{required:['domain','stats']},handle],additionalProperties:true
 },
 identity_list_policies:{
   type:'object',properties:{policies:{type:'array',items:{type:'object'}},scopeNote:string,nextPageToken:{type:['string','null']}},
   anyOf:[{required:['policies','scopeNote','nextPageToken']},handle],additionalProperties:true
 },
 identity_policy_audit:{
   type:'object',properties:{domain:string,customerWide:{type:'boolean'},complete:{type:'boolean'},policiesRead:{type:'integer'},baselineRules:{type:'integer'},areasWithRules:strings,scopeNote:string,results:{type:'array',items:{type:'object',properties:{setting:string,policySetting:string,field:string,status:{type:'string',enum:['ok','needs_attention','not_readable']},observations:{type:'array',items:{type:'object'}}},required:['setting','policySetting','field','status','observations']}},summary:{type:'object',properties:{needsAttention:{type:'integer'},notReadable:{type:'integer'},matchingExplicitPolicies:{type:'integer'}},required:['needsAttention','notReadable','matchingExplicitPolicies']}},
   anyOf:[{required:['domain','customerWide','complete','policiesRead','baselineRules','areasWithRules','scopeNote','results','summary']},handle],additionalProperties:true
 },
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
 case 'reports_activity':
   return typeof value.application==='string'&&value.application.length>0&&array(value.activities)&&value.activities.every(v=>v!==null&&typeof v==='object'&&!array(v))&&
     (value.nextPageToken===undefined||typeof value.nextPageToken==='string');
 case 'postmaster_list_domains':
   return array(value.domains)&&Number.isInteger(value.count)&&value.count===value.domains.length&&value.domains.every(v=>v!==null&&typeof v==='object'&&!array(v))&&
     (value.scopeFiltered===undefined||typeof value.scopeFiltered==='boolean')&&
     (value.nextPageToken===undefined||typeof value.nextPageToken==='string');
 case 'postmaster_list_traffic_stats':
   return typeof value.domain==='string'&&value.domain.length>0&&array(value.stats)&&value.stats.every(v=>v!==null&&typeof v==='object'&&!array(v))&&
     (value.nextPageToken===undefined||typeof value.nextPageToken==='string');
 case 'identity_list_policies':
   return array(value.policies)&&value.policies.every(v=>v!==null&&typeof v==='object'&&!array(v))&&
     typeof value.scopeNote==='string'&&(value.nextPageToken===null||typeof value.nextPageToken==='string');
 case 'identity_policy_audit':
   return typeof value.domain==='string'&&value.domain.length>0&&value.customerWide===true&&typeof value.complete==='boolean'&&
     Number.isInteger(value.policiesRead)&&value.policiesRead>=0&&Number.isInteger(value.baselineRules)&&value.baselineRules>=1&&array(value.areasWithRules)&&
     typeof value.scopeNote==='string'&&array(value.results)&&value.results.every(v=>v&&typeof v==='object'&&!array(v)&&
       typeof v.setting==='string'&&typeof v.policySetting==='string'&&typeof v.field==='string'&&
       ['ok','needs_attention','not_readable'].includes(v.status)&&array(v.observations))&&
     value.summary&&typeof value.summary==='object'&&
     ['needsAttention','notReadable','matchingExplicitPolicies'].every(k=>Number.isInteger(value.summary[k])&&value.summary[k]>=0);
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
