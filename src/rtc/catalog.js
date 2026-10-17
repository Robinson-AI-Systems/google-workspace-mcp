// Classify permissions once, before listing OR dispatch, for all delivery doors.
import { GUARDS } from '../tools/guards.js';
import { READ_ONLY_TOOL_NAMES } from './read-only-semantics.js';
// Only an intentionally reviewed exact read-only name is safe to expose to
// read_only connections. Unknown names fail closed as writes, regardless of
// their spelling (get/resolve/untrash/etc); the CI audit proves provenance.
export const RTC_META = new Set(['workspace_search_tools','workspace_describe_tool','workspace_call','workspace_batch','workspace_get_result']);
export const RTC_AREAS = ['mail','files','calendar','tasks','chat','admin','workspace','workflows','dns','people','business','identity','datatransfer','licensing','chrome','domain'];
export function rtcArea(name) {
 const p=String(name).split('_')[0];
 return ({gmail:'mail',inbox:'mail',postmaster:'mail',drive:'files',docs:'files',sheets:'files',slides:'files',forms:'files',calendar:'calendar',tasks:'tasks',chat:'chat',admin:'admin',reports:'admin',licensing:'admin',vault:'admin',workspace:'workspace',workflow:'workflows',dns:'dns',contacts:'people',directory:'people'})[p]||p;
}
export function isWrite(name) {
 if(RTC_META.has(name))return name==='workspace_call'; // dispatcher checks actual target
 return !READ_ONLY_TOOL_NAMES.has(name);
}
export function allowedTool(name, c={}) {
 // The developer fixture creation/cleanup tools are TEST-only; ordinary
 // Workspace operations and non-writing integration checks remain live-capable.
 if(c.mode==='live'&&['workspace_dev_create_fixtures','workspace_dev_cleanup'].includes(name))return false;
 if (RTC_META.has(name) return true; // The dispatcher rechecks the selected target's area and profile.
 if (Array.isArray(c.areas)&&!c.areas.includes(rtcArea(name)))return false;
 if (c.profile==='read_only'&&isWrite(name))return false;
 if (c.profile==='everyday'&&isWrite(name)&&['admin','workspace','dns','licensing','vault'].includes(rtcArea(name)))return false;
 return true;
}
export function listedTools(tools,c={},listing=c.listing||'catalog'){
 return tools.filter(t=>allowedTool(t.name,c)&&(listing!=='compact'||RTC_META.has(t.name)||t.name==='workspace_whoami'||t.name.startsWith('workflow_')))
  // Compact discovery stays under its 5,000-token budget. Full schemas are
  // available from workspace_describe_tool or the normal catalog.
  .map(t=>listing==='compact'&&t.outputSchema?(({outputSchema,...small})=>small)(t):t);
}
export function audienceFor(name){
 if(name.startsWith('workspace_admin_overview')||name==='workspace_where_is_setting'||name==='workspace_plan_summary')return ['owner','builder'];
 if(name.startsWith('admin_')||name.startsWith('licensing_')||name.startsWith('vault_')||name.startsWith('dns_'))return ['owner','builder'];
 if(name.includes('_dev_'))return ['builder'];
 if(name.startsWith('workflow_'))return ['owner','operator','builder'];
 if(name.startsWith('workspace_'))return ['owner','operator','builder'];
 return ['operator','builder'];
}
export function toolMetadata(t){
 const writes=isWrite(t.name),destructive=Boolean(GUARDS[t.name]?.destructive)||t.name==='workspace_undo_change';
 return {...t,description:t.description.slice(0,160),area:rtcArea(t.name),profiles:writes?['everyday','full']:['read_only','everyday','full'],writes,money:false,destructive,audience:audienceFor(t.name),
 annotations:{readOnlyHint:!writes,destructiveHint:destructive,idempotentHint:!writes,openWorldHint:true}};
}
