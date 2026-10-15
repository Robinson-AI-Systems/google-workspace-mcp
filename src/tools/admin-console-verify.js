// P8-8: Guided, provider-backed *read-only* checks for selected Admin
// console topics. "Observed" means this exact child API returned a structurally
// valid response, NOT that a global/OU policy, billing plan or security rule is
// correct. The existing guarded registry executes all child reads.
import {ok} from './util.js';
import {allowedTool} from '../rtc/catalog.js';
import {callReadForComposition} from '../rtc/results.js';
import {CONSOLE_MAP,CONSOLE_VERIFICATION} from '../data/console-map.js';
import {CONSOLE_REVIEW_GROUPS} from '../data/console-review.js';

const EMAIL=/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$/;
const SKU=/^[a-zA-Z0-9_-]{2,100}$/;
const REPORT_DATE=/^\d{4}-\d{2}-\d{2}$/;
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
 'drive-sharing':{tool:'workflow_audit_external_sharing',area:'workflows',scope:'account_sample',
   proof:x=>obj(x)&&integer(x.scanned)&&x.scanned<=20&&
     bounded(x.filesWithExternalOrPublicSharing)&&
     x.filesWithExternalOrPublicSharing.every(f=>obj(f)&&nonempty(f.fileId)),
   args:()=>({maxFilesToScan:20})},
 'reports':{tool:'reports_usage_customer',area:'admin',scope:'named_report_date',
   proof:listOf(x=>obj(x)&&nonempty(x.customerId||x.date||x.entity?.customerId)),
   args:t=>({date:t})},
 'license-assign-ui':{tool:'licensing_list_assignments',area:'admin',scope:'named_sku',
   proof:listOf(x=>obj(x)&&nonempty(x.userId)&&nonempty(x.skuId)),
   args:t=>({skuId:t})},
 'api-controls':{tool:'workspace_delegation_status',area:'workspace',scope:'customer',
   proof:x=>obj(x)&&bool(x.configured)&&Array.isArray(x.scopesToAuthorize)&&
     x.scopesToAuthorize.every(nonempty),
   args:()=>({})},
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

