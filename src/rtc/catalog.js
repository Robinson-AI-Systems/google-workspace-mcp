// Classify permissions once, before listing OR dispatch, for all delivery doors.
import { GUARDS } from '../tools/guards.js';
const SAFE_VERBS = new Set(['list','get','search','find','read','describe','whoami','check','inspect','audit','preview','export','download','count','query','watch','validate','fetch','lookup','status','summarize','report']);
const SAFE_NAMES = new Set(['workspace_whoami','workspace_list_accounts','workspace_list_connections','workspace_recent_changes','workspace_where_is_setting','workspace_plan_summary','gmail_inbox_summary','gmail_find_unanswered','workflow_email_health','workflow_health_report','workflow_security_snapshot','workflow_audit_external_sharing','workflow_search_presence_check']);
const KNOWN_MUTATIONS = new Set(['gmail_untrash_message','gmail_untrash_thread','sheets_duplicate_sheet','sheets_format_cells','sheets_freeze_rows','sheets_autoresize_columns','sheets_sort_range','sheets_merge_cells','sheets_unmerge_cells','sheets_protect_range','domain_confirm_verification']);
export const RTC_META = new Set(['workspace_search_tools','workspace_describe_tool','workspace_call','workspace_batch']);
export const RTC_AREAS = ['mail','files','calendar','tasks','chat','admin','workspace','workflows','dns','people','business','identity','datatransfer','licensing'];
export function rtcArea(name) {
 const p=String(name).split('_')[0];
 return ({gmail:'mail',inbox:'mail',drive:'files',docs:'files',sheets:'files',slides:'files',forms:'files',calendar:'calendar',tasks:'tasks',chat:'chat',admin:'admin',reports:'admin',licensing:'admin',vault:'admin',workspace:'workspace',workflow:'workflows',dns:'dns'})[p]||p;
}
export function isWrite(name) {
 if (RTC_META.has(name)) return name === 'workspace_call';
 if (KNOWN_MUTATIONS.has(name)||GUARDS[name]) return true;
 if (SAFE_NAMES.has(name)) return false;
 return !String(name).split('_').slice(1).some(x=>SAFE_VERBS.has(x));
}
export function allowedTool(name, c={}) {
 if (RTC_META.has(name)) return true; // The dispatcher rechecks the selected target's area and profile.
 if (Array.isArray(c.areas)&&!c.areas.includes(rtcArea(name)))return false;
 if (c.profile==='read_only'&&isWrite(name))return false;
 if (c.profile==='everyday'&&isWrite(name)&&['admin','workspace','dns','licensing','vault'].includes(rtcArea(name)))return false;
 return true;
}
export function listedTools(tools,c={},listing=c.listing||'catalog'){
 return tools.filter(t=>allowedTool(t.name,c)&&(listing!=='compact'||RTC_META.has(t.name)||t.name==='workspace_whoami'||t.name.startsWith('workflow_')));
}
export function toolMetadata(t){
 const writes=isWrite(t.name),destructive=Boolean(GUARDS[t.name]?.destructive);
 return {...t,description:t.description.slice(0,160),area:rtcArea(t.name),profiles:writes?['everyday','full']:['read_only','everyday','full'],writes,money:false,destructive,audience:['builder','owner','operator'],
 annotations:{readOnlyHint:!writes,destructiveHint:destructive,idempotentHint:!writes,openWorldHint:true}};
}
