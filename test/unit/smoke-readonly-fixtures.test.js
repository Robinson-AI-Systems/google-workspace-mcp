import {describe,it,expect,vi} from 'vitest';
import {parseExactReadFixtures,runFixtureReadOnlySmoke,FIXTURE_TOOL_NAMES,main}
 from '../../scripts/smoke-readonly-fixtures.mjs';
import {FIXTURE_READ_PROOFS,verifiedProviderReadResult} from '../../scripts/smoke-provider-shapes.mjs';

const account='scratch@example.test';
const origin='https://mcp.example.test';
const token='rtc_pass_'+'A'.repeat(43);
const revision='b'.repeat(40);
const requests=[
 {name:'workspace_gmail_get_label',args:{labelId:'Label_99'}},
 {name:'workspace_gmail_get_message',args:{messageId:'msg1'}},
 {name:'workspace_gmail_get_thread',args:{threadId:'thread1'}},
 {name:'workspace_drive_get_file',args:{fileId:'file1'}},
 {name:'workspace_drive_get_shared_drive',args:{driveId:'drive1'}},
 {name:'workspace_calendar_get_event',args:{calendarId:'owned@example.test',eventId:'event1'}},
 {name:'workspace_tasks_get_tasklist',args:{tasklistId:'list1'}},
 {name:'workspace_tasks_get_task',args:{tasklistId:'list1',taskId:'task1'}},
 {name:'workspace_docs_get_document',args:{documentId:'doc1'}},
 {name:'workspace_sheets_get_spreadsheet',args:{spreadsheetId:'sheet1'}},
 {name:'workspace_slides_get_presentation',args:{presentationId:'deck1'}},
 {name:'workspace_forms_get',args:{formId:'form1'}}
];
const ids={labelId:'id',messageId:'id',threadId:'id',fileId:'id',driveId:'id',
 eventId:'id',tasklistId:'id',taskId:'id',documentId:'documentId',
 spreadsheetId:'spreadsheetId',presentationId:'presentationId',formId:'formId'};
