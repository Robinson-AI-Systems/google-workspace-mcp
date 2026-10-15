import {describe,it,expect} from 'vitest';
import {summarizeAppReadiness} from '../../src/tools/dev-integration-report.js';
import {inspectGoogleIntegration} from '../../src/tools/dev-integration.js';
const url='https://calendar.google.com';
describe('P8-7 machine-readable app readiness and safe fix summaries',()=>{
 it('does not mark an empty or unreadable checkset as ready',()=>{
  const empty=summarizeAppReadiness([]);
  expect(empty).toMatchObject({status:'not_readable',total:0,ready:0,complete:false});
  expect(empty.nextSteps).toEqual([]);
  expect(()=>summarizeAppReadiness([null])).toThrow();
  expect(()=>summarizeAppReadiness([{kind:'calendar',status:'success'}])).toThrow();
 });
 it('groups Google API areas, tracks all three states and retains the overall missing priority',()=>{
  const summary=summarizeAppReadiness([
   {kind:'gmail_message',status:'ready'},
   {kind:'drive_file',status:'missing',reason:'resource_not_found',fix:{url:'https://drive.google.com'}},
   {kind:'calendar_role',status:'not_readable',reason:'scope_or_access_denied',fix:{url}},
   {kind:'calendar_availability',status:'ready'},
   {kind:'task_item',status:'ready'},
   {kind:'contact',status:'ready'},
   {kind:'api',status:'ready'},
   {kind:'delegated_scope',status:'not_readable',fix:{url:'https://admin.google.com'}}
  ]);
  expect(summary).toMatchObject({total:8,ready:5,missing:1,notReadable:2,
   complete:false,status:'missing'});
  expect(summary.byKind.calendar_role).toMatchObject({not_readable:1,ready:0});
  expect(summary.byArea.calendar).toMatchObject({ready:1,not_readable:1});
  expect(summary.byArea.delegation.not_readable).toBe(1);
  expect(summary.nextSteps.map(x=>x.url)).toEqual([
   'https://drive.google.com',url,'https://admin.google.com'
  ]);
  expect(JSON.stringify(summary)).not.toContain('sourceAccount');
 });
 it('prevents user-controlled link injection in suggested remediation',()=>{
  const x=summarizeAppReadiness([
   {kind:'contact',status:'missing',fix:{url:'https://evil.test/phishing?token=secret'}},
   {kind:'calendar',status:'not_readable',fix:{url:'javascript:alert(1)'}},
   {kind:'calendar',status:'missing',fix:{url:'https://calendar.google.com.evil.test/page'}},
   {kind:'calendar',status:'missing',fix:{url:'https://calendar.google.com'}},
   {kind:'calendar',status:'missing',fix:{url:'https://calendar.google.com'}}
  ]);
  expect(x.nextSteps).toHaveLength(1);
  expect(x.nextSteps[0].url).toBe('https://calendar.google.com');
 });
 it('bounds repeated Google Console guidance and preserves checked counts',()=>{
  const many=Array.from({length:30},(_,i)=>({kind:'oauth_scope',
   status:'missing',reason:'oauth_consent_missing',
   fix:{url:'https://console.cloud.google.com/'+i}}));
  const report=summarizeAppReadiness(many);
  expect(report.nextSteps).toHaveLength(8);
  expect(report.total).toBe(30);
  expect(report.byArea.oauth.missing).toBe(30);
 });
 it('exposes aggregate counts without user data through the existing public integration workflow',async()=>{
  const c={actingAs:'dev@example.test',rtcPolicy:{profile:'read_only'},
   gmail:{users:{getProfile:async()=>({data:{emailAddress:'dev@example.test'}})}},
   drive:{files:{get:async()=>({data:{id:'file-1',mimeType:'application/pdf',trashed:false}})}}
  };
  const result=await inspectGoogleIntegration({
   apis:['gmail'],driveFiles:['file-1']
  },c);
  expect(result.summary).toMatchObject({total:2,ready:2,missing:0,notReadable:0,
   complete:true,status:'ready'});
  expect(Object.keys(result.summary.byArea).sort()).toEqual(['api','files']);
  expect(result.changesMade).toBe(false);
  expect(result.summary.nextSteps).toEqual([]);
 });
});
