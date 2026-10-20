> **Independent service identity:** This is **Workspace MCP by Robinson AI Systems**, an independently operated connector for Google Workspace™; it is not made, operated, sponsored or endorsed by Google LLC. The stable native remote MCP URL is `https://workspace.robinsonaisystems.com/api/mcp` with service-owned OAuth. See [direct client setup, brand decisions and pending verification](docs/BRANDING-AND-DIRECT-MCP.md). Existing connected client credentials and technical identifiers are not renamed. Public directory publication has **not** been approved.

# Workspace MCP by Robinson AI Systems

**Hub compatibility:** This server remains independently usable. Its coding agents should follow the [shared Hub compatibility checklist](docs/HUB-COMPATIBILITY.md) and the linked canonical Hub RTC contract; Hub initiates discovery and keeps provider schemas out of the agent's default tool menu.

**Roadmap status:** [P9 user authority and P10 parallel multi-user Google sign-in](docs/plan/designs/USER-AUTHORITY-AND-PARALLEL-SIGNIN.md). P9 and P10-1..5/7 source engineering is merged; real P10-6 Google two-user custom-MCP pilot and public publication remain unaccepted. Owner and existing Hub TEST connections remain supported. The public pilot is **OFF by default**; do not interpret this README as launch approval. See [P10 owner setup](docs/PUBLIC-SIGNIN-OWNER-GUIDE.md) and [pilot readiness](docs/pr-cards/P10-PILOT-READINESS.md).

