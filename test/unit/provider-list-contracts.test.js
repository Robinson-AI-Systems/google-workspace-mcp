import {describe,it,expect} from 'vitest';
import {handlers as admin} from '../../src/tools/admin-directory.js';
import {handlers as people} from '../../src/tools/people.js';
import {verifiedProviderReadResult} from '../../scripts/smoke-provider-shapes.mjs';
const cases=[
 ['admin_list_groups','groups',data=>({admin:{groups:{list:async()=>({data})}}})],
 ['admin_list_users','users',data=>({admin:{users:{list:async()=>({data})}}})],
 ['contacts_list','connections',data=>({people:{people:{connections:{list:async()=>({data})}}}})],
 ['directory_list_people','people',data=>({people:{people:{listDirectoryPeople:async()=>({data})}}})]
];
const handlers={...admin,...people};
describe('known Google list response contracts',()=>{
 for(const [name,field,clients]of cases){
  it(name+' preserves a documented omitted empty collection and its cursor',async()=>{
   const result=JSON.parse((await handlers[name]({},clients({nextPageToken:'next-page'}))).content[0].text);
   expect(result).toEqual({nextPageToken:'next-page',[field]:[]});
   expect(verifiedProviderReadResult('workspace_'+name,result,'ops@example.test',{})).toBe(true);
   expect(JSON.parse((await handlers[name]({},clients({}))).content[0].text)).toEqual({[field]:[]});
  });
  it(name+' retains actual collection items without accepting malformed payloads',async()=>{
   const rows=[{id:'fixture'}];
   expect(JSON.parse((await handlers[name]({},clients({[field]:rows,nextPageToken:'next'}))).content[0].text)).toEqual({[field]:rows,nextPageToken:'next'});
   for(const invalid of [null,[],undefined,{error:{code:403}},{unexpected:'wrong resource'},{[field]:null},{[field]:{}},{nextPageToken:42}])
    await expect(handlers[name]({},clients(invalid))).rejects.toThrow(/Google returned/);
  });
 }
 it('accepts the actual observed empty Directory envelope without dropping its etag',async()=>{
  const data={kind:'admin#directory#groups',etag:'fake-etag'};
  const value=JSON.parse((await admin.admin_list_groups({},cases[0][2](data))).content[0].text);
  expect(value).toEqual({...data,groups:[]});
 });
});
