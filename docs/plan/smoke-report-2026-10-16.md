# Read-only smoke report — October 16, 2026

Prepared from retained genuine receipts and the current source casebook. This report does not rerun cleaned fixtures or relabel blocked cases as passes.

Current source independently observed READY: `42afbaaf138d293d6042acd874c0fd3c32f7ce0e` / configuration redeploy `dpl_5cWHQLUyxqmQbsy9juFtNtew1KDd`. Earlier retained reads remain bound to their original receipt revisions.

**160 verified retained handler/service reads; 3 development-tested GETs without live resources; 1 retired unsupported operation; 2 owner-excluded live Vault cases.** Historical inventory166; active read catalog165 after retirement. These counts include service metadata, and do not prove every subcheck in composite reports is healthy.

Original P0-2 report criterion permits failures documented in the Known Bugs table. The developer catalog audit is complete with the explicit dispositions below; broader Hub acceptance is now complete in Hub PR227 / Workspace PR197. Exact original runner and cleanup proof is in [final route evidence](evidence/2026-10-17-final-hub-route-acceptance.json). See [Known Bugs and provider limitations](ARCHITECTURE.md#known-bugs--genuine-acceptance-follow-up-october162026) and [P0-2](TASKS.md#p0-2--smoke-test-every-read-only-tool-against-a-real-account-m).

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
| `workspace_chat_list_spaces` | VERIFIED_RETAINED | New original TEST genuine200, strict native two-space list. One first-page operation, no pagination completeness claim. |
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
| `workspace_admin_list_admin_console_notifications` | RETIRED_UNSUPPORTED | Official Directory discovery revision20261014 has neither notifications resource nor scope; pinned SDK agrees. Remove advertised tool and obsolete login scope; no sunset date invented. |
| `workspace_admin_list_alerts` | VERIFIED | Owner-approved DWD and production opt-in activated. Original TEST identity and genuine Google list200/native empty array verified on READY42afbaa/config redeploy dpl5cWH. See alert-center-activation.json. |
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
| `workspace_drive_list_changes` | VERIFIED_RETAINED | New original TEST genuine200 with fresh start cursor immediately before one bounded changes request; no historical cursor or writes. |
| `workspace_drive_list_permissions` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner |
| `workspace_drive_list_revisions` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner |
| `workspace_drive_search_files` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response |
| `workspace_gmail_list_history` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response |
| `workspace_gmail_search` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response |
| `workspace_identity_list_policies` | VERIFIED_RETAINED | retained_strict_runner |
| `workspace_licensing_list_assignments` | VERIFIED_RETAINED | permanent_strict_runner |
| `workspace_postmaster_list_domains` | VERIFIED_RETAINED | Genuine original TEST/read_only on READY6ec69ce v2: HTTP200, native domains[]/count0, pageSize20, no continuation; no traffic proof implied. |
| `workspace_postmaster_list_traffic_stats` | VERIFIED_RETAINED | Original TEST/read_only on READY6ec69ce: exact owned scoped domain OWNER/VERIFIED after approved additiveTXT/Google verification; October9-15 seven-day query200/native v2 stats[]/no continuation. Missing metrics remain unknown, not healthy delivery. |
| `workspace_admin_get_2sv_status` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_admin_get_alert` | DEVELOPMENT_TESTED_NO_RESOURCE | DWD is now active; genuine Google list returned no alerts. Actual generated GET and403 propagation tested; no incident manufactured to obtain an ID. |
| `workspace_admin_get_building` | VERIFIED_RETAINED | Current READYf96 required-floor exactpositive200, guarded audited create/delete and independent404; allcreatedAdminobjects cleaned. |
| `workspace_admin_get_calendar_resource` | VERIFIED_RETAINED | retained_exact_guarded_resource_cycle |
| `workspace_admin_get_chrome_device` | DEVELOPMENT_TESTED_NO_RESOURCE | Retained original ChromeOS inventory200/native empty. Actual SDK exact GET contract and404 preservation tested. Google30day50device trial exists but still needs enrolled device and acceptance of terms; no trial/purchase/enrollment needed for development completion. |
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
| `workspace_datatransfer_get_transfer_status` | DEVELOPMENT_TESTED_NO_RESOURCE | Retained owner-bounded transfer list200/native empty. Exact REST GET and404 preservation tested. Creating a transfer migrates real user data; no migration is justified to manufacture a test resource. |
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
| `workspace_workflow_health_report` | VERIFIED_RETAINED | New original TEST genuine200, exact approved domain,13checks:8PASS/2WARN/1FAIL/2INFO. Operation passes; tenant security health is not certified. |
| `workspace_workflow_search_presence_check` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response |
| `workspace_workflow_security_snapshot` | VERIFIED_RETAINED | permanent_strict_runner, retained_strict_runner |
| `workspace_admin_overview` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response |
| `workspace_delegation_status` | VERIFIED_RETAINED | permanent_strict_runner, retained_strict_runner |
| `workspace_dev_check_integration` | VERIFIED_RETAINED | offline_source_proof_of_retained_provider_response, permanent_strict_runner, retained_strict_runner |
| `workspace_dev_get_run` | VERIFIED_SERVICE_METADATA | Retained original creator200 for3 cleaned ledgers with same IDs; foreign principal404. providerVerified:false by design. Real PG ownership tests; never replay cleaned fixtures. |
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

## Historical remaining-work review before the approved conditional release

The following dated recovery progression preserves original observations. Its obsolete November1, Postmaster, Alert Center and Hub pending statements are superseded by the completed cutover/activation and final Hub receipts linked above; do not rerun these already completed operations.

- Building: released required-floor tagged cycle and cleanup passed, cumulative28reads/7requests exactlyused.
- Tasks/Site coexistence: resolved on READYf96 after explicit owner approval. Genuine combined consent, all three scope checks and six-API/four-scope readiness pass before and after genuine saved-grant refresh; both connected accounts encrypted ready.
- Postmaster: scope ready, API disabled; Cloud Console remains unavailable in the authorized browser. No blind retry, alternate cloud credential, paid change, sending, or domain verification.
- Notifications: actual pinned SDK has no notifications resource. Current provider reference does not establish a supported replacement for the legacy Admin notification list; explicit not-readable/manual guidance is retained. This is distinct from Directory push channels.
- Other unverified cases retain exact account/scope/asset/creator constraints above. Extra test budget does not grant unrelated data access or permission to recreate exhausted fixtures.
- Hub: current native health ready with one authorized target; restricted relay/Sandbox/revocation not exposed and remain separately Hub-owned. No Hub changes.
- Plaintext retirement: November 1 Denver plus independent approval, fresh readiness, instance drain and recovery. No early retirement.

Published with the genuine post-release building acceptance evidence. This report does not imply full catalog/provider acceptance.

Current v2 follow-up: owner-approved protected consent and genuine saved-grant refresh complete on READY6ec69ce. All6API/7checked scopes READY both before and after refresh; all2accounts encrypted/backfill/refresh ready, zero problems, storage mode unchanged. Source repair and domain-list read are complete; remaining traffic/other catalog, Hub and November1 gates remain pending.

Subsequent owner-approved setup completed: one Postmaster domain registration, one additive Vercel verificationTXT (14existing records preserved), public DNS proof, Google Domain verified and originalTESTlistOWNER/VERIFIED. Traffic operation now verified200/native v2 empty statistics for the fixed seven-day window; no sending or delivery-health claim. Current155verified/9unverified/2Vault excluded supersedes earlier empty-domain prerequisite. No release needed.


## Current completion audit — supersedes historical blockers above

All nine formerly unexplained cases now have source/provider-contract dispositions.
Three new live checks and the retained internal-ledger evidence bring verified
handler/service reads to159. Four retained tools have development contract tests
rather than positive live fixtures: ChromeOS device GET, transfer status GET and
the two Alert Center reads. No generated SDK test is called a genuine Google pass.
The health report surfaced business-security findings (2-Step enforcement,
super-admin count and third-party app access); changing those policies is outside
this completion repair. The report correctly preserves its FAIL/WARN findings.

Hub native discovery/read/audit acceptance is independently documented in Hub
PR224. The service does not discover Hub. Broader Hub-specific paths stay there.
The November1 calendar restriction is removed by explicit owner decision; actual
retirement still needs checked READY source, all-account readiness, drain and
recovery. Google Developer Preview is not a general sandbox for paid GA features.
References and exact source-contract facts are in the final audit JSON.


Final released acceptance: PR194 source42afbaa independently READY; retired
notifications404 and AlertCenter503 with explicit DWD configuration reason verified
through original read-only TEST. Actual protected encrypted-only activation and
both-account saved-grant renewal/mailbox/persistence verification complete;
plaintextAccounts0, legacyPlaintextCopies0, allproblems0. Subsequent actual
Gmail-backed whoami200/matching identity. See encrypted-cutover.json and screenshot.
Catalog report/developer audit is complete with the documented resource/config
limits; positive Alert Center still needs separate apps.alerts authorization.
Native Hub connection is proved, but separately listed broader Hub relay/Sandbox/
revocation checks remain pending for Hub-agent reconciliation; earlier native-only
closure wording does not waive or prove them. No reverse discovery is required.


### Alert Center activation — October16 owner approval

Owner approved the exact apps.alerts read/write scope on the existing robot. Google Admin saved five scopes, preserving all four existing scopes. Production-only runtime opt-in is enabled; config redeploy dpl_5cWHQLUyxqmQbsy9juFtNtew1KDd is READY on checked source42afbaa and all three aliases. Original TEST identity and real mailbox identity matched, then Google alert list returned200/native empty array. No provider mutation, key extraction, credential rotation or paid upgrade. Exact alert GET remains development-tested without a live resource. Current counts160verified/3development-tested no-resource/1retired/2owner-excluded sum to historical166. See evidence/2026-10-16-alert-center-activation.json and saved scope screenshot. Broader Hub D-4 remains pending.
