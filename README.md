# Robinson Google Workspace MCP

[![ci](https://github.com/Robinson-AI-Systems/google-workspace-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Robinson-AI-Systems/google-workspace-mcp/actions/workflows/ci.yml)

A Claude connector that gives Claude real, working control over your Google Workspace — not just email and calendar, but the admin side too: creating/suspending users, managing groups, adding domains and aliases, pushing Chrome policies, running security audits, and more. **354 tools** across every major Google Workspace service, and it can hold sign-ins for more than one mailbox (e.g. one per business on the same Workspace), with each Claude connection bound to the one you pick.

Built for one goal: you should be able to tell Claude what you want done in Google Workspace — in plain English — and have it actually happen, without you opening the admin console.

## Roadmap and how to contribute

The implementation plan lives in [`docs/plan/`](docs/plan/README.md): current
architecture, ordered task cards with acceptance checks, the test strategy,
and a paste-ready prompt for the implementing model (Claude Sonnet 5.5). Start
with `docs/plan/README.md`.

## Developing

Use Node 20 (what the automatic checks on GitHub use; `package.json` accepts 18 or newer).

```
npm ci            # install
npm run check     # syntax check every source file, plus the "every changing tool is safe" check
npm test          # unit tests (35 files, 1014 tests, about half a minute, touches nothing real)
npm run test:db   # database tests; needs TEST_DATABASE_URL pointing at any Postgres or a Neon branch
```

- Tests never call Google or the real database. `test/helpers/fake-google.js` stands in for the Google clients and `test/helpers/fake-db.js` for `src/db.js`; `test/contract/db-contract.js` runs the same checks against both so the fake cannot drift from the real thing. Database tests work inside their own temporary schema and clean up after themselves.
- Never put a real token, passphrase or key in a test or a log. Tests use obviously fake values.
- Database changes must be additive (`IF NOT EXISTS`); old and new code run against the same database at once.
- Keep pull requests coherent and keep the ledger row in `docs/plan/TASKS.md` current in the same PR. Tightly related cards may be grouped when that reduces CI churn without weakening review or acceptance checks. The full rules are in [`docs/plan/`](docs/plan/README.md).
- GitHub runs check, unit tests and database tests (on a throwaway Postgres) on every pull request.

## What's covered

| Area | Tools | Examples |
|---|---|---|
| Gmail | 56 | send/read/search mail, labels, filters, vacation responder, delegates, forwarding |
| Drive | 36 | files, folders, sharing, permissions, revisions, trash, export |
| Calendar | 21 | events, sharing, recurring events, Meet links, free/busy |
| Sheets | 23 | read/write cells, formatting, sorting, conditional formatting, protection |
| Docs | 15 | create/edit content, tables, images, export to PDF/Word |
| Slides | 14 | build decks, shapes, images, text, export |
| Forms | 8 | create forms, questions, read responses |
| Tasks | 11 | task lists and tasks |
| Contacts / Directory | 9 | personal contacts + company directory search |
| **Admin: users/groups/orgunits/domains/aliases/roles/devices** | 92 | the core of "manage my whole Workspace"; `admin_update_group_settings` also sets a group's reply-to routing, message and spam moderation, who can post, view, discover and contact it, the collaborative inbox and the footer (for shared inboxes like support@) |
| Admin Reports | 8 | login/admin/drive/groups audit logs, usage reports |
| Licensing | 5 | assign/reassign Workspace licenses |
| Chat | 8 | spaces, messages, members |
| Chrome Policy | 3 | push Chrome/ChromeOS settings without the console |
| Cloud Identity | 3 | nested group membership, security posture |
| Domain verification | 3 | verify a new domain end-to-end |
| Vault | 5 | legal holds, matters |
| Data Transfer | 3 | bulk-transfer a departing employee's files |
| **Mailbox branding (delegated)** | 2 | `workflow_brand_mailbox` sets sender name, signature and send-as aliases on any user's Gmail via domain-wide delegation; `workspace_delegation_status` checks the setup |
| **Accounts, connections, change log** | 8 | `workspace_whoami` (which mailbox this connection acts as), list/default/remove connected Google accounts, `workspace_set_allowed_domains` (which domains a connection may manage), `workspace_list_connections` / `workspace_revoke_connection` (which Claude connections exist; switch one off), `workspace_recent_changes` (what was changed through this server) |
| **DNS (domains hosted at Vercel)** | 3 | `dns_list_records`, `dns_add_record`, `dns_delete_record`; refuses any domain whose DNS lives somewhere else |
| **Business calendar and folders** | 2 | `workspace_business_calendar`, `workspace_business_folders`: find (or, only if missing, create) a business's calendar and standard Drive folders and remember their IDs for the business apps |
| **Operations checks and inbox triage** | 9 | `workflow_email_health` (MX/SPF/DKIM/DMARC with the exact record to add), `workflow_health_report` (2SV, admins, risky apps, forwarding, stale accounts, licences), `workflow_weekly_digest`, `workspace_where_is_setting` (clicks for settings Google has no API for), `workspace_plan_summary`, `workflow_search_presence_check`, `calendar_update_calendar`, `gmail_inbox_summary`, `gmail_find_unanswered` |
| **Workflows (compound actions)** | 7 | `workflow_add_staff_member` (account, role addresses, business calendar and Drive folder at the right level, mailbox branding; safe to run twice), `workflow_set_up_business` (domain, org unit, owner, role addresses, calendar, standard Drive folders, branding, email health; stops at the DNS step), `workflow_onboard_employee`, `workflow_offboard_employee`, `workflow_add_domain_and_start_verification`, `workflow_audit_external_sharing`, `workflow_security_snapshot` |

(The rows add up to the 354 tools the server loads; the home page of the running server prints the same number.)

The "workflow_*" tools are the ones worth knowing about specifically: instead of you (or Claude) stringing together six separate admin calls to offboard someone, `workflow_offboard_employee` does the whole checklist — suspend, sign out everywhere, revoke third-party app access, revoke app passwords, transfer their files, remove from all groups — in one call.

For a plain-English list of what to ask Claude for, see [docs/OWNER-GUIDE.md](docs/OWNER-GUIDE.md).

## How it runs

It runs hosted, on Vercel, with your login token stored in Neon (Postgres), so claude.ai can reach it from your phone, browser, anywhere. Setup is in `DEPLOY.md`. (The old "run on one computer" mode was retired; nothing in the hosted setup needed it.)

## How it signs in to Google

- **Your own sign-in (OAuth)** — you log in once as yourself. If that account is a Workspace super admin, every admin tool works too.
- **A separate robot identity (service account with domain-wide delegation)** — lets a few tools act *inside other people's* mailboxes, calendars and Drive without each person logging in. Setup, including the exact permission list to paste into the Admin console, is in `DEPLOY.md` (Part 5).

## A few things worth knowing

- **Each connection stays in its own business.** The admin tools (users, groups, domains, licenses, data transfer, Vault) refuse to touch an address or domain outside the domains allowed for the account the connection acts as. By default that is the account's own domain, so the Appliance Rentals connection cannot casually change AI Systems users. If a business has more than one domain, or you really want one connection to reach another, run `workspace_set_allowed_domains` (needs `confirm: true`), or pass `crossDomain: true` on a single call. It checks the addresses and domain names you give; a bare user ID or a list-everything call carries no domain and is not checked.

- **Safety on every tool that changes things.** 191 tools accept `dryRun: true` to preview exactly what would change, and 120 of them (everything that deletes, sends email or chat messages, suspends, resets, changes forwarding, access, roles, domains, security or licences) do nothing until you pass `confirm: true`. A check that runs on every change (`scripts/check-writes.mjs`) fails if a new tool whose name contains a changing word (create, update, delete, send, share and so on) ships without this. It matches on names, so a tool named with a verb it does not know is not caught (see the last point below). Some general tools only need `confirm` for risky uses: `admin_update_user` when it suspends, resets a password or changes admin rights; `drive_share_file` for public links; `admin_update_group_settings` when it opens a group to outsiders or the whole internet, switches message approval off or lets spam straight through; `gmail_create_filter` when it forwards; the bulk document/sheet/slide/form editors when they delete. `confirmed` in the result is true only if Google really shows what was asked for (null when nothing could be read back). After a change the tool asks Google what it now holds and returns that (plus whether it could confirm), and the change goes in the change log (`workspace_recent_changes`; previews are hidden unless `includeDryRuns: true`). The full list is the table in `src/tools/guards.js`.

- **Nothing here is placeholder code.** Every tool calls the real Google API method it claims to. A handful of things Google's public APIs genuinely cannot do (some settings only exist in the admin console UI) are left out rather than faked. `workspace_where_is_setting` gives the console clicks for those.
- **Three Alert Center tools cannot be used yet.** `admin_list_alerts`, `admin_get_alert` and `admin_delete_alert` are in the list, but Google's sign-in screen refuses the Alert Center permission (it is a limited-availability API), so the sign-in does not ask for it and Google will turn these three calls down. `workflow_security_snapshot` carries on without alerts. They start working if Google allows the permission for this project or the robot identity is given the permission later.
- **Data Transfer API** (`datatransfer_*` tools, used by `workflow_offboard_employee`) isn't in Google's current client library, so it's implemented as a direct REST call — same effect, just built by hand instead of generated.
- **The safety layer covers almost every tool that changes things.** Deletes, suspensions, revocations, transfers, sending, sharing and the other changes all use the dry-run / confirmation / read-back / change-log layer described above, and every new changing tool is built with it. Eleven small tools still change things without it, and the name-based check does not catch them because their names use verbs it does not list: `gmail_untrash_message`, `gmail_untrash_thread`, `sheets_duplicate_sheet`, `sheets_format_cells`, `sheets_freeze_rows`, `sheets_autoresize_columns`, `sheets_sort_range`, `sheets_merge_cells`, `sheets_unmerge_cells`, `sheets_protect_range` and `domain_confirm_verification`. None of them deletes anything; wrapping them is the remaining part of card P5-1.
