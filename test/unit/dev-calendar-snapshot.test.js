import {describe,it,expect,vi} from 'vitest';
import {snapshotCalendar} from '../../src/tools/dev-calendar-snapshot.js';
const calendarId='test@group.calendar.google.com';
function clients({entry={},pages=[{items:[{id:'existing',summary:'Private meeting',etag:'v1'}]}],acl=[{id:'owner',scope:{value:'private@example.test'},role:'owner'}]}={}){
 let page=0;
 return {actingAs:'ops@example.test',connection:'pass_fake',rtcPolicy:{mode:'test'},calendar:{
  calendarList:{get:vi.fn(async()=>({data:{id:calendarId,accessRole:'owner',...entry}}))},
  acl:{list:vi.fn(async()=>({data:{items:acl}}))},
  events:{list:vi.fn(async()=>({data:pages[Math.min(page++,pages.length-1)]}))}
 }};
}
describe('owned calendar preservation snapshot',()=>{
 it('hashes every page and sharing without disclosing event contents or ACL addresses',async()=>{
  const c=clients({pages:[{items:[{id:'one',summary:'Private meeting'}],nextPageToken:'next'},{items:[{id:'two'},{id:'gone',status:'cancelled'}]}]});
  const result=await snapshotCalendar({calendarId},c);
  expect(result).toMatchObject({calendarId,owned:true,primary:false,complete:true,eventCount:2});
  expect(c.calendar.events.list.mock.calls[1][0]).toMatchObject({pageToken:'next',showDeleted:false,singleEvents:false});
  expect(JSON.stringify(result)).not.toMatch(/Private meeting|private@example/);
  expect(result.eventsDigest).toMatch(/^[a-f0-9]{64}$/);
 });
 it('gives the same digest regardless of provider item or object-key ordering',async()=>{
  const a=await snapshotCalendar({calendarId},clients({pages:[{items:[{id:'one',summary:'a'},{id:'two'}]}]}));
  const b=await snapshotCalendar({calendarId},clients({pages:[{items:[{id:'two'},{summary:'a',id:'one'}]}]}));
  expect(a).toEqual(b);
  const changed=await snapshotCalendar({calendarId},clients({pages:[{items:[{id:'one',summary:'b'},{id:'two'}]}]}));
  expect(changed.eventsDigest).not.toBe(a.eventsDigest);
 });
 it('refuses primary, foreign, unowned or non-TEST calendars before reading event data',async()=>{
  for(const entry of [{primary:true},{id:'foreign'},{accessRole:'writer'}]){
   const c=clients({entry});
   await expect(snapshotCalendar({calendarId},c)).rejects.toThrow('separately owned');
   expect(c.calendar.events.list).not.toHaveBeenCalled();
  }
  const c=clients();c.rtcPolicy.mode='live';
  await expect(snapshotCalendar({calendarId},c)).rejects.toThrow('TEST');
  expect(c.calendar.calendarList.get).not.toHaveBeenCalled();
 });
 it('refuses missing items, duplicate IDs, repeated tokens and incomplete ten-page scans',async()=>{
  for(const pages of [[{}],[{items:[{id:'one'},{id:'one'}]}],[{items:[],nextPageToken:'repeat'}],
   Array.from({length:10},(_,n)=>({items:[],nextPageToken:'token-'+n}))]){
   await expect(snapshotCalendar({calendarId},clients({pages}))).rejects.toThrow(/snapshot/i);
  }
 });
});
