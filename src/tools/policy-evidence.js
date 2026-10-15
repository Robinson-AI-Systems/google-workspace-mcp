// P7-2: evidence semantics for explicit Google Cloud Identity policies.
// Google exposes underlying policy resources, NOT their reduced/effective
// setting for a domain, OU, group, user, or device. Never infer compliance.
// Pure functions keep the provider, owner baseline and console UI consistent.
// References: https://docs.cloud.google.com/identity/docs/concepts/overview-policies
//             https://docs.cloud.google.com/identity/docs/reference/rest/v1/policies
const SETTING=/^settings\/[a-z_]+\.[A-Za-z0-9_]+$/;
const POLICY_NAME=/^policies\/[A-Za-z0-9_./-]+$/;
const CUSTOMER_NAME=/^customers\/C[A-Za-z0-9_-]+$/;
const VERSION=/^\d{4}-\d{2}-\d{2}\.[1-9]\d{0,4}$/;
const AREAS=Object.freeze([
 'gmail','drive_and_docs','calendar','chat','groups_for_business',
 'api_controls','workspace_marketplace','meet','devices','security','other'
]);
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const own=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
export const POLICY_AUDIT_AREAS=AREAS;

export function checkPolicyBaseline(rules,metadata){
 if(!Array.isArray(rules)||rules.length===0||rules.length>200||
    !object(metadata)||!VERSION.test(metadata.version||'')||
    metadata.readOnly!==true||!['advisory','owner_reviewed'].includes(metadata.status)||
    !Array.isArray(metadata.areas)||metadata.areas.some(a=>!AREAS.includes(a))||
    new Set(metadata.areas).size!==metadata.areas.length)
   throw Error('Invalid or unversioned read-only owner policy baseline');
 const keys=new Set(),presentAreas=new Set();
 for(const rule of rules) {
  if(!object(rule)||typeof rule.area!=='string'||!AREAS.includes(rule.area)||
    !SETTING.test(rule.type||'')||!rule.type.startsWith('settings/'+rule.area+'.')||
    !/^[A-Za-z][A-Za-z0-9_]*$/.test(rule.field||'')||
    typeof rule.label!=='string'||!rule.label.trim()||rule.label.length>240||
    typeof rule.consoleQuery!=='string'||!rule.consoleQuery.trim()||
    rule.consoleQuery.length>240||
    !['boolean','string','number'].includes(typeof rule.expected)||
    (typeof rule.expected==='number'&&!Number.isFinite(rule.expected))||
    (rule.comparator!==undefined&&rule.comparator!=='atLeast')||
    (rule.comparator==='atLeast'&&typeof rule.expected!=='number'))
   throw Error('Invalid rule in read-only owner policy baseline');
  const key=rule.type+'#'+rule.field;
  if(keys.has(key))throw Error('Duplicate policy rule: '+key);
  keys.add(key);presentAreas.add(rule.area);
 }
 if(metadata.areas.length!==presentAreas.size||
    metadata.areas.some(a=>!presentAreas.has(a)))
   throw Error('Policy baseline declared area coverage does not match rules');
 return true;
}

export function checkPolicySnapshot(policies){
 if(!Array.isArray(policies)||policies.length>2000)
  throw Error('Invalid or oversized Policy API snapshot; scan incomplete');
 const names=new Set(),customers=new Set();
 for(const p of policies){
  if(!object(p)||!POLICY_NAME.test(p.name||'')||names.has(p.name)||
    !object(p.setting)||!SETTING.test(p.setting.type||'')||
    !object(p.setting.value)||
    (p.customer!==undefined&&!CUSTOMER_NAME.test(p.customer))||
    (p.type!==undefined&&!['ADMIN','SYSTEM','POLICY_TYPE_UNSPECIFIED'].includes(p.type))||
    (p.policyQuery!==undefined&&!object(p.policyQuery)))
   throw Error('Untrusted or conflicting Policy API snapshot');
  names.add(p.name);
  if(p.customer)customers.add(p.customer);
 }
 if(customers.size>1)throw Error('Policy API snapshot crossed customer boundaries');
 return {resources:policies.length,customerVerified:customers.size===1&&policies.every(p=>!!p.customer),
  customerScope:customers.size===1?[...customers][0]:null};
}

export function sourceScope(policy){
 const query=policy.policyQuery||{};
 const group=typeof query.group==='string'&&query.group.length>0;
 const ou=typeof query.orgUnit==='string'&&query.orgUnit.length>0;
 const cel=typeof query.query==='string'&&query.query.length>0;
 const rawType=policy.type||'POLICY_TYPE_UNSPECIFIED';
 return {
  policyType:rawType,
  // A single OU helper is NOT proof that the policy is effective there.
  policyQueryKind: group&&ou?'ou_and_group':group?'group':ou?'org_unit':
    cel?'complex_cel':'unspecified',
  exactOrgUnitHelper:ou?query.orgUnit:null,
  groupScoped:group,
  conditionalExpressionPresent:cel,
  reducedOrInherited:false
 };
}
export function observedPolicyField(p,rule){
 if(p.setting.type!==rule.type)return null;
 const val=p.setting.value;
 const present=own(val,rule.field);
 const raw=present?val[rule.field]:undefined;
 // A missing/null field and an unsupported value type are UNKNOWN, not
 // a default or passing match. Protobuf Struct still carries normal JS
 // booleans, numbers and strings in its JSON representation.
 const expectedType=typeof rule.expected;
 const supplied=present&&raw!==null;
 const known=supplied&&typeof raw===expectedType&&
   !(expectedType==='number'&&!Number.isFinite(raw));
 const match=known&&(rule.comparator==='atLeast'
  ?raw>=rule.expected:raw===rule.expected);
 return {
  name:p.name,
  ...sourceScope(p),
  present,validType:known,invalidType:supplied&&!known,
  value:known?raw:null,
  result:!supplied?'unknown':match?'match':'mismatch'
 };
}

