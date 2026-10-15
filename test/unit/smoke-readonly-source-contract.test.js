import {describe,it,expect,vi} from 'vitest';
import {handlers as directory} from '../../src/tools/admin-directory.js';
import {handlers as reports} from '../../src/tools/admin-reports.js';
import {handlers as postmaster} from '../../src/tools/postmaster.js';
import {handlers as calendar} from '../../src/tools/calendar.js';
import {handlers as chat} from '../../src/tools/chat.js';
import {handlers as sheets} from '../../src/tools/sheets.js';
import {verifiedProviderReadResult} from '../../scripts/smoke-provider-shapes.mjs';

const mailbox='owner@example.test';
const parse=reply=>JSON.parse(reply.content[0].text);
const verified=(name,reply,args={})=>verifiedProviderReadResult(name,parse(reply),mailbox,args);
describe('P0-2 actual wrapped Google handler source-contract smoke',()=>{
 it('Directory admin user read forwards exact actor key and refuses foreign returned owner',async()=>{
  const get=vi.fn(async()=>({data:{id:'immutable-123',primaryEmail:mailbox}}));
  const args={userKey:mailbox};
  const result=await directory.admin_get_user(args,{admin:{users:{get}}});
  expect(get).toHaveBeenCalledExactlyOnceWith({userKey:mailbox,projection:'full'});
  expect(verified('workspace_admin_get_user',result,args)).toBe(true);
  expect(verifiedProviderReadResult('workspace_admin_get_user',
   {id:'immutable-123',primaryEmail:'outsider@example.test'},mailbox,args)).toBe(false);
 });
 it('Directory list limits actual provider page and records native users collection',async()=>{
  const list=vi.fn(async()=>({data:{users:[{id:'u1',primaryEmail:mailbox}],nextPageToken:'next'}}));
  const args={maxResults:1};
  const result=await directory.admin_list_users(args,{admin:{users:{list}}});
  expect(list).toHaveBeenCalledExactlyOnceWith({
   domain:undefined,customer:'my_customer',query:undefined,maxResults:1,
   pageToken:undefined,showDeleted:undefined
  });
  expect(verified('workspace_admin_list_users',result,args)).toBe(true);
  expect(verifiedProviderReadResult('workspace_admin_list_users',{users:[{}]},mailbox,args)).toBe(false);
  expect(verifiedProviderReadResult('workspace_admin_list_users',{users:[{id:'u1'}],nextPageToken:1},mailbox,args)).toBe(false);
 });
 it('Reports audit binds application, user scope and size before accepting native activities',async()=>{
  const list=vi.fn(async()=>({data:{items:[{id:{time:'2026-10-14T00:00:00Z'}}],nextPageToken:'later'}}));
  const args={application:'calendar',userKey:mailbox,maxResults:1};
  const result=await reports.reports_activity(args,{adminReports:{activities:{list}}});
  expect(list).toHaveBeenCalledExactlyOnceWith({
   applicationName:'calendar',userKey:mailbox,maxResults:1
  });
  expect(verified('workspace_reports_activity',result,args)).toBe(true);
  expect(verifiedProviderReadResult('workspace_reports_activity',
    {application:'drive',activities:[{id:{time:'now'}}]},mailbox,args)).toBe(false);
 });
 it('Postmaster list uses existing domain filter with no mutation and truthful count',async()=>{
  const list=vi.fn(async()=>({data:{domains:[
   {name:'domains/robinsonappliancerentals.com'},
   {name:'domains/unrelated.example'}
  ],nextPageToken:'page2'}}));
  const clients={postmaster:{domains:{list}},
   allowedDomains:['robinsonappliancerentals.com']};
  const result=await postmaster.postmaster_list_domains({pageSize:1},clients);
  expect(list).toHaveBeenCalledTimes(1);
  expect(verified('workspace_postmaster_list_domains',result,{pageSize:1})).toBe(true);
  expect(parse(result)).toMatchObject({count:1,scopeFiltered:true,
   domains:[{name:'domains/robinsonappliancerentals.com'}],nextPageToken:'page2'});
  expect(verifiedProviderReadResult('workspace_postmaster_list_domains',
   {count:2,domains:[{name:'domains/robinsonappliancerentals.com'}]},mailbox)).toBe(false);
 });
 it('Calendar deletion inspection reads two independent GET doors only',async()=>{
  const getResource=vi.fn(async()=>{const e=Error('not found');e.code=404;throw e;});
  const getList=vi.fn(async()=>{const e=Error('not found');e.code=404;throw e;});
  const args={calendarId:'owned-nonprimary@test.example'};
  const result=await calendar.calendar_verify_calendar_deletion(args,{
   calendar:{calendars:{get:getResource},calendarList:{get:getList}}
  });
  expect(getResource).toHaveBeenCalledExactlyOnceWith({calendarId:args.calendarId});
  expect(getList).toHaveBeenCalledExactlyOnceWith({calendarId:args.calendarId});
  expect(verified('workspace_calendar_verify_calendar_deletion',result,args)).toBe(true);
  expect(parse(result)).toMatchObject({exists:false,verification:'calendar_not_found'});
 });
 it('Chat empty list and Sheets value read use actual Google methods',async()=>{
  const spaces=vi.fn(async()=>({data:{}}));
  const s=await chat.chat_list_spaces({}, {chat:{spaces:{list:spaces}}});
  expect(spaces).toHaveBeenCalledExactlyOnceWith({});
  expect(verified('workspace_chat_list_spaces',s)).toBe(true);
  const values=vi.fn(async()=>({data:{range:'Sheet1!A1',values:[['value']]}}));
  const args={spreadsheetId:'owned-sheet',range:'Sheet1!A1'};
  const v=await sheets.sheets_get_values(args,{sheets:{spreadsheets:{values:{get:values}}}});
  expect(values).toHaveBeenCalledExactlyOnceWith(args);
  expect(verified('workspace_sheets_get_values',v,args)).toBe(true);
  expect(verifiedProviderReadResult('workspace_sheets_get_values',
   {range:'Sheet2!A1',values:[['another']]},mailbox,args)).toBe(false);
 });
});
