// P8-8: Guided, provider-backed *read-only* checks for selected Admin
// console topics. "Observed" means this exact child API returned a structurally
// valid response, NOT that a global/OU policy, billing plan or security rule is
// correct. The existing guarded registry executes all child reads.
import {ok} from './util.js';
import {allowedTool} from '../rtc/catalog.js';
import {callReadForComposition} from '../rtc/results.js';
import {CONSOLE_MAP,CONSOLE_VERIFICATION} from '../data/console-map.js';
import {CONSOLE_REVIEW_GROUPS} from '../data/console-review.js';

const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN=/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?\.[a-z]{2,63}$/i;
const MAX=10;
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const nonempty=x=>typeof x==='string'&&x.trim().length>0;
const integer=x=>Number.isSafeInteger(x)&&x>=0;
const bounded=x=>Array.isArray(x)&&x.length<=200;
const email=x=>nonempty(x)&&EMAIL.test(x)&&x.trim()===x&&x.length<=254;
const domain=x=>nonempty(x)&&DOMAIN.test(x)&&x.trim()===x&&x.length<=253;
const text=x=>typeof x==='string'&&x.length<=500;
const bool=x=>typeof x==='boolean';
const listOf=(test)=>x=>bounded(x)&&x.every(test);
const countOf=x=>obj(x)&&integer(x.totalLicensesAssigned)&&Array.isArray(x.plans)&&
 x.plans.every(p=>obj(p)&&integer(p.assigned))&&
 x.plans.reduce((n,p)=>n+p.assigned,0)===x.totalLicensesAssigned;
const safeArray=v=>Array.isArray(v)?v:[];
const domainOf=mail=>String(mail||'').split('@')[1]?.toLowerCase()||'';
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);

// Every evidence type is manually reviewed; none derives a child tool name
// from caller input. State-creating tools are not present in this table.
const READBACK=Object.freeze({
 'gmail-imap-pop':{tool:'gmail_get_imap_settings',area:'mail',scope:'acting_mailbox',
   proof:x=>obj(x)&&bool(x.enabled),args:()=>({})},
 'gmail-default-routing-delegation':{tool:'gmail_list_delegates',area:'mail',scope:'acting_mailbox',
   proof:listOf(x=>obj(x)&&email(x.delegateEmail)),args:()=>({})},
 'email-forwarding':{tool:'gmail_get_forwarding_settings',area:'mail',scope:'acting_mailbox',
   proof:x=>obj(x)&&bool(x.enabled),args:()=>({})},
 'out-of-office':{tool:'gmail_get_vacation_settings',area:'mail',scope:'acting_mailbox',
   proof:x=>obj(x)&&bool(x.enableAutoReply),args:()=>({})},
 'signature':{tool:'gmail_list_send_as',area:'mail',scope:'acting_mailbox',
   proof:listOf(x=>obj(x)&&email(x.sendAsEmail)),args:()=>({})},
 'drive-storage':{tool:'drive_get_storage_quota',area:'files',scope:'acting_mailbox',
   proof:x=>obj(x)&&['limit','usage','usageInDrive','usageInDriveTrash'].some(k=>
     typeof x[k]==='string'&&/^\d+$/.test(x[k])),args:()=>({})},
 'billing-plan':{tool:'workspace_plan_summary',area:'workspace',scope:'customer',
   proof:countOf,args:()=>({})},
 'domains':{tool:'admin_list_domains',area:'admin',scope:'customer',
   proof:listOf(x=>obj(x)&&domain(x.domainName)&&bool(x.verified)),args:()=>({})},
 'org-units':{tool:'admin_list_orgunits',area:'admin',scope:'customer',
   proof:listOf(x=>obj(x)&&nonempty(x.orgUnitPath)),args:()=>({})},
 'users':{tool:'admin_list_users',area:'admin',scope:'customer_sample',
   proof:listOf(x=>obj(x)&&email(x.primaryEmail)),args:()=>({maxResults:20})},
 'admin-roles':{tool:'admin_list_role_assignments',area:'admin',scope:'customer_sample',
   proof:listOf(x=>obj(x)&&nonempty(x.roleAssignmentId||x.roleId)),args:()=>({maxResults:20})},
 'alerts':{tool:'admin_list_alerts',area:'admin',scope:'customer_sample',
   proof:listOf(x=>obj(x)&&nonempty(x.alertId)),args:()=>({maxResults:20})},
 'calendar-resources':{tool:'admin_list_calendar_resources',area:'admin',scope:'customer_sample',
   proof:listOf(x=>obj(x)&&nonempty(x.resourceId)),args:()=>({maxResults:20})},
 'mobile-management':{tool:'admin_list_mobile_devices',area:'admin',scope:'customer_sample',
   proof:listOf(x=>obj(x)&&nonempty(x.deviceId||x.resourceId)),args:()=>({maxResults:20})},
 'chrome-management':{tool:'admin_list_chrome_devices',area:'chrome',scope:'customer_sample',
   proof:listOf(x=>obj(x)&&nonempty(x.deviceId)),args:()=>({maxResults:20})},
 '2sv':{tool:'admin_get_2sv_status',area:'admin',scope:'named_user',
   proof:(x,t)=>obj(x)&&email(x.primaryEmail||t)&&
     (x.primaryEmail===undefined||x.primaryEmail.toLowerCase()===t.toLowerCase())&&
     bool(x.isEnrolledIn2Sv)&&bool(x.isEnforcedIn2Sv),
   args:t=>({userEmail:t})},
 'recovery':{tool:'admin_get_user',area:'admin',scope:'named_user',
   proof:(x,t)=>obj(x)&&email(x.primaryEmail)&&x.primaryEmail.toLowerCase()===t.toLowerCase(),
   args:t=>({userEmail:t})},
 'groups-settings':{tool:'admin_get_group_settings',area:'admin',scope:'named_group',
   proof:(x,t)=>obj(x)&&(!x.email||x.email.toLowerCase()===t.toLowerCase())&&
     Object.keys(x).some(k=>k!=='kind'&&k!=='etag'),
   args:t=>({groupEmail:t})},
 'dkim':{tool:'workflow_email_health',area:'workflows',scope:'named_domain',
   proof:(x)=>obj(x)&&obj(x.summary)&&Array.isArray(x.checks)&&x.checks.length>0,
   args:t=>({domain:t})},
 'spf-dmarc':{tool:'workflow_email_health',area:'workflows',scope:'named_domain',
   proof:(x)=>obj(x)&&obj(x.summary)&&Array.isArray(x.checks)&&x.checks.length>0,
   args:t=>({domain:t})}
});
const TOPICS=new Map(CONSOLE_MAP.map(x=>[x.id,x]));
const CATEGORY=new Map(Object.entries(CONSOLE_REVIEW_GROUPS).flatMap(([group,ids])=>
 ids.map(id=>[id,group])));
