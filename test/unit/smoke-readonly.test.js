import {describe,it,expect,vi} from 'vitest';
import {originFromEnv,chooseProbe,verifiedProviderReadResult,runReadOnlySmoke,main} from '../../scripts/smoke-readonly.mjs';
const token='rtc_pass_'+ 'A'.repeat(43);
const revision='a'.repeat(40);
function fakeHttp({areas=null,profile='read_only',account='scratch@example.test',gmailAccount=account,actualRevision=revision,failName,unreadable=false,brokenCursor=false,wrongBytes=false,malformedName=null}={}){
 const calls=[];
 const handle='rtc_result_'+'b'.repeat(32);
 const stored=JSON.stringify({files:[{name:'s'.repeat(9300),id:'known-owned-file'}]});
 const pages=Array.from({length:Math.ceil(stored.length/4096)},(_,i)=>stored.slice(i*4096,(i+1)*4096));
 const fetcher=async(url,options)=>{
   const u=new URL(url);calls.push({path:u.pathname,method:options.method,body:options.body,headers:options.headers});
   const ret=(status,value)=>({status,json:async()=>value});
   if(u.pathname==='/api/contract')return ret(200,{rtc:1,deployment:{sourceRevision:actualRevision}});
   if(u.pathname==='/api/whoami')return ret(200,{ok:true,result:{account:'scratch@example.test',profile,mode:'test',allow_writes:false,areas}});
   if(u.pathname==='/api/tools'){
     const name=u.searchParams.get('q');
     return ret(200,{ok:true,result:{tools:[{name,writes:false,annotations:{readOnlyHint:true}}]}});
   }
   if(u.pathname.startsWith('/api/results/')){
     if(unreadable)return ret(404,{ok:false});
     const p=Number(u.searchParams.get('page'));
     return ret(200,{ok:true,result:{handle,page:p,pages:pages.length,
       bytes:Buffer.byteLength(stored,'utf8')+(wrongBytes?1:0),
       content:pages[p-1],next:p===pages.length?null:brokenCursor?1:p+1}});
   }
   if(u.pathname.startsWith('/api/tools/')){
     const name=decodeURIComponent(u.pathname.slice('/api/tools/'.length));
     if(name===failName)return ret(403,{ok:false,error:{code:'permission'}});
     if(name==='workspace_whoami')return ret(200,{ok:true,result:{actingAs:account,gmailReports:gmailAccount,matches:account===gmailAccount}});
     if(name===malformedName)return ret(200,{ok:true,result:{unexpected:'transport only'}});
     if(name==='workspace_drive_list_files')return ret(200,{ok:true,handle,result:{handle,summary:'stored'}});
     if(name==='workspace_gmail_list_messages')return ret(200,{ok:true,result:{messages:[]}});
     if(name==='workspace_calendar_list_calendars')return ret(200,{ok:true,result:{kind:'calendar#calendarList',items:[]}});
     if(name==='workspace_tasks_list_tasklists')return ret(200,{ok:true,result:{kind:'tasks#taskLists',items:[]}});
     return ret(200,{ok:true,result:{items:[]}});
   }
   throw Error('unmocked request');
 };
 return {fetcher,calls};
}
describe('non-production multi-service read-only smoke',()=>{
 it('rejects insecure endpoints and usernames',()=>{
   expect(originFromEnv('https://mcp.example.test')).toBe('https://mcp.example.test');
   for(const url of ['http://mcp.example.test','https://u:p@mcp.example.test','https://mcp.example.test/path','https://mcp.example.test/?bearer=abc'])expect(()=>originFromEnv(url)).toThrow();
 });
 it('accepts only trusted read-only metadata',()=>{
   expect(chooseProbe([{name:'x',writes:false,annotations:{readOnlyHint:true}}],'x')).toBeTruthy();
   expect(chooseProbe([{name:'x',writes:true,annotations:{readOnlyHint:false}}],'x')).toBeNull();
 });
 it('checks the actual mailbox and recovers large Drive results',async()=>{
   const f=fakeHttp();
   const outcome=await runReadOnlySmoke({origin:'https://mcp.example.test',token,expectedAccount:'scratch@example.test',expectedRevision:revision,fetcher:f.fetcher});
   expect(outcome.ok).toBe(true);
   expect(outcome.outcomes.filter(x=>x.status==='PASS')).toHaveLength(5);
   expect(f.calls.filter(x=>x.path.startsWith('/api/results/'))).toHaveLength(3);
   expect(f.calls.find(x=>x.path==='/api/tools/workspace_drive_list_files'&&x.method==='POST')?.body)
     .toBe(JSON.stringify({maxResults:1}));
   expect(f.calls.filter(x=>x.method==='POST').every(x=>x.path.startsWith('/api/tools/'))).toBe(true);
 });
 it('rejects incomplete, inconsistent and cursor-looped stored reads without false PASS',async()=>{
   for(const flags of [{unreadable:true},{brokenCursor:true},{wrongBytes:true}]){
     const f=fakeHttp(flags);
     const outcome=await runReadOnlySmoke({origin:'https://mcp.example.test',token,expectedAccount:'scratch@example.test',
       expectedRevision:revision,fetcher:f.fetcher});
     expect(outcome.ok).toBe(false);
     expect(outcome.outcomes).toContainEqual({
       tool:'workspace_drive_list_files',status:'FAIL',reason:'result_handle_unreadable'
     });
   }
 });
 it('rejects a success envelope without native Google list evidence',async()=>{
  for(const name of ['workspace_gmail_list_messages','workspace_drive_list_files',
   'workspace_calendar_list_calendars','workspace_tasks_list_tasklists']){
   const f=fakeHttp({malformedName:name});
   const report=await runReadOnlySmoke({origin:'https://mcp.example.test',token,
    expectedAccount:'scratch@example.test',expectedRevision:revision,fetcher:f.fetcher});
   expect(report.ok,name).toBe(false);
   expect(report.outcomes).toContainEqual({tool:name,status:'FAIL',reason:'invalid_google_read_shape'});
  }
 });
 it('accepts only bounded provider-identifiable list objects or documented empty-list markers',()=>{
  const samples=[
   ['workspace_gmail_list_messages',{messages:[{id:'m1'}]}],
   ['workspace_gmail_list_messages',{resultSizeEstimate:0}],
   ['workspace_drive_list_files',{files:[{id:'f1'}]}],
   ['workspace_drive_list_files',{kind:'drive#fileList'}],
   ['workspace_calendar_list_calendars',{kind:'calendar#calendarList'}],
   ['workspace_tasks_list_tasklists',{kind:'tasks#taskLists',items:[]}]
  ];
  for(const [name,value] of samples)expect(verifiedProviderReadResult(name,value),name).toBe(true);
  for(const name of ['workspace_gmail_list_messages','workspace_drive_list_files',
   'workspace_calendar_list_calendars','workspace_tasks_list_tasklists']){
   for(const bad of [null,'OK',{items:[]},{files:[{}],nextPageToken:123},
     {messages:[{id:'m1'},{id:'m2'}]}, {error:{code:'provider_failed'}}]){
    // Some malformed values happen to use another family's valid list key.
    if(bad?.items&&name==='workspace_calendar_list_calendars'||bad?.items&&name==='workspace_tasks_list_tasklists')continue;
    if(bad?.files&&name==='workspace_drive_list_files'&&bad.files[0]?.id)continue;
    expect(verifiedProviderReadResult(name,bad),name).toBe(false);
   }
  }
 });
 it('never calls tools outside the pass areas',async()=>{
   const f=fakeHttp({areas:['workspace']});
   const outcome=await runReadOnlySmoke({origin:'https://mcp.example.test',token,expectedAccount:'scratch@example.test',expectedRevision:revision,fetcher:f.fetcher});
   expect(outcome.ok).toBe(true);
   expect(outcome.outcomes.filter(x=>x.status==='NOT_AVAILABLE')).toHaveLength(4);
   expect(f.calls.some(x=>x.path.includes('gmail'))).toBe(false);
 });
 it('fails closed for mismatched account, missing capability, unreadable handle, provider refusal',async()=>{
   for(const f of [fakeHttp({account:'other@example.test'}),fakeHttp({unreadable:true}),fakeHttp({failName:'workspace_calendar_list_calendars'})]){
     const outcome=await runReadOnlySmoke({origin:'https://mcp.example.test',token,expectedAccount:'scratch@example.test',expectedRevision:revision,fetcher:f.fetcher});
     expect(outcome.ok).toBe(false);
     expect(outcome.outcomes.some(x=>x.status==='FAIL')).toBe(true);
   }
   const f=fakeHttp({profile:'full'});
   await expect(runReadOnlySmoke({origin:'https://mcp.example.test',token,expectedAccount:'scratch@example.test',expectedRevision:revision,fetcher:f.fetcher})).rejects.toThrow(/read-only TEST/);
 });
 it('requires explicit owner test authorization before any call',async()=>{
   const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
   expect(await main([],{})).toBe(2);
   expect(await main(['--authorized-read-only'],{RTC_ORIGIN:'https://mcp.example.test'})).toBe(2);
   spy.mockRestore();
 });
 it('requires independently supplied exact deployed revision before authenticated calls',async()=>{
  const f=fakeHttp({actualRevision:'b'.repeat(40)});
  await expect(runReadOnlySmoke({origin:'https://mcp.example.test',token,expectedAccount:'scratch@example.test',
   expectedRevision:revision,fetcher:f.fetcher})).rejects.toThrow('revision mismatch');
  expect(f.calls).toHaveLength(1);
  expect(f.calls[0].headers).toBeUndefined();
 });
 it('stops before other provider reads when local token identity disagrees with Gmail',async()=>{
  const f=fakeHttp({gmailAccount:'wrong@example.test'});
  const result=await runReadOnlySmoke({origin:'https://mcp.example.test',token,expectedAccount:'scratch@example.test',
   expectedRevision:revision,fetcher:f.fetcher});
  expect(result).toMatchObject({ok:false,outcomes:[{reason:'unexpected_google_identity'}]});
  expect(f.calls.filter(x=>x.method==='POST').map(x=>x.path)).toEqual(['/api/tools/workspace_whoami']);
 });
 it('refuses missing identity area rather than treating skipped identity as success',async()=>{
  const f=fakeHttp({areas:['mail']});
  await expect(runReadOnlySmoke({origin:'https://mcp.example.test',token,expectedAccount:'scratch@example.test',
   expectedRevision:revision,fetcher:f.fetcher})).rejects.toThrow('workspace area');
  expect(f.calls.some(x=>x.method==='POST')).toBe(false);
 });
});
