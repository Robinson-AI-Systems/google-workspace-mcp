// Opt-in inventory of the actually authorized RTC read-only catalog. This is
// not a blanket "all tools passed" check: only harmless reviewed probes run;
// tools needing real fixture IDs or organization-wide approval remain unprobed.
// Secrets and provider response bodies are never written to the report.
import { parseReviewedReadCases } from './smoke-readonly-cases.mjs';
import { runReadOnlySmoke, originFromEnv } from './smoke-readonly.mjs';
import { preparedFixtureProbes, planCatalogReads, coverageResults,
  renderReadOnlyReport, validateTestAuthorization } from './smoke-readonly-plan.mjs';
import { writeFile } from 'node:fs/promises';

export const SAFE_READ_PROBES = Object.freeze([
  {name:'workspace_whoami',area:'workspace',args:{}},
  {name:'workspace_gmail_get_profile',area:'mail',args:{}},
  {name:'workspace_gmail_list_labels',area:'mail',args:{}},
  {name:'workspace_gmail_list_messages',area:'mail',args:{maxResults:1}},
  {name:'workspace_gmail_list_threads',area:'mail',args:{maxResults:1}},
  {name:'workspace_gmail_list_drafts',area:'mail',args:{maxResults:1}},
  {name:'workspace_gmail_list_filters',area:'mail',args:{}},
  {name:'workspace_gmail_list_send_as',area:'mail',args:{}},
  {name:'workspace_gmail_get_imap_settings',area:'mail',args:{}},
  {name:'workspace_gmail_get_pop_settings',area:'mail',args:{}},
  {name:'workspace_gmail_get_vacation_settings',area:'mail',args:{}},
  {name:'workspace_gmail_get_forwarding_settings',area:'mail',args:{}},
  {name:'workspace_gmail_list_forwarding_addresses',area:'mail',args:{}},
  {name:'workspace_gmail_list_delegates',area:'mail',args:{}},
  {name:'workspace_drive_get_about',area:'files',args:{}},
  {name:'workspace_drive_get_start_page_token',area:'files',args:{}},
  {name:'workspace_drive_list_files',area:'files',args:{maxResults:1}},
  {name:'workspace_drive_list_shared_drives',area:'files',args:{maxResults:1}},
  {name:'workspace_drive_list_recent_files',area:'files',args:{maxResults:1}},
  {name:'workspace_drive_list_starred',area:'files',args:{}},
  {name:'workspace_drive_list_trash',area:'files',args:{maxResults:1}},
  {name:'workspace_drive_list_shared_with_me',area:'files',args:{}},
  {name:'workspace_drive_get_storage_quota',area:'files',args:{}},
  {name:'workspace_calendar_get_settings',area:'calendar',args:{}},
  {name:'workspace_calendar_list_calendars',area:'calendar',args:{}},
  {name:'workspace_calendar_list_event_colors',area:'calendar',args:{}},
  {name:'workspace_calendar_list_events',area:'calendar',args:{calendarId:'primary',maxResults:1}},
  {name:'workspace_tasks_list_tasklists',area:'tasks',args:{}},
  {name:'workspace_tasks_list_tasks',area:'tasks',args:{}},
  {name:'workspace_recent_changes',area:'workspace',args:{limit:1}}
]);

const PROTECTED_DISPATCHERS=new Set([
 'workspace_search_tools','workspace_describe_tool','workspace_call',
 'workspace_batch','workspace_get_result'
]);
const VALID_NAME=/^[a-z][a-z0-9_]{1,119}$/;

export async function readAuthorizedCatalog({origin,token,fetcher=fetch}){
 const url=originFromEnv(origin);
 const names=new Set(),tools=[];
 let page=1;
 for(let i=0;i<20;i++){
  const response=await fetcher(url+'/api/tools?listing=catalog&limit=100&page='+page,{
   method:'GET',redirect:'error',signal:AbortSignal.timeout(12000),
   headers:{authorization:'Bearer '+token}
  });
  if(response.status!==200)throw Error('read_only_catalog_unavailable');
  let body;try{body=await response.json()}catch{throw Error('read_only_catalog_invalid_json')}
  const result=body?.result;
  if(body?.ok!==true||!Array.isArray(result?.tools)||result.tools.length>100)
   throw Error('read_only_catalog_invalid_page');
  for(const tool of result.tools){
   if(!VALID_NAME.test(tool?.name||'')||names.has(tool.name)||
      tool.writes!==false&&!PROTECTED_DISPATCHERS.has(tool.name)||
      tool.annotations?.readOnlyHint!==true&&!PROTECTED_DISPATCHERS.has(tool.name))
    throw Error('read_only_catalog_unsafe_or_duplicate');
   names.add(tool.name);
   tools.push({name:tool.name,area:tool.area,writes:tool.writes===true,annotations:tool.annotations,inputSchema:tool.inputSchema});
  }
  if(result.next===null){return tools;}
  const next=Number(result.next);
  if(!Number.isSafeInteger(next)||next!==page+1||result.tools.length===0)
   throw Error('read_only_catalog_bad_cursor');
  page=next;
 }
 throw Error('read_only_catalog_page_cap');
}

