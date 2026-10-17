# Architecture — maintained through October 12, 2026

## Current completion and release state — October 17, 2026 UTC

All 29 required acceptance tasks and all 48 required roadmap subsections are complete. Workspace PR197 and Hub PR227 record genuine local/direct, encrypted GitHub-only relay, Sandbox direct, native Hub audit/read, same-pass revocation and cleanup. See [final route evidence](evidence/2026-10-17-final-hub-route-acceptance.json). The independent Workspace server remains usable without Hub; only optional P8-6 is on request. The owner has now requested a checked Workspace release after this documentation and Git closeout; the final released SHA/deployment belongs in the merged PR's permanent release receipt. Earlier dated pending observations below are historical, not new work or permission requests.

Encrypted-only cutover is already complete for both accounts (account/legacy plaintext zero); do not replay activation. Alert Center delegation and protected runtime opt-in are approved and enabled, with a genuine empty list verified. The three no-resource exact GET development contracts, retired unsupported operation and two owner-excluded Vault live positives retain their original limits; completion does not claim every Google operation has a live positive fixture.


Read this before touching code. It describes what exists, why, and the
conventions every card must keep. Where the code and this page disagree, the
code is the truth and this page gets fixed in the same PR. (Last full audit of
this page against the code: 2026-10-02, at the merge of PR #23. At that point
the server loaded 354 tools and the unit tests ran 993 passing tests in 34 files.)

## One-paragraph summary

A Node.js (ES modules) MCP server. It runs as Vercel serverless functions under
`api/`, keeps all state in a Neon Postgres database, and is reached by Claude at
`https://<host>/api/mcp` with a bearer token the server itself issued. It holds
Google sign-ins for one or more mailboxes (`google_accounts`); each Claude
connection is bound to one of them at login. Tool calls act as that mailbox
through the Google APIs. A separate, narrowly scoped service account (the
"robot identity") lets a few tools act *inside* other users' Gmail settings,
and is authorized for calendar and `drive.file` in reserve. Every tool that
changes things goes through a safety layer (preview, confirmation, read-back,
change log). The assembled catalog currently covers 375 operations (161 reviewed reads, 209 proven guarded writes, five protected meta dispatchers). The old local stdio mode was retired on Chris's decision
(2026-10-02); the server is hosted-only.

## Request path (hosted)

```
Claude ──bearer──▶ api/mcp.js
                     │ initSchema()           additive CREATE/ALTER IF NOT EXISTS
                     │ getAccessToken(token)  → oauth_tokens row (has google_account; revoked tokens are refused)
                     │ ensureMigrated()       legacy single-account → google_accounts (copy, once)
                     │ buildServer(account)
                     ▼
               tool handler(args, clients)     (the registry, see "Tool registry layers")
                     │ clients = buildHostedApiClients(account)
                     │   → OAuth2 client with that account's stored tokens (auto-refresh, persisted)
                     │   → lazy googleapis clients: gmail, drive, calendar, admin, …
                     ▼
               ok(value) | errorResult(err)    src/tools/util.js; errorResult translates Google errors (src/tools/errors.js)
```

`api/mcp.js` creates a fresh MCP `Server` + `StreamableHTTPServerTransport`
per request (serverless has no memory between calls). It also stamps
`oauth_tokens.last_used_at` (at most once a minute per token). The home page
(`api/index.js`) prints how many tools the registry loaded.

## Tool registry layers

`src/tools/index.js` builds the registry in four steps:

1. `mergeNamespaces([...modules])` joins registered tool modules.
   Duplicate tool names throw at import time.
2. `applyGuards(...)` (`src/tools/guards.js` plus `guards-mail.js`,
   `guards-files.js`, `guards-admin.js`) wraps existing changing tools with the
   safety layer (see "Safety layer").
3. `applyDomainGuard(...)` (`src/tools/domain-guard.js`) keeps a connection
   inside its own business: admin-family tools (`admin_`, `licensing_`,
   `datatransfer_`, `workflow_`, `identity_`, `reports_`, `vault_`, `dns_`)
   refuse an address or domain outside the account's `allowed_domains` unless
   the call says `crossDomain: true`. It checks only the addresses and domain
   names given in the arguments; a bare user ID, `me` or `all` is let through.

