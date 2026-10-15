import {describe,it,expect} from 'vitest';
import baseline from '../../src/data/policy-baseline.json' with {type:'json'};
import metadata from '../../src/data/policy-baseline-meta.json' with {type:'json'};
import {checkPolicyBaseline,checkPolicySnapshot,sourceScope,observedPolicyField,
 evaluatePolicyEvidence,summarizePolicyEvidence,policyOwnerReport
} from '../../src/tools/policy-evidence.js';
import {handlers} from '../../src/tools/policy-audit.js';

const TYPE='settings/gmail.external_recipient_warning';
const rule=baseline.find(x=>x.type===TYPE&&x.field==='enabled');
const make=(name,value=true,scope={orgUnit:'orgUnits/root'},customer='customers/C123')=>({
 name,customer,type:'ADMIN',policyQuery:scope,
 setting:{type:TYPE,value:{enabled:value}}
});
const head=make('policies/old-system-name');
const data=rows=>({cloudidentity:{policies:{list:async()=>({data:{policies:rows}})}},crossDomain:true});
const unpack=response=>JSON.parse(response.content[0].text);

describe('P7-2 advisory baseline metadata and immutable safety boundaries',()=>{
 it('pins the full 37-rule owner-editable advisory baseline and its actual areas',()=>{
   expect(checkPolicyBaseline(baseline,metadata)).toBe(true);
   expect(metadata.version).toMatch(/^2026-10-15\./);
   expect(metadata.status).toBe('advisory');
   expect(metadata.ownerAdopted).toBe(false);
   expect(metadata.readOnly).toBe(true);
   expect(metadata.areas).toHaveLength(10);
   expect(new Set(baseline.map(r=>r.area))).toEqual(new Set(metadata.areas));
 });
 it('rejects silently edited metadata, missing coverage, unsupported settings and duplicate checks',()=>{
   const clone=structuredClone(metadata);
   for(const bad of [
     {...clone,status:'enforced'},
     {...clone,version:'latest'},
     {...clone,readOnly:false},
     {...clone,areas:['gmail']},
     {...clone,areas:[...metadata.areas,metadata.areas[0]]}
   ])expect(()=>checkPolicyBaseline(baseline,bad)).toThrow();
   for(const bad of [
     [rule,rule],
     [{...rule,type:'settings/admin_delete_everyone'}],
     [{...rule,field:'__proto__'}],
     [{...rule,expected:NaN}],
     [{...rule,expected:[]}],
     [{...rule,comparator:'execute'}]
   ])expect(()=>checkPolicyBaseline(bad,{...metadata,areas:['gmail']})).toThrow();
 });
});
describe('P7-2 provider snapshot integrity, provenance, observed explicit values',()=>{
 it('checks every Google resource and refuses mixed customers and duplicate names',()=>{
   expect(checkPolicySnapshot([head])).toEqual({
     resources:1,customerVerified:true,customerScope:'customers/C123'});
   expect(checkPolicySnapshot([{...head,customer:undefined}]).customerVerified).toBe(false);
   expect(checkPolicySnapshot([head,{...head,name:'policies/second',customer:undefined}]).customerVerified)
      .toBe(false);
   for(const rows of [
      [head,head],
      [head,make('policies/else',true,undefined,'customers/COTHER')],
      [{...head,name:'bad'}],
      [{...head,setting:{...head.setting,value:null}}],
      [{...head,type:'MUTATION'}],
      Array(2001).fill(head)
   ])expect(()=>checkPolicySnapshot(rows)).toThrow();
 });
 it('reports CEL/group/OU helper scope without asserting effective policy reduction',()=>{
   expect(sourceScope(head)).toMatchObject({
      policyType:'ADMIN',policyQueryKind:'org_unit',
      exactOrgUnitHelper:'orgUnits/root',reducedOrInherited:false});
   const both={...head,policyQuery:{orgUnit:'orgUnits/one',group:'groups/1',
      query:'entity.groups.exists(...)'}};
   expect(sourceScope(both)).toMatchObject({
      policyQueryKind:'ou_and_group',groupScoped:true,
      conditionalExpressionPresent:true,reducedOrInherited:false
   });
   const observed=observedPolicyField(both,rule);
   expect(observed).toMatchObject({result:'match',reducedOrInherited:false,
      exactOrgUnitHelper:'orgUnits/one',groupScoped:true});
 });
 it('distinguishes unknown inherited defaults, malformed values and actual mismatches',()=>{
   const missing={...head,setting:{type:TYPE,value:{}}};
   expect(observedPolicyField(missing,rule)).toMatchObject({
      present:false,result:'unknown',value:null});
   expect(observedPolicyField(make('policies/wrong', 'true'),rule))
      .toMatchObject({invalidType:true,result:'mismatch',value:null});
   expect(observedPolicyField(make('policies/false',false),rule))
      .toMatchObject({result:'mismatch',value:false});
   expect(observedPolicyField(head,rule))
      .toMatchObject({result:'match',value:true});
 });
 it('does not confuse new SYSTEM names and sorting metadata with values',()=>{
   const old={...head,type:'SYSTEM',name:'policies/sku_legacy_priority'};
   const next={...head,type:'SYSTEM',name:'policies/0000000023'};
   const first=evaluatePolicyEvidence([old],[rule],{baselineStatus:'advisory'});
   const second=evaluatePolicyEvidence([next],[rule],{baselineStatus:'advisory'});
   expect(first[0].status).toBe('ok');
   expect(second[0].status).toBe('ok');
   expect(first[0].complianceVerified).toBe(false);
   expect(second[0].complianceVerified).toBe(false);
 });
});
describe('P7-2 usable owner review output, no invented per-domain compliance',()=>{
 it('keeps observed violations visible during partial pages and misses unknown inherited values',()=>{
   const entries=evaluatePolicyEvidence([head,make('policies/second',false)],
      [rule],{complete:false,baselineStatus:'advisory'});
   expect(entries[0]).toMatchObject({
      status:'needs_attention',incompleteScan:true,complianceVerified:false,
      observedExplicitPolicies:2,matchingExplicitPolicies:1,
      mismatchingExplicitPolicies:1,evidenceLevel:'explicit_policy_only'});
   const absent=evaluatePolicyEvidence([], [rule],{complete:true,baselineStatus:'advisory'});
   expect(absent[0]).toMatchObject({status:'not_readable',complianceVerified:false});
   const partial=evaluatePolicyEvidence([head],[rule],{complete:false,baselineStatus:'advisory'});
   expect(partial[0].status).toBe('not_readable');
 });
 it('never uses another org unit as evidence of a selected owner OU',()=>{
   const rows=[make('policies/one',false,{orgUnit:'orgUnits/one'}),
     make('policies/two',true,{orgUnit:'orgUnits/two'})];
   expect(evaluatePolicyEvidence(rows,[rule],{orgUnit:'orgUnits/two',baselineStatus:'advisory'})[0])
       .toMatchObject({status:'ok',observedExplicitPolicies:1});
   expect(evaluatePolicyEvidence(rows,[rule],{orgUnit:'orgUnits/absent',baselineStatus:'advisory'})[0])
       .toMatchObject({status:'not_readable',observedExplicitPolicies:0});
 });
 it('builds a bounded per-area packet with exact action links and no compliance certificate',()=>{
   const findings=evaluatePolicyEvidence([make('policies/bad',false)],baseline,{
      complete:true,chosen:'gmail',baselineStatus:'advisory',
      consoleGuide:r=>({query:r.consoleQuery,url:'https://admin.google.com',steps:[]})
   });
   const summary=summarizePolicyEvidence(findings,{
      baselineVersion:metadata.version,baselineStatus:'advisory',complete:true,policiesRead:1
   });
   expect(summary).toMatchObject({customerWide:true,isComplianceCertificate:false,
      effectiveSettingsVerified:0,scope:'explicit_policies_not_reduced_settings',
      summary:{needsAttention:1}});
   expect(summary.coverageByArea).toHaveLength(1);
   const report=policyOwnerReport(findings,summary);
   expect(report).toMatchObject({advisory:true,effective:false,needsAttention:1});
   expect(report.actions[0]).toMatchObject({area:'gmail',
      consoleUrl:'https://admin.google.com',observedMismatchCount:1});
 });
 it('integrates the reviewed version and advisory scope through the existing owner audit tool',async()=>{
   const report=unpack(await handlers.identity_policy_audit({domain:'rentals.example',area:'gmail'},
      data([make('policies/mismatch',false)])));
   expect(report).toMatchObject({
      baselineVersion:metadata.version,baselineStatus:'advisory',
      isComplianceCertificate:false,customerScopeVerified:true,effective:false,
      ownerReport:{advisory:true,effective:false,needsAttention:1},
      summary:{needsAttention:1}});
   expect(report.ownerReport.notice).toMatch(/inherited/);
   expect(report.results[0].observations[0]).toMatchObject({policyType:'ADMIN',
      exactOrgUnitHelper:'orgUnits/root',reducedOrInherited:false});
 });
});