function fake({wrong=null,areas:nullAreas=null,missing=null,wrongAccount=false}={}){
 const calls=[];
 const fetcher=async(url,options={})=>{
  const uri=new URL(url),path=uri.pathname;
  const body=options.body?JSON.parse(options.body):null;
  calls.push({path,method:options.method,body,options});
  const ret=(status,result)=>({status,json:async()=>result});
  if(path==='/api/contract')return ret(200,{rtc:1,deployment:{sourceRevision:revision}});
  if(path==='/api/whoami')return ret(200,{ok:true,result:{account,profile:'read_only',mode:'test',
   allow_writes:false,areas:nullAreas}});
  if(path==='/api/tools'){
   const name=uri.searchParams.get('q');
   return ret(200,{ok:true,result:{tools:name===missing?[]:
    [{name,writes:false,annotations:{readOnlyHint:true}}]}});
  }
  if(path==='/api/tools/workspace_whoami')return ret(200,{ok:true,
   result:{actingAs:wrongAccount?'different@example.test':account,gmailReports:account,
    matches:!wrongAccount}});
  if(path.startsWith('/api/tools/')){
    const name=path.slice('/api/tools/'.length);
    const request=requests.find(x=>x.name===name);
    if(!request)throw Error('unexpected tool');
    const attr=Object.keys(request.args).at(-1);
    const key=ids[attr];
    return ret(200,{ok:true,result:{[key]:name===wrong?'unrelated-id':request.args[attr]}});
  }
  throw Error('unexpected path');
 };
 return {fetcher,calls};
}
const options=(http,fixtures=requests)=>({
 origin,token,expectedAccount:account,expectedRevision:revision,fixtures,fetcher:http.fetcher
});
describe('owner-authorized exact-ID read-only fixture runner',()=>{
 it('keeps the whole explicit allowlist aligned with exact identity validators',()=>{
  expect(FIXTURE_TOOL_NAMES.sort()).toEqual(Object.keys(FIXTURE_READ_PROOFS).sort());
  expect(parseExactReadFixtures(requests,account)).toHaveLength(12);
  const message=parseExactReadFixtures([requests[1]],account)[0];
  expect(message.args).toEqual({messageId:'msg1',format:'metadata'});
  expect(message.area).toBe('mail');
 });
 it('performs exact twelve provider reads through read_only TEST and never writes',async()=>{
  const f=fake();
  const report=await runFixtureReadOnlySmoke(options(f));
  expect(report).toMatchObject({ok:true,accountVerified:true,summary:{requested:12,passed:12,failed:0,unavailable:0}});
  const calls=f.calls.filter(x=>x.method==='POST');
  expect(calls).toHaveLength(13);
  expect(calls.every(x=>x.path.startsWith('/api/tools/'))).toBe(true);
  expect(calls.every(x=>JSON.stringify(x).includes(token)===false)).toBe(false); // header is protected, not body
  expect(calls.every(x=>JSON.stringify(x.body).includes(token)===false)).toBe(true);
  expect(calls.slice(1).every(x=>x.body.detail==='full')).toBe(true);
  expect(calls.find(x=>x.path.endsWith('gmail_get_message')).body.format).toBe('metadata');
  expect(JSON.stringify(report)).not.toContain('event1');
  expect(JSON.stringify(report)).not.toContain('Label_99');
 });
 it('never converts wrong-provider-resource success into fixture acceptance',async()=>{
  for(const row of requests){
   const f=fake({wrong:row.name});
   const report=await runFixtureReadOnlySmoke(options(f,[row]));
   expect(report.ok,row.name).toBe(false);
   expect(report.tools).toEqual([{tool:row.name,status:'FAIL',reason:'invalid_google_read_shape'}]);
  }
 });
 it('requires the exact resource IDs in every successful value',()=>{
  for(const row of requests){
   const name=row.name;
   const key=Object.keys(row.args).at(-1);
   expect(verifiedProviderReadResult(name,{[ids[key]]:row.args[key]},account,row.args),name).toBe(true);
   expect(verifiedProviderReadResult(name,{[ids[key]]:'different-id'},account,row.args),name).toBe(false);
  }
 });
 it('fails incomplete area and advertised catalog instead of claiming coverage',async()=>{
  const limited=fake({areas:['workspace']});
  const denied=await runFixtureReadOnlySmoke(options(limited,[requests[3]]));
  expect(denied).toMatchObject({ok:false,summary:{requested:1,passed:0,unavailable:1}});
  expect(limited.calls.filter(c=>c.method==='POST')).toHaveLength(1);
  const absent=fake({missing:requests[0].name});
  const report=await runFixtureReadOnlySmoke(options(absent,[requests[0]]));
  expect(report.ok).toBe(false);
  expect(report.tools[0].status).toBe('NOT_AVAILABLE');
 });
 it('will not read any resources if identity does not match the protected mailbox',async()=>{
  const f=fake({wrongAccount:true});
  const report=await runFixtureReadOnlySmoke(options(f,[requests[0]]));
  expect(report.ok).toBe(false);
  expect(f.calls.filter(c=>c.method==='POST')).toHaveLength(1);
 });
 it('validates the entire fixture set before sending any authenticated request',async()=>{
  const malformed=[
   [],[...requests,requests[0]],[requests[0],requests[0]],
   [{name:'workspace_gmail_delete_message',args:{messageId:'msg'}}],
   [{name:'workspace_call',args:{name:'gmail_get_label'}}],
   [{name:'workspace_gmail_get_label',args:{labelId:'x',confirm:true}}],
   [{name:'workspace_gmail_get_label',args:{}}],
   [{name:'workspace_gmail_get_message',args:{messageId:'a',format:'full'}}],
   [{name:'workspace_drive_get_file',args:{fileId:'https://evil.example/'}}],
   [{name:'workspace_calendar_get_event',args:{calendarId:'primary',eventId:'e'}}],
   [{name:'workspace_calendar_get_event',args:{calendarId:account,eventId:'e'}}],
   [{name:'workspace_forms_get',args:{formId:'\n'}}]
  ];
  for(const input of malformed){
   expect(()=>parseExactReadFixtures(input,account)).toThrow();
   const f=fake();
   await expect(runFixtureReadOnlySmoke(options(f,input))).rejects.toThrow();
   expect(f.calls).toHaveLength(0);
  }
 });
 it('does not echo fixtures or tokens through main on bad authorization',async()=>{
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  expect(await main([],{})).toBe(2);
  expect(await main(['--authorized-fixtures'],{RTC_ORIGIN:origin})).toBe(2);
  spy.mockRestore();
 });
});