4. `applyResultRules(...)` (`src/rtc/results.js`) ensures bounded results and structured RTC return behavior. The complete assembled registry passes an exact semantic mutation audit and is the source of `npm run gen:catalog`. The generated README catalog is checked in CI; no manual totals or hand-picked aliases.

## Connector login (how Claude gets its bearer token)

OAuth 2.1 with PKCE, served by the files under `api/oauth/` and
`api/well-known/`:

1. Claude discovers metadata at `/.well-known/oauth-authorization-server`.
2. Claude registers a client (`api/oauth/register.js`, dynamic registration →
   `oauth_clients`).
3. Claude sends the person to `api/oauth/authorize.js`: a page with an
   **account dropdown** (which `google_accounts` row this connection acts as)
   and the **passphrase** (`ADMIN_PASSPHRASE` env var). The passphrase is
   compared in constant time, and every attempt is recorded in `login_attempts`
   (`src/oauth/login-guard.js`): after 5 wrong tries from one address within 15
   minutes the address is refused with a plain message and the passphrase is
   not even checked. On success it stores an auth code in `oauth_codes` with
   `google_account`.
4. Claude exchanges the code at `api/oauth/token.js` → `oauth_tokens` row with
   `google_account`; 30-day access token plus refresh token.
5. Refresh: only honored if the refresh token exists in `oauth_tokens` for the
   same client (fixed in PR #4; before that, anyone could mint tokens).
6. A connection can be switched off by hand (`workspace_revoke_connection` sets
   `revoked_at`); `workspace_list_connections` shows who is connected.

## Google sign-in (how the server gets Google tokens)

`api/google/authorize.js` → Google consent (all `ALL_SCOPES`, with
`login_hint` from `?account=`) → `api/google/callback.js` →
`handleGoogleCallback` asks Gmail `users.getProfile('me')` which mailbox
approved, then `saveGoogleTokensFor(email, tokens, {label})`. The first
account ever saved becomes `is_default`. Tokens merge with `||` so a refresh
that omits `refresh_token` keeps the old one.

If `TOKEN_ENCRYPTION_KEY` is set, the tokens are also stored encrypted
(`google_accounts.tokens_enc`, AES-256-GCM, `src/crypto.js`) and the encrypted
copy is read first; if it cannot be read the server falls back to the plain
copy and re-encrypts it, so a wrong or lost key never locks anyone out. The
plain copy keeps being written until card P5-2.

Scope notes (`src/auth/scopes.js`): the Alert Center permission is deliberately
absent from ordinary user OAuth because Google requires service-account domain-wide delegation instead. The separate owner-approved `apps.alerts` path and runtime opt-in are documented in DEPLOY.md. The four Classroom
permissions are still requested although no tool uses Classroom (see "Known
gaps").

## Delegation (acting inside another user's mailbox)

`src/auth/service-account.js` loads `GOOGLE_SERVICE_ACCOUNT_JSON` (raw or
base64) and builds a `google.auth.JWT` with `subject = userEmail`.
`DELEGATED_SCOPES` is exactly four permissions: Gmail settings basic + sharing,
`calendar`, and `drive.file` (the last two added 2026-10-02 at Chris's written
approval, with the Admin console entry updated to match; `workspace_delegation_status`
reported all four working on 2026-10-02). Nothing ever asks for all four at
once: each call requests only the subset it needs (`buildDelegatedAuth`,
`delegatedClients`).

Who uses it: the Gmail pair is used by the mailbox tools
(`workflow_brand_mailbox`, offboarding, adding staff, the health report).
`calendar` and `drive.file` are held in reserve for the business apps: today
only `workspace_delegation_status` exercises them, because
`workspace_business_calendar` and `workspace_business_folders` act as the
connection's own account. A broader "act as any user on any tool" design was
considered and rejected as too wide a grant.

Service account in use: `robinson-s-toolkit-mcp@robinsons-toolkit-mcp.iam.gserviceaccount.com`
(client ID 115576530222062805971), authorized in Admin console → Security →
API controls → Domain-wide delegation.

## Database (Neon, project `google-workspace-mcp`, `long-king-81663618`)

| Table | Purpose | Notes |
| --- | --- | --- |
| `google_accounts` | One row per mailbox: `email` PK, `label`, `tokens` JSONB, `tokens_enc` (encrypted copy), `allowed_domains` (NULL = own domain only), `is_default` | Plain `tokens` still written until P5-2 |
| `google_auth` | **Legacy** single-account row (`id=1`) | Kept on purpose; old code reads it. Chris drops by hand later |
| `oauth_clients` | Claude's registered clients | |
| `oauth_codes` | Short-lived auth codes, with `google_account` | |
| `oauth_tokens` | Bearer + refresh tokens, `client_id`, `google_account` (NULL = default), `last_used_at`, `revoked_at` | |
| `login_attempts` | Every try at the passphrase page: `ip`, `attempted_at`, `success` | Drives the 5-tries-in-15-minutes lockout |
| `change_log` | Every change made through the server: `at`, `acting_as`, `connection`, `tool`, `target`, `summary`, `before`, `after`, `dry_run` | Secrets are redacted before storing (`src/changelog.js`) |
| `business_resources` | Google IDs the business apps look up: `business`, `kind`, `key`, `google_id` | Written by the business calendar/folder tools |

### Database rules

- Automatic Vercel branch previews are **disabled** under the October 12 hosting policy. The live service follows only checked, scheduled at-most-daily `main → live` promotion; do not manually deploy. Old and new code run against the same database at the same
  time. Therefore: additive changes only, idempotent `initSchema`, and never
  move or delete data a previous version reads.
- `initSchema()` runs on every request. Keep it cheap: `IF NOT EXISTS` only.
- Database tests run in their own temporary schema (`test/db/upgrade.test.js`,
  `test/contract/db-contract.js`), never in production. CI runs them on a
  throwaway Postgres on every PR; locally set `TEST_DATABASE_URL` to any
  Postgres or a Neon branch. `scripts/test-db-upgrade.mjs` is a thin wrapper
  around the same tests. The Neon branch `test-multi-account-upgrade`
  (br-soft-meadow-b7726s0b) exists from 2026-09-30 and may be reused or
  deleted by Chris.

## Environment variables (Vercel)

`DATABASE_URL`, `ADMIN_PASSPHRASE`, `GOOGLE_OAUTH_CLIENT_ID`,
`GOOGLE_OAUTH_CLIENT_SECRET`, `PUBLIC_BASE_URL`, `GOOGLE_SERVICE_ACCOUNT_JSON`
(all environments). Optional: `TOKEN_ENCRYPTION_KEY` (DEPLOY.md Part 6; all
environments) and `VERCEL_API_TOKEN` + `VERCEL_TEAM_ID` for the DNS tools
(DEPLOY.md Part 7; Production only; the token is marked Sensitive). Never
print any of them.

## Tool module convention

Each file in `src/tools/` exports:

```js
export const tools = [ { name, description, inputSchema }, … ];
export const handlers = { [name]: async (args, clients) => ok(...) };
```

- Names are `service_verb_object` in snake_case; workflows are `workflow_*`;
  server-about-itself tools are `workspace_*`; Vercel DNS tools are `dns_*`.
- Handlers receive `clients` from `buildHostedApiClients` (`gmail`, `drive`,
  `calendar`, `sheets`, `docs`, `slides`, `forms`, `tasks`, `people`, `chat`,
  `classroom`, `admin`, `adminReports`, `groupssettings`, `licensing`,
  `datatransfer`, `alertcenter`, `chromepolicy`, `cloudidentity`,
  `siteVerification`, `vault`; built on first use) plus `actingAs` (email).
- Return `ok(value)`; throw or let Google throw and `api/mcp.js` wraps it with
  `errorResult`, which turns known Google errors into "what happened, likely
  cause, what to do" and keeps the raw message under "Technical detail".
- A new tool that changes things is built with `defineWrite` (below), not as a
  bare handler.
- Descriptions are written for Claude *and* for Chris: say what it does, what
  it needs, and anything irreversible.

## Safety layer (every tool that changes things)

- **`defineWrite`** (`src/tools/write.js`) builds a new changing tool from four
  pieces (plan, apply, read-before, read-after). It adds `dryRun` and, when the
  tool is destructive (or risky for this call), `confirm`; runs the plan first;
  refuses without `confirm: true`; applies; asks Google what it now holds and
  returns that (plus whether the result could be confirmed); writes a
  `change_log` row.
- **`guard`** (same file) wraps an older tool's handler the same way. The table
  of every wrapped tool, with how to describe it and how to read before/after,
  is `src/tools/guards*.js`. `test/unit/guards.test.js` fails if a tool with
  `_delete` in its name has no entry.
- **Group settings** have one source of truth, `src/tools/group-settings.js`: every setting `admin_update_group_settings` can change, the values Google accepts, and the check that turns a request into the body Google wants. The tool and its guard entry (`guards-admin.js`) both import it, so the preview text, the confirmation rules and the read-back cannot disagree about which settings exist.
- **`scripts/check-writes.mjs`** runs in `npm run check` and CI. It fails when
  a tool whose name matches its list of changing verbs has no `dryRun`. It
  matches on names only, which is why the gap below exists.
- At the audit date: 191 tools accept `dryRun`, 120 of them also require or
  conditionally require `confirm`.

## Robinson Tool Contract (Phase 8; partial integration, not certified)

P8-4 exposes eight generic OpenAPI operations from `src/rtc/openapi.js`, including
explicit service-pass bearer authentication, public metadata, authorized discovery,
request/result schemas, bounded batch and UTF-8 result recovery, and RTC error codes.
Provider schemas remain available via authorized tool discovery; they are not expanded
into hundreds of OpenAPI operations. Invalid configured server URLs fall back to the
serving origin. The gateway rejects ambiguous query values and non-object POST bodies
before dispatch, returns sanitized RTC errors for thrown failures, and treats failed
writes as uncertain until read back. `createRtcGateway()` owns only an initialization
latch per instance; authorization, revocation and atomic per-pass limits remain in the
shared DB. Atomic charges also prune only that pass’s obsolete windows in the same
SQL statement; another pass’s receipts stay untouched. The P8-4 DB test uses two independently constructed handlers and a pool of
real concurrent PostgreSQL backends, including configured limits and window rollover.
Source/local/CI evidence remains separate from deployed or genuine Google acceptance.

RTC profiles, metadata, bounded result handles, guarded HTTPS tool routes and short-lived read-only TEST passes are implemented and locally tested. The authoritative completed implementation and accepted external proofs live in `TASKS.md`. Neither pinned Hub reference conformance nor simulated Google proves protected deployed direct/relay/Sandbox and revocation against a real service. Never widen scopes or treat test profile acceptance as production activation.

## Known Bugs — genuine acceptance follow-up, October16,2026

The final smoke report/casebook supersedes unresolved wording in this recovery chronology. All authorized fixture cleanup and required acceptance are complete; retained resource, edition and owner-exclusion limitations are documented rather than counted as live positive results.

| Check | Actual result and disposition | Re-entry |
| --- | --- | --- |
| Completion consent coexistence | Reproduced isolated-consent replacement; released protected completion_read requests exactly the three already approved scopes together. Genuine owner-approved combined consent succeeded on READYf96. | Resolved: actual Tasks/Postmaster/Site scope checks and six-API/four-scope readiness pass before and after genuine saved-grant refresh; both connected accounts encrypted ready. No broader scope or new release. |
| Building create floors | Exact approved creation returned opaque503; exact recovery404 found no object. Independent Google contract requires at least one floorNames entry, but tool cannot expose/forward it. Repair requires/forwards floors, refuses invalid input before provider access and checks independent ordered-floor readback. | Resolved required-floor contract: actual READYf96 tagged creation/exact positive read/guarded audited cleanup/independent404 pass; original opaque503 cause still unknown. All created Admin objects cleaned, extended28reads/7requests used exactly. |
| Postmaster v1 retirement after API enablement | V2 read adapter/protected consent released on READY6ec69ce; permission retention after refresh verified. Owner-approved domain registration/additiveTXT/Google ownership verification now complete; exact originalTEST domain OWNER/VERIFIED and bounded7day traffic query200/native empty stats. | Resolved source, permission, domain verification and traffic-read gates. Google reports Not enough data; missing metrics are unknown, not healthy delivery. Existing14DNSrecords preserved; no sends, users, purchase or extra release. |
| Root organizational-unit lookup | Actual READY06cf root GET returned organizational-unit collection, not exact root. Chrome correctly refused it; admin_get_orgunit incorrectly returned collection as resource. Shared exact-root lookup selects exactly one parent-inclusive root with ID. | Resolved: actual owner-approved READY5138204 exact-root and Chrome-root regressions pass with original readonly principals; no policy write. |
| Site Verification and Chrome filter | Retained403; webResource.list requires absent siteverification consent purpose. Correct schema-list filter field is name, not schemaName; corrected schema read and nonroot resolution pass current live. | Exact scope owner-approved17:30:56Z; isolated purpose released5138204 and live form contract verified. Genuine Google consent pending browser recovery; no DNS/verification/ownership write. |
| Admin Console notifications | Deployed8ce3d7b calls absent `admin.notifications.list`; actual Google SDK has no notifications resource. Repair returns explicit `not_readable/provider_method_unavailable` and manual Console guidance, never an empty verified list. No claim that the API itself is definitively discontinued. | Checked repair release; retain provider/API limitation in full casebook. |
| Tasks / People profile / Vault | Owner-approved four-scope consent completed on READY75fadc4. Real token-info proves all four granted; all six app APIs ready, exact self People ready. Vault denied metadata despite scope. Owner2026-10-16T13:59 explicitly excludes actual Vault connection testing because the subscription upgrade is unneeded. | Preserve denied history and grant proof, perform no further live Vault probes or upgrade; exclusion is not a Vault success. |
| Omitted empty Directory / People lists | Actual groups `{kind,etag}` and directory/contact `{}` did not meet the casebook's native collection proof. Known SDK list boundaries now retain the documented empty named arrays and cursors; error, unrelated and malformed payloads refuse. | Checked repair release and genuine read_only casebook retest; synthetic tests do not close P0-2. |
| Installed SDK / existing provider request defects | Offline pinned-SDK scan found Forms publishing absent; targeted contract review found Chrome OU paths used as IDs and missing policy field masks, and nested-membership handler used direct-only listing. Repairs preserve guards, same auth, exact OU lookup, named-field update mask, actual transitive endpoint and bounded pagination; security metadata includes mailbox identity. | Release then run only authorized read cases with eligible resource/pass/Google permissions. No live Forms publish or Chrome policy write was authorized or performed. Premium-only transitive denial remains an honest denial; no upgrade. |
| Chrome/domain area issuance | Actual Chrome schema read403outside_scope; registry advertises Chrome and domain areas, while neither pass issuance nor OAuth connector validator accepts those names. Repair adds both exact areas to both lists; no remap or widening of existing grants. | Checked release and separately explicit missing-area read_only grant, if selected; current14-area pass remains useful unchanged. |
| Catalog checker: empty Gmail snippet / delegation metadata | Genuine read_only66-call run found valid native empty-string thread snippet rejected;8 further metadata reads found configured/scopes service metadata missing generic report markers. Fixed targeted type/handler proofs; fresh exact reads both pass. Native resource ID/cursor/row caps and configured/scopes/identity checks retained; internal metadata classified service_shape, not provider proof. | Resolved by real retests on unchanged8ce provider source; retain original failed receipts and source regression. |
| Remaining catalog read scopes / Chrome schema parameter | Actual approved transitive group read503 insufficient permission. Enrollment omitted Cloud Identity group, Chrome Policy and Chat membership read scopes; separate owner-protected `catalog_read` purpose requests exactly those three, without changing standard or previous consent. Installed Chrome SDK and official schema-list endpoint require `parent`, not `customer`; corrected and tested through generated client. | Checked repair release, separately explicit Google consent and missing Chrome area TEST grant; no automatic grant widening. Retain partial/UNKNOWN group receipt, never repeat the exhausted six-call cycle. |
| Calendar fractional availability / wrapped provider statuses | READYf1b1200 returned whole-second busy bounds with the exact fractional query echo, causing false unreadable readiness. Candidate accepts only precisely floored boundary-second start, validates exact echoed interval and retains all other bounds/errors/identity refusal. Actual post-delete Chat read permission denial was wrapped as503; numeric401/403/429 now survive wrapped MCP errors with tested finite status markers; unknown/contradictory errors stay503. | Checked merge/release and same retained exact secondary Calendar fractional readback; existing deleted Chat ID provides nonmutating permission-status regression. No new fixture or blanket retry. |
| Usage report date | October14 not available; existing usage-read grant ready. Older October9 customer and actor reports both returned verified native arrays. Resolved by explicit older date; no code or grant change needed. | Preserve initial failures and successful retest. |
| Exact app resources | Original cleaned Drive/Calendar fixtures give expected trashed/missing evidence; no active tagged replacements discovered. Chat DMs were not treated as test spaces, contact discovery did not yield an exact positive resource. | Approved active owned test resources plus missing read consent; no automatic fixture creation. |

Current released regression/cleanup receipts: `evidence/2026-10-16-completion-push.json`. Earlier sanitized actual receipts: `evidence/2026-10-16-approved-read-progress.json`.
These observations used the approved TEST/full credential only for read operations;
they do not satisfy the full-catalog runner's separate read_only credential gate.

## Known gaps (as of 2026-10-02)

Historical initial inventory: the current completed ledger and final developer casebook supersede these original pending descriptions; they do not reopen completed cards.

| Where | What | Card |
| --- | --- | --- |
| `gmail_untrash_message`, `gmail_untrash_thread`, `sheets_duplicate_sheet`, `sheets_format_cells`, `sheets_freeze_rows`, `sheets_autoresize_columns`, `sheets_sort_range`, `sheets_merge_cells`, `sheets_unmerge_cells`, `sheets_protect_range`, `domain_confirm_verification` | Change things with no `dryRun`, read-back or change-log row, and `check-writes.mjs` does not catch them because their verbs are not in its list. None deletes anything | P5-1 (finish) |
| `admin_list_alerts`, `admin_get_alert`, `admin_delete_alert` | Requires separately approved service-account DWD and runtime opt-in; user OAuth cannot authorize it | Corrected in PR194; activation evidence in `evidence/2026-10-16-alert-center-activation.json` |
| `src/auth/scopes.js` `classroom` group | The sign-in asks for four Classroom permissions but no tool uses Classroom | Cleanup, needs every account to re-authorize if removed |
| Read-only smoke test (`scripts/smoke-readonly.mjs`) | Does not exist yet, so tools that never worked against a real account are not yet found | P0-2 |
| `google_accounts.tokens` | Original gap resolved: encrypted-only storage active, both account/legacy plaintext counts zero | P5-2 complete; owner removed the waiting date, readiness and protected activation proof retained |
| Version, changelog, generated tool catalog | `package.json` is 2.0.0; generated README catalog and changelog maintained by `npm run gen:catalog` and semantic CI | P5-4 |

Fixed since the first version of this page (kept so old PR text still makes
sense): `drive_upload_file` Buffer bug (P0-3), licensing customer ID and
plain error when the API is off (P2-6), group settings limited to six fields (P6-1: reply-to routing, moderation and more now reachable), no tool to set the calendar time zone
(P2-1), no safe single DNS record tool (P2-3), no lockout or constant-time
passphrase compare (P0-5), no connection list or revocation (P1-1).

## What exists outside this repo that the server depends on

- **Google Cloud project** holding the OAuth client (under Chris's personal
  Google account) and the service account (`robinsons-toolkit-mcp`). Moving
  these under the business Workspace is a someday cleanup, not in this plan.
- **Google Admin console** domain-wide delegation entry for the service
  account's client ID with the four scopes above.
- **Vercel project** `google-workspace-mcp` (team `team_PUafLQmqT7LYBaBs8lEOPYMG`),
  production alias `google-workspace-mcp-chris-projects-de6cd1bf.vercel.app`
  (also `-five.vercel.app`).
- **Two Workspace accounts** connected: `ops@robinsonaisystems.com` (default,
  "Migrated from single-account setup") and
  `ops@robinsonappliancerentals.com` ("Appliance Rentals"). Both are super
  admins; both have 2-step verification enforced.


### Reports audit expansion (P7-3)

`reports_activity` reads only Google's allowlisted Admin SDK Reports application names (including Calendar, Meet, Chat, SAML/SSO, rules, security and login). It preserves the provider paging cursor, refuses unknown names locally and caps page size without enabling `includeSensitiveData`. Existing named Reports tools retain their previous response shape. One additional audited read is included in the assembled semantic inventory; plan availability and actual Google provider acceptance remain separately unverified.


### P7-4 Gmail Postmaster read-only visibility

The owner-approved legacy `postmaster.readonly` grant remains unchanged. After the
owner enabled the existing API, a bounded TEST read demonstrated unsupported v1.
The repair uses a small v2 REST adapter because the pinned generated SDK has no v2
constructor. Only domain GET/list and domainStats query are exposed; tool names,
allowed-domain guards, date limits and pagination remain. Daily v2 spam,
authentication and delivery-error ratios normalize into the existing output;
metrics can span pages, and duplicate metric/day observations fail closed. Domain
and IP reputation are unavailable in v2 and never invented. Missing observations
remain unknown. Exact owner approval, consent, checked release and domain-list read are now
verified on READY6ec69ce. Subsequent exact owner-approved domain setup and
seven-day traffic query also pass; native stats are empty, with no health claim. V2 requires: `postmaster.domain` permits viewing AND managing domains, and
`postmaster.traffic.readonly` permits traffic reads. Standard and previous isolated scopes remain unchanged. The owner-approved
postmaster_v2_read purpose requests the two replacements plus existing Tasks/Site
grants together. No domain/user mutation is implemented.

Official contracts reviewed October 16, 2026:
- https://developers.google.com/workspace/gmail/postmaster/reference/rest/v2/domains/list
- https://developers.google.com/workspace/gmail/postmaster/reference/rest/v2/domains.domainStats/query
- https://developers.google.com/workspace/gmail/postmaster/reference/rest/v2/MetricDefinition
- https://developers.google.com/workspace/gmail/postmaster/reference/rest/v2/TimeQuery
- https://developers.google.com/workspace/gmail/postmaster/reference/rest/v2/QueryDomainStatsResponse
- https://developers.google.com/identity/protocols/oauth2/scopes#gmailpostmastertools

### P7-2 customer-policy audit limitation

The Cloud Identity Policy API provides explicitly set customer/OU/group rules, **not** effective per-domain reduced settings. `identity_list_policies` and `identity_policy_audit` compare a documented editable baseline from `src/data/policy-baseline.json`; absent and inherited fields are marked `not_readable` instead of falsely green. A domain argument is a business authorization boundary, not a Google provider filter: **business-restricted connections must explicitly use `crossDomain:true` with owner approval** to see customer-wide policies. Read-only OAuth scope `cloud-identity.policies.readonly` requires existing connections to reauthorize and an API-enabled Super Admin. A verified live read and full settings coverage remain outstanding P7-2 acceptance; no service-account delegation scope is added.


### Policy baseline expansion and precedence of evidence (P7-2 follow-up)

The editable `src/data/policy-baseline.json` contains 21 vetted, uniquely identified checks across seven supported settings areas. A validated typed comparison supports equality and numeric minimums (password length). A confirmed explicit mismatch is never suppressed by missing entries, unknown inherited values or a paginated provider result: it remains `needs_attention`; observations absent or incomplete without a contradiction remain `not_readable`. Matches apply to the **observed explicit policy only** and never certify effective OU/group/domain settings. This is a review baseline, not a mandatory universal configuration; the owner may deliberately revise rules before any audit results are treated as recommendations.


### P8-1 typed read compatibility — nine operations after planned #55

The registry advertises schemas for four existing JSON workflows and five newer read-only report surfaces (`reports_activity`, `postmaster_list_domains`, `postmaster_list_traffic_stats`, `identity_list_policies`, `identity_policy_audit`). A schema-checked successful full JSON response receives `structuredContent`; malformed returned success becomes an error. Large results retain the same connection-owned expiring handle with typed handle validation, not duplicated sensitive payloads. Explicit user `fields` projection remains partial JSON without pretending to fulfill the full-object schema; existing typed consumers must request full keys when requiring typed results. This is unit/service-side proof only, not live deployed Google/Hub acceptance.

## Gateway/shared-code boundary — 2026-10-12

Hub talks to this server's RTC HTTPS doors; direct `/api/mcp` remains independent. Provider identity, credentials,
delegation scopes, domain guard, write provenance and durable state remain service-owned. P8-6 is optional
published-export reuse, not an external protocol or deployment prerequisite. See README and TASKS recovery sections.

### P8-5/P8-7 actual service conformance and fixture recovery

The RTC manifest namespace is `workspace`; external tools still use `workspace_`.
This aligns the frozen contract's `<prefix>_` naming rule without renaming tools.
Guarded writes retain native MCP `logged:boolean` compatibility and now preserve
the real `changeId`. The HTTPS door exposes that reference as `logged:{id}` under
RTC §8; advertised workflow schemas reflect its wire receipt. An unusable receipt
cannot establish a confirmed audited change. Owned large write handles retain the
receipt metadata without exposing the stored payload. The real fixture acceptance
client accepts current receipts and legacy deployed boolean results during rollout.

Fixture runs add nullable JSONB `request_spec` (additive only). New creations bind
scenario, exact parent/calendar and explicit normalized start time to the original
run before any provider call. Different replay intent fails before another create;
legacy null-intent runs require reviewed recovery rather than silent rebinding.
`workspace_dev_get_run` is a reviewed read-only tool, available only to the same
trusted TEST account and connection. It reports immutable request, exact slots,
pending/recorded/partially-cleaned/cleaned state and next recovery action. It never
claims that ledger state is a fresh provider readback or acts on another principal.

The conformance entry point retains upstream reference tests AND runs the pinned
Hub package against actual Workspace HTTP/OAuth modules in two separate Node
processes, using an isolated real local Postgres schema and a strict stateful fake
Google provider. No production module substitutes a provider or DB. Process/import
substitution lives exclusively under test/conformance. The run covers actual
profile-preserving refresh, all named RTC probes (no missing-role skips), shared
rate limits, every fixture scenario's lost-response recovery, same-run replay,
foreign-pass refusal, immutable intent, confirmation, provider readback/audit,
exact cleanup and cleaned-run non-recreation. Missing local TEST_DATABASE_URL
fails the service conformance step; reference success cannot substitute for it.


### Final provider/developer audit — October16

- Chat spaces, fresh bounded Drive changes and exact-domain health report now
  have genuine original TEST200/strict-shape proof. Health-report operation
  success preserves its actual organization FAIL/WARN findings.
- dev_get_run is connection-owned internal metadata, explicitly not a provider
  read; retained creator200/foreign404 and PG tests are the appropriate proof.
- ChromeOS device and transfer status APIs remain supported. Their native
  inventories are empty here; real SDK/REST request/response/denial contracts
  are tested. A paid trial or real migration is not a development requirement.
- Alert Center is available to all Workspace customers but requires service
  account/DWD. Correct the user-OAuth client mismatch with separately opted-in
  apps.alerts auth; default remains off. This read-and-write scope is not added
  to existing delegation or user login. No live positive acceptance is claimed.
- The historical Directory notifications resource/scope is absent from official
  discovery20261014 and the SDK. Remove its advertised tool and obsolete scope;
  retain the historical smoke row as retired, with no invented sunset date.
- Owner removed the November1 delay. Protected explicit activation now uses
  runtime all-account integrity/refresh readiness, drain/recovery attestations,
  existing owner login/lockout and exact Origin. Fresh readiness reports include
  plaintextAccounts for next-refresh verification. Source tests are not live
  retirement. Hub discovers this service, with its own scoped grant and audit.

Final retirement review also closes the retained single-account google_auth copy: only after encrypted-only activation and a successful account refresh, clear a legacy credential whose refresh token exactly matches that account’s pre/post renewal token. Unmatched credentials and the table remain intact; no activation-time bulk erase. Sanitized inspection adds legacyPlaintextCopies; real PG tests cover unrelated-account refusal, rotation, next-refresh timing and no resurrection. Actual encrypted-only readback has completed for both connected accounts with account/legacy plaintext zero; see evidence/2026-10-16-encrypted-cutover.json.


Final released acceptance: PR194 source42afbaa independently READY; retired
notifications404 and AlertCenter503 with explicit DWD configuration reason verified
through original read-only TEST. Actual protected encrypted-only activation and
both-account saved-grant renewal/mailbox/persistence verification complete;
plaintextAccounts0, legacyPlaintextCopies0, allproblems0. Subsequent actual
Gmail-backed whoami200/matching identity. See encrypted-cutover.json and screenshot.
Catalog report/developer audit is complete with the documented resource/config
limits. Alert Center authorization and an actual empty list are now verified.
Native Hub and the separate local/direct, GitHub-only encrypted relay, Sandbox
and revocation/cleanup gates are accepted in Hub PR227 and Workspace PR197.
No reverse discovery is required; see evidence/2026-10-17-final-hub-route-acceptance.json.


Current Alert Center configuration supersedes the earlier pending authorization: explicit owner approval, saved five-scope readback, production opt-in and READY checked config redeploy completed. Original TEST list200/native empty array is genuine Google proof; exact GET remains development-tested/no-resource. See `evidence/2026-10-16-alert-center-activation.json`. No provider write test or whole-customer healthy claim.
