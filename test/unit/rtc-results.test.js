import {describe,it,expect} from 'vitest';
import {projectFields,shapeReadResult,readStoredResult,INLINE_BYTES} from '../../src/rtc/results.js';
import {ok} from '../../src/tools/util.js';
import {summarizeGoogleResult} from '../../src/rtc/summary.js';
import {createFakeDb} from '../helpers/fake-db.js';
describe('RTC result handles',()=>{
 it('projects nested fields without prototype pollution',()=>{
   expect(projectFields({user:{name:'A',email:'b'},id:5},'user.name,id')).toEqual({user:{name:'A'},id:5});
   expect(()=>projectFields({a:1},'__proto__.polluted')).toThrow();
 });
 it('preserves large data behind a handle and isolates connections',async()=>{
   const fake=createFakeDb();
   const output=await shapeReadResult(ok({messages:Array.from({length:250},(_,i)=>({id:i,body:'x'.repeat(80)}))}),{},'connection-1',fake.storeRtcResult);
   const info=JSON.parse(output.content[0].text);
   expect(info.handle).toMatch(/^rtc_result_/);
   expect(info.bytes).toBeGreaterThan(INLINE_BYTES);
   expect((await fake.getRtcResult(info.handle,'connection-2'))).toBeNull();
   const page=await readStoredResult({handle:info.handle,page:1},'connection-1',fake.getRtcResult);
   expect(JSON.parse(page.content[0].text).next).toBe(2);
   const full=await readStoredResult({handle:info.handle},'connection-1',fake.getRtcResult);
   expect(JSON.parse(full.content[0].text).payload.length).toBeGreaterThan(INLINE_BYTES);
   expect((await readStoredResult({handle:info.handle},'connection-2',fake.getRtcResult)).isError).toBe(true);
 });
 it('does not change small legacy MCP responses',async()=>{
   const original=ok({hello:'world'});
   expect(await shapeReadResult(original,{},'connection-1',async()=>{throw Error('must not store')})).toEqual(original);
 });
});

describe('RTC object-specific compact results',()=>{
 const msg={id:'m1',threadId:'t1',snippet:'hello',payload:{headers:[{name:'Subject',value:'Invoice'}, {name:'From',value:'sender@example.test'}],body:{data:'PRIVATE'}}};
 it('summarizes Gmail messages without leaking full bodies, with actual counts',()=>{
   expect(summarizeGoogleResult('gmail_list_messages',{messages:[msg],nextPageToken:'next'}))
    .toMatchObject({returnedCount:1,nextPageToken:'next',messages:[{id:'m1',subject:'Invoice'}]});
   expect(JSON.stringify(summarizeGoogleResult('gmail_get_message',msg))).not.toContain('PRIVATE');
 });
 it('supports events, files, users, groups, threads and sheet ranges',()=>{
   const cases=[
    ['calendar_list_events',{items:[{id:'e',summary:'meeting',attendees:[{email:'x'}],secret:'x'}]},'attendeeCount'],
    ['drive_list_files',{files:[{id:'d',name:'doc',mimeType:'application/pdf',content:'private'}]},'mimeType'],
    ['admin_list_users',{users:[{primaryEmail:'ops@example.test',unknown:'private'}]},'primaryEmail'],
    ['admin_list_groups',{groups:[{email:'g@example.test',memberEmails:['x']}]},'email'],
    ['gmail_get_thread',{id:'t',messages:[{id:'m'}]},'messageCount'],
    ['sheets_get_values',{range:'A1:B3',values:[[1,2],[3,4],[5,6]]},'rows']
   ];
   for(const [name,value,key] of cases){
     const x=summarizeGoogleResult(name,value);
     expect(JSON.stringify(x)).toContain(key);
     expect(JSON.stringify(x)).not.toContain('private');
   }
 });
 it('leaves uncommon objects unchanged rather than guessing at their shape',()=>{
   const v={security:{unknown:'value'}};
   expect(summarizeGoogleResult('workflow_security_snapshot',v)).toBe(v);
 });
 it('stores complete oversized original and returns compact data with isolated handle',async()=>{
   const fake=createFakeDb();
   const many=Array.from({length:100},(_,i)=>({...msg,id:String(i),payload:{...msg.payload,body:{data:'z'.repeat(200)}}}));
   const out=await shapeReadResult(ok({messages:many}),{toolName:'gmail_list_messages'},'owner-a',fake.storeRtcResult);
   const data=JSON.parse(out.content[0].text);
   expect(data.handle).toMatch(/^rtc_result_/);
   expect(data.data.messages).toHaveLength(100);
   expect(JSON.stringify(data.data)).not.toContain('zzzz');
   const saved=await fake.getRtcResult(data.handle,'owner-a');
   expect(saved.data.messages[0].payload.body.data).toHaveLength(200);
   expect(await fake.getRtcResult(data.handle,'owner-b')).toBeNull();
 });
 it('detail full retains existing full-content behavior and dotted fields take precedence',async()=>{
   const raw=ok({messages:[msg]});
   const full=await shapeReadResult(raw,{toolName:'gmail_list_messages',detail:'full'},'x');
   expect(full).toEqual(raw);
   const projected=await shapeReadResult(raw,{toolName:'gmail_list_messages',fields:'messages.id'},'x');
   expect(JSON.parse(projected.content[0].text).messages[0].id).toBe('m1');
 });
});

it('does not summarize unrelated Google account, Gmail profile or Calendar setting metadata',()=>{
  for(const name of ['gmail_get_profile','gmail_get_label','calendar_get_settings','drive_list_shared_drives','admin_get_building']){
    const value={important:'must retain'};
    expect(summarizeGoogleResult(name,value)).toBe(value);
  }
});