// Expectations are per-observed-mailbox predicates, never organizational
// policy assertions. An expected=false is a legitimate owner policy choice;
// failures are surfaced, not silently upgraded to verified Admin settings.
const EXPECTATION_READBACKS=Object.freeze({
 'gmail-imap-pop':x=>x.enabled,
 'email-forwarding':x=>x.enabled,
 'out-of-office':x=>x.enableAutoReply,
 'gmail-default-routing-delegation':x=>x.length>0,
 'signature':x=>x.length>0,
 '2sv':x=>x.isEnrolledIn2Sv===true&&x.isEnforcedIn2Sv===true
});
export function validateConsoleExpectations(args={}){
 const requests=args.expectations===undefined?[]:args.expectations;
 if(!Array.isArray(requests)||requests.length>MAX)
  throw Error('Expected mailbox settings must contain at most ten checks.');
 const ids=new Set(),map=new Map();
 for(const item of requests){
  if(!obj(item)||Object.keys(item).sort().join(',')!=='expected,id'||
     !Object.hasOwn(EXPECTATION_READBACKS,item.id)||
     !Array.isArray(args.ids)||!args.ids.includes(item.id)||
     typeof item.expected!=='boolean'||ids.has(item.id))
   throw Error('Expectations require distinct selected reviewed mailbox IDs and an exact boolean.');
  ids.add(item.id);map.set(item.id,item.expected);
 }
 return map;
}

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
   args.domain!==undefined&&!domain(args.domain)||
   args.skuId!==undefined&&(typeof args.skuId!=='string'||!SKU.test(args.skuId))||
   args.reportDate!==undefined&&(typeof args.reportDate!=='string'||!REPORT_DATE.test(args.reportDate)||
     Number.isNaN(Date.parse(args.reportDate+'T00:00:00Z'))))
  throw Error('Invalid exact mailbox, group, DNS domain, SKU or usage-report date.');
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
  const requiresCustomer=['customer','customer_sample','named_report_date','named_sku'].includes(spec.scope);
  const target=spec.scope==='named_user'?args.subjectEmail:
   spec.scope==='named_group'?args.groupEmail:
   spec.scope==='named_domain'?args.domain:
   spec.scope==='named_report_date'?args.reportDate:
   spec.scope==='named_sku'?args.skuId:null;
  if(['named_user','named_group','named_domain','named_report_date','named_sku'].includes(spec.scope)&&!target)
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
  if(['customer_sample','customer','account_sample','named_report_date','named_sku'].includes(spec.scope))
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
 const expectations=validateConsoleExpectations(args);
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
  const predicted=expectations.get(base.id);
  let expectedStatus=observed;
  if(predicted!==undefined&&observed.status==='observed'){
   try{
    const observedBoolean=EXPECTATION_READBACKS[base.id](value);
    if(typeof observedBoolean==='boolean')
     expectedStatus=observedBoolean===predicted?
      {status:'matches_expected',reason:'observed_mailbox_setting_matches_requested_boolean'}:
      {status:'needs_attention',reason:'observed_mailbox_setting_differs_from_expected_boolean'};
   }catch{/* Provider data never becomes a verified boolean without a readback. */}
  }
  entries.push({...base,status:expectedStatus.status,reason:expectedStatus.reason,
   ...(predicted!==undefined?{expected:predicted}:{}),
   ...(value!==null&&Array.isArray(value)&&observed.status!=='not_readable'?
    {observedCount:value.length}:{})});
 }
 const summary={total:entries.length,observed:0,observedPartial:0,
  matchesExpected:0,needsAttention:0,notReadable:0,outsideScope:0,manualOnly:0,needsTarget:0,planned:0};
 for(const entry of entries){
  if(entry.status==='observed')summary.observed++;
  else if(entry.status==='observed_partial')summary.observedPartial++;
  else if(entry.status==='matches_expected')summary.matchesExpected++;
  else if(entry.status==='needs_attention')summary.needsAttention++;
  else if(entry.status==='not_readable')summary.notReadable++;
  else if(entry.status==='outside_scope')summary.outsideScope++;
  else if(entry.status==='manual_only')summary.manualOnly++;
  else if(entry.status==='needs_target')summary.needsTarget++;
  else if(entry.status==='planned')summary.planned++;
 }
 const allObserved=summary.observed+summary.observedPartial+
  summary.matchesExpected+summary.needsAttention===summary.total;
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
  reportDate:{type:'string',description:'Exact YYYY-MM-DD date for the Reports usage read.'},
  skuId:{type:'string',description:'Exact Workspace licensing SKU ID, not a purchased-seat count.'},
  crossDomain:{type:'boolean',description:'Explicit owner authorization for customer-wide or other-business reads; default false.'},
  dryRun:{type:'boolean',description:'True: list eligible provider reads and scope gates only, no Google requests.'},
  expectations:{type:'array',maxItems:10,items:{type:'object',required:['id','expected'],
    properties:{id:{type:'string',enum:Object.keys(EXPECTATION_READBACKS)},expected:{type:'boolean'}}}}
 },required:['ids']}
},{
 name:'workspace_admin_console_capabilities',
 description:'Discover which of all mapped Google Admin settings have a reviewed read-only provider check, which require exact targets or owner approval, and which remain manual.',
 inputSchema:{type:'object',properties:{
  category:{type:'string',enum:Object.keys(CONSOLE_REVIEW_GROUPS)},
  query:{type:'string',maxLength:120},
  status:{type:'string',enum:['eligible','outside_scope','manual_only','needs_target']},
  page:{type:'integer',minimum:1,maximum:1000},
  pageSize:{type:'integer',minimum:1,maximum:20},
  subjectEmail:{type:'string'},
  groupEmail:{type:'string'},
  domain:{type:'string'},
  reportDate:{type:'string'},
  skuId:{type:'string'},
  crossDomain:{type:'boolean'}
 }}
}];
export const handlers={
 async workspace_admin_console_verify(args={},clients){
  const {registry}=await import('./index.js');
  return ok(await executeConsoleReadbacks(args,clients,
   (name,childArgs,account)=>callReadForComposition(registry,name,childArgs,account)));
 },
 async workspace_admin_console_capabilities(args={},clients){return ok(discoverConsoleReadbacks(args,clients));}
};

