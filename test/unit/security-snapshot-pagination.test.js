import {describe,it,expect} from 'vitest';
import {boundedRead,handlers,MAX_SECURITY_USER_PAGES,MAX_SECURITY_ALERT_PAGES} from '../../src/tools/workflows.js';
import {attachStructuredResult} from '../../src/rtc/structured.js';

const json=r=>JSON.parse(r.content[0].text);
const user=(email,{admin=false,enrolled=true,suspended=false}={})=>({
 primaryEmail:email,isAdmin:admin,isEnrolledIn2Sv:enrolled,suspended
});
const client=(directory,alerts)=>({
 admin:{users:{list:directory}},
 alertcenter:{alerts:{list:alerts}}
});
const alert=(type)=>({type,createTime:'2026-10-12T00:00:00Z',source:'Google'});
const first=(result)=>json(result);
const report=async c=>first(await handlers.workflow_security_snapshot({},c));

describe('P8-8 bounded security snapshot evidence',()=>{
 it('follows actual Directory and Alert Center page tokens before marking complete',async()=>{
  const directories=[],alertRequests=[];
  const c=client(async args=>{
   directories.push(args);
   if(!args.pageToken)return {data:{users:[
    user('admin@example.test',{admin:true}),user('risk@example.test',{enrolled:false})],nextPageToken:'users2'}};
   expect(args.pageToken).toBe('users2');
   return {data:{users:[user('second@example.test',{admin:true})]}};
  },async args=>{
   alertRequests.push(args);
   return {data:args.pageToken?{alerts:[alert('Suspicious login')]}:{alerts:[alert('Malware')],nextPageToken:'alerts2'}};
  });
  const result=await handlers.workflow_security_snapshot({},c);
  const data=first(result);
  expect(data).toMatchObject({
   complete:true,alertsReadable:true,totalUsers:3,usersScanned:3,
   coverage:{userPagesRead:2,alertPagesRead:2,userDirectoryComplete:true,alertCenterComplete:true}
  });
  expect(data.usersWithout2StepVerification).toEqual(['risk@example.test']);
  expect(data.superAdmins).toEqual(['admin@example.test','second@example.test']);
  expect(data.recentAlerts).toHaveLength(2);
  expect(directories).toHaveLength(2);
  expect(alertRequests[1].pageToken).toBe('alerts2');
  expect(attachStructuredResult('workflow_security_snapshot',result).structuredContent).toEqual(data);
 });
 it('bounds provider work and reports the incomplete coverage rather than a clean result',async()=>{
  let userCalls=0,alertCalls=0;
  const c=client(async()=>{
   userCalls++;
   return {data:{users:[user('risk@example.test',{enrolled:false})],nextPageToken:'users'+userCalls}};
  },async()=>{
   alertCalls++;
   return {data:{alerts:[],nextPageToken:'alert'+alertCalls}};
  });
  const data=await report(c);
  expect(userCalls).toBe(MAX_SECURITY_USER_PAGES);
  expect(alertCalls).toBe(MAX_SECURITY_ALERT_PAGES);
  expect(data).toMatchObject({complete:false,alertsReadable:false,coverage:{
   userLimit:'page_limit',alertLimit:'page_limit'
  }});
  expect(data.usersWithout2StepVerification.length).toBe(MAX_SECURITY_USER_PAGES);
 });
 it('detects repeated continuation tokens without looping or asserting healthy',async()=>{
  let calls=0;
  const c=client(async()=>{
   calls++;
   return {data:{users:[user('a@example.test',{admin:true})],nextPageToken:'repeat'}};
  },async()=>({data:{alerts:[]}}));
  const data=await report(c);
  expect(calls).toBe(2);
  expect(data.complete).toBe(false);
  expect(data.coverage.userLimit).toBe('invalid_or_repeated_page_token');
  expect(data.usersScanned).toBe(2);
 });
 it('retains known security findings if a later Directory page becomes unavailable',async()=>{
  let calls=0;
  const c=client(async()=>{
   calls++;
   if(calls>1)throw new Error('rate limit');
   return {data:{users:[user('risk@example.test',{enrolled:false})],nextPageToken:'next'}};
  },async()=>({data:{alerts:[]}}));
  const data=await report(c);
  expect(data.complete).toBe(false);
  expect(data.coverage.userLimit).toBe('later_page_unavailable');
  expect(data.usersWithout2StepVerification).toContain('risk@example.test');
 });
 it('does not fabricate a successful first Directory read',async()=>{
  const c=client(async()=>{throw Error('unauthorized');},async()=>({data:{alerts:[]}}));
  await expect(handlers.workflow_security_snapshot({},c)).rejects.toThrow(/unauthorized/);
 });
 it('does not turn unavailable Alert Center into a verified absence of alerts',async()=>{
  const c=client(async()=>({data:{users:[user('a@example.test',{admin:true})]}}),async()=>{throw Error('forbidden');});
  const data=await report(c);
  expect(data.complete).toBe(true);
  expect(data.alertsReadable).toBe(false);
  expect(data.coverage.alertLimit).toBe('alert_center_unavailable');
  expect(data.recentAlerts).toEqual([]);
 });
 it('preserves observed alerts if later alert pages error or are malformed',async()=>{
  for(const later of [async()=>{throw Error('rate limited');},async()=>({data:{alerts:'not-a-list'}})]){
   let alertCalls=0;
   const c=client(async()=>({data:{users:[user('a@example.test',{admin:true})]}}),async()=>{
    alertCalls++;
    if(alertCalls===1)return {data:{alerts:[alert('Suspicious login')],nextPageToken:'next'}};
    return later();
   });
   const data=await report(c);
   expect(data.alertsReadable).toBe(false);
   expect(data.recentAlerts[0].type).toBe('Suspicious login');
   expect(data.coverage.alertLimit).toMatch(/later_page|invalid_later_page/);
  }
 });
 it('handles valid empty pages and rejects a malformed first response',async()=>{
  const result=await boundedRead(async()=>({data:{users:[]}}),'users',3);
  expect(result).toMatchObject({items:[],pages:1,complete:true,reason:null});
  await expect(boundedRead(async()=>({}),'users',1)).rejects.toThrow(/invalid users page/);
 });
});
