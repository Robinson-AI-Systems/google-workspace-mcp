// P8-1: typed MCP outputs for reviewed read and guarded-write workflows.
// The same structured value is derived from the post-projection, post-handle
// response, never from the original oversized content.
import { errorResult } from '../tools/util.js';
const string={type:'string'},strings={type:'array',items:string};
const handle={required:['handle','bytes','count','summary']};
const healthStatus={type:'string',enum:['PASS','WARN','FAIL','INFO']};
const healthSummary={type:'object',properties:{pass:{type:'integer',minimum:0},warn:{type:'integer',minimum:0},fail:{type:'integer',minimum:0},info:{type:'integer',minimum:0}},
 required:['pass','warn','fail','info'],additionalProperties:true};
const healthChecks={type:'array',items:{type:'object',properties:{
 check:string,status:healthStatus,found:string,fix:{type:['string','null']}
 },required:['check','status','found'],additionalProperties:true}};

export const WRITE_WORKFLOWS=new Set(['workflow_onboard_employee','workflow_offboard_employee',
 'workflow_add_domain_and_start_verification','workflow_brand_mailbox','workflow_weekly_digest',
 'workflow_add_staff_member','workflow_set_up_business']);
const lifecycle={type:'object',properties:{done:{type:'boolean'},summary:string,target:{type:['string','null']},
 dryRun:{type:'boolean'},needsConfirmation:{type:'boolean'},refused:string,logged:{type:'boolean'},
 confirmed:{type:['boolean','null']},auditFailure:{type:'boolean'},warning:string,
 before:{},after:{},details:{},note:string},
 anyOf:[{required:['done','summary','confirmed','logged'],properties:{done:{const:true}}},
  {required:['done','summary','dryRun','logged'],properties:{done:{const:false},dryRun:{const:true}}},
  {required:['done','summary','needsConfirmation'],properties:{done:{const:false},needsConfirmation:{const:true}}},
  {required:['done','refused'],properties:{done:{const:false}}}],additionalProperties:true};

