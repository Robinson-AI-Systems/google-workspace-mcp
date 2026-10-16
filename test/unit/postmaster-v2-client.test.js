import {describe,it,expect,vi} from 'vitest';
import {createServer} from 'node:http';
import {buildPostmasterClient} from '../../src/auth/postmaster-client.js';
import {handlers} from '../../src/tools/postmaster.js';
import {explainError} from '../../src/tools/errors.js';
import {ALL_SCOPES,COMPLETION_READ_SCOPES} from '../../src/auth/scopes.js';
const args={domain:'allowed.example',startDate:'2026-10-09',endDate:'2026-10-15',pageSize:7};
const row=(metric,value=0.2,day=10)=>({name:'domains/allowed.example/domainStats/opaque-'+metric,date:{year:2026,month:10,day},metric,value:{doubleValue:value}});
const data=out=>JSON.parse(out.content[0].text);
function client(pages) {const request=vi.fn(async()=>({data:pages.shift()}));return {auth:{request},clients:{postmaster:buildPostmasterClient({request}),allowedDomains:['allowed.example']}};}
describe('Postmaster v2 read-only transport repair',()=>{
 it('uses real HTTP serialization for the documented v2 read query and list contracts',async()=>{
  const seen=[];
  const server=createServer(async(req,res)=>{let body='';for await(const c of req)body+=c;seen.push({url:req.url,method:req.method,body:body?JSON.parse(body):null});res.setHeader('content-type','application/json');res.end(JSON.stringify(req.method==='POST'?{domainStats:[row('userReportedSpamRatio')]}:{domains:[]}));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
   const auth={request:async({url,method,params,data})=>{
    const target=new URL(url);expect(target.origin).toBe('https://gmailpostmastertools.googleapis.com');
    for(const [key,value]of Object.entries(params||{}))target.searchParams.set(key,value);
    const response=await fetch('http://127.0.0.1:'+server.address().port+target.pathname+target.search,{method,headers:{'content-type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});return {data:await response.json()};
   }};
   const clients={postmaster:buildPostmasterClient(auth)};
   expect(data(await handlers.postmaster_list_domains({pageSize:20},clients))).toMatchObject({domains:[],count:0});
   expect(data(await handlers.postmaster_list_traffic_stats(args,clients))).toMatchObject({apiVersion:'v2',stats:[{name:'domains/allowed.example/trafficStats/20261010',userReportedSpamRatio:0.2}]});
   expect(seen[0]).toEqual({url:'/v2/domains?pageSize=20',method:'GET',body:null});
   expect(seen[1]).toEqual({url:'/v2/domains/allowed.example/domainStats:query',method:'POST',body:{pageSize:7,aggregationGranularity:'DAILY',timeQuery:{dateRanges:{dateRanges:[{start:{year:2026,month:10,day:9},end:{year:2026,month:10,day:15}}]}},metricDefinitions:[
    {name:'userReportedSpamRatio',baseMetric:{standardMetric:'SPAM_RATE'}},
    {name:'spfSuccessRatio',baseMetric:{standardMetric:'AUTH_SUCCESS_RATE'},filter:'auth_type = "spf"'},
    {name:'dkimSuccessRatio',baseMetric:{standardMetric:'AUTH_SUCCESS_RATE'},filter:'auth_type = "dkim"'},
    {name:'dmarcSuccessRatio',baseMetric:{standardMetric:'AUTH_SUCCESS_RATE'},filter:'auth_type = "dmarc"'},
    {name:'deliveryErrorRatio',baseMetric:{standardMetric:'DELIVERY_ERROR_RATE'}}
   ]}});
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 });
 it('merges different metrics of one day across pages without fabricating reputation or missing fields',async()=>{
  const {clients,auth}=client([{domainStats:[row('userReportedSpamRatio')],nextPageToken:'second'},{domainStats:[row('spfSuccessRatio',0.9),row('deliveryErrorRatio',0.01)]}]);
  const result=data(await handlers.postmaster_list_traffic_stats({...args,withSummary:true},clients));
  expect(result.stats).toHaveLength(1);expect(result.summary).toMatchObject({observedDays:1,complete:true,maxObservedUserReportedSpamRatio:0.2,minObservedSpfSuccessRatio:0.9,minObservedDkimSuccessRatio:null,worstDomainReputation:null,maxObservedDeliveryErrorRatio:0.01});
  expect(auth.request.mock.calls[1][0].data.pageToken).toBe('second');
 });
 it('retains exact resumable pagination and unknown empty/partial coverage',async()=>{
  const {clients}=client([{domainStats:[row('spfSuccessRatio')],nextPageToken:'second'}]);
  expect(data(await handlers.postmaster_list_traffic_stats({...args,withSummary:true,maxPages:1},clients))).toMatchObject({nextPageToken:'second',summary:{complete:false,assessment:'not_readable',maxObservedUserReportedSpamRatio:null}});
  const empty=client([{nextPageToken:''}]).clients;
  expect(data(await handlers.postmaster_list_traffic_stats({...args,withSummary:true},empty))).toMatchObject({stats:[],summary:{observedDays:0,assessment:'not_readable'}});
 });
 it('fails closed for malformed pages, foreign identities/dates, unknown metrics and invalid values',async()=>{
  for(const response of [null,{domainStats:{}},{domainStats:[{...row('spfSuccessRatio'),name:'domains/foreign.example/domainStats/x'}]},{domainStats:[row('spfSuccessRatio',0.9,16)]},{domainStats:[row('unknown')]},{domainStats:[row('spfSuccessRatio',2)]},{domainStats:[{...row('spfSuccessRatio'),value:{intValue:'1'}}]},{domainStats:[row('spfSuccessRatio'),row('spfSuccessRatio')]},{domainStats:[],nextPageToken:17}]){
   await expect(handlers.postmaster_list_traffic_stats(args,client([response]).clients)).rejects.toThrow();
  }
  for(const response of [null,{domains:{}},{domains:[{}]},{domains:[],nextPageToken:17}]) await expect(handlers.postmaster_list_domains({},client([response]).clients)).rejects.toThrow();
  await expect(handlers.postmaster_list_traffic_stats({...args,withSummary:true},client([{domainStats:[row('spfSuccessRatio')],nextPageToken:'p'},{domainStats:[row('spfSuccessRatio')]}]).clients)).rejects.toThrow(/Duplicate/);
 });
 it('never changes OAuth scope sets or advertises writes',()=>{
  for(const scopes of [ALL_SCOPES,COMPLETION_READ_SCOPES]){
   expect(scopes).toContain('https://www.googleapis.com/auth/postmaster.readonly');
   expect(scopes).not.toContain('https://www.googleapis.com/auth/postmaster.domain');
   expect(scopes).not.toContain('https://www.googleapis.com/auth/postmaster.traffic.readonly');
  }
  const adapter=buildPostmasterClient({request:vi.fn()});expect(Object.keys(adapter.domains).sort()).toEqual(['list','trafficStats']);
 });
 it('explains retirement before generic HTTP429 guidance',()=>{
  const failure={response:{status:429,data:{error:{message:'This version of the Postmaster Tools API is no longer supported. Get the current API for the latest tools.'}}}};
  expect(explainError(failure)).toMatchObject({what:expect.stringContaining('no longer supports'),todo:expect.stringContaining('separate owner approval')});
  expect(explainError(failure).todo).not.toMatch(/Wait about/);
 });
});
