// P0-2: finite, least-privilege coverage classification for the *actual* RTC
// catalog. Classifying a read never grants an area, adds a scope or runs it.
// Fixture identities stay in protected input and NEVER appear in reports.
import { READ_ONLY_TOOL_NAMES } from '../src/rtc/read-only-semantics.js';
import { FIXTURE_TOOL_NAMES, parseExactReadFixtures } from './smoke-readonly-fixtures.mjs';
import { PROVIDER_READ_PROOFS, FIXTURE_READ_PROOFS } from './smoke-provider-shapes.mjs';

const IDENT=/^[a-z][a-z0-9_]{1,119}$/;
const PASS_ID=/^rtc_pass_[A-Za-z0-9_-]{43}$/;
const ACCOUNT=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SHA=/^[a-f0-9]{40}$/;
const DISPATCHERS=new Set(['workspace_search_tools','workspace_describe_tool',
 'workspace_call','workspace_batch','workspace_get_result']);
const FIXTURE=new Set(FIXTURE_TOOL_NAMES);
const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);

// Never infer permission from a read-looking name: the server's audited
// read-only set and the separately protected RTC broker contract control it.
export function isReviewedRead(name) {
 if(typeof name!=='string'||!IDENT.test(name)||DISPATCHERS.has(name))return false;
 return READ_ONLY_TOOL_NAMES.has(name)||
  (name.startsWith('workspace_')&&READ_ONLY_TOOL_NAMES.has(name.slice(10)));
}
export function validateAuthorizedReadCatalog(catalog) {
 if(!Array.isArray(catalog)||catalog.length>500)throw Error('unsafe_catalog');
 const found=new Set();
 return catalog.map(tool=>{
  if(!isObject(tool)||!IDENT.test(tool.name)||found.has(tool.name))
   throw Error('unsafe_catalog_duplicate_or_name');
  found.add(tool.name);
  if(DISPATCHERS.has(tool.name))return {...tool,protected:true};
  if(tool.writes!==false||tool.annotations?.readOnlyHint!==true||
     !isReviewedRead(tool.name))throw Error('unsafe_catalog_unreviewed_read');
  return tool;
 });
}

// Inspect advertised required fields without fabricating arguments for real
// customers. Full parameter validation is delegated to the provider-specific
// fixture parser or a vetted zero-argument probe: a JSON schema isn't consent.
export function requiredFields(tool) {
 const schema=tool.inputSchema;
 if(!isObject(schema))return null;
 if(schema.type!==undefined&&schema.type!=='object')return null;
 if(schema.required===undefined)return [];
 if(!Array.isArray(schema.required)||schema.required.some(k=>typeof k!=='string'||!k))
  return null;
 return [...new Set(schema.required)].sort();
}

// Exact fixtures are opt-in only, and the existing parser limits all inputs to
// 12 protected named resources. It refuses primary-calendar IDs and extra keys.
export function preparedFixtureProbes(fixtures,account) {
 if(fixtures===undefined||fixtures===null||fixtures==='')return [];
 return parseExactReadFixtures(fixtures,account);
}

export function planCatalogReads({catalog,safeProbes,fixtures=[],account}={}) {
 const tools=validateAuthorizedReadCatalog(catalog);
 if(!Array.isArray(safeProbes)||!ACCOUNT.test(account||''))
  throw Error('approved_account_and_reviewed_probes_required');
 const safe=new Map();
 for(const probe of safeProbes) {
  if(!isObject(probe)||!IDENT.test(probe.name)||!isReviewedRead(probe.name)||
     !own(PROVIDER_READ_PROOFS,probe.name)||!isObject(probe.args)||
     typeof probe.area!=='string'||safe.has(probe.name))
    throw Error('unsafe_reviewed_probe_definition');
  safe.set(probe.name,probe);
 }
 const fixturesByName=new Map();
 for(const probe of fixtures) {
  if(!isObject(probe)||!FIXTURE.has(probe.name)||!isObject(probe.args)||
     !own(FIXTURE_READ_PROOFS,probe.name)||fixturesByName.has(probe.name))
   throw Error('unsafe_fixture_probe_definition');
  fixturesByName.set(probe.name,probe);
 }
 const entries=tools.map(tool=>{
  const common={name:tool.name,area:tool.area||'unknown'};
  if(tool.protected)return {...common,kind:'PROTECTED',reason:'broker_not_direct_read'};
  const schemaRequired=requiredFields(tool);
  if(safe.has(tool.name)){
   if(schemaRequired===null||schemaRequired.some(k=>!own(safe.get(tool.name).args,k)))
    return {...common,kind:'GAP',reason:'reviewed_probe_schema_drift'};
   if(tool.area!==safe.get(tool.name).area)
    return {...common,kind:'GAP',reason:'reviewed_probe_area_drift'};
   return {...common,kind:'SAFE',probe:safe.get(tool.name)};
  }
  if(fixturesByName.has(tool.name)){
   const probe=fixturesByName.get(tool.name);
   if(schemaRequired===null||schemaRequired.some(k=>!own(probe.args,k))||
       tool.area!==probe.area)
    return {...common,kind:'GAP',reason:'fixture_probe_schema_or_area_drift'};
   return {...common,kind:'FIXTURE',probe};
  }
  if(FIXTURE.has(tool.name))
   return {...common,kind:'NEEDS_FIXTURE',reason:'exact_owner_fixture_required'};
  if(!isReviewedRead(tool.name))
   return {...common,kind:'GAP',reason:'unreviewed_read_declaration'};
  if(schemaRequired===null)
   return {...common,kind:'GAP',reason:'missing_or_invalid_read_schema'};
  // Do not run an admin/customer-wide read, a cross-domain query, an
  // export, or a mailbox-resource read merely because it needs no args.
  // A new reviewer must supply a named response proof and consent model.
  return {...common,kind:'GAP',
   reason: schemaRequired.length?'unreviewed_required_arguments':'unreviewed_output_or_scope',
   required:schemaRequired};
 });
 for(const [name] of safe)if(!entries.some(e=>e.name===name))
  entries.push({name,area:'unknown',kind:'ABSENT',reason:'reviewed_probe_not_advertised'});
 for(const [name] of fixturesByName)if(!entries.some(e=>e.name===name))
  entries.push({name,area:'unknown',kind:'ABSENT',reason:'fixture_not_advertised'});
 return entries;
}

