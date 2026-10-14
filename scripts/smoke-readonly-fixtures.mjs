// Opt-in, zero-write RTC TEST acceptance for exact owner-supplied fixture IDs.
// Never enumerate a real user's resources to guess IDs; each request must be
// explicitly named in a protected environment variable. No provider data, IDs,
// bearer tokens or email contents are written to stdout, GitHub or reports.
import {runReadOnlySmoke} from './smoke-readonly.mjs';
import {FIXTURE_READ_PROOFS} from './smoke-provider-shapes.mjs';

const REQUIRED=Object.freeze({
 workspace_gmail_get_label:{area:'mail',keys:['labelId']},
 workspace_gmail_get_message:{area:'mail',keys:['messageId'],fixed:{format:'metadata'}},
 workspace_gmail_get_thread:{area:'mail',keys:['threadId']},
 workspace_drive_get_file:{area:'files',keys:['fileId']},
 workspace_drive_get_shared_drive:{area:'files',keys:['driveId']},
 workspace_calendar_get_event:{area:'calendar',keys:['calendarId','eventId'],nonPrimary:true},
 workspace_tasks_get_tasklist:{area:'tasks',keys:['tasklistId']},
 workspace_tasks_get_task:{area:'tasks',keys:['tasklistId','taskId']},
 workspace_docs_get_document:{area:'files',keys:['documentId']},
 workspace_sheets_get_spreadsheet:{area:'files',keys:['spreadsheetId']},
 workspace_slides_get_presentation:{area:'files',keys:['presentationId']},
 workspace_forms_get:{area:'files',keys:['formId']}
});
const EXACT_ID=/^[^\s/?#<>]{1,256}$/;
const MAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export const FIXTURE_TOOL_NAMES=Object.freeze(Object.keys(REQUIRED));

export function parseExactReadFixtures(input,account){
 if(typeof input==='string'){
  if(input.length>10000)throw Error('Fixture request too large');
  try{input=JSON.parse(input)}catch{throw Error('Invalid protected fixture JSON')}
 }
 if(!MAIL.test(account||''))throw Error('Approved TEST mailbox required');
 if(!Array.isArray(input)||!input.length||input.length>12)
  throw Error('Provide one to twelve read-only fixture calls.');
 const names=new Set();
 return input.map(entry=>{
  if(!isObject(entry)||Object.keys(entry).sort().join(',')!=='args,name'||
    typeof entry.name!=='string'||!Object.hasOwn(REQUIRED,entry.name)||
    !isObject(entry.args))throw Error('Fixture name or arguments are not allowlisted');
  if(names.has(entry.name))throw Error('Duplicate fixture tool is not permitted');
  names.add(entry.name);
  const spec=REQUIRED[entry.name];
  if(Object.keys(entry.args).sort().join(',')!==[...spec.keys].sort().join(',')||
    !spec.keys.every(key=>typeof entry.args[key]==='string'&&
      EXACT_ID.test(entry.args[key])&&entry.args[key].trim()===entry.args[key]))
   throw Error('Fixture must use the exact required resource IDs; no extra arguments');
  if(spec.nonPrimary &&
    (entry.args.calendarId==='primary'||entry.args.calendarId.toLowerCase()===account.toLowerCase()))
   throw Error('Calendar fixture requires an independently owned non-primary calendar');
  if(!Object.hasOwn(FIXTURE_READ_PROOFS,entry.name))
   throw Error('Fixture provider identity validator missing');
  return {name:entry.name,area:spec.area,args:{...entry.args,...spec.fixed}};
 });
}

export async function runFixtureReadOnlySmoke({
 origin,token,expectedAccount,expectedRevision,fixtures,fetcher=fetch
}={}){
 // Parse and validate the entire batch before making any remote call.
 const probes=parseExactReadFixtures(fixtures,expectedAccount);
 const outcome=await runReadOnlySmoke({
  origin,token,expectedAccount,expectedRevision,fetcher,probes
 });
 const found=new Map(outcome.outcomes.map(row=>[row.tool,row]));
 const tools=probes.map(p=>({
  tool:p.name,
  status:found.get(p.name)?.status||'FAIL',
  ...(found.get(p.name)?.reason?{reason:found.get(p.name).reason}:{})
 }));
 // A denied area, unadvertised capability or skipped fixture is not a
 // successful real-provider acceptance, even if identity passed.
 return {
  ok:outcome.ok&&tools.every(row=>row.status==='PASS'),
  accountVerified:found.get('workspace_whoami')?.status==='PASS',
  summary:{requested:probes.length,passed:tools.filter(row=>row.status==='PASS').length,
   failed:tools.filter(row=>row.status==='FAIL').length,
   unavailable:tools.filter(row=>row.status==='NOT_AVAILABLE').length},
  tools
 };
}

export async function main(argv=process.argv.slice(2),env=process.env){
 if(argv.length!==1||argv[0]!=='--authorized-fixtures'){
  console.error('Usage: node scripts/smoke-readonly-fixtures.mjs --authorized-fixtures');
  return 2;
 }
 if(!env.RTC_ORIGIN||!env.RTC_TEST_PASS||!env.RTC_EXPECTED_ACCOUNT||
   !env.RTC_EXPECTED_REVISION||!env.RTC_READ_FIXTURES_JSON){
  console.error('Protected TEST pass, origin, source revision, mailbox and fixture IDs required');
  return 2;
 }
 try{
  const report=await runFixtureReadOnlySmoke({
   origin:env.RTC_ORIGIN,token:env.RTC_TEST_PASS,
   expectedAccount:env.RTC_EXPECTED_ACCOUNT,
   expectedRevision:env.RTC_EXPECTED_REVISION,
   fixtures:env.RTC_READ_FIXTURES_JSON
  });
  for(const {tool,status,reason} of report.tools)
   console.log(status+' '+tool+(reason?' ('+reason+')':''));
  console.log('Exact-ID TEST reads: '+report.summary.passed+'/'+report.summary.requested+
    '; provider objects and IDs omitted; no writes.');
  return report.ok?0:1;
 }catch{
  console.error('FAIL exact-ID read-only acceptance; no provider data or IDs printed');
  return 1;
 }
}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1])
 process.exitCode=await main();
