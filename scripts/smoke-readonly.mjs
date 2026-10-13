// P0-2: explicit, non-production, read-only Google API acceptance probes.
// No provider data or pass text is printed. No production connection is allowed.
const DEFAULT_PROBES=[
 {name:'workspace_whoami',area:'workspace',args:{}},
 {name:'workspace_gmail_list_messages',area:'mail',args:{maxResults:1}},
 {name:'workspace_drive_list_files',area:'files',args:{pageSize:1}},
 {name:'workspace_calendar_list_calendars',area:'calendar',args:{maxResults:1}},
 {name:'workspace_tasks_list_tasklists',area:'tasks',args:{maxResults:1}}
];
const bearer=/^rtc_pass_[A-Za-z0-9_-]{43}$/;
export function originFromEnv(value){
 const u=new URL(value);
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/'||u.port)throw Error('An exact HTTPS origin is required.');
 return u.origin;
}
export function chooseProbe(catalog,name){
 const match=catalog?.find(t=>t.name===name);
 return match&&match.writes===false&&match.annotations?.readOnlyHint===true?match:null;
}
export async function runReadOnlySmoke({origin,token,expectedAccount,expectedRevision,fetcher=fetch,probes=DEFAULT_PROBES}={}){
 const url=originFromEnv(origin);
 if(!bearer.test(token||''))throw Error('Missing protected RTC TEST pass');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(expectedAccount||''))throw Error('Expected scratch account is required');
 if(!/^[a-f0-9]{40}$/.test(expectedRevision||''))throw Error('Independently verified deployed source revision is required');
 const manifestResponse=await fetcher(url+'/api/contract',{method:'GET',redirect:'error',signal:AbortSignal.timeout(12000)});
 const manifest=await manifestResponse.json();
 if(manifestResponse.status!==200||manifest.rtc!==1||manifest.deployment?.sourceRevision!==expectedRevision)
  throw Error('Deployed source revision mismatch');
 const request=async(path,body)=>{
   const response=await fetcher(url+path,{method:body===undefined?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(12000),
    headers:{authorization:'Bearer '+token,...(body===undefined?{}:{'content-type':'application/json'})},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
   let data;try{data=await response.json()}catch{throw Error('invalid_json');}
   return {status:response.status,data};
 };
 const who=await request('/api/whoami');
 if(who.status!==200||who.data?.ok!==true||who.data?.result?.account!==expectedAccount||who.data?.result?.profile!=='read_only'||who.data?.result?.mode!=='test'||who.data?.result?.allow_writes!==false)throw Error('Not an approved read-only TEST pass.');
 const allowed=who.data.result.areas;
 if(allowed!==null&&(!Array.isArray(allowed)||!allowed.includes('workspace')))throw Error('Identity verification requires workspace area');
 // Verify Gmail itself BEFORE any other provider read. The token's local
 // actingAs claim alone does not establish which Google mailbox is connected.
 const identity=await request('/api/tools/workspace_whoami',{});
 if(identity.status!==200||identity.data.ok!==true||identity.data.result?.actingAs!==expectedAccount||
  identity.data.result?.gmailReports!==expectedAccount||identity.data.result?.matches!==true)
  return {ok:false,outcomes:[{tool:'workspace_whoami',status:'FAIL',reason:'unexpected_google_identity'}]};
 const outcomes=[{tool:'workspace_whoami',status:'PASS'}];
 for(const probe of probes){
   if(probe.name==='workspace_whoami')continue;
   if(Array.isArray(allowed)&&!allowed.includes(probe.area)){
     outcomes.push({tool:probe.name,status:'NOT_AVAILABLE',reason:'area_not_granted'});continue;
   }
   const catalog=await request('/api/tools?listing=catalog&limit=30&q='+encodeURIComponent(probe.name));
   const tool=catalog.status===200?chooseProbe(catalog.data?.result?.tools,probe.name):null;
   if(!tool){outcomes.push({tool:probe.name,status:'NOT_AVAILABLE',reason:'read_tool_not_advertised'});continue;}
   let result;
   try{result=await request('/api/tools/'+encodeURIComponent(probe.name),probe.args);}
   catch {outcomes.push({tool:probe.name,status:'FAIL',reason:'request_failed'});continue;}
   if(result.status!==200||result.data?.ok!==true){
      outcomes.push({tool:probe.name,status:'FAIL',reason:'provider_read_failed'});continue;
   }
   let payload=result.data.result;
   if(result.data.handle){
     const recovered=await request('/api/results/'+encodeURIComponent(result.data.handle));
     if(recovered.status!==200||recovered.data?.ok!==true||!recovered.data.result?.payload){
       outcomes.push({tool:probe.name,status:'FAIL',reason:'result_handle_unreadable'});continue;
     }
     try{payload=JSON.parse(recovered.data.result.payload)}catch{payload=recovered.data.result.payload}
   }
   if(probe.name==='workspace_whoami'&&String(payload?.actingAs||'').toLowerCase()!==expectedAccount.toLowerCase()){
      outcomes.push({tool:probe.name,status:'FAIL',reason:'unexpected_account'});continue;
   }
   outcomes.push({tool:probe.name,status:'PASS'});
 }
 const required=outcomes.find(x=>x.tool==='workspace_whoami');
 return {ok:required?.status==='PASS'&&outcomes.every(x=>x.status!=='FAIL'),outcomes};
}
export async function main(argv=process.argv.slice(2),env=process.env){
 if(argv.length!==1||argv[0]!=='--authorized-read-only'){
   console.error('Usage: node scripts/smoke-readonly.mjs --authorized-read-only');return 2;
 }
 if(!env.RTC_TEST_PASS||!env.RTC_ORIGIN||!env.RTC_EXPECTED_ACCOUNT||!env.RTC_EXPECTED_REVISION){
   console.error('Missing protected pass, origin, expected account or independently verified source revision');return 2;
 }
 try{
   const result=await runReadOnlySmoke({origin:env.RTC_ORIGIN,token:env.RTC_TEST_PASS,expectedAccount:env.RTC_EXPECTED_ACCOUNT,expectedRevision:env.RTC_EXPECTED_REVISION});
   for(const entry of result.outcomes)console.log(entry.status+' '+entry.tool+(entry.reason?' ('+entry.reason+')':''));
   console.log('RTC scratch-account read-only smoke: '+(result.ok?'PASS':'FAIL')+'; UTC '+new Date().toISOString());
   return result.ok?0:1;
 }catch{console.error('FAIL read-only acceptance preflight; no secrets or response data printed');return 1;}
}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1])process.exitCode=await main();