// Run code deliberately lives in the existing RTC TEST executor, preserving
// exact deployed revision, Gmail identity, area grants, handle byte limits,
// native shape checks, no writes and protected error/fixture boundaries.
export function coverageResults(entries,outcomes=[]) {
 if(!Array.isArray(entries)||!Array.isArray(outcomes))throw Error('invalid_coverage_results');
 const seen=new Set();
 const tested=new Map();
 for(const outcome of outcomes) {
  if(!isObject(outcome)||typeof outcome.tool!=='string'||seen.has(outcome.tool)||
     !['PASS','FAIL','NOT_AVAILABLE'].includes(outcome.status))
   throw Error('invalid_or_duplicate_probe_result');
  seen.add(outcome.tool);tested.set(outcome.tool,outcome);
 }
 const results=entries.map(entry=>{
  if(entry.kind==='SAFE'||entry.kind==='FIXTURE') {
   const o=tested.get(entry.name);
   if(!o)return {tool:entry.name,status:'FAIL',reason:'scheduled_probe_not_executed'};
   return {tool:entry.name,status:o.status,...(o.reason?{reason:o.reason}:{})};
  }
  if(entry.kind==='ABSENT')return {tool:entry.name,status:'FAIL',reason:entry.reason};
  return {tool:entry.name,status:'NOT_PROBED',reason:entry.reason};
 });
 const summary={
  discovered:entries.filter(e=>e.kind!=='ABSENT').length,
  scheduled:entries.filter(e=>e.kind==='SAFE'||e.kind==='FIXTURE').length,
  passed:results.filter(r=>r.status==='PASS').length,
  failed:results.filter(r=>r.status==='FAIL').length,
  notProbed:results.filter(r=>r.status==='NOT_PROBED'||r.status==='NOT_AVAILABLE').length,
  engineeringGaps:entries.filter(e=>e.kind==='GAP').length,
  exactFixtureGates:entries.filter(e=>e.kind==='NEEDS_FIXTURE').length,
  protectedBrokers:entries.filter(e=>e.kind==='PROTECTED').length
 };
 return {tools:results,summary,coverageComplete:summary.failed===0&&summary.notProbed===0,
  executionPass:summary.failed===0};
}

// Report is deliberately reproducible and safe to check in AFTER real TEST
// acceptance. It never includes identities, args, handles, contents or passes.
// Unknown reasons are not interpolated; only a fixed classification vocabulary.
const REASONS=new Set([
 'broker_not_direct_read','reviewed_probe_schema_drift','reviewed_probe_area_drift',
 'fixture_probe_schema_or_area_drift','exact_owner_fixture_required',
 'unreviewed_read_declaration','missing_or_invalid_read_schema',
 'unreviewed_required_arguments','unreviewed_output_or_scope',
 'reviewed_probe_not_advertised','fixture_not_advertised',
 'scheduled_probe_not_executed','provider_read_failed','request_failed',
 'result_handle_unreadable','invalid_google_read_shape','area_not_granted',
 'read_tool_not_advertised','advertised_probe_unavailable'
]);
export function renderReadOnlyReport({date,revision,coverage,runType='synthetic'}={}) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!SHA.test(revision||'')||
  !['synthetic','authorized_test'].includes(runType)||!isObject(coverage)||
  !Array.isArray(coverage.tools)||!isObject(coverage.summary))
  throw Error('invalid_report_metadata');
 const validStatus=new Set(['PASS','FAIL','NOT_PROBED','NOT_AVAILABLE']);
 const table=coverage.tools.map(row=>{
  if(!isObject(row)||!IDENT.test(row.tool)||!validStatus.has(row.status)||
     (row.reason&&!REASONS.has(row.reason)))throw Error('unsafe_report_row');
  return '| `'+row.tool+'` | '+row.status+' | '+(row.reason||'—')+' |';
 });
 return [
  '# P0-2 read-only Google catalog report — '+date,'',
  '- Source revision: `'+revision+'`',
  '- Evidence level: `'+runType+'` (synthetic is NOT real Google acceptance)',
  '- Advertised read operations: '+coverage.summary.discovered,
  '- Scheduled: '+coverage.summary.scheduled+'; passed: '+coverage.summary.passed+
   '; failed: '+coverage.summary.failed+'; not probed: '+coverage.summary.notProbed,
  '- Unfinished engineering probes: '+coverage.summary.engineeringGaps+
   '; fixture gates: '+coverage.summary.exactFixtureGates,
  '- Full coverage: '+(coverage.coverageComplete?'YES':'NO'),
  '- No provider responses, resource IDs, bearer passes, mailbox content or recipient addresses are recorded.','',
  '| Read operation | Result | Safe reason |','| --- | --- | --- |',
  ...table,'',
  'Failures require a real code fix or a linked existing Known Bugs entry; skips remain open evidence, not passes.',''
 ].join('\n');
}

export function validateTestAuthorization({token,account,revision}={}) {
 if(!PASS_ID.test(token||'')||!ACCOUNT.test(account||'')||!SHA.test(revision||''))
  throw Error('protected_read_only_test_authorization_required');
 return true;
}