// Compact complete coverage ledger: an owner sees what is genuinely
// available for an entire category, not just the current page of results.
export function summarizeConsoleCategories(items){
 if(!Array.isArray(items))throw Error('Category coverage needs the reviewed topic set.');
 const categories=Object.create(null);
 for(const group of Object.keys(CONSOLE_REVIEW_GROUPS)){
  categories[group]={total:0,eligible:0,outsideScope:0,needsTarget:0,manualOnly:0};
 }
 const unique=new Set();
 for(const item of items){
  if(!obj(item)||!TOPICS.has(item.id)||unique.has(item.id)||!CATEGORY.has(item.id))
   throw Error('Incomplete or duplicate Admin console topic identity.');
  unique.add(item.id);
  const row=categories[CATEGORY.get(item.id)];
  row.total++;
  if(item.status==='eligible')row.eligible++;
  else if(item.status==='outside_scope')row.outsideScope++;
  else if(item.status==='needs_target')row.needsTarget++;
  else if(item.status==='manual_only')row.manualOnly++;
  else throw Error('Unreviewed console availability state.');
 }
 for(const row of Object.values(categories)){
  if(row.eligible+row.outsideScope+row.needsTarget+row.manualOnly!==row.total)
   throw Error('Console category counts did not reconcile.');
 }
 return categories;
}

const PREVIEW_STATES=new Set(['eligible','outside_scope','manual_only','needs_target']);
export function discoverConsoleReadbacks(args={},clients={}){
 const {category,query='',status,page=1,pageSize=10}=args;
 if(category!==undefined&&!Object.keys(CONSOLE_REVIEW_GROUPS).includes(category))
  throw Error('Unknown Admin console review category.');
 if(typeof query!=='string'||query.length>120||
   status!==undefined&&!PREVIEW_STATES.has(status)||
   !Number.isSafeInteger(page)||page<1||page>1000||
   !Number.isSafeInteger(pageSize)||pageSize<1||pageSize>20)
  throw Error('Review filter, eligibility, page or page size is invalid.');
 const found=CONSOLE_MAP
  .filter(entry=>(!category||CATEGORY.get(entry.id)===category)&&
    (!query||[entry.id,entry.title,...entry.keywords].some(term=>
      term.toLowerCase().includes(query.trim().toLowerCase()))))
  .map(entry=>{
   const planned=planConsoleReadbacks({
    ids:[entry.id],crossDomain:args.crossDomain,
    subjectEmail:args.subjectEmail,groupEmail:args.groupEmail,domain:args.domain,
    reportDate:args.reportDate,skuId:args.skuId
   },clients)[0];
   return {id:entry.id,category:CATEGORY.get(entry.id),
    title:entry.title,status:planned.status,
    ...(planned.reason?{reason:planned.reason}:{}),
    ...(planned.tool?{tool:planned.tool}:{})};
  });
 const counts={eligible:0,outside_scope:0,manual_only:0,needs_target:0};
 for(const item of found)counts[item.status]++;
 const filtered=status?found.filter(item=>item.status===status):found;
 const categories=summarizeConsoleCategories(found);
 const start=(page-1)*pageSize;
 return {
  mode:'read_only_discovery',account:clients.actingAs,totalMapped:CONSOLE_MAP.length,
  totalMatched:filtered.length,
  filters:{category:category||null,status:status||null,query:query.trim()},
  counts,categoryCoverage:categories, page,pageSize,
  nextPage:start+pageSize<filtered.length?page+1:null,
  items:filtered.slice(start,start+pageSize),
  note:'This is a protected scope/shape inventory only. Eligible does not mean Google granted the permission or applied an effective Admin policy; run workspace_admin_console_verify for exact provider reads.'
 };
}
