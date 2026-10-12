import {describe,it,expect} from 'vitest';
import {registry} from '../../src/tools/index.js';
import {OUTPUT_SCHEMAS,attachStructuredResult} from '../../src/rtc/structured.js';
import {ok} from '../../src/tools/util.js';
import {healthReport} from '../../src/tools/health-report.js';

const names=['workflow_health_report','workflow_email_health','workspace_plan_summary'];
const checks=[{check:'2-Step Verification',status:'WARN',found:'One user needs enrollment',fix:'Review the setting.'},
 {check:'Domain',status:'PASS',found:'Confirmed'}];
const health={scope:'example.test',summary:{pass:1,warn:1,fail:0,info:0},checks,report:'## Workspace health'};
const email={domain:'example.test',summary:{pass:1,warn:1,fail:0,info:0},checks,report:'## Email health'};
const plans={customerId:'C123',totalLicensesAssigned:3,plans:[
 {skuId:'starter',plan:'Business Starter',assigned:2,geminiIncluded:true},
 {skuId:'enterprise',plan:'Enterprise',assigned:1,geminiIncluded:null}],
 geminiIncluded:'on some plans',note:'Purchased seats unavailable'};

describe('P8-1 typed read-only Workspace diagnostics',()=>{
 it('exposes three schema contracts on the assembled registry',()=>{
  for(const name of names){
   const tool=registry.tools.find(t=>t.name===name);
   expect(tool?.outputSchema).toEqual(OUTPUT_SCHEMAS[name]);
   expect(tool.outputSchema.anyOf).toHaveLength(2);
   expect(tool.annotations?.destructiveHint).not.toBe(true);
  }
  expect(registry.tools.find(t=>t.name==='gmail_send_email').outputSchema).toBeUndefined();
 });
 it('returns structured content for validated health, email and plan reports',()=>{
  for(const [name,value] of Object.entries({
   workflow_health_report:health,workflow_email_health:email,workspace_plan_summary:plans
  })){
   const result=attachStructuredResult(name,ok(value));
   expect(result.isError,name).not.toBe(true);
   expect(result.structuredContent,name).toEqual(value);
   expect(result.content[0].text).toEqual(ok(value).content[0].text);
  }
 });
 it('refuses impossible or missing health totals and malformed check statuses',()=>{
  const invalid=[
   {...health,summary:{pass:5,warn:1,fail:0,info:0}},
   {...health,summary:{pass:1,warn:0,fail:0,info:0}},
   {...health,checks:[{check:'Setting',found:'Unknown',status:'CERTIFIED'}]},
   {...health,report:undefined}
  ];
  for(const value of invalid)
   expect(attachStructuredResult('workflow_health_report',ok(value)).isError).toBe(true);
  expect(attachStructuredResult('workflow_email_health',ok({...email,domain:null})).isError).toBe(true);
 });
 it('fails closed for license totals inconsistent with individual assignments',()=>{
  for(const bad of [{...plans,totalLicensesAssigned:9},
   {...plans,plans:[{assigned:-1,skuId:'bad',plan:'Unknown'}]},
   {...plans,geminiIncluded:null}]){
   expect(attachStructuredResult('workspace_plan_summary',ok(bad)).isError).toBe(true);
  }
 });
 it('does not transform missing permission or cross-domain refusal into a typed success',()=>{
  for(const name of names){
   const denied={...ok('OAuth token not authorized'),isError:true};
   expect(attachStructuredResult(name,denied)).toBe(denied);
   const refused=attachStructuredResult(name,ok('Refused: this account may not read another business. Nothing was read.'));
   expect(refused.isError).toBe(true);
   expect(refused.structuredContent).toBeUndefined();
  }
 });
 it('supports only well-formed connection-owned large-result handles',()=>{
  const handle={handle:'rtc_result_'+'z'.repeat(32),bytes:123456,count:41,summary:'Stored under connection'};
  for(const name of names){
   expect(attachStructuredResult(name,ok(handle)).structuredContent).toEqual(handle);
   expect(attachStructuredResult(name,ok({...handle,handle:'invalid'})).isError).toBe(true);
  }
 });
 it('counts the warning from an empty Workspace directory correctly',async()=>{
  const clients={admin:{users:{list:async()=>({data:{users:[]}})}}};
  const r=await healthReport('example.test',clients);
  expect(r.summary.warn).toBe(1);
  expect(r.checks).toHaveLength(1);
  expect(r.checks[0].status).toBe('WARN');
  expect(attachStructuredResult('workflow_health_report',ok(r)).structuredContent).toEqual(r);
 });
});
