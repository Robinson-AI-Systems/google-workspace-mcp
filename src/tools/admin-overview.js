// RTC §11 owner overview: one read-only report from guarded child tools.
// A failed, partial, denied or unobserved check is never presented as healthy.
import { ok } from './util.js';
import { allowedTool } from '../rtc/catalog.js';

const secretShape=/rtc_pass_[A-Za-z0-9_-]{43}/g;
const errors=e=>String(e?.message||e).replace(secretShape,'[redacted]').slice(0,160);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const nonnegative=v=>Number.isInteger(v)&&v>=0;
const domainOf=mail=>String(mail||'').split('@')[1]?.toLowerCase()||'';

function unpack(output){
 if(output?.isError)throw new Error(output.content?.[0]?.text||'Read failed');
 const text=output?.content?.find(c=>c.type==='text')?.text;
 if(typeof text!=='string')throw new Error('The provider returned no readable result.');
 // Some existing guards return a plain-language refusal without isError.
 if(/^Refused:\s/i.test(text))throw new Error(text);
 try{return JSON.parse(text)}catch{return text;}
}

const SOURCES={
 identity:{tool:'workspace_whoami',args:()=>({})},
 organization:{tool:'admin_get_customer_info',customerWide:true,args:()=>({})},
 domains:{tool:'admin_list_domains',customerWide:true,args:()=>({})},
 security:{tool:'workflow_security_snapshot',customerWide:true,args:()=>({})},
 health:{tool:'workflow_health_report',args:clients=>({scope:domainOf(clients?.actingAs)})},
 email:{tool:'workflow_email_health',args:clients=>({domain:domainOf(clients?.actingAs)})},
 licenses:{tool:'workspace_plan_summary',customerWide:true,args:()=>({})},
 policies:{tool:'identity_policy_audit',customerWide:true,args:clients=>({domain:domainOf(clients?.actingAs)})}
};

function evaluateSummary(data,source){
 if(!object(data)||!object(data.summary)||!Array.isArray(data.checks)||!data.checks.length)
   return {status:'not_readable',reason:'A complete structured health report was not returned.'};
 const summary=data.summary;
 if(!['pass','warn','fail','info'].every(k=>nonnegative(summary[k])))
   return {status:'not_readable',reason:'The health report has invalid or missing totals.'};
 if(data.checks.some(c=>!object(c)||!['PASS','WARN','FAIL','INFO'].includes(c.status)))
   return {status:'not_readable',reason:'The health report has an unknown check result.'};
 if(summary.fail>0||summary.warn>0||data.checks.some(c=>['WARN','FAIL'].includes(c.status)))
   return {status:'needs_attention'};
 // INFO is not a green check when the provider explicitly could not test it.
 if(data.checks.some(c=>c.status==='INFO'&&/not checked|could not check|unavailable/i.test(String(c.found||''))))
   return {status:'not_readable',reason:'One or more '+source+' checks could not be completed.'};
 return {status:'ok'};
}

