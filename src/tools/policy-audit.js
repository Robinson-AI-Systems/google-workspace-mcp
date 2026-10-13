// Read-only Cloud Identity policy inspection. Policies describe explicit
// customer/OU/group rules, NOT computed effective per-domain configuration.
import { ok } from './util.js';
import { matchSettings } from './ops.js';
import baseline from '../data/policy-baseline.json' with { type:'json' };

const AREAS=Object.freeze(['gmail','drive_and_docs','calendar','chat','groups_for_business','api_controls','workspace_marketplace','meet','devices','security','other']);
function area(value) {
  if(value===undefined||value===null||value==='')return null;
  if(!AREAS.includes(value))throw new Error('Unknown policy area; allowed: '+AREAS.join(', '));
  return value;
}
function request(args={}) {
  if(typeof args.domain!=='string'||!/^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?(?:\.[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?)+$/i.test(args.domain))throw new Error('A business domain such as example.com is required.');
  const chosen=area(args.area);
  const orgUnit=args.orgUnit===undefined?null:args.orgUnit;
  // This is an exact policyQuery helper match, not an Admin Directory OU path
  // and never a claim that every effective/inherited policy was reduced.
  if(orgUnit!==null&&(typeof orgUnit!=='string'||!/^orgUnits\/[A-Za-z0-9_-]{1,128}$/.test(orgUnit)))
    throw new Error('orgUnit must be an exact Google policy helper ID such as orgUnits/123456789.');
  const pageSize=args.pageSize===undefined?100:args.pageSize;
  if(!Number.isInteger(pageSize)||pageSize<1||pageSize>100)throw new Error('pageSize must be an integer from 1 through 100.');
  if(args.pageToken!==undefined&&(typeof args.pageToken!=='string'||!args.pageToken))throw new Error('Invalid page token.');
  return {chosen,orgUnit,filter:'customer == "customers/my_customer"',pageSize,...(args.pageToken?{pageToken:args.pageToken}:{})};
}
const label=(p)=>String(p?.setting?.type||'').replace(/^settings\//,'').split('.')[0];
const scopeNote='Cloud Identity Policy API returns customer-wide explicitly-set policies and OU/group overrides, not per-domain effective settings. The supplied domain is a connection boundary, not an API filter. Google may omit inherited/default values. An optional orgUnit selector only compares exact policyQuery.orgUnit helper IDs; complex CEL policies, inherited values and per-user reduced/effective settings are NOT inferred. Inspect the scope and Admin console before changing anything.';
function guide(rule) {
  const hit=matchSettings(rule.consoleQuery,1)[0];
  return {query:rule.consoleQuery,url:hit?.link||'https://admin.google.com',steps:hit?.path||['Open Admin console','Search for '+rule.label]};
}
function validatePolicies(policies){
  if(!Array.isArray(policies))throw new Error('Google returned an invalid policies list.');
  for(const p of policies) if(typeof p?.setting?.type!=='string'||typeof p?.name!=='string')throw new Error('Policy data is incomplete. Cannot assert compliance.');
}
async function listOne(args,clients){
  if(Array.isArray(clients?.allowedDomains)&&clients.crossDomain!==true) throw new Error('Organization-wide Cloud Identity policies include other business domains. Ask the owner before running with crossDomain: true. Nothing was read.');
  const cfg=request(args);const response=await clients.cloudidentity.policies.list({filter:cfg.filter,pageSize:cfg.pageSize,...(args.pageToken?{pageToken:args.pageToken}:{})});
  const all=response.data?.policies||[];validatePolicies(all);
  const matching=all.filter(p=>(!cfg.chosen||label(p)===cfg.chosen)&&(!cfg.orgUnit||p.policyQuery?.orgUnit===cfg.orgUnit));
  return {policies:matching,nextPageToken:response.data?.nextPageToken||null,
    ...(cfg.orgUnit?{orgUnit:cfg.orgUnit,scopeMode:'exact_explicit_org_unit_overrides',effective:false}:{}),scopeNote};
}
export function validateBaseline(rules=baseline){
  if(!Array.isArray(rules)||!rules.length)throw new Error('Policy baseline must contain rules.');
  const seen=new Set();
  for(const r of rules){
    if(!r||!AREAS.includes(r.area)||typeof r.type!=='string'||!r.type.startsWith('settings/'+r.area+'.')||
       !/^[A-Za-z][A-Za-z0-9_]*$/.test(r.field||'')||typeof r.label!=='string'||!r.label.trim()||
       typeof r.consoleQuery!=='string'||!r.consoleQuery.trim()||
       !['boolean','string','number'].includes(typeof r.expected)||
       (typeof r.expected==='number'&&!Number.isFinite(r.expected))||
       (r.comparator!==undefined&&r.comparator!=='atLeast')||
       (r.comparator==='atLeast'&&typeof r.expected!=='number'))
      throw new Error('Invalid policy baseline rule: '+String(r?.type));
    const key=r.type+'#'+r.field;
    if(seen.has(key))throw new Error('Duplicate policy baseline rule: '+key);
    seen.add(key);
  }
  return rules;
}
function differs(observed,rule){
  if(observed===undefined)return false;
  if(rule.comparator==='atLeast')return typeof observed!=='number'||!Number.isFinite(observed)||observed<rule.expected;
  return observed!==rule.expected;
}
export function evaluateBaseline(policies,{complete=true,chosen=null}={}){
  validateBaseline();
  validatePolicies(policies);
  const matches=baseline.filter(r=>!chosen||r.area===chosen);
  return matches.map(rule=>{
    const relevant=policies.filter(p=>p.setting.type===rule.type);
    const observations=relevant.map(p=>({name:p.name,policyQuery:p.policyQuery||null,policyType:p.type||null,value:p.setting?.value?.[rule.field]}));
    // Missing/unknown values and incomplete pagination must not become green.
    const unknown=observations.length===0||observations.some(o=>o.value===undefined);
    const mismatch=observations.some(o=>differs(o.value,rule));
    return {setting:rule.label,policySetting:rule.type,field:rule.field,expected:rule.expected,...(rule.comparator?{comparator:rule.comparator}:{}),
      status:mismatch?'needs_attention':!complete||unknown?'not_readable':'ok',
      reason:mismatch?'One or more observed explicit policies differ from the owner-editable baseline, even if other pages or inherited settings are unavailable.':!complete?'Some pages were not available; cannot conclude.':unknown?'No explicit readable policy value was returned; inherited/default state is not proven.':'All observed explicit policy entries match the baseline; inherited state and per-domain effectiveness are not verified.',
      observations,console:guide(rule)};
  });
}
export const tools=[
 {name:'identity_list_policies',description:'List Google Cloud Identity policies with pagination, optionally narrowed to an application. Requires crossDomain: true for business-restricted connections with owner permission; domain is NOT a provider filter.',inputSchema:{type:'object',properties:{domain:{type:'string'},area:{type:'string',enum:AREAS},orgUnit:{type:'string',description:'Optional exact Cloud Identity policyQuery.orgUnit helper ID, e.g. orgUnits/123; does not include inherited/effective values.'},pageSize:{type:'integer',minimum:1,maximum:100},pageToken:{type:'string'}},required:['domain']}},
 {name:'identity_policy_audit',description:'Compare explicit Cloud Identity policies with the documented editable reference baseline. Missing/inherited data is not_readable, not compliant. Organization-wide reads require crossDomain: true for business-restricted connections with owner permission; Google requires Super Admin and account-specific OAuth consent.',inputSchema:{type:'object',properties:{domain:{type:'string'},area:{type:'string',enum:AREAS},orgUnit:{type:'string',description:'Optional exact policyQuery.orgUnit ID for observed explicit override comparisons only. Does not calculate effective settings.'}},required:['domain']}}
];
export const handlers={
 async identity_list_policies(args={},clients){return ok(await listOne(args,clients));},
 async identity_policy_audit(args={},clients){
   if(Array.isArray(clients?.allowedDomains)&&clients.crossDomain!==true) throw new Error('Organization-wide Cloud Identity policies include other business domains. Ask the owner before running with crossDomain: true. Nothing was read.');
   const cfg=request(args),seen=new Set(),policies=[];
   let token,complete=false;
   for(let page=0;page<20;page++){
     const v=await listOne({...args,pageToken:token,pageSize:100},clients);
     policies.push(...v.policies);
     if(!v.nextPageToken){complete=true;break;}
     if(seen.has(v.nextPageToken))throw new Error('Google repeated a policy page token; the audit is incomplete.');
     seen.add(v.nextPageToken);token=v.nextPageToken;
   }
   const results=evaluateBaseline(policies,{complete,chosen:cfg.chosen});
   return ok({domain:args.domain.toLowerCase(),customerWide:true,complete,policiesRead:policies.length,
      ...(cfg.orgUnit?{orgUnit:cfg.orgUnit,scopeMode:'exact_explicit_org_unit_overrides',effective:false}:{}),
      baselineRules:baseline.length,areasWithRules:[...new Set(baseline.map(r=>r.area))],results,scopeNote,
      summary:{needsAttention:results.filter(r=>r.status==='needs_attention').length,notReadable:results.filter(r=>r.status==='not_readable').length,matchingExplicitPolicies:results.filter(r=>r.status==='ok').length}});
 }
};