export async function runCatalogReadOnlySmoke({origin,token,expectedAccount,expectedRevision,fixtures,reviewedCases,fetcher=fetch}){
 // Validate the exact fixture manifest BEFORE the first HTTP request.
 validateTestAuthorization({token,account:expectedAccount,revision:expectedRevision});
 const selectedFixtures=preparedFixtureProbes(fixtures,expectedAccount);
 const selectedCases=parseReviewedReadCases(reviewedCases);
 // Identity, exact deployed revision and existing five essential reads are
 // checked before walking or invoking the wider catalog.
 const baseline=await runReadOnlySmoke({origin,token,expectedAccount,expectedRevision,fetcher});
 if(!baseline.ok)return {ok:false,catalogComplete:false,baseline:baseline.outcomes,
  tools:[],summary:{discovered:0,probed:0,failed:baseline.outcomes.filter(x=>x.status==='FAIL').length,notProbed:0,engineeringGaps:0}};
 const catalog=await readAuthorizedCatalog({origin,token,fetcher});
 const plan=planCatalogReads({catalog,safeProbes:SAFE_READ_PROBES,fixtures:selectedFixtures,reviewedCases:selectedCases,account:expectedAccount});
 const probes=plan.filter(entry=>entry.probe).map(entry=>entry.probe);
 const run=await runReadOnlySmoke({origin,token,expectedAccount,expectedRevision,fetcher,probes});
 const coverage=coverageResults(plan,run.outcomes);
 // A missing advertised exact name is a contract drift, not an optional skip.
 const tools=coverage.tools.map(row=>row.status==='NOT_AVAILABLE'&&
  row.reason==='read_tool_not_advertised'
  ? {...row,status:'FAIL',reason:'advertised_probe_unavailable'}:row);
 const failed=tools.filter(row=>row.status==='FAIL').length;
 const summary={...coverage.summary,failed,probed:coverage.summary.passed+failed,
  notProbed:tools.filter(row=>row.status==='NOT_PROBED'||row.status==='NOT_AVAILABLE').length};
 const coverageComplete=failed===0&&summary.notProbed===0;
 // Success means the selected approved catalog was actually fully checked.
 // A partly implemented plan may still have zero individual provider errors.
 // Never expose that partial result to library callers as a passing smoke.
 return {ok:baseline.ok&&run.ok&&coverageComplete,catalogComplete:true,
  coverageComplete,baseline:baseline.outcomes,
  tools,summary};
}

export async function main(argv=process.argv.slice(2),env=process.env){
 if(argv.length!==1||argv[0]!=='--authorized-catalog'){
  console.error('Usage: node scripts/smoke-readonly-catalog.mjs --authorized-catalog');
  return 2;
 }
 if(!env.RTC_TEST_PASS||!env.RTC_ORIGIN||!env.RTC_EXPECTED_ACCOUNT||!env.RTC_EXPECTED_REVISION){
  console.error('Missing protected TEST read_only pass, origin, expected account or deployed revision');
  return 2;
 }
 try{
  const result=await runCatalogReadOnlySmoke({
   origin:env.RTC_ORIGIN,token:env.RTC_TEST_PASS,expectedAccount:env.RTC_EXPECTED_ACCOUNT,
   expectedRevision:env.RTC_EXPECTED_REVISION,fixtures:env.RTC_READ_FIXTURES_JSON,
   reviewedCases:env.RTC_REVIEWED_READ_CASES_JSON
  });
  if(result.catalogComplete){
   const date=new Date().toISOString().slice(0,10);
   const markdown=renderReadOnlyReport({date,revision:env.RTC_EXPECTED_REVISION,
    coverage:result,runType:'authorized_test'});
   // Sanitized report is written locally for review/commit, not sent to Google.
   await writeFile('docs/plan/smoke-report-'+date+'.md',markdown,{flag:'wx'});
  }
  for(const entry of result.tools)console.log(entry.status+' '+entry.tool+(entry.reason?' ('+entry.reason+')':''));
  console.log('Read-only catalog enumerated: '+result.catalogComplete+
   '; probes passed: '+(result.summary.probed-result.summary.failed)+
   '; failed: '+result.summary.failed+'; not probed: '+result.summary.notProbed+
   '; probe implementation gaps: '+result.summary.engineeringGaps+
   '; additional owner-approved cases missing: '+(result.summary.reviewedCaseGates||0)+
   '; NOT a claim of full provider or Hub acceptance or external-only exhaustion.');
  return result.ok&&result.coverageComplete?0:1;
 }catch{
  console.error('FAIL read-only catalog acceptance; no provider data or secrets printed');
  return 1;
 }
}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1])process.exitCode=await main();
