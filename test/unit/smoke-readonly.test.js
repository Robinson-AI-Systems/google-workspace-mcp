import {describe,it,expect,vi} from 'vitest';
import {originFromEnv,chooseProbe,runReadOnlySmoke,main} from '../../scripts/smoke-readonly.mjs';
const token='rtc_pass_'+ 'A'.repeat(43);
function fakeHttp({areas=null,profile='read_only',account='scratch@example.test',failName,unreadable=false}={}){
 const calls=[];
 const fetcher=async(url,options)=>{
   const u=new URL(url);calls.push({path:u.pathname,method:options.method,body:options.body});
   const ret=(status,value)=>({status,json:async()=>value});
   if(u.pathname==='/api/whoami')return ret(200,{ok:true,result:{profile,mode:'test',allow_writes:false,areas}});
   if(u.pathname==='/api/tools'){
     const name=u.searchParams.get('q');
     return ret(200,{ok:true,result:{tools:[{name,writes:false,annotations:{readOnlyHint:true}}]}});
   }
   if(u.pathname.startsWith('/api/results/'))return ret(unreadable?404:200,unreadable?{ok:false}:{ok:true,result:{payload:JSON.stringify({messages:[]})}});
   if(u.pathname.startsWith('/api/tools/')){
     const name=decodeURIComponent(u.pathname.slice('/api/tools/'.length));
     if(name===failName)return ret(403,{ok:false,error:{code:'permission'}});
     if(name==='workspace_whoami')return ret(200,{ok:true,result:{actingAs:account}});
     if(name==='workspace_drive_list_files')return ret(200,{ok:true,handle:'rtc_result_'+'b'.repeat(32),result:{summary:'stored'}});
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
   const outcome=await runReadOnlySmoke({origin:'https://mcp.example.test',token,expectedAccount:'scratch@example.test',fetcher:f.fetcher});
   expect(outcome.ok).toBe(true);
   expect(outcome.outcomes.filter(x=>x.status==='PASS')).toHaveLength(5);
   expect(f.calls.some(x=>x.path.startsWith('/api/results/'))).toBe(true);
   expect(f.calls.filter(x=>x.method==='POST').every(x=>x.path.startsWith('/api/tools/'))).toBe(true);
 });
 it('never calls tools outside the pass areas',async()=>{
   const f=fakeHttp({areas:['workspace']});
   const outcome=await runReadOnlySmoke({origin:'https://mcp.example.test',token,expectedAccount:'scratch@example.test',fetcher:f.fetcher});
   expect(outcome.ok).toBe(true);
   expect(outcome.outcomes.filter(x=>x.status==='NOT_AVAILABLE')).toHaveLength(4);
   expect(f.calls.some(x=>x.path.includes('gmail'))).toBe(false);
 });
 it('fails closed for mismatched account, missing capability, unreadable handle, provider refusal',async()=>{
   for(const f of [fakeHttp({account:'other@example.test'}),fakeHttp({unreadable:true}),fakeHttp({failName:'workspace_calendar_list_calendars'})]){
     const outcome=await runReadOnlySmoke({origin:'https://mcp.example.test',token,expectedAccount:'scratch@example.test',fetcher:f.fetcher});
     expect(outcome.ok).toBe(false);
     expect(outcome.outcomes.some(x=>x.status==='FAIL')).toBe(true);
   }
   const f=fakeHttp({profile:'full'});
   await expect(runReadOnlySmoke({origin:'https://mcp.example.test',token,expectedAccount:'scratch@example.test',fetcher:f.fetcher})).rejects.toThrow(/read-only TEST/);
 });
 it('requires explicit owner test authorization before any call',async()=>{
   const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
   expect(await main([],{})).toBe(2);
   expect(await main(['--authorized-read-only'],{RTC_ORIGIN:'https://mcp.example.test'})).toBe(2);
   spy.mockRestore();
 });
});