[![ci](https://github.com/Robinson-AI-Systems/google-workspace-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Robinson-AI-Systems/google-workspace-mcp/actions/workflows/ci.yml)

A Claude connector that gives Claude real, working control over your Google Workspace — not just email and calendar, but the admin side too: creating/suspending users, managing groups, adding domains and aliases, pushing Chrome policies, running security audits, and more. **a registry-verified tool catalog** across every major Google Workspace service, and it can hold sign-ins for more than one mailbox (e.g. one per business on the same Workspace), with each Claude connection bound to the one you pick.

Built for one goal: you should be able to tell Claude what you want done in Google Workspace — in plain English — and have it actually happen, without you opening the admin console.

## Roadmap and how to contribute

The implementation plan lives in [`docs/plan/`](docs/plan/README.md): current
architecture, ordered task cards with acceptance checks, the test strategy,
and a paste-ready prompt for the implementing model (Claude Sonnet 5.5). Start
with `docs/plan/README.md`.

## Developing

Use Node 24 (the version used by GitHub CI and the hosted Vercel project).

```
npm ci            # install
npm run check     # syntax check every source file, plus the "every changing tool is safe" check
npm test          # unit tests (no real Google or production database calls)
npm run test:db   # database tests; needs TEST_DATABASE_URL pointing at disposable local/CI Postgres
```

- Tests never call Google or the real database. `test/helpers/fake-google.js` stands in for the Google clients and `test/helpers/fake-db.js` for `src/db.js`; `test/contract/db-contract.js` runs the same checks against both so the fake cannot drift from the real thing. Database tests work inside their own temporary schema and clean up after themselves.
- Never put a real token, passphrase or key in a test or a log. Tests use obviously fake values.
- Database changes must be additive (`IF NOT EXISTS`); old and new code run against the same database at once.
- Keep pull requests coherent and keep the ledger row in `docs/plan/TASKS.md` current in the same PR. Tightly related cards may be grouped when that reduces CI churn without weakening review or acceptance checks. The full rules are in [`docs/plan/`](docs/plan/README.md).
- GitHub runs check, unit tests and database tests (on a throwaway Postgres) on every pull request.

## Actual registered tool catalog

<!-- BEGIN GENERATED TOOL CATALOG -->
<!-- Registry-derived; regenerate with `npm run gen:catalog`. Do not edit this section by hand. -->

**384 registered tools** from the assembled server registry. The names below include read-only operations, guarded writes and five protected meta-tools; listing a tool does not grant permission to call it. For current descriptions, required inputs and account restrictions, use `workspace_describe_tool`.

| Area | Registered tools |
| --- | ---: |
| admin | 112 |
| calendar | 24 |
| chat | 8 |
| chrome | 3 |
| datatransfer | 3 |
| dns | 3 |
| domain | 3 |
| files | 103 |
| identity | 5 |
| mail | 60 |
| people | 9 |
| tasks | 11 |
| workflows | 12 |
| workspace | 28 |

### admin (112)

- `admin_action_chrome_device`
- `admin_action_mobile_device`
- `admin_add_domain_alias`
- `admin_add_domain`
- `admin_add_group_alias`
- `admin_add_group_member`
- `admin_add_user_alias`
- `admin_create_building`
- `admin_create_calendar_resource`
- `admin_create_feature`
- `admin_create_group`
- `admin_create_orgunit`
- `admin_create_role_assignment`
- `admin_create_role`
- `admin_create_schema`
- `admin_create_user`
- `admin_delete_alert`
- `admin_delete_asp`
- `admin_delete_building`
- `admin_delete_calendar_resource`
- `admin_delete_domain_alias`
- `admin_delete_domain`
- `admin_delete_feature`
- `admin_delete_group_alias`
- `admin_delete_group`
- `admin_delete_mobile_device`
- `admin_delete_orgunit`
- `admin_delete_role_assignment`
- `admin_delete_role`
- `admin_delete_schema`
- `admin_delete_token`
- `admin_delete_user_alias`
- `admin_delete_user`
- `admin_get_alert`
- `admin_get_available_privileges`
- `admin_get_building`
- `admin_get_calendar_resource`
- `admin_get_chrome_device`
- `admin_get_customer_info`
- `admin_get_domain`
- `admin_get_group_settings`
- `admin_get_group`
- `admin_get_mobile_device`
- `admin_get_orgunit`
- `admin_get_role`
- `admin_get_schema`
- `admin_get_token`
- `admin_get_user_photo`
- `admin_get_user`
- `admin_list_alerts`
- `admin_list_asp`
- `admin_list_buildings`
- `admin_list_calendar_resources`
- `admin_list_chrome_devices`
- `admin_list_domain_aliases`
- `admin_list_domains`
- `admin_list_features`
- `admin_list_group_aliases`
- `admin_list_group_members`
- `admin_list_groups`
- `admin_list_mobile_devices`
- `admin_list_orgunits`
- `admin_list_role_assignments`
- `admin_list_roles`
- `admin_list_schemas`
- `admin_list_tokens`
- `admin_list_user_aliases`
- `admin_list_users`
- `admin_make_super_admin`
- `admin_move_chrome_devices_to_orgunit`
- `admin_move_user_orgunit`
- `admin_remove_group_member`
- `admin_reset_user_password`
- `admin_set_user_photo`
- `admin_sign_out_user`
- `admin_suspend_user`
- `admin_undelete_user`
- `admin_unsuspend_user`
- `admin_update_building`
- `admin_update_calendar_resource`
- `admin_update_chrome_device`
- `admin_update_customer_info`
- `admin_update_group_member_role`
- `admin_update_group_settings`
- `admin_update_group`
- `admin_update_orgunit`
- `admin_update_role`
- `admin_update_schema`
- `admin_update_user`
- `licensing_assign_license`
- `licensing_get_assignment`
- `licensing_list_assignments`
- `licensing_list_product_assignments`
- `licensing_remove_license`
- `licensing_replace_assignment`
- `licensing_update_assignment`
- `reports_activity`
- `reports_admin_activity`
- `reports_drive_activity`
- `reports_groups_activity`
- `reports_login_activity`
- `reports_mobile_activity`
- `reports_oauth_token_activity`
- `reports_usage_customer`
- `reports_usage_user`
- `vault_create_hold`
- `vault_create_matter`
- `vault_list_holds`
- `vault_list_matters`
- `vault_remove_hold`

### calendar (24)

- `calendar_add_attendee`
- `calendar_create_calendar`
- `calendar_create_event`
- `calendar_create_recurring_event`
- `calendar_create_video_meeting`
- `calendar_delete_calendar`
- `calendar_delete_event`
- `calendar_dev_snapshot`
- `calendar_get_event`
- `calendar_get_freebusy`
- `calendar_get_settings`
- `calendar_list_acl`
- `calendar_list_calendars`
- `calendar_list_event_colors`
- `calendar_list_event_instances`
- `calendar_list_events`
- `calendar_move_event`
- `calendar_quick_add`
- `calendar_set_event_color`
- `calendar_share_calendar`
- `calendar_unshare_calendar`
- `calendar_update_calendar`
- `calendar_update_event`
- `calendar_verify_calendar_deletion`

### chat (8)

- `chat_add_member`
- `chat_create_space`
- `chat_delete_message`
- `chat_get_space`
- `chat_list_members`
- `chat_list_messages`
- `chat_list_spaces`
- `chat_send_message`

### chrome (3)

- `chrome_list_policy_schemas`
- `chrome_resolve_policies`
- `chrome_set_policy`

### datatransfer (3)

- `datatransfer_get_transfer_status`
- `datatransfer_list_transfers`
- `datatransfer_start_transfer`

### dns (3)

- `dns_add_record`
- `dns_delete_record`
- `dns_list_records`

### domain (3)

- `domain_confirm_verification`
- `domain_get_verification_token`
- `domain_list_verified`

### files (103)

- `docs_append_paragraph`
- `docs_batch_update`
- `docs_create_document`
- `docs_create_named_range`
- `docs_delete_content`
- `docs_export_as_docx`
- `docs_export_as_html`
- `docs_export_as_pdf`
- `docs_get_document`
- `docs_get_text`
- `docs_insert_image`
- `docs_insert_table`
- `docs_insert_text`
- `docs_list_headings`
- `docs_replace_text`
- `drive_copy_file`
- `drive_create_doc`
- `drive_create_drive_label_assignment`
- `drive_create_folder`
- `drive_create_shared_drive`
- `drive_create_shortcut`
- `drive_create_spreadsheet`
- `drive_delete_file`
- `drive_delete_revision`
- `drive_delete_shared_drive`
- `drive_download_file`
- `drive_empty_trash`
- `drive_export_as_pdf`
- `drive_export_file`
- `drive_get_about`
- `drive_get_file`
- `drive_get_revision`
- `drive_get_shared_drive`
- `drive_get_start_page_token`
- `drive_get_storage_quota`
- `drive_list_changes`
- `drive_list_files`
- `drive_list_permissions`
- `drive_list_recent_files`
- `drive_list_revisions`
- `drive_list_shared_drives`
- `drive_list_shared_with_me`
- `drive_list_starred`
- `drive_list_trash`
- `drive_move_file`
- `drive_remove_permission`
- `drive_rename_file`
- `drive_restore_from_trash`
- `drive_search_files`
- `drive_share_file`
- `drive_star_file`
- `drive_transfer_ownership`
- `drive_trash_file`
- `drive_unstar_file`
- `drive_update_permission`
- `drive_update_shared_drive`
- `drive_upload_file`
- `drive_upload_from_url`
- `forms_add_multiple_choice_question`
- `forms_add_text_question`
- `forms_batch_update`
- `forms_create`
- `forms_get`
- `forms_get_response`
- `forms_list_responses`
- `forms_set_publish_settings`
- `sheets_add_conditional_formatting`
- `sheets_add_sheet`
- `sheets_append_values`
- `sheets_autoresize_columns`
- `sheets_batch_get`
- `sheets_batch_update`
- `sheets_batch_update_values`
- `sheets_clear_values`
- `sheets_copy_to_spreadsheet`
- `sheets_create_spreadsheet`
- `sheets_delete_sheet`
- `sheets_duplicate_sheet`
- `sheets_find_replace`
- `sheets_format_cells`
- `sheets_freeze_rows`
- `sheets_get_sheet_as_csv`
- `sheets_get_spreadsheet`
- `sheets_get_values`
- `sheets_merge_cells`
- `sheets_protect_range`
- `sheets_sort_range`
- `sheets_unmerge_cells`
- `sheets_update_values`
- `slides_batch_update`
- `slides_create_image`
- `slides_create_presentation`
- `slides_create_shape`
- `slides_create_slide`
- `slides_create_textbox`
- `slides_delete_slide`
- `slides_delete_text`
- `slides_export_as_pdf`
- `slides_get_presentation`
- `slides_get_slide`
- `slides_get_thumbnail`
- `slides_insert_text`
- `slides_replace_all_text`

### identity (5)

- `identity_check_membership`
- `identity_get_security_settings`
- `identity_list_group_transitive_membership`
- `identity_list_policies`
- `identity_policy_audit`

### mail (60)

- `gmail_add_delegate`
- `gmail_add_forwarding_address`
- `gmail_batch_delete`
- `gmail_create_draft`
- `gmail_create_filter`
- `gmail_create_label`
- `gmail_create_send_as`
- `gmail_delete_draft`
- `gmail_delete_filter`
- `gmail_delete_label`
- `gmail_delete_message`
- `gmail_delete_send_as`
- `gmail_delete_thread`
- `gmail_find_unanswered`
- `gmail_forward_message`
- `gmail_get_attachment`
- `gmail_get_draft`
- `gmail_get_filter`
- `gmail_get_forwarding_settings`
- `gmail_get_imap_settings`
- `gmail_get_label`
- `gmail_get_message`
- `gmail_get_message_body`
- `gmail_get_pop_settings`
- `gmail_get_profile`
- `gmail_get_thread`
- `gmail_get_vacation_settings`
- `gmail_inbox_summary`
- `gmail_list_delegates`
- `gmail_list_drafts`
- `gmail_list_filters`
- `gmail_list_forwarding_addresses`
- `gmail_list_history`
- `gmail_list_labels`
- `gmail_list_messages`
- `gmail_list_send_as`
- `gmail_list_threads`
- `gmail_mark_read`
- `gmail_mark_unread`
- `gmail_modify_message`
- `gmail_modify_thread`
- `gmail_remove_delegate`
- `gmail_reply_to_thread`
- `gmail_search`
- `gmail_send_draft`
- `gmail_send_email`
- `gmail_send_with_attachment`
- `gmail_trash_message`
- `gmail_trash_thread`
- `gmail_untrash_message`
- `gmail_untrash_thread`
- `gmail_update_draft`
- `gmail_update_forwarding_settings`
- `gmail_update_imap_settings`
- `gmail_update_label`
- `gmail_update_pop_settings`
- `gmail_update_send_as`
- `gmail_update_vacation_settings`
- `postmaster_list_domains`
- `postmaster_list_traffic_stats`

### people (9)

- `contacts_create`
- `contacts_delete`
- `contacts_get`
- `contacts_list`
- `contacts_list_groups`
- `contacts_search`
- `contacts_update`
- `directory_list_people`
- `directory_search_people`

### tasks (11)

- `tasks_clear_completed`
- `tasks_create_task`
- `tasks_create_tasklist`
- `tasks_delete_task`
- `tasks_delete_tasklist`
- `tasks_get_task`
- `tasks_get_tasklist`
- `tasks_list_tasklists`
- `tasks_list_tasks`
- `tasks_update_task`
- `tasks_update_tasklist`

### workflows (12)

- `workflow_add_domain_and_start_verification`
- `workflow_add_staff_member`
- `workflow_audit_external_sharing`
- `workflow_brand_mailbox`
- `workflow_email_health`
- `workflow_health_report`
- `workflow_offboard_employee`
- `workflow_onboard_employee`
- `workflow_search_presence_check`
- `workflow_security_snapshot`
- `workflow_set_up_business`
- `workflow_weekly_digest`

### workspace (28)

- `workspace_admin_console_capabilities`
- `workspace_admin_console_verify`
- `workspace_admin_overview`
- `workspace_batch`
- `workspace_bulk_operation`
- `workspace_business_calendar`
- `workspace_business_folders`
- `workspace_call`
- `workspace_delegation_status`
- `workspace_describe_tool`
- `workspace_dev_check_integration`
- `workspace_dev_cleanup`
- `workspace_dev_create_fixtures`
- `workspace_dev_get_run`
- `workspace_dev_list_runs`
- `workspace_get_result`
- `workspace_list_accounts`
- `workspace_list_connections`
- `workspace_plan_summary`
- `workspace_recent_changes`
- `workspace_remove_account`
- `workspace_revoke_connection`
- `workspace_search_tools`
- `workspace_set_allowed_domains`
- `workspace_set_default_account`
- `workspace_undo_change`
- `workspace_where_is_setting`
- `workspace_whoami`
<!-- END GENERATED TOOL CATALOG -->

The "workflow_*" tools are the ones worth knowing about specifically: instead of you (or Claude) stringing together six separate admin calls to offboard someone, `workflow_offboard_employee` does the whole checklist — suspend, sign out everywhere, revoke third-party app access, revoke app passwords, transfer their files, remove from all groups — in one call.

For a plain-English list of what to ask Claude for, see [docs/OWNER-GUIDE.md](docs/OWNER-GUIDE.md).

## How it runs

It runs hosted, on Vercel, with your login token stored in Neon (Postgres), so claude.ai can reach it from your phone, browser, anywhere. Setup is in `DEPLOY.md`. (The old "run on one computer" mode was retired; nothing in the hosted setup needed it.)

## How it signs in to Google

- **Your own sign-in (OAuth)** — you log in once as yourself. If that account is a Workspace super admin, every admin tool works too.
- **A separate robot identity (service account with domain-wide delegation)** — lets a few tools act *inside other people's* mailboxes, calendars and Drive without each person logging in. Setup, including the exact permission list to paste into the Admin console, is in `DEPLOY.md` (Part 5).

## A few things worth knowing

- **Each connection stays in its own business.** The admin tools (users, groups, domains, licenses, data transfer, Vault) refuse to touch an address or domain outside the domains allowed for the account the connection acts as. By default that is the account's own domain, so the Appliance Rentals connection cannot casually change AI Systems users. If a business has more than one domain, or you really want one connection to reach another, run `workspace_set_allowed_domains` (needs `confirm: true`), or pass `crossDomain: true` on a single call. It checks the addresses and domain names you give; a bare user ID or a list-everything call carries no domain and is not checked.

- **Safety on every tool that changes things.** Guarded mutation tools accept `dryRun: true` for previews, and destructive or otherwise sensitive ones (everything that deletes, sends email or chat messages, suspends, resets, changes forwarding, access, roles, domains, security or licences) do nothing until you pass `confirm: true`. The assembled-registry semantic CI gate fails closed for unreviewed tool behavior rather than trusting a name or `dryRun` field. Some general tools only need `confirm` for risky uses: `admin_update_user` when it suspends, resets a password or changes admin rights; `drive_share_file` for public links; `admin_update_group_settings` when it opens a group to outsiders or the whole internet, switches message approval off or lets spam straight through; `gmail_create_filter` when it forwards; the bulk document/sheet/slide/form editors when they delete. `confirmed` in the result is true only if Google really shows what was asked for (null when nothing could be read back). After a change the tool asks Google what it now holds and returns that (plus whether it could confirm), and the change goes in the change log (`workspace_recent_changes`; previews are hidden unless `includeDryRuns: true`). The full list is the table in `src/tools/guards.js`.

- **Nothing here is placeholder code.** Every tool calls the real Google API method it claims to. A handful of things Google's public APIs genuinely cannot do (some settings only exist in the admin console UI) are left out rather than faked. `workspace_where_is_setting` gives the console clicks for those.
- **Alert Center uses separate service-account authorization.** Its tools require Google Admin domain-wide delegation for `https://www.googleapis.com/auth/apps.alerts` and the runtime opt-in described in `DEPLOY.md`. Google provides this API to all Workspace customers; ordinary user OAuth cannot authorize it. The scope permits read and write, so enabling it requires explicit owner approval. TEST read-only and guarded-write controls still apply. `workflow_security_snapshot` reports unavailable alert coverage when authorization is absent.
- **Data Transfer API** (`datatransfer_*` tools, used by `workflow_offboard_employee`) isn't in Google's current client library, so it's implemented as a direct REST call — same effect, just built by hand instead of generated.
- **Safety classification fails closed.** The P5-1 audit now guards all eleven previously omitted Gmail restoration, Sheets and domain-verification mutations. The assembled handler inventory explicitly reviews 156 read-only tools; every new/unknown ordinary tool defaults to a mutation until reviewed, and CI requires genuine guarded-write provenance — a name like `get` or the presence of a `dryRun` field does not qualify. Actions support preview, appropriate confirmation, read-back and change logs. Fakes/green CI are not live provider acceptance, which remains separately tracked in the roadmap.

## Robinson's Toolkit Hub / RTC 1

This standalone server retains its original `POST /api/mcp` and Google
OAuth interface. Its additional RTC 1 HTTPS doors expose
`GET /api/contract`, `GET /api/tools`, `GET /api/tools/{name}`,
`POST /api/tools/{name}`, `POST /api/tools/_batch`,
`GET /api/results/{handle}`, `GET /api/whoami` and
`GET /api/openapi.json`. HTTPS requires a short-lived, owner-created
hashed TEST read-only pass. Existing MCP tool names are unchanged; HTTPS
uses collision-safe `workspace_` aliases.

The RTC integration and shared conformance suites run in CI. Actual Hub
D-4 acceptance is complete: native audited Hub read, separate local direct,
GitHub-only encrypted relay and Vercel Sandbox direct routes passed, with
same-pass issuer revocation and temporary-infrastructure cleanup verified.
See the [final route evidence](docs/plan/evidence/2026-10-17-final-hub-route-acceptance.json)
and [Phase 8 ledger](docs/plan/TASKS.md) for exact revisions, UTC results and
retained limitations. These RTC meta/owner tools are additional to the
historical service-category counts above.


### Developer integration readiness

For a connected app builder, `workspace_dev_check_integration`
checks requested Google API availability, currently granted OAuth
scopes, connected service-account client ID and declared delegated
scopes, plus optional Calendar IDs, Gmail labels/messages/threads, exact Drive
file/folder IDs, individual Tasks/list pairs, Chat space resource names,
Contacts/People resource names, and Docs/Sheets/Slides/Forms IDs, plus explicit Calendar reader/writer roles,
Google Drive folder capabilities, shared-drive membership roles, Gmail send-as
verification and exact Calendar free/busy windows, without changing Google data.
Only status findings are returned: message bodies, permissions details and busy
slots are not included. Each resource probe uses the existing scoped account,
metadata-only reads and exact provider-ID agreement; a mismatch, permission
denial or unavailable optional API is not declared ready. At most 24 additional
exact app resources and 24 explicit permission/capability requirements can be
probed in one call, plus up to 12 narrow Calendar availability windows. The
response includes total/ready/missing/not-readable counts, per-resource-type
and API-area breakdowns, and a bounded list of trusted Google Console remediation
links. Unsupported or unobservable authorizations remain `not_readable`. It returns observed `ready`, `missing`
and `not_readable` findings; Admin-console-only permissions remain
unverified until separately checked. This is a complete read-only
integration check, not fixture creation/cleanup; all three P8-7 fixture families are now implemented with exact-ID cleanup and crash reconciliation tests. Authorized Google TEST fixture acceptance and full Hub routes are accepted in [the ledger](docs/plan/TASKS.md); documented no-resource and owner-excluded live cases retain their stated limits.



### Protected owner console readback (P8-8)

`workspace_admin_console_capabilities` helps an owner browse the **50** mapped Google Admin settings by category, search term and approved readback eligibility, without contacting Google or changing anything. All 24 existing reviewed readback mappings are eligible only when their exact required inputs, scope, profile and per-account restrictions pass; other topics stay manual. Discovery returns a reconciled per-category coverage table for the whole review set, not just the visible page. This inventory does not report that a console policy is active. `workspace_admin_console_verify` can then inspect up to **10** exact selected topics using guarded child reads, with independently enforced profile/area and explicit owner intent for customer-wide or other-business data. Use `dryRun: true` to preview eligibility without provider calls.

An owner may provide optional, reviewed boolean `expectations` for the selected mailbox settings; a matching exact read becomes `matches_expected`, and a mismatch becomes `needs_attention` without changing Google. A successful provider result is recorded as a **narrow observed read**, or `observed_partial` for customer-wide or bounded pages. Neither means the Admin console's effective organizational-unit policy, bought seats, external notification rules or every user was proven correct. Bad provider shapes, missing account permissions, foreign identifiers or unsupported topics are not green, and Google object data is never returned by the composed check. No settings can be changed through these two workflows.

### Gmail Postmaster (read-only, owner-approved scope)

`postmaster_list_domains` and `postmaster_list_traffic_stats` use Google's Gmail Postmaster Tools **v1** read-only API. They require the explicitly approved `postmaster.readonly` permission, which **existing accounts must separately grant by reconnecting at `/api/google/authorize`**; registration in the catalog is not consent or proof that a sending domain is verified. Missing traffic can reflect low volume or provider restrictions. A signed-in business-domain boundary is enforced for domain-targeted statistics. No Gmail message content is read, no delegated service-account scope was added, and no mail is sent.


### Cloud Identity policy inspection (P7-2, read-only)

`identity_list_policies` lists explicitly configured organization policies; `identity_policy_audit` compares selected Gmail, Drive, Calendar and Chat settings against **21 documented, editable security/operations checks across seven areas** in `src/data/policy-baseline.json`. Mismatches trigger attention, but missing, inherited, inaccessible or incomplete policy data is marked **not_readable**, never green. Policies apply to the Workspace *customer*, not directly to an email domain, and organizational-unit/group overrides matter. Consequently a business-restricted connection needs explicit `crossDomain: true` and owner authorization before reading customer-wide policies. Google requires a Super Admin, a supported Policy API setup, and new OAuth consent to `cloud-identity.policies.readonly`. The previously approved scope is not proof that any account has connected, or that an effective per-domain baseline has been verified.


### Machine-readable read-only results (RTC P8-1)

Nine implemented read workflows now advertise validated MCP `outputSchema` and return `structuredContent` on full successful JSON responses. Added typed responses cover **Reports multi-application activity, Postmaster registered domains and delivery metrics, Cloud Identity policy list and the policy baseline audit**. Explicit `fields` projection still returns the selected JSON fields without pretending a partial object fulfills the full typed schema; `detail: full` keeps complete results, and large payloads use connection-owned, expiring retrieval handles. Error or missing-provider conditions cannot turn into typed success. The runtime tool registry remains 375 names; this does not certify live Google TEST or Hub conformance.

## Coding-agent development access (2026-10-13)

The implementing agent uses a renewable native OAuth connection, not a new copied RTC
pass for every retest. `rtool developer-connect ALIAS --profile full` prepares one mobile
link using the custom service. Choose the intended account/resources and authorize once;
return to chat without copying secrets. The agent reruns the command to finish privately,
then uses developer-check, developer-tools and developer-call. Existing original service
write previews, owner approvals and resource guards still apply. This developer workflow
does not reduce the finished product's tool capabilities.

On a managed POSIX cloud runner, configure RTOOL_DEVELOPER_VAULT_DIR to an absolute private
folder outside every Git checkout. The CLI creates a separate 0600 encryption key and
AES-GCM encrypted connection files in a 0700 folder; keep that private runner state for
resumes. OS credential managers remain the desktop default. Neither option places secrets
in chats, prompts, Git or shared artifacts. Initial provider consent or an expired/revoked
underlying authorization can still require a new owner sign-in. Source/tests are not
proof that the new deployed workflow has been exercised against the real provider.
