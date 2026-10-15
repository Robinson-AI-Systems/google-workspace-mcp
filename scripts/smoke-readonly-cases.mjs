// P0-2: individually enumerated audited read handlers without automatic execution.
// Profile groups describe the expected wrapped handler output, not permission.
// Only a protected, service-issued read_only TEST pass may exercise a case.
import { READ_ONLY_TOOL_NAMES } from '../src/rtc/read-only-semantics.js';

const GROUPS = Object.freeze({
 array: `
chat_list_members chat_list_messages chat_list_spaces chrome_list_policy_schemas
chrome_resolve_policies contacts_list_groups contacts_search directory_search_people
domain_list_verified docs_list_headings forms_list_responses
identity_list_group_transitive_membership reports_usage_customer reports_usage_user
vault_list_holds vault_list_matters`,
 paged: `
admin_list_admin_console_notifications admin_list_alerts admin_list_asp
admin_list_buildings admin_list_calendar_resources admin_list_chrome_devices
admin_list_domain_aliases admin_list_domains admin_list_features
admin_list_group_aliases admin_list_group_members admin_list_groups
admin_list_mobile_devices admin_list_orgunits admin_list_role_assignments
admin_list_roles admin_list_schemas admin_list_tokens admin_list_user_aliases
admin_list_users calendar_list_acl calendar_list_event_instances contacts_list
datatransfer_list_transfers directory_list_people drive_list_changes
drive_list_permissions drive_list_revisions drive_search_files gmail_list_history
gmail_search identity_list_policies licensing_list_assignments
postmaster_list_domains postmaster_list_traffic_stats`,
 resource: `
admin_get_2sv_status admin_get_alert admin_get_available_privileges
admin_get_building admin_get_calendar_resource admin_get_chrome_device
admin_get_customer_info admin_get_domain admin_get_group admin_get_group_settings
admin_get_mobile_device admin_get_orgunit admin_get_role admin_get_schema
admin_get_token admin_get_user admin_get_user_photo chat_get_space contacts_get
datatransfer_get_transfer_status drive_get_revision forms_get_response
gmail_get_attachment gmail_get_draft gmail_get_filter gmail_get_message_body
identity_check_membership identity_get_security_settings licensing_get_assignment
sheets_batch_get sheets_get_values slides_get_slide slides_get_thumbnail`,
 report: `
calendar_get_freebusy calendar_dev_snapshot calendar_verify_calendar_deletion
dns_list_records gmail_find_unanswered gmail_inbox_summary identity_policy_audit
reports_activity reports_admin_activity reports_drive_activity
reports_groups_activity reports_login_activity reports_mobile_activity
reports_oauth_token_activity workflow_audit_external_sharing workflow_email_health
workflow_health_report workflow_search_presence_check workflow_security_snapshot
workspace_admin_overview workspace_delegation_status
workspace_dev_check_integration workspace_dev_list_runs workspace_list_accounts
workspace_list_connections workspace_admin_console_capabilities
workspace_admin_console_verify workspace_plan_summary workspace_where_is_setting`,
 data: `
docs_export_as_docx docs_export_as_html docs_export_as_pdf docs_get_text
domain_get_verification_token drive_download_file drive_export_as_pdf
drive_export_file sheets_get_sheet_as_csv slides_export_as_pdf`
});
const entries = Object.entries(GROUPS).flatMap(([kind,names]) =>
 names.trim().split(/\s+/).map(name => [name,kind]));
export const EXTRA_READ_CASES = Object.freeze(Object.fromEntries(
 entries.map(([name,kind])=>[name.startsWith('workspace_')?name:'workspace_'+name,kind])
));
if(Object.keys(EXTRA_READ_CASES).length!==entries.length ||
 entries.some(([name])=>!READ_ONLY_TOOL_NAMES.has(name))) {
 throw Error('P0-2 reviewed casebook has a duplicate or unreviewed operation');
}

// For Google GETs with returned stable identifiers, require the exact fixture.
// Other reads still require native content/collection/setting evidence; no
// generic HTTP 200, ok:true, arbitrary JSON string or unrelated error passes.
const BOUND_IDS=Object.freeze({
 workspace_forms_get_response:['responseId','responseId'],
 workspace_contacts_get:['resourceName','resourceName'],
 workspace_chat_get_space:['spaceName','name'],
 workspace_slides_get_slide:['pageObjectId','objectId'],
 workspace_admin_get_user:['userKey','primaryEmail'],
 workspace_admin_get_group:['groupKey','email'],
 workspace_admin_get_domain:['domainName','domainName'],
 workspace_admin_get_orgunit:['orgUnitPath','orgUnitPath'],
 workspace_drive_get_revision:['revisionId','id']
});
const obj=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const str=value=>typeof value==='string'&&value.trim().length>0;
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const malformed=value=>value===null||value===undefined||
 (obj(value)&&(value.isError===true||own(value,'error')||own(value,'ok')||own(value,'result')));
const limitedRows=value=>Array.isArray(value)&&value.length<=200&&
 value.every(row=>obj(row)&&Object.keys(row).length>0);
const collection=value=>obj(value)&&Object.entries(value).some(([k,v])=>
  !/error|request|status/i.test(k)&&Array.isArray(v)&&v.length<=200&&
  v.every(row=>obj(row)&&Object.keys(row).length>0));
const fields=value=>obj(value)&&Object.entries(value).some(([key,v])=>
 ['id','name','email','primaryEmail','resourceName','responseId','threadId',
  'role','usage','enabled','isEnrolledIn2Sv','isEnforcedIn2Sv',
  'hasMembership','format','range','values','data','size','title',
  'kind','background','label','snippet','text','html','content',
  'attachmentId','settings','token'].includes(key)&&
 v!==null&&v!==undefined&&typeof v!=='function');