export const OUTPUT_SCHEMAS=Object.freeze({
 ...Object.fromEntries([...WRITE_WORKFLOWS].map(name=>[name,lifecycle])),
 workflow_search_presence_check:{
  type:'object',properties:{domain:string,status:{type:'string',enum:['PASS','WARN','FAIL']},readable:{type:'boolean'},reason:string,
   verified:{type:'object',properties:{root:{type:'object',properties:{name:string,verified:{type:['boolean','null']}},required:['name','verified']},
    www:{type:'object',properties:{name:string,verified:{type:['boolean','null']}},required:['name','verified']}},required:['root','www']},
   searchConsole:string,businessProfile:string,note:string},
  anyOf:[{required:['domain','status','verified','searchConsole','businessProfile','note']},handle],additionalProperties:true
 },
 // P8-1 read-only typed results for the newly integrated Reports,
 // Postmaster and Cloud Identity policy features. Write wrappers above retain provenance.
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
 workflow_health_report:{
  type:'object',properties:{scope:string,summary:healthSummary,checks:healthChecks,report:string},
  anyOf:[{required:['scope','summary','checks','report']},handle],additionalProperties:true
 },
 workflow_email_health:{
  type:'object',properties:{domain:string,summary:healthSummary,checks:healthChecks,report:string},
  anyOf:[{required:['domain','summary','checks','report']},handle],additionalProperties:true
 },
 workspace_plan_summary:{
  type:'object',properties:{customerId:string,totalLicensesAssigned:{type:'integer',minimum:0},
   plans:{type:'array',items:{type:'object',properties:{skuId:string,plan:string,assigned:{type:'integer',minimum:0}},required:['skuId','plan','assigned']}},
   geminiIncluded:string,note:string},
  anyOf:[{required:['customerId','totalLicensesAssigned','plans','geminiIncluded','note']},handle],additionalProperties:true
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
 if(WRITE_WORKFLOWS.has(name)){
  if(typeof value.done!=='boolean')return false;
  if(value.done===false&&typeof value.refused==='string')return true;
  if(typeof value.summary!=='string')return false;
  if(value.done===false)return value.needsConfirmation===true||value.dryRun===true&&typeof value.logged==='boolean';
  return typeof value.logged==='boolean'&&(value.confirmed===null||typeof value.confirmed==='boolean')&&
    (value.confirmed!==true||value.logged===true&&value.auditFailure!==true);
 }
 if(typeof value.handle==='string')
   return /^rtc_result_[A-Za-z0-9_-]{32}$/.test(value.handle)&&
     Number.isFinite(value.bytes)&&Number.isFinite(value.count)&&typeof value.summary==='string';
 switch(name){
 case 'workflow_search_presence_check': {
   // A real Site Verification 403 insufficientPermissions has no evidence for
   // either property. The advertised output schema already accepts null; the
   // runtime validator must agree, but ONLY for the exact unreadable/scope-
   // denial state. Never transform unknown into failed verification or green.
   const scopeUnknown=value.status==='WARN'&&value.readable===false&&
     ['site_verification_scope_unavailable','invalid_domain'].includes(value.reason);
   if(value.readable===false&&!scopeUnknown)return false;
   return typeof value.domain==='string'&&value.domain.length>0&&
     ['PASS','WARN','FAIL'].includes(value.status)&&
     ['root','www'].every(k=>value.verified?.[k]&&typeof value.verified[k].name==='string'&&
       (scopeUnknown?value.verified[k].verified===null:typeof value.verified[k].verified==='boolean'))&&
     ['searchConsole','businessProfile','note'].every(k=>typeof value[k]==='string');
 }
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
 case 'workflow_health_report':
 case 'workflow_email_health': {
   const key=name==='workflow_health_report'?'scope':'domain';
   if(typeof value[key]!=='string'||!value[key]||typeof value.report!=='string'||!array(value.checks)||!value.summary||typeof value.summary!=='object')return false;
   const statuses=['PASS','WARN','FAIL','INFO'];
   if(!value.checks.every(c=>c&&typeof c==='object'&&!array(c)&&typeof c.check==='string'&&typeof c.found==='string'&&statuses.includes(c.status)&&
      (c.fix===undefined||c.fix===null||typeof c.fix==='string')))return false;
   return ['pass','warn','fail','info'].every(k=>Number.isInteger(value.summary[k])&&value.summary[k]>=0&&
     value.summary[k]===value.checks.filter(c=>c.status===k.toUpperCase()).length);
 }
 case 'workspace_plan_summary':
   return typeof value.customerId==='string'&&value.customerId.length>0&&Number.isInteger(value.totalLicensesAssigned)&&value.totalLicensesAssigned>=0&&
     array(value.plans)&&value.plans.every(p=>p&&typeof p==='object'&&typeof p.skuId==='string'&&
       typeof p.plan==='string'&&Number.isInteger(p.assigned)&&p.assigned>=0)&&
     value.plans.reduce((n,p)=>n+p.assigned,0)===value.totalLicensesAssigned&&
     typeof value.geminiIncluded==='string'&&typeof value.note==='string';
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
 if(response?.structuredContent)return matchesStructuredShape(name,response.structuredContent)?response:
   errorResult(new Error('Schema error: workflow structured output does not satisfy its advertised structure.'));
 const raw=response?.content?.find(c=>c.type==='text')?.text;
 // Domain-guard denial is intentionally a human-readable refusal, not JSON.
 // Never disguise it as a generic schema failure or attach typed success.
 if(typeof raw==='string'&&/^Refused:\s/.test(raw))return {...response,isError:true};
 let parsed;
 try{parsed=JSON.parse(raw)}catch{return errorResult(new Error('Schema error: workflow returned non-JSON output.'))}
 if(!matchesStructuredShape(name,parsed))
   return errorResult(new Error('Schema error: workflow output does not satisfy its advertised structure.'));
 return {...response,structuredContent:parsed};
}
