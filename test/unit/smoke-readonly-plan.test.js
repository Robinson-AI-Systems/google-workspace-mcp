import {describe,it,expect} from 'vitest';
import { SAFE_READ_PROBES } from '../../scripts/smoke-readonly-catalog.mjs';
import { FIXTURE_TOOL_NAMES } from '../../scripts/smoke-readonly-fixtures.mjs';
import { planCatalogReads, coverageResults, preparedFixtureProbes,
 validateAuthorizedReadCatalog, renderReadOnlyReport, isReviewedRead,
 requiredFields, validateTestAuthorization } from '../../scripts/smoke-readonly-plan.mjs';

const account='scratch@example.test',revision='a'.repeat(40);
const approved=name=>({
 name,area:name.includes('gmail')?'mail':name.includes('calendar')?'calendar':
  name.includes('drive')?'files':name.includes('tasks')?'tasks':'workspace',
 writes:false,annotations:{readOnlyHint:true},
 inputSchema:{type:'object',properties:{},required:[]}
});
const safe=()=>SAFE_READ_PROBES.map(p=>({...approved(p.name),area:p.area}));
const fixture={name:'workspace_gmail_get_label',args:{labelId:'test-fixture-label'}};
const catalog=()=>[...safe(),approved('workspace_gmail_get_label'),
 {...approved('workspace_admin_get_user'),area:'admin',inputSchema:{type:'object',
  properties:{userKey:{type:'string'}},required:['userKey']}},
 {name:'workspace_call',area:'workspace',writes:true,annotations:{readOnlyHint:false}}];