const report=value=>obj(value)&&Object.keys(value).some(key=>
 ['status','summary','checkedAt','results','checks','findings','activities',
  'items','domains','users','changes','records','scanned','application',
  'ready','scope','issues','policies','matches','settings','complete',
  'report','health','warnings','verified','account','connections',
  'runs','tools','steps','urls','entries','sites'].includes(key))&&
 !own(value,'error');
const data=value=>str(value)||
 (obj(value)&&Object.keys(value).some(key=>
  ['base64','base64Data','bytes','omitted','content','html','text',
   'fileId','token','txt','verificationToken','mimeType','data','url'].includes(key)));

export function verifyAdditionalRead(name,payload,account,args={}) {
 const kind=EXTRA_READ_CASES[name];
 if(!kind||malformed(payload))return false;
 try {
  const bound=BOUND_IDS[name];
  if(bound&&str(args[bound[0]])){
   if(!obj(payload)||String(payload[bound[1]]||'').toLowerCase()!==
      args[bound[0]].toLowerCase())return false;
  }
  if(kind==='array')return limitedRows(payload)||
   (obj(payload)&&str(payload.truncated)&&limitedRows(payload.items));
  if(kind==='paged')return collection(payload)||limitedRows(payload)||
   (obj(payload)&&Number.isInteger(payload.resultSizeEstimate)&&
    payload.resultSizeEstimate===0);
  if(kind==='resource')return fields(payload);
  if(kind==='report')return report(payload)||collection(payload)||limitedRows(payload);
  if(kind==='data')return data(payload);
 }catch{}
 return false;
}

// A caller MUST explicitly name every additional read and supply exact owned
// arguments in protected env. Zero-arg reads are opt-in too; never schedule all
// directory, policy, Vault, report or export calls by recognizing their names.
export function parseReviewedReadCases(input) {
 if(input===undefined||input===null||input==='')return [];
 if(typeof input==='string'){
  if(input.length>100000)throw Error('reviewed_read_manifest_too_large');
  try {input=JSON.parse(input)}catch{throw Error('invalid_reviewed_read_manifest')}
 }
 if(!Array.isArray(input)||!input.length||input.length>123)
  throw Error('invalid_reviewed_read_manifest');
 const found=new Set();
 return input.map(entry=>{
  if(!obj(entry)||Object.keys(entry).sort().join(',')!=='args,name'||
    !own(EXTRA_READ_CASES,entry.name)||!obj(entry.args)||found.has(entry.name))
   throw Error('unsafe_reviewed_read_name_or_duplicate');
  found.add(entry.name);
  if(JSON.stringify(entry.args).length>4096||Object.keys(entry.args).length>16)
   throw Error('unsafe_reviewed_read_argument_size');
  return {name:entry.name,args:entry.args};
 });
}

// Validate against the actual protected deployed catalog, not a guessed local
// schema, and cap provider-side page/query behavior. Names and argument values
// never enter the sanitized report except the already public operation name.
export function validateReviewedCase(probe,tool) {
 if(!obj(probe)||!own(EXTRA_READ_CASES,probe.name)||
   !obj(tool)||tool.name!==probe.name||tool.writes!==false||
   tool.annotations?.readOnlyHint!==true||
   !obj(tool.inputSchema)||tool.inputSchema.type!=='object'||
   !obj(tool.inputSchema.properties))return false;
 const props=tool.inputSchema.properties;
 if(!Array.isArray(tool.inputSchema.required||[])||
  tool.inputSchema.required.some(k=>!own(probe.args,k)))return false;
 for(const [key,value] of Object.entries(probe.args)){
  const field=props[key];
  if(!obj(field)||!validValue(field,value,0))return false;
  if(key==='crossDomain'&&value!==false)return false;
  if(['confirm','dryRun','allowWrites','sendWelcome'].includes(key))return false;
  if(['maxResults','pageSize','limit','maxFilesToScan','maxPages','pageSizeLimit']
    .includes(key)&&(!Number.isInteger(value)||value<1||value>10))return false;
  if(['userKey','query','q','groupEmail','groupKey'].includes(key)&&
   typeof value==='string'&&/^(all|\*)$/i.test(value.trim()))return false;
  if(key==='format'&&value!=='metadata'&&value!=='minimal')return false;
 }
 return true;
}
function validValue(schema,value,depth) {
 if(depth>4||value===null||value===undefined)return false;
 const types=Array.isArray(schema.type)?schema.type:[schema.type];
 if(schema.enum&&!schema.enum.some(item=>item===value))return false;
 if(types.includes('string')){
  return str(value)&&value.length<=512&&!/[\x00-\x1f]/.test(value);
 }
 if(types.includes('integer')||types.includes('number')){
  return typeof value==='number'&&Number.isFinite(value)&&
   (!types.includes('integer')||Number.isInteger(value))&&
   (schema.minimum===undefined||value>=schema.minimum)&&
   (schema.maximum===undefined||value<=schema.maximum);
 }
 if(types.includes('boolean'))return typeof value==='boolean';
 if(types.includes('array')){
  return Array.isArray(value)&&value.length<=10&&value.every(v=>
   validValue(schema.items||{type:'string'},v,depth+1));
 }
 if(types.includes('object')){
  if(!obj(value)||Object.keys(value).length>12)return false;
  const spec=schema.properties||{};
  return Object.entries(value).every(([key,v])=>own(spec,key)&&
   validValue(spec[key],v,depth+1));
 }
 return false;
}
