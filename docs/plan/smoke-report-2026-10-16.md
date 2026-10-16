# Read-only smoke report — October 16, 2026

Prepared from retained genuine receipts and the current source casebook. This report does not rerun cleaned fixtures or relabel blocked cases as passes.

Source independently observed READY live: `f96a369e9cdab0b1c84aec478605d780f33c55a4` / `dpl_5QDmh4dRau9JjRucmZeqqeRadMcu`. Earlier retained reads remain bound to their original receipt revisions.

**153 verified retained handler/service reads; 11 unverified; 2 owner-excluded live Vault cases.** These counts include service metadata, and do not prove every subcheck in composite reports is healthy.

Original P0-2 report criterion permits failures documented in the Known Bugs table. The later explicit full-catalog queue remains open; no requirement is silently removed. See [Known Bugs and provider limitations](ARCHITECTURE.md#known-bugs--genuine-acceptance-follow-up-october162026) and [P0-2](TASKS.md#p0-2--smoke-test-every-read-only-tool-against-a-real-account-m).

| Tool | Result | Evidence or precise remaining prerequisite |
| --- | --- | --- |
| `workspace_whoami` | VERIFIED_RETAINED | permanent_strict_runner, retained_strict_runner |
| `workspace_gmail_get_profile` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_gmail_list_labels` | VERIFIED_RETAINED | permanent_strict_runner, retained_strict_runner |
| `workspace_gmail_list_messages` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_gmail_list_threads` | VERIFIED_RETAINED | permanent_strict_runner, retained_strict_runner |
| `workspace_gmail_list_drafts` | VERIFIED_RETAINED | permanent_strict_runner, retained_strict_runner |
| `workspace_gmail_list_filters` | VERIFIED_RETAINED | permanent_strict_runner, retained_strict_runner |
| `workspace_gmail_list_send_as` | VERIFIED_RETAINED | permanent_strict_runner, retained_strict_runner |
| `workspace_gmail_get_imap_settings` | VERIFIED_RETAINED | permanent_strict_runner, retained_strict_runner |
| `workspace_gmail_get_pop_settings` | VERIFIED_RETAINED | permanent_strict_runner, retained_strict_runner |
| `workspace_gmail_get_vacation_settings` | VERIFIED_RETAINED | permanent_strict_runner, retained_strict_runner |
| `workspace_gmail_get_forwarding_settings` | VERIFIED_RETAINED | permanent_strict_runner, retained_strict_runner |
| `workspace_gmail_list_forwarding_addresses` | VERIFIED_RETAINED | permanent_strict_runner, retained_strict_runner |
| `workspace_gmail_list_delegates` | VERIFIED_RETAINED | permanent_strict_runner, retained_strict_runner |
| `workspace_drive_get_about` | VERIFIED_RETAINED | permanent_strict_runner, retained_strict_runner |
| `workspace_drive_get_start_page_token` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_drive_list_files` | VERIFIED_RETAINED | permanent_strict_runner, retained_strict_runner |
| `workspace_drive_list_shared_drives` | VERIFIED_RETAINED | permanent_strict_runner, retained_strict_runner |
| `workspace_drive_list_recent_files` | VERIFIED_RETAINED | permanent_strict_runner, retained_strict_runner |
| `workspace_drive_list_starred` | VERIFIED_RETAINED | permanent_strict_runner, retained_strict_runner |
| `workspace_drive_list_trash` | VERIFIED_RETAINED | permanent_strict_runner, retained_strict_runner |
| `workspace_drive_list_shared_with_me` | VERIFIED_RETAINED | permanent_strict_runner, retained_strict_runner |
| `workspace_drive_get_storage_quota` | VERIFIED_RETAINED | permanent_strict_runner, retained_strict_runner |
| `workspace_calendar_get_settings` | VERIFIED_RETAINED | permanent_strict_runner, retained_strict_runner |
| `workspace_calendar_list_calendars` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_calendar_list_event_colors` | VERIFIED_RETAINED | permanent_strict_runner, retained_strict_runner |
| `workspace_calendar_list_events` | VERIFIED_RETAINED | permanent_strict_runner, retained_strict_runner |
| `workspace_tasks_list_tasklists` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner |
| `workspace_tasks_list_tasks` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner |
| `workspace_recent_changes` | VERIFIED_RETAINED | permanent_strict_runner, retained_strict_runner |
| `workspace_gmail_get_label` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, retained_original_exact_read |
| `workspace_gmail_get_message` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_original_exact_read |
| `workspace_gmail_get_thread` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response |
| `workspace_drive_get_file` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_original_exact_read |
| `workspace_drive_get_shared_drive` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response |
| `workspace_calendar_get_event` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_original_exact_read |
| `workspace_tasks_get_tasklist` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner |
| `workspace_tasks_get_task` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner |
| `workspace_docs_get_document` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_original_exact_read |
| `workspace_sheets_get_spreadsheet` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner |
| `workspace_slides_get_presentation` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner |
| `workspace_forms_get` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner |
| `workspace_admin_get_available_privileges` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_chat_list_members` | VERIFIED_RETAINED | genuine_original_readonly_test |
| `workspace_chat_list_messages` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner |
| `workspace_chat_list_spaces` | UNVERIFIED | Prior broad discovery automatically rejected; never replay/consume. New actor-only space approval does not authorize reading other accessible spaces. Exact UI/space alternative remains separate. |
| `workspace_chrome_list_policy_schemas` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response |
| `workspace_chrome_resolve_policies` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response |
| `workspace_contacts_list_groups` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_contacts_search` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_directory_search_people` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_domain_list_verified` | VERIFIED_RETAINED | current_owner_approved_narrow_read_only_site_recovery |
| `workspace_docs_list_headings` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner |
| `workspace_forms_list_responses` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner |
| `workspace_identity_list_group_transitive_membership` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response |
| `workspace_reports_usage_customer` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_reports_usage_user` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_vault_list_holds` | OWNER_EXCLUDED_LIVE | Could not verify without unneeded subscription upgrade; positive live pass excluded from completion by owner. Keep code, existing grant and synthetic proof. |
| `workspace_vault_list_matters` | OWNER_EXCLUDED_LIVE | Could not verify without unneeded subscription upgrade; positive live pass excluded from completion by owner. Keep code, existing grant and synthetic proof. |
| `workspace_admin_list_admin_console_notifications` | UNVERIFIED | Installed SDK has no notifications.list. Released source truthfully returns not_readable/provider_method_unavailable; no fake empty-list pass. |
| `workspace_admin_list_alerts` | UNVERIFIED | Alert Center scope apps.alerts intentionally absent; retain actual denial, no blind repeat or automatic consent expansion. |
| `workspace_admin_list_asp` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_admin_list_buildings` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_admin_list_calendar_resources` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_admin_list_chrome_devices` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_admin_list_domain_aliases` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_admin_list_domains` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_admin_list_features` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_admin_list_group_aliases` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response |
| `workspace_admin_list_group_members` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response |
| `workspace_admin_list_groups` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response |
| `workspace_admin_list_mobile_devices` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_admin_list_orgunits` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_admin_list_role_assignments` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_admin_list_roles` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_admin_list_schemas` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_admin_list_tokens` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_admin_list_user_aliases` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_admin_list_users` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_calendar_list_acl` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner |
| `workspace_calendar_list_event_instances` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner |
| `workspace_contacts_list` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response |
| `workspace_datatransfer_list_transfers` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response |
| `workspace_directory_list_people` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response |
| `workspace_drive_list_changes` | UNVERIFIED | Requires an exact approved cursor/interval limited to owned nonproduction changes; do not scan unrelated visible-file or mailbox history. |
| `workspace_drive_list_permissions` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner |
| `workspace_drive_list_revisions` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner |
| `workspace_drive_search_files` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response |
| `workspace_gmail_list_history` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response |
| `workspace_gmail_search` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response |
| `workspace_identity_list_policies` | VERIFIED_RETAINED | retained_strict_runner |
| `workspace_licensing_list_assignments` | VERIFIED_RETAINED | permanent_strict_runner |
| `workspace_postmaster_list_domains` | UNVERIFIED | Postmaster scope actually READY. One bounded list returned403 with explicit Postmaster API switched-off diagnosis. Cloud Console Site Unavailable persisted after one reload. Enable existing project API, then one bounded genuine read; no paid upgrade or domain verification. |
| `workspace_postmaster_list_traffic_stats` | UNVERIFIED | Postmaster API switched off as established by bounded domain-list error. No blind traffic call. After enablement, bounded list then exact returned owned accessible domain/fixed7day interval only. |
| `workspace_admin_get_2sv_status` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_admin_get_alert` | UNVERIFIED | Alert Center scope apps.alerts intentionally absent; retain actual denial, no blind repeat or automatic consent expansion. |
| `workspace_admin_get_building` | VERIFIED_RETAINED | Current READYf96 required-floor exactpositive200, guarded audited create/delete and independent404; allcreatedAdminobjects cleaned. |
| `workspace_admin_get_calendar_resource` | VERIFIED_RETAINED | retained_exact_guarded_resource_cycle |
| `workspace_admin_get_chrome_device` | UNVERIFIED | No existing approved positive target established by retained selection. No new building/resource/device/schema/filter/response creation or purchases. |
| `workspace_admin_get_customer_info` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_admin_get_domain` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_admin_get_group` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response |
| `workspace_admin_get_group_settings` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response |
| `workspace_admin_get_mobile_device` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_admin_get_orgunit` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_admin_get_role` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_admin_get_schema` | VERIFIED_RETAINED | genuine_original_readonly_test |
| `workspace_admin_get_token` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_admin_get_user` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_admin_get_user_photo` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response |
| `workspace_chat_get_space` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner |
| `workspace_contacts_get` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner |
| `workspace_datatransfer_get_transfer_status` | UNVERIFIED | Approved one-result transfer list returned zero. No genuine existing transfer ID to read; status invocation not used, no second list or initiation permitted. |
| `workspace_drive_get_revision` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response |
| `workspace_forms_get_response` | VERIFIED_RETAINED | genuine_original_readonly_test |
| `workspace_gmail_get_attachment` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner |
| `workspace_gmail_get_draft` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response |
| `workspace_gmail_get_filter` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response |
| `workspace_gmail_get_message_body` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner |
| `workspace_identity_check_membership` | VERIFIED_RETAINED | genuine_original_readonly_test |
| `workspace_identity_get_security_settings` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_licensing_get_assignment` | VERIFIED_RETAINED | permanent_strict_runner |
| `workspace_sheets_batch_get` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner |
| `workspace_sheets_get_values` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner |
| `workspace_slides_get_slide` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner |
| `workspace_slides_get_thumbnail` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner |
| `workspace_calendar_get_freebusy` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner |
| `workspace_calendar_dev_snapshot` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response |
| `workspace_calendar_verify_calendar_deletion` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response |
| `workspace_dns_list_records` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response |
| `workspace_gmail_find_unanswered` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response |
| `workspace_gmail_inbox_summary` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response |
| `workspace_identity_policy_audit` | VERIFIED_RETAINED | retained_strict_runner |
| `workspace_reports_activity` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_reports_admin_activity` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_reports_drive_activity` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_reports_groups_activity` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_reports_login_activity` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_reports_mobile_activity` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_reports_oauth_token_activity` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_workflow_audit_external_sharing` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response |
| `workspace_workflow_email_health` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response |
| `workspace_workflow_health_report` | UNVERIFIED | Membership-only extra invocation now consumed; it does not authorize group-settings reads inside workflow. Original group cycles exhausted; additional exact workflow allowance still needed. |
| `workspace_workflow_search_presence_check` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response |
| `workspace_workflow_security_snapshot` | VERIFIED_RETAINED | permanent_strict_runner, retained_strict_runner |
| `workspace_admin_overview` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response |
| `workspace_delegation_status` | VERIFIED_RETAINED | permanent_strict_runner, retained_strict_runner |
| `workspace_dev_check_integration` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_dev_get_run` | UNVERIFIED | Original creator-run inspection and foreign404 proofs retained separately; readonly principal does not own revoked creator ledgers. No old run replay or ownership change. |
| `workspace_dev_list_runs` | VERIFIED_RETAINED | permanent_strict_runner, retained_strict_runner |
| `workspace_list_accounts` | VERIFIED_RETAINED | permanent_strict_runner, retained_strict_runner |
| `workspace_list_connections` | VERIFIED_RETAINED | permanent_strict_runner, retained_strict_runner |
| `workspace_admin_console_capabilities` | VERIFIED_RETAINED | permanent_strict_runner, retained_strict_runner |
| `workspace_admin_console_verify` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response |
| `workspace_plan_summary` | VERIFIED_RETAINED | permanent_strict_runner, retained_strict_runner |
| `workspace_where_is_setting` | VERIFIED_RETAINED | permanent_strict_runner, retained_strict_runner |
| `workspace_docs_export_as_docx` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner |
| `workspace_docs_export_as_html` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner |
| `workspace_docs_export_as_pdf` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner |
| `workspace_docs_get_text` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner |
| `workspace_domain_get_verification_token` | VERIFIED_RETAINED | current_owner_approved_narrow_read_only_site_recovery |
| `workspace_drive_download_file` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response |
| `workspace_drive_export_as_pdf` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner |
| `workspace_drive_export_file` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner |
| `workspace_sheets_get_sheet_as_csv` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner |
| `workspace_slides_export_as_pdf` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner |

## Remaining-work review before the approved conditional release

- Building: released required-floor tagged cycle and cleanup passed, cumulative28reads/7requests exactlyused.
- Tasks/Site coexistence: resolved on READYf96 after explicit owner approval. Genuine combined consent, all three scope checks and six-API/four-scope readiness pass before and after genuine saved-grant refresh; both connected accounts encrypted ready.
- Postmaster: scope ready, API disabled; Cloud Console remains unavailable in the authorized browser. No blind retry, alternate cloud credential, paid change, sending, or domain verification.
- Notifications: actual pinned SDK has no notifications resource. Current provider reference does not establish a supported replacement for the legacy Admin notification list; explicit not-readable/manual guidance is retained. This is distinct from Directory push channels.
- Other unverified cases retain exact account/scope/asset/creator constraints above. Extra test budget does not grant unrelated data access or permission to recreate exhausted fixtures.
- Hub: current native health ready with one authorized target; restricted relay/Sandbox/revocation not exposed and remain separately Hub-owned. No Hub changes.
- Plaintext retirement: November 1 Denver plus independent approval, fresh readiness, instance drain and recovery. No early retirement.

Published with the genuine post-release building acceptance evidence. This report does not imply full catalog/provider acceptance.
