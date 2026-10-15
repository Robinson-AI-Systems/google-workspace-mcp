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
   proof:(x,t)=>obj(x)&&email(x.primaryEmail)&&
     x.primaryEmail.toLowerCase()===t.toLowerCase()&&
     bool(x.isEnrolledIn2Sv)&&bool(x.isEnforcedIn2Sv),
   args:t=>({userEmail:t})},
 'recovery':{tool:'admin_get_user',area:'admin',scope:'named_user',
   proof:(x,t)=>obj(x)&&email(x.primaryEmail)&&x.primaryEmail.toLowerCase()===t.toLowerCase(),
   args:t=>({userEmail:t})},
 'groups-settings':{tool:'admin_get_group_settings',area:'admin',scope:'named_group',
   proof:(x,t)=>obj(x)&&email(x.email)&&x.email.toLowerCase()===t.toLowerCase()&&
     Object.keys(x).some(k=>k!=='kind'&&k!=='etag'&&k!=='email'),
   args:t=>({groupEmail:t})},
 'dkim':{tool:'workflow_email_health',area:'workflows',scope:'named_domain',
   proof:(x,t)=>obj(x)&&(!x.domain||x.domain.toLowerCase()===t.toLowerCase())&&
     obj(x.summary)&&Array.isArray(x.checks)&&x.checks.length>0,
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

function decodeRead(output){
 if(!obj(output)||output.isError===true)return null;
 const part=output.content?.find(x=>x.type==='text');
 if(!part||typeof part.text!=='string'||part.text.length>4*1024*1024)return null;
 // Never treat plain English or a transport wrapper as Google evidence.
 let value;
 try{value=JSON.parse(part.text);}catch{return null;}
 if(obj(value)&&(['error','isError','content'].some(k=>own(value,k))))return null;
 return value;
}
function shapeStatus(spec,value,target){
 try{
  if(!spec.proof(value,target))return {status:'not_readable',reason:'google_evidence_missing_or_malformed'};
  if(['customer_sample','customer'].includes(spec.scope))
   return {status:'observed_partial',reason:'a_supported_account_or_customer_subset_not_an_effective_policy'};
  // The API may return a legitimate empty list for one mailbox; that is
  // a valid read of the connected mailbox, not proof of org-wide policy.
  return {status:'observed',reason:'narrow_metadata_readback_only'};
 }catch{
  return {status:'not_readable',reason:'google_evidence_missing_or_malformed'};
 }
}
export async function executeConsoleReadbacks(args={},clients={},invoke){
 if(args.dryRun!==undefined&&typeof args.dryRun!=='boolean')
  throw Error('dryRun must be boolean.');
 if(typeof invoke!=='function')throw Error('A guarded source reader is required.');
 const planned=planConsoleReadbacks(args,clients);
 const entries=[];
 for(const plannedItem of planned){
  const {tool,scope,target,args:input,...base}=plannedItem;
  if(plannedItem.status!=='eligible'){
   entries.push(base);
   continue;
  }
  if(args.dryRun===true){
   entries.push({...base,status:'planned',reason:'read_only_provider_probe_not_run'});
   continue;
  }
  let output;
  try{output=await invoke(tool,input,clients);}catch{
   entries.push({...base,status:'not_readable',reason:'google_read_threw_or_was_denied'});
   continue;
  }
  const value=decodeRead(output);
  const observed=shapeStatus(READBACK[base.id],value,target);
  entries.push({...base,status:observed.status,reason:observed.reason,
   ...(value!==null&&Array.isArray(value)&&observed.status!=='not_readable'?
    {observedCount:value.length}:{})});
 }
 const summary={total:entries.length,observed:0,observedPartial:0,
  notReadable:0,outsideScope:0,manualOnly:0,needsTarget:0,planned:0};
 for(const entry of entries){
  if(entry.status==='observed')summary.observed++;
  else if(entry.status==='observed_partial')summary.observedPartial++;
  else if(entry.status==='not_readable')summary.notReadable++;
  else if(entry.status==='outside_scope')summary.outsideScope++;
  else if(entry.status==='manual_only')summary.manualOnly++;
  else if(entry.status==='needs_target')summary.needsTarget++;
  else if(entry.status==='planned')summary.planned++;
 }
 const allObserved=summary.observed+summary.observedPartial===summary.total;
 return {
  account:clients.actingAs,checkedAt:new Date().toISOString(),
  mode:args.dryRun===true?'review_preview':'read_only_google_observation',
  complete:args.dryRun!==true&&allObserved,
  summary,entries,
  note:'Observed is this exact accessible Google API read only. Partial reads, other domains, purchased licenses, inherited settings, delivery rules and Admin console policy toggles still need independent proof; this tool changes nothing.'
 };
}
export const tools=[{
 name:'workspace_admin_console_verify',
 description:'Read-only exact Admin-console topic verification: choose up to ten mapped topics to observe current Google metadata, with per-account/domain scope, partial-evidence and safe manual guidance. Never edits policies or treats an API read as proof of effective organization settings.',
 inputSchema:{type:'object',properties:{
  ids:{type:'array',minItems:1,maxItems:10,items:{type:'string',
    enum:[...TOPICS.keys()].sort()}},
  subjectEmail:{type:'string',description:'Exact named employee mailbox for 2-Step or recovery checks; never guessed.'},
  groupEmail:{type:'string',description:'Exact owned/approved group email for its effective group settings read.'},
  domain:{type:'string',description:'Exact reviewed DNS domain for a narrow published email-authentication check.'},
  crossDomain:{type:'boolean',description:'Explicit owner authorization for customer-wide or other-business reads; default false.'},
  dryRun:{type:'boolean',description:'True: list eligible provider reads and scope gates only, no Google requests.'}
 },required:['ids']}
}];
export const handlers={
 async workspace_admin_console_verify(args={},clients){
  const {registry}=await import('./index.js');
  return ok(await executeConsoleReadbacks(args,clients,
   (name,childArgs,account)=>callReadForComposition(registry,name,childArgs,account)));
 }
};