const support=new Set(Object.keys(READBACK));
if([...support].some(id=>!TOPICS.has(id)||!CONSOLE_VERIFICATION[id]||
 CONSOLE_VERIFICATION[id].tool!==READBACK[id].tool))
 throw Error('P8-8 Console readback policy registry is stale; do not silently use the wrong child tool.');

export const CONSOLE_LIVE_READBACK_IDS=Object.freeze([...support].sort());

export function planConsoleReadbacks(args={},clients={}){
 if(!obj(args)||!Array.isArray(args.ids)||args.ids.length<1||args.ids.length>MAX||
   args.ids.some(id=>typeof id!=='string'||!TOPICS.has(id))||
   new Set(args.ids).size!==args.ids.length)
  throw Error('Provide one to ten distinct mapped Admin console setting IDs.');
 if(args.crossDomain!==undefined&&typeof args.crossDomain!=='boolean')
  throw Error('crossDomain must be boolean.');
 if(args.subjectEmail!==undefined&&!email(args.subjectEmail)||
   args.groupEmail!==undefined&&!email(args.groupEmail)||
   args.domain!==undefined&&!domain(args.domain))
  throw Error('Invalid exact mailbox, group or DNS domain.');
 if(!email(clients.actingAs))throw Error('An authenticated acting mailbox is required.');
 const actingDomain=domainOf(clients.actingAs);
 const permissions=clients.rtcPolicy||{};
 return args.ids.map(id=>{
  const topic=TOPICS.get(id),spec=READBACK[id];
  const guidance={url:topic.link||'https://admin.google.com',
   steps:topic.path.map((step,i)=>({n:i+1,action:'Navigate to',target:step})),
   note:'The Google API can observe this narrow fact, not the effective domain/OU-wide console policy.'};
  if(!spec)return {id,category:CATEGORY.get(id),status:'manual_only',
   reason:'no_reviewed_live_readback',guidance};
  const requiresCustomer=['customer','customer_sample'].includes(spec.scope);
  const target=spec.scope==='named_user'?args.subjectEmail:
   spec.scope==='named_group'?args.groupEmail:
   spec.scope==='named_domain'?args.domain:null;
  if(['named_user','named_group','named_domain'].includes(spec.scope)&&!target)
   return {id,category:CATEGORY.get(id),status:'needs_target',
    reason:'supply_exact_approved_resource_identity',guidance};
  if((requiresCustomer||target&&domainOf(target)!==actingDomain&&spec.scope!=='named_domain'||
      spec.scope==='named_domain'&&target!==actingDomain)&&args.crossDomain!==true)
   return {id,category:CATEGORY.get(id),status:'outside_scope',
    reason:'customer_or_other_business_requires_explicit_cross_domain_owner_intent',guidance};
  if(!allowedTool(spec.tool,permissions))
   return {id,category:CATEGORY.get(id),status:'outside_scope',
    reason:'connection_profile_or_area_denied',guidance};
  return {id,category:CATEGORY.get(id),status:'eligible',
   tool:spec.tool,scope:spec.scope,target,args:spec.args(target),guidance};
 });
}
