// Audited from the fully assembled Google Workspace registry on 2026-10-12.
// These exact handlers only read provider/account state. All other ordinary
// tools are treated as writes until a reviewer explicitly proves read-only
// behavior. Do not derive this list from tool names, schema or dryRun fields.
export const READ_ONLY_TOOL_NAMES=new Set([
  'admin_get_2sv_status', 'admin_get_alert', 'admin_get_available_privileges', 'admin_get_building',
  'admin_get_calendar_resource', 'admin_get_chrome_device', 'admin_get_customer_info', 'admin_get_domain',
  'admin_get_group', 'admin_get_group_settings', 'admin_get_mobile_device', 'admin_get_orgunit',
  'admin_get_role', 'admin_get_schema', 'admin_get_token', 'admin_get_user',
  'admin_get_user_photo', 'admin_list_admin_console_notifications', 'admin_list_alerts', 'admin_list_asp',
  'admin_list_buildings', 'admin_list_calendar_resources', 'admin_list_chrome_devices', 'admin_list_domain_aliases',
  'admin_list_domains', 'admin_list_features', 'admin_list_group_aliases', 'admin_list_group_members',
  'admin_list_groups', 'admin_list_mobile_devices', 'admin_list_orgunits', 'admin_list_role_assignments',
  'admin_list_roles', 'admin_list_schemas', 'admin_list_tokens', 'admin_list_user_aliases',
  'admin_list_users', 'calendar_get_event', 'calendar_get_freebusy', 'calendar_get_settings',
  'calendar_dev_snapshot', 'calendar_list_acl', 'calendar_list_calendars', 'calendar_list_event_colors', 'calendar_list_event_instances',
  'calendar_list_events', 'calendar_verify_calendar_deletion', 'chat_get_space', 'chat_list_members', 'chat_list_messages',
  'chat_list_spaces', 'chrome_list_policy_schemas', 'chrome_resolve_policies', 'contacts_get',
  'contacts_list', 'contacts_list_groups', 'contacts_search', 'datatransfer_get_transfer_status',
  'datatransfer_list_transfers', 'directory_list_people', 'directory_search_people', 'dns_list_records',
  'docs_export_as_docx', 'docs_export_as_html', 'docs_export_as_pdf', 'docs_get_document',
  'docs_get_text', 'docs_list_headings', 'domain_get_verification_token', 'domain_list_verified',
  'drive_download_file', 'drive_export_as_pdf', 'drive_export_file', 'drive_get_about',
  'drive_get_file', 'drive_get_revision', 'drive_get_shared_drive', 'drive_get_start_page_token',
  'drive_get_storage_quota', 'drive_list_changes', 'drive_list_files', 'drive_list_permissions',
  'drive_list_recent_files', 'drive_list_revisions', 'drive_list_shared_drives', 'drive_list_shared_with_me',
  'drive_list_starred', 'drive_list_trash', 'drive_search_files', 'forms_get',
  'forms_get_response', 'forms_list_responses', 'gmail_find_unanswered', 'gmail_get_attachment',
  'gmail_get_draft', 'gmail_get_filter', 'gmail_get_forwarding_settings', 'gmail_get_imap_settings',
  'gmail_get_label', 'gmail_get_message', 'gmail_get_message_body', 'gmail_get_pop_settings',
  'gmail_get_profile', 'gmail_get_thread', 'gmail_get_vacation_settings', 'gmail_inbox_summary',
  'gmail_list_delegates', 'gmail_list_drafts', 'gmail_list_filters', 'gmail_list_forwarding_addresses',
  'gmail_list_history', 'gmail_list_labels', 'gmail_list_messages', 'gmail_list_send_as',
  'gmail_list_threads', 'gmail_search', 'identity_check_membership', 'identity_get_security_settings',
  'identity_list_group_transitive_membership', 'identity_list_policies', 'identity_policy_audit', 'licensing_get_assignment', 'licensing_list_assignments', 'postmaster_list_domains', 'postmaster_list_traffic_stats', 'reports_activity', 'reports_admin_activity',
  'reports_drive_activity', 'reports_groups_activity', 'reports_login_activity', 'reports_mobile_activity',
  'reports_oauth_token_activity', 'reports_usage_customer', 'reports_usage_user', 'sheets_batch_get',
  'sheets_get_sheet_as_csv', 'sheets_get_spreadsheet', 'sheets_get_values', 'slides_export_as_pdf',
  'slides_get_presentation', 'slides_get_slide', 'slides_get_thumbnail', 'tasks_get_task',
  'tasks_get_tasklist', 'tasks_list_tasklists', 'tasks_list_tasks', 'vault_list_holds',
  'vault_list_matters', 'workflow_audit_external_sharing', 'workflow_email_health', 'workflow_health_report',
  'workflow_search_presence_check', 'workflow_security_snapshot', 'workspace_admin_overview', 'workspace_delegation_status',
  'workspace_dev_check_integration', 'workspace_dev_get_run', 'workspace_dev_list_runs', 'workspace_list_accounts', 'workspace_list_connections',
  'workspace_admin_console_capabilities', 'workspace_admin_console_verify', 'workspace_plan_summary', 'workspace_recent_changes', 'workspace_where_is_setting', 'workspace_whoami',
]);

// Pure validator shared by CI and regression tests. An unrecognized operation
// fails closed: it cannot be a read merely because its name says "get".
export function mutationCoverageErrors(registry,{isWrite,isGuardedWrite,RTC_META}){
 const errors=[];
 const registered=new Set(registry.tools.map(t=>t.name));
 for(const name of READ_ONLY_TOOL_NAMES)if(!registered.has(name))errors.push(`Stale reviewed read declaration: ${name}`);
 for(const tool of registry.tools){
   const name=tool.name,handler=registry.handlers[name];
   if(typeof handler!=='function'){errors.push(`Missing handler: ${name}`);continue;}
   if(RTC_META.has(name))continue; // controlled dispatcher contracts tested separately
   if(READ_ONLY_TOOL_NAMES.has(name)){
     if(isWrite(name))errors.push(`Read explicitly reviewed but classified as write: ${name}`);
     if(isGuardedWrite(handler))errors.push(`Read declaration conflicts with guarded mutation: ${name}`);
   }else{
     if(!isWrite(name))errors.push(`Unreviewed operation classified as read: ${name}`);
     if(!isGuardedWrite(handler))errors.push(`No guarded-write provenance: ${name}`);
     if(tool.inputSchema?.properties?.dryRun?.type!=='boolean')errors.push(`Missing preview contract: ${name}`);
   }
 }
 const dispatch=registry.handlers.workspace_call;
 if(typeof dispatch!=='function'||!RTC_META.has('workspace_call'))errors.push('Missing safe workspace_call dispatcher');
 return errors;
}
