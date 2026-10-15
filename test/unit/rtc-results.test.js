import {describe,it,expect} from 'vitest';
import {projectFields,shapeReadResult,readStoredResult,utf8Page,INLINE_BYTES} from '../../src/rtc/results.js';
import {ok} from '../../src/tools/util.js';
import {summarizeGoogleResult} from '../../src/rtc/summary.js';
import {createFakeDb} from '../helpers/fake-db.js';
describe('RTC result handles',()=>{
 it('projects nested fields without prototype pollution',()=>{
   expect(projectFields({user:{name:'A',email:'b'},id:5},'user.name,id')).toEqual({user:{name:'A'},id:5});
   expect(()=>projectFields({a:1},'__proto__.polluted')).toThrow();
 });
 it('merges selected sibling fields by list position without losing prior fields',()=>{
   const original={entries:[{id:'a',status:'observed',private:'omit'},
     {id:'b',status:'outside_scope',private:'omit'}]};
   expect(projectFields(original,'entries.id,entries.status')).toEqual({entries:[
     {id:'a',status:'observed'},{id:'b',status:'outside_scope'}]});
   expect(projectFields(original,'entries.id,entries.status,entries.missing')).toEqual({entries:[
     {id:'a',status:'observed'},{id:'b',status:'outside_scope'}]});
   expect(original.entries[0].private).toBe('omit');
 });
 it('preserves empty and nested lists when selecting several fields',()=>{
   const original={groups:[{members:[{id:'one',role:'reader'},{id:'two'}]},
     {members:[]}]};
   expect(projectFields(original,'groups.members.id,groups.members.role')).toEqual({groups:[
     {members:[{id:'one',role:'reader'},{id:'two'}]},{members:[]}]});
 });
 it('projects sibling list fields from an owned stored result without leaking omitted data',async()=>{
   const fake=createFakeDb();
   const original={entries:[{id:'a',status:'observed',private:'x'.repeat(10000)},
     {id:'b',status:'outside_scope',private:'y'.repeat(10000)}]};
   const shaped=await shapeReadResult(ok(original),{detail:'full'},'owner',fake.storeRtcResult);
   const {handle}=JSON.parse(shaped.content[0].text);
   const out=await readStoredResult({handle,fields:'entries.id,entries.status'},'owner',fake.getRtcResult);
   expect(JSON.parse(JSON.parse(out.content[0].text).payload)).toEqual({entries:[
     {id:'a',status:'observed'},{id:'b',status:'outside_scope'}]});
   expect((await readStoredResult({handle,fields:'entries.id,entries.status'},'foreign',fake.getRtcResult)).isError).toBe(true);
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
   // Omitting page must never expose the entire oversized stored payload.
   const first=await readStoredResult({handle:info.handle},'connection-1',fake.getRtcResult);
   const firstData=JSON.parse(first.content[0].text);
   expect(firstData.page).toBe(1);
   expect(firstData.next).toBe(2);
   expect(firstData).not.toHaveProperty('payload');
   expect(Buffer.byteLength(firstData.content,'utf8')).toBeLessThanOrEqual(4096);
   expect((await readStoredResult({handle:info.handle},'connection-2',fake.getRtcResult)).isError).toBe(true);
 });
 it('keeps short projected handle retrieval inline, with truthful projected bytes',async()=>{
   const fake=createFakeDb();
   const shaped=await shapeReadResult(ok({rows:Array.from({length:100},(_,i)=>({id:i,body:'z'.repeat(100)})),version:7}),{},'owner',fake.storeRtcResult);
   const {handle}=JSON.parse(shaped.content[0].text);
   const r=await readStoredResult({handle,fields:'version'},'owner',fake.getRtcResult);
   const result=JSON.parse(r.content[0].text);
   expect(result.payload).toBe('{"version":7}');
   expect(result.bytes).toBe(Buffer.byteLength(result.payload,'utf8'));
   const large=await readStoredResult({handle,fields:'rows'},'owner',fake.getRtcResult);
   const first=JSON.parse(large.content[0].text);
   expect(first.page).toBe(1);
   expect(first.next).toBeGreaterThan(1);
   expect(first.bytes).toBeGreaterThan(4096);
   expect(first).not.toHaveProperty('payload');
 });
 it('treats invalid projected fields as a controlled MCP error instead of throwing',async()=>{
   const fake=createFakeDb();
   const shaped=await shapeReadResult(ok({rows:Array.from({length:100},()=>({body:'x'.repeat(100)}))}),{},'owner',fake.storeRtcResult);
   const {handle}=JSON.parse(shaped.content[0].text);
   const output=await readStoredResult({handle,fields:'__proto__.polluted'},'owner',fake.getRtcResult);
   expect(output.isError).toBe(true);
   expect(output.content[0].text).toMatch(/invalid_args/);
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
   expect(data.data.messages).toHaveLength(8);
   expect(data.count).toBe(100);
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


describe('RTC byte-safe international result pages',()=>{
 it('does not split UTF-8, even when a four-byte emoji straddles the byte limit',()=>{
  const text='a'.repeat(4095)+'🦉'+'é'.repeat(2100)+'漢字'+ '🌎'.repeat(1200);
  const parts=[];let index=1;
  for(;;){
   const page=utf8Page(text,index++);
   expect(page).not.toBeNull();
   expect(Buffer.byteLength(page.content,'utf8')).toBeLessThanOrEqual(4096);
   expect(page.content).not.toContain('\uFFFD');
   parts.push(page.content);
   if(page.next===null){expect(index-1).toBe(page.pages);break;}
  }
  expect(parts.join('')).toBe(text);
  expect(utf8Page(text,index)).toBeNull();
 });
 it('recovers multilingual stored JSON losslessly through numbered, owner-isolated pages',async()=>{
  const fake=createFakeDb(),owner='international-connection';
  const original={rows:Array.from({length:100},(_,i)=>({id:i,notes:'é漢🌎🦉'.repeat(40)}))};
  const out=await shapeReadResult(ok(original),{detail:'full'},owner,fake.storeRtcResult);
  const handle=JSON.parse(out.content[0].text).handle;
  expect(handle).toMatch(/^rtc_result_/);
  let page=1,full='',pages=0;
  while(page){
   const resp=await readStoredResult({handle,page},owner,fake.getRtcResult);
   expect(resp.isError).not.toBe(true);
   const result=JSON.parse(resp.content[0].text);
   expect(Buffer.byteLength(result.content,'utf8')).toBeLessThanOrEqual(4096);
   expect(result.content).not.toContain('\uFFFD');
   full+=result.content;page=result.next;pages++;
   expect(pages).toBeLessThan(200);
  }
  expect(JSON.parse(full)).toEqual(original);
  expect((await readStoredResult({handle,page:pages+1},owner,fake.getRtcResult)).isError).toBe(true);
  expect((await readStoredResult({handle,page:1},'other-connection',fake.getRtcResult)).isError).toBe(true);
 });
 it('keeps empty and exact-boundary results consistent',()=>{
  expect(utf8Page('',1)).toMatchObject({pages:1,content:'',next:null});
  expect(utf8Page('x'.repeat(4096),1)).toMatchObject({pages:1,next:null});
  expect(utf8Page('x'.repeat(4097),1)).toMatchObject({pages:2,next:2});
 });
});