function evaluate(section,data,clients){
 if(section==='organization'){
  return object(data)&&typeof data.id==='string'&&data.id.length>0&&typeof data.customerDomain==='string'
   ?{status:'ok',reason:'Directory customer identity only; subscription and policy entitlement are separate.'}
   :{status:'not_readable',reason:'Google did not return a complete customer identity.'};
 }
 if(section==='domains'){
  if(!Array.isArray(data)||!data.length||data.some(d=>!object(d)||typeof d.domainName!=='string'||typeof d.verified!=='boolean'))
   return {status:'not_readable',reason:'A complete domain verification list was not returned.'};
  return data.some(d=>!d.verified)?{status:'needs_attention',reason:'At least one registered domain is unverified.'}:
   {status:'ok',reason:'Directory domain verification only; DNS, aliases and mail authentication are separate.'};
 }
 if(section==='identity'){
   if(!object(data)||typeof data.matches!=='boolean'||typeof data.gmailReports!=='string')
     return {status:'not_readable',reason:'Google did not confirm the mailbox identity.'};
   if(data.matches!==true||data.gmailReports.toLowerCase()!==String(clients?.actingAs||'').toLowerCase())
     return {status:'needs_attention',reason:'The Google mailbox does not match the selected connection.'};
   return {status:'ok'};
 }
 if(section==='health'||section==='email'){
   // Existing integrations can return a plain WARN/FAIL message. It is not proof
   // of a passing structured health report; only the failure can be surfaced.
   if(typeof data==='string')
     return /\b(WARN|FAIL|needs_attention|blocked|misconfigured)\b/i.test(data)
       ?{status:'needs_attention',reason:'The source returned a warning without structured counts.'}
       :{status:'not_readable',reason:'The source returned text, not a verified health report.'};
   return evaluateSummary(data,section);
 }
 if(section==='security'){
   if(!object(data)||!nonnegative(data.totalUsers)||!Array.isArray(data.usersWithout2StepVerification)||
      !Array.isArray(data.superAdmins)||!Array.isArray(data.recentAlerts))
     return {status:'not_readable',reason:'The security snapshot is incomplete or malformed.'};
   if(data.usersWithout2StepVerification.length||data.recentAlerts.length||data.superAdmins.length<2)
     return {status:'needs_attention'};
   if(data.complete!==true||data.alertsReadable!==true)
     return {status:'not_readable',reason:'User pagination or security alerts could not be fully verified.'};
   return {status:'ok'};
 }
 if(section==='policies'){
   if(!object(data)||data.customerWide!==true||!Array.isArray(data.results)||!object(data.summary)||
      !nonnegative(data.baselineRules)||data.baselineRules<1||data.results.length!==data.baselineRules||
      !Array.isArray(data.coverageByArea)||!data.coverageByArea.length||
      data.results.some(r=>!object(r)||!['ok','needs_attention','not_readable'].includes(r.status)))
     return {status:'not_readable',reason:'The Cloud Identity policy report did not include reconcilable per-rule evidence.'};
   const found={ok:0,needs_attention:0,not_readable:0};
   for(const rule of data.results)found[rule.status]++;
   const totals=data.summary;
   if(totals.needsAttention!==found.needs_attention||totals.notReadable!==found.not_readable||
      totals.matchingExplicitPolicies!==found.ok||
      data.coverageByArea.reduce((sum,area)=>sum+(nonnegative(area?.checks)?area.checks:0),0)!==data.baselineRules)
     return {status:'not_readable',reason:'Cloud Identity policy coverage totals did not reconcile.'};
   if(found.needs_attention>0)return {status:'needs_attention',reason:'One or more observed explicit Workspace policies differ from the owner baseline; missing values remain unknown.'};
   if(data.complete!==true||found.not_readable>0)
     return {status:'not_readable',reason:'Some explicit policy checks are not readable, inherited or incompletely paginated.'};
   return {status:'ok',reason:'Observed explicit rules match the owner baseline; effective per-user or per-domain settings are not proven.'};
 }
 if(section==='licenses'){
   if(!object(data)||!nonnegative(data.totalLicensesAssigned)||!Array.isArray(data.plans))
     return {status:'not_readable',reason:'A complete license count was not returned.'};
   if(data.totalLicensesAssigned!==data.plans.reduce((n,p)=>n+(nonnegative(p?.assigned)?p.assigned:0),0)||
      data.plans.some(p=>!nonnegative(p?.assigned)))
     return {status:'not_readable',reason:'The license totals do not reconcile.'};
   if(data.truncated===true)return {status:'not_readable',reason:'Unread license assignment pages remain; these counts are a partial observation.'};
   // Assigned licenses are observable; purchased seats and billing invoices are not.
   return {status:'ok',reason:'Assigned licenses only; paid-seat and invoice details require Admin console.'};
 }
 return {status:'not_readable',reason:'No reviewed evaluator for this check.'};
}

// Project exact observed health checks into owner-facing coverage sections.
// A passing subset never proves an unobserved or incomplete source is healthy.
function healthSection(health,names,{directory=false}={}){
 const checks=health?.data?.checks;
 if(!Array.isArray(checks))return {status:'not_readable',reason:health?.reason||'The health source returned no structured evidence.'};
 const selected=names.map(name=>checks.find(c=>c.check===name));
 if(selected.some(c=>!object(c)||!['PASS','WARN','FAIL','INFO'].includes(c.status)))
  return {status:'not_readable',reason:'One or more required owner checks were not observed.'};
 if(selected.some(c=>c.status==='FAIL'))return {status:'needs_attention',checks:selected};
 if(selected.some(c=>/could not check|not checked|unavailable/i.test(String(c.found||''))))
  return {status:'not_readable',reason:'The provider check could not be completed.',checks:selected};
 if(selected.some(c=>c.status==='WARN'))return {status:'needs_attention',checks:selected};
 // A missing coverage check is not proof that pagination finished.
 // Exactly one complete explicit Directory result is needed before green.
 // Confirmed FAIL/WARN in observed users remains visible above.
 if(directory){
  const coverage=checks.filter(c=>c.check==='Directory coverage');
  if(coverage.length!==1||coverage[0].status!=='PASS')
   return {status:'not_readable',reason:'Complete Directory scan coverage was not verified.',checks:selected};
 }
 if(selected.some(c=>c.status==='INFO'))return {status:'not_readable',reason:'Informational evidence does not establish the setting.',checks:selected};
 return {status:'ok',checks:selected};
}