describe('P0-2 complete read-catalog engineering inventory',()=>{
 it('ties execution to the audited static registry instead of method names',()=>{
  expect(isReviewedRead('workspace_gmail_get_label')).toBe(true);
  expect(isReviewedRead('admin_get_user')).toBe(true);
  expect(isReviewedRead('workspace_call')).toBe(false);
  expect(isReviewedRead('unreviewed_get_fake')).toBe(false);
  expect(isReviewedRead('admin_delete_user')).toBe(false);
  expect(()=>validateAuthorizedReadCatalog([approved('unreviewed_get_fake')])).toThrow('unreviewed_read');
  expect(()=>validateAuthorizedReadCatalog([{...approved('workspace_gmail_get_label'),writes:true}]))
   .toThrow('unreviewed_read');
  expect(()=>validateAuthorizedReadCatalog([approved('workspace_gmail_get_label'),
   approved('workspace_gmail_get_label')])).toThrow('duplicate');
 });
 it('distinguishes reviewed runnable probes, resource fixtures and unfinished engineering',()=>{
  const entries=planCatalogReads({catalog:catalog(),safeProbes:SAFE_READ_PROBES,account});
  expect(entries.filter(e=>e.kind==='SAFE')).toHaveLength(SAFE_READ_PROBES.length);
  expect(entries.find(e=>e.name===fixture.name)).toMatchObject({
   kind:'NEEDS_FIXTURE',reason:'exact_owner_fixture_required'
  });
  expect(entries.find(e=>e.name==='workspace_admin_get_user')).toMatchObject({
   kind:'NEEDS_CASE',reason:'reviewed_owner_case_required'
  });
  expect(entries.find(e=>e.name==='workspace_call').kind).toBe('PROTECTED');
  const checks=coverageResults(entries,entries.filter(e=>e.kind==='SAFE')
   .map(e=>({tool:e.name,status:'PASS'})));
  expect(checks.summary).toMatchObject({
   discovered:SAFE_READ_PROBES.length+3,
   scheduled:SAFE_READ_PROBES.length,
   passed:SAFE_READ_PROBES.length,
   failed:0,notProbed:2,engineeringGaps:0,exactFixtureGates:1,reviewedCaseGates:1,
   protectedBrokers:1
  });
  expect(checks.coverageComplete).toBe(false);
 });
 it('requires exact account-owned TEST fixture IDs before scheduling any resource read',()=>{
  const manifest=JSON.stringify([fixture]);
  const [prepared]=preparedFixtureProbes(manifest,account);
  expect(prepared).toMatchObject({...fixture,area:'mail'});
  const entries=planCatalogReads({catalog:catalog(),safeProbes:SAFE_READ_PROBES,
   fixtures:[prepared],account});
  expect(entries.find(e=>e.name===fixture.name).kind).toBe('FIXTURE');
  expect(entries.find(e=>e.name==='workspace_admin_get_user').kind).toBe('NEEDS_CASE');
  const checks=coverageResults(entries,entries.filter(e=>e.probe)
   .map(e=>({tool:e.name,status:'PASS'})));
  expect(checks.summary.exactFixtureGates).toBe(0);
  expect(checks.summary.passed).toBe(SAFE_READ_PROBES.length+1);
  for(const request of [
   [{name:'workspace_gmail_get_label',args:{labelId:'other',includeSpamTrash:true}}],
   [{name:'admin_get_user',args:{userKey:account}}],
   [{name:'workspace_calendar_get_event',args:{calendarId:'primary',eventId:'event1'}}],
   Array(13).fill(fixture)
  ])expect(()=>preparedFixtureProbes(JSON.stringify(request),account)).toThrow();
 });
 it('fails closed on schema/area drift instead of sending incomplete guessed args',()=>{
  const bad=[{...approved('workspace_gmail_list_messages'),area:'admin',
   inputSchema:{type:'object',required:[]}},
   {...approved('workspace_gmail_get_label'),inputSchema:{type:'object',
    properties:{labelId:{}},required:['labelId','unknown']}}];
  const entries=planCatalogReads({catalog:bad,safeProbes:SAFE_READ_PROBES,
   account,fixtures:preparedFixtureProbes(JSON.stringify([fixture]),account)});
  expect(entries.find(e=>e.name==='workspace_gmail_list_messages')).toMatchObject({
   kind:'GAP',reason:'reviewed_probe_area_drift'
  });
  expect(entries.find(e=>e.name===fixture.name)).toMatchObject({
   kind:'GAP',reason:'fixture_probe_schema_or_area_drift'
  });
  const checks=coverageResults(entries);
  expect(checks.summary.failed).toBeGreaterThan(0);
  expect(checks.coverageComplete).toBe(false);
  expect(requiredFields({inputSchema:{required:['b','a','a']}})).toEqual(['a','b']);
  expect(requiredFields({inputSchema:{required:'oops'}})).toBeNull();
 });
 it('never turns absent, denied or ambiguous outcomes into a provider PASS',()=>{
  const entries=planCatalogReads({catalog:[safe()[0]],safeProbes:SAFE_READ_PROBES,account});
  const one=entries.find(e=>e.name===SAFE_READ_PROBES[0].name);
  expect(one.kind).toBe('SAFE');
  expect(coverageResults([one]).tools[0]).toMatchObject({
   status:'FAIL',reason:'scheduled_probe_not_executed'
  });
  expect(coverageResults([one],[{tool:one.name,status:'NOT_AVAILABLE',
   reason:'area_not_granted'}]).coverageComplete).toBe(false);
  expect(()=>coverageResults([one],[{tool:one.name,status:'PASS'},
   {tool:one.name,status:'PASS'}])).toThrow('duplicate');
 });
 it('writes a strictly sanitized report that rejects any unexpected provider text',()=>{
  const entries=planCatalogReads({catalog:catalog(),safeProbes:SAFE_READ_PROBES,
   fixtures:preparedFixtureProbes(JSON.stringify([fixture]),account),account});
  const checks=coverageResults(entries,entries.filter(e=>e.probe)
   .map(e=>({tool:e.name,status:'PASS'})));
  const report=renderReadOnlyReport({date:'2026-10-15',revision,coverage:checks,
   runType:'synthetic'});
  expect(report).toContain('Unfinished engineering probes: 0');
  expect(report).toContain('Full coverage: NO');
  expect(report).toContain('| `workspace_admin_get_user` | NOT_PROBED |');
  expect(report).not.toContain('test-fixture-label');
  expect(report).not.toContain(account);
  expect(()=>renderReadOnlyReport({date:'2026-10-15',revision,
   coverage:{...checks,tools:[{tool:'workspace_whoami',status:'FAIL',
    reason:'Google sent private@example.com'}]}})).toThrow('unsafe_report_row');
 });
 it('rejects missing token, wrong TEST source and weak fixture input before HTTP',()=>{
  expect(()=>validateTestAuthorization({account,revision})).toThrow('protected');
  expect(()=>validateTestAuthorization({token:'secret',account,revision})).toThrow('protected');
  expect(validateTestAuthorization({token:'rtc_pass_'+'a'.repeat(43),account,revision})).toBe(true);
  expect(()=>planCatalogReads({catalog:catalog(),safeProbes:SAFE_READ_PROBES,
   account:'other-email'})).toThrow('approved_account');
 });
});