export function evaluatePolicyEvidence(policies,rules,{
 complete=true,chosen=null,orgUnit=null,baselineStatus='advisory',
 consoleGuide=()=>null
}={}){
 checkPolicySnapshot(policies);
 if(typeof complete!=='boolean'||(chosen!==null&&!AREAS.includes(chosen))||
    (orgUnit!==null&&!/^orgUnits\/[A-Za-z0-9_-]{1,128}$/.test(orgUnit))||
    !['advisory','owner_reviewed'].includes(baselineStatus))
  throw Error('Invalid Policy API audit selector');
 const selected=rules.filter(r=>!chosen||r.area===chosen);
 return selected.map(rule=>{
  const rows=policies.filter(p=>p.setting.type===rule.type&&
    (!orgUnit||p.policyQuery?.orgUnit===orgUnit));
  const observations=rows.map(p=>observedPolicyField(p,rule));
  const mismatch=observations.some(o=>o.result==='mismatch');
  const unknown=observations.length===0||
    observations.some(o=>o.result==='unknown');
  const status=mismatch?'needs_attention':!complete||unknown?'not_readable':'ok';
  return {
   area:rule.area,setting:rule.label,policySetting:rule.type,
   field:rule.field,expected:rule.expected,
   ...(rule.comparator?{comparator:rule.comparator}:{}),
   status,complianceVerified:false,
   evidenceLevel:'explicit_policy_only',
   baselineStatus,
   // These booleans let clients distinguish a positive explicit match from
   // a verified effective setting (which this API cannot supply).
   observedExplicitPolicies:observations.length,
   matchingExplicitPolicies:observations.filter(o=>o.result==='match').length,
   mismatchingExplicitPolicies:observations.filter(o=>o.result==='mismatch').length,
   unavailableExplicitValues:observations.filter(o=>o.result==='unknown').length,
   incompleteScan:!complete,
   reason:mismatch?
     'One or more observed explicit policies differ from the advisory baseline or contain invalid value types. Check their targets and inherited settings in Admin console.':
     !complete?'The provider scan is partial; matching available pages cannot verify completeness.':
     unknown?'The requested explicit value was not readable; no inherited/default value can be assumed.':
     'All observed explicit policy values match this baseline; reduced or effective settings remain unverified.',
   observations,
   console:consoleGuide(rule)
  };
 });
}

export function summarizePolicyEvidence(findings,{
 baselineVersion,baselineStatus,complete,policiesRead
}={}){
 if(!Array.isArray(findings)||typeof complete!=='boolean'||
    !VERSION.test(baselineVersion||'')||
    !['advisory','owner_reviewed'].includes(baselineStatus)||
    !Number.isInteger(policiesRead)||policiesRead<0)
  throw Error('Invalid owner policy report summary');
 const byArea=[...new Set(findings.map(f=>f.area))].map(area=>{
  const rows=findings.filter(f=>f.area===area);
  return {
   area,checks:rows.length,
   matchingExplicitPolicies:rows.filter(f=>f.status==='ok').length,
   needsAttention:rows.filter(f=>f.status==='needs_attention').length,
   notReadable:rows.filter(f=>f.status==='not_readable').length,
   effectiveSettingsVerified:0
  };
 });
 const counts={
  needsAttention:findings.filter(f=>f.status==='needs_attention').length,
  notReadable:findings.filter(f=>f.status==='not_readable').length,
  matchingExplicitPolicies:findings.filter(f=>f.status==='ok').length
 };
 return {
  baselineVersion,baselineStatus,
  // This is NEVER a compliance certification, including when all entries
  // match and a complete customer-wide scan was obtained.
  isComplianceCertificate:false,
  effectiveSettingsVerified:0,
  customerWide:true,
  policiesRead,
  complete,
  scope:'explicit_policies_not_reduced_settings',
  nextAction:counts.needsAttention?
    'Review each explicit mismatch at its linked Admin console page before changing a setting.':
    'Inspect Admin console inherited/default settings and the selected domain or OU; no effective compliance was established.',
  coverageByArea:byArea,summary:counts
 };
}

export function policyOwnerReport(findings,summary){
 // This small response is meant to be rendered in the owner workflow alongside
 // the full structured rows. Never claims per-domain or reduced compliance.
 if(!Array.isArray(findings)||!object(summary)||!object(summary.summary))
  throw Error('Invalid policy review report');
 const rows=findings.filter(f=>f.status==='needs_attention').map(f=>({
  area:f.area,setting:f.setting,
  observedMismatchCount:f.mismatchingExplicitPolicies,
  consoleQuery:f.console?.query||f.setting,
  consoleUrl:f.console?.url||null
 }));
 return {
  title:'Google Workspace policy review (explicit rules only)',
  advisory:summary.baselineStatus==='advisory',
  version:summary.baselineVersion,
  checked:findings.length,
  needsAttention:summary.summary.needsAttention,
  notReadable:summary.summary.notReadable,
  complete:summary.complete,
  effective:false,
  actions:rows,
  notice:'The API does not compute final inherited/domain-specific settings. Open Admin console before making a compliance decision or any change.'
 };
}