export async function buildAdminOverview(clients,call,{crossDomain=false}={}){
 const items={};
 await Promise.all(Object.entries(SOURCES).map(async([section,source])=>{
  if(!allowedTool(source.tool,clients?.rtcPolicy||{})){
   items[section]={status:'not_readable',reason:'Outside the permitted areas or connection profile.'};return;
  }
  if(source.customerWide&&Array.isArray(clients?.allowedDomains)&&crossDomain!==true){
   items[section]={status:'not_readable',reason:'This source can include other business domains. Ask the owner before using crossDomain: true; nothing was read.'};return;
  }
  try{
   // The owner intent is not a reusable permission grant: only the selected customer-wide policy child sees it.
   const childClients=section==='policies'&&crossDomain===true?{...clients,crossDomain:true}:clients;
   const data=unpack(await call(source.tool,source.args(clients),childClients));
   items[section]={...evaluate(section,data,clients),data};
  }catch(e){items[section]={status:'not_readable',reason:errors(e)};}
 }));
 // Surface Cloud Identity baseline findings alongside observed user/application health.
 // Explicit policy controls and effective user/OU settings are different evidence.
 function policyArea(name){
   const records=items.policies?.data?.results;
   const scoped=Array.isArray(records)?records.filter(x=>x?.area===name):[];
   if(scoped.some(x=>x?.status==='needs_attention'))
     return {status:'needs_attention',reason:'A documented explicit '+name+' policy differs from the owner baseline.',checks:scoped};
   if(items.policies?.status!=='ok'||!scoped.length||scoped.some(x=>x?.status!=='ok'))
     return {status:'not_readable',reason:items.policies?.reason||'Policy API evidence for '+name+' is incomplete.',checks:scoped};
   return {status:'ok',reason:'Observed explicit '+name+' rules match the baseline; effective settings are not calculated.',checks:scoped};
 }
 items.third_party_app_policy=policyArea('api_controls');
 items.groups_sharing_policy=policyArea('groups_for_business');
 items.marketplace_apps_policy=policyArea('workspace_marketplace');
 items.users_admins=healthSection(items.health,['2-Step Verification','Super admins'],{directory:true});
 items.two_step_enforcement=healthSection(items.health,['2-Step enforcement'],{directory:true});
 items.third_party_app_access=healthSection(items.health,['Third-party app access'],{directory:true});
 items.forwarding=healthSection(items.health,['Automatic forwarding of mail'],{directory:true});
 items.groups_external=healthSection(items.health,['Groups open to outsiders']);
 items.verification_dns={...items.email,reason:items.email.reason||'Email authentication and DNS evidence for this mailbox domain; not all customer domains.'};
 items.licenses_plan={...items.licenses};
 const security=items.security.data;
 items.recent_security_alerts=!object(security)||!Array.isArray(security.recentAlerts)
  ?{status:'not_readable',reason:items.security.reason||'No security alert evidence returned.'}
  :security.recentAlerts.length?{status:'needs_attention',alerts:security.recentAlerts}
   :security.alertsReadable===true&&security.coverage?.alertCenterComplete===true?{status:'ok',alerts:[]}:
    {status:'not_readable',reason:'Security alerts were not completely readable.',alerts:security.recentAlerts};
 items.billing_invoices={status:'not_readable',reason:'Google Workspace invoice/payment settings have no API available to this server.',
   setting:{url:'https://admin.google.com/ac/billing',steps:[{n:1,action:'Open',target:'Billing in Admin console'}],expected:'Billing page visible; no changes are made or claimed.'}};
 items.notification_settings={status:'not_readable',reason:'Some owner notification preferences require the Admin console.',
   setting:{url:'https://admin.google.com',steps:[{n:1,action:'Search',target:'Notification settings'}],expected:'Setting visible, not changed or verified.'}};
 return {account:clients?.actingAs||null,checkedAt:new Date().toISOString(),items};
}

export const tools=[{
 name:'workspace_admin_overview',
 description:'Read owner security, email, identity, license and Cloud Identity policy audit evidence; broader customer data requires owner cross-domain permission.',
 inputSchema:{type:'object',properties:{
  crossDomain:{type:'boolean',description:'True only after explicit owner authorization to read customer-wide security and license information across business domains. Default false.'}
 }}
}];
export const handlers={
 async workspace_admin_overview(args={},clients){
  const {registry}=await import('./index.js');
  return ok(await buildAdminOverview(clients,(name,childArgs,c)=>registry.handlers[name](childArgs,c),
   {crossDomain:args.crossDomain===true}));
 }
};
