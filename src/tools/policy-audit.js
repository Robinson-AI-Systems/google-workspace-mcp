// Read-only Cloud Identity policy inspection. Policies describe explicit
// customer/OU/group rules, NOT computed effective per-domain configuration.
import { ok } from './util.js';
import { matchSettings } from './ops.js';
import baseline from '../data/policy-baseline.json' with { type:'json' };
import metadata from '../data/policy-baseline-meta.json' with { type:'json' };
import { checkPolicyBaseline, checkPolicySnapshot, evaluatePolicyEvidence,
 summarizePolicyEvidence, policyOwnerReport } from './policy-evidence.js';
import { createHash } from 'node:crypto';
import { policyFilter, readPolicyPage, scanPolicyPages } from './policy-scan.js';

import { POLICY_AUDIT_AREAS } from './policy-evidence.js';
const AREAS=POLICY_AUDIT_AREAS;
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
  return {chosen,orgUnit,filter:policyFilter(chosen),pageSize,...(args.pageToken?{pageToken:args.pageToken}:{})};
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
  const cfg=request(args);
  const page=await readPolicyPage(clients,{filter:cfg.filter,pageSize:cfg.pageSize,...(args.pageToken?{pageToken:args.pageToken}:{})});
  const all=page.policies;validatePolicies(all);
  const matching=all.filter(p=>(!cfg.chosen||label(p)===cfg.chosen)&&(!cfg.orgUnit||p.policyQuery?.orgUnit===cfg.orgUnit));
  return {policies:matching,nextPageToken:page.nextPageToken,
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
  if (rules === baseline) checkPolicyBaseline(rules,metadata);
  return rules;
}
export function evaluateBaseline(policies,{complete=true,chosen=null,orgUnit=null}={}) {
  validateBaseline();
  validatePolicies(policies);
  return evaluatePolicyEvidence(policies,baseline,{
    complete,chosen,orgUnit,
    baselineStatus:metadata.status,consoleGuide:guide
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
   const cfg=request(args);
   const scan=await scanPolicyPages(clients,{filter:cfg.filter,pageSize:100});
   const policies=scan.policies.filter(p=>(!cfg.chosen||label(p)===cfg.chosen)&&(!cfg.orgUnit||p.policyQuery?.orgUnit===cfg.orgUnit));
   const results=evaluateBaseline(policies,{complete:scan.complete,chosen:cfg.chosen,orgUnit:cfg.orgUnit});
   const integrity=checkPolicySnapshot(policies);
   const evidence=summarizePolicyEvidence(results,{
      baselineVersion:metadata.version,baselineStatus:metadata.status,
      complete:scan.complete,policiesRead:policies.length
   });
   const coverageByArea=evidence.coverageByArea;
   const ownerReport=policyOwnerReport(results,evidence);
   return ok({domain:args.domain.toLowerCase(),customerWide:true,complete:scan.complete,pagesRead:scan.pagesRead,
      nextPageToken:scan.nextPageToken,incompleteReason:scan.incompleteReason,
      baselineRevision:createHash('sha256').update(JSON.stringify({metadata,rules:baseline})).digest('hex'),
      baselineSource:'src/data/policy-baseline.json',baselineMetadataSource:'src/data/policy-baseline-meta.json',
      baselineVersion:metadata.version,baselineStatus:metadata.status,
      isComplianceCertificate:false,customerScopeVerified:integrity.customerVerified,
      policyEvaluationScope:evidence.scope,ownerReport,
      effective:false,policiesRead:policies.length,
      ...(cfg.orgUnit?{orgUnit:cfg.orgUnit,scopeMode:'exact_explicit_org_unit_overrides',effective:false}:{}),
      baselineRules:baseline.length,areasWithRules:[...new Set(baseline.map(r=>r.area))],coverageByArea,results,scopeNote,
      summary:evidence.summary});
 }
};
