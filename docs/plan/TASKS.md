# Task cards

Work the cards in order. Prefer one card per PR, but tightly related cards may
be grouped when doing so reduces CI churn without weakening review or acceptance
checks. Every card has acceptance checks; a card is done only when all of them
pass and the ledger at the bottom is updated in the same PR.

Size key: **S** under a day, **M** one to two days, **L** three to five days.
Model key: default Sonnet 5.5; `[H]` = Haiku 4.5 is enough.

---

## Phase 0: Safety and hygiene

### P0-1 · Test harness and CI (M)

**Goal.** Make it possible to prove a change did not break anything.

**Build.**
- Add `vitest` as a dev dependency. `npm test` runs unit tests; `npm run test:db`
  runs database tests only when `TEST_DATABASE_URL` is set (a Neon branch).
- Create `test/helpers/fake-google.js`: a factory that returns a `clients`
  object whose every service is a recording stub (`calls` array; configurable
  `resolve`/`reject` per method path, e.g. `gmail.users.settings.sendAs.patch`).
- Create `test/helpers/fake-db.js`: an in-memory implementation of the exported
  functions in `src/db.js` for unit tests that must not touch Postgres.
- Add `.github/workflows/ci.yml`: on PR and `main`, run `npm ci`,
  `npm run check`, `npm test`. Database tests run only on `main` with
  `TEST_DATABASE_URL` from a repository secret (Chris adds it; the PR body tells
  him how in two sentences).
- Convert `scripts/test-db-upgrade.mjs` into `test/db/upgrade.test.mjs` so it
  runs under `npm run test:db`; keep the script as a thin wrapper.

**Acceptance.**
- `npm test` passes locally and in CI with at least these tests: `mergeNamespaces`
  rejects duplicate names; `workspace_whoami` returns `matches: true` with the
  fake; `workflow_brand_mailbox` with no key returns `done: false`.
- CI badge in README. A deliberately failing test turns the PR red (prove once,
  then remove).

### P0-2 · Smoke test every read-only tool against a real account (M)

**Goal.** Find the bugs nobody has hit in the 330 tools.

**Build.**
- `scripts/smoke-readonly.mjs`: given `SMOKE_ACCOUNT` (email) and a bearer
  token or direct DB access, call every tool whose name matches a read-only
  allow-list (`*_list_*`, `*_get_*`, `*_search*`, `workspace_*status`,
  `workspace_whoami`) with minimal valid arguments, and write a Markdown report
  `docs/plan/smoke-report-<date>.md`: tool, pass/fail, first line of the error.
- Never call anything that writes. The allow-list is explicit; unknown names
  are skipped and listed.

**Acceptance.**
- Report committed. Every failure is either fixed in this PR (if trivial) or
  turned into a row in the "Known bugs" table of ARCHITECTURE.md with a card
  reference.

### P0-3 · Fix Drive upload (S) `[H]` may group with P0-2

**Build.** In `src/tools/drive.js` `drive_upload_file`, wrap the buffer:
`body: Readable.from(Buffer.from(args.base64Data, 'base64'))` (import
`Readable` from `node:stream`). Same fix anywhere else `media.body` is a Buffer
(`grep -n "media:" src/tools`).

**Acceptance.** Unit test with the fake asserts `files.create` received a
stream. Manual: upload a 1 KB text file to the "01 Brand Kit" folder
(`13wK6i7n_c0WFARlglC3-glM1f8jkwcQN`) in the Appliance Rentals account and
read it back with `drive_get_file`.

### P0-4 · Upload from a URL or from GitHub (S)

**Goal.** Base64 through the chat is too expensive for anything over a few KB.

**Build.** `drive_upload_from_url { url, name, parentFolderId, mimeType? }`:
server fetches the URL (10 MB cap, 20 s timeout, http(s) only, follows up to 3
redirects) and uploads the stream. Document that GitHub "raw" URLs work for
public repos; for the private appliance-desk repo use
`https://raw.githubusercontent.com/...` with a `GITHUB_TOKEN` env var sent as a
header **only** when the host is `raw.githubusercontent.com`.

**Acceptance.** Unit test for the host check (token never sent elsewhere).
Manual: copy `docs/brand/00_Start_Here/Brand-Standards-v2.0.pdf` from the
appliance-desk repo into Drive "01 Brand Kit".

### P0-5 · Passphrase lockout and constant-time compare (S)

**Build.**
- New table `login_attempts (ip TEXT, attempted_at TIMESTAMPTZ, success BOOL)`.
- In `api/oauth/authorize.js` POST: count failures from this IP in the last 15
  minutes; at 5, respond 429 with a plain message and do not check the
  passphrase. Compare with `crypto.timingSafeEqual` on equal-length buffers.
- Record every attempt. Clear nothing (the window handles it).

**Acceptance.** Unit tests with fake-db: 5th failure locks; success after
window resets. Manual: wrong passphrase 5 times shows the lockout text.

### P0-6 · Encrypt stored Google tokens (M)

**Build.**
- `TOKEN_ENCRYPTION_KEY` env var (32 bytes, base64). `src/crypto.js` with
  `encryptJson`/`decryptJson` (AES-256-GCM, random IV, output
  `v1:<iv>:<tag>:<ciphertext>` base64).
- `google_accounts.tokens_enc TEXT` column added; readers prefer `tokens_enc`
  and fall back to `tokens`; writers write both until P5-2 removes the
  plaintext write. (Old deployments keep working.)
- If the env var is missing, log one warning per cold start and keep plaintext
  behavior; never crash.

**Acceptance.** Round-trip unit tests; tamper test (flip a byte → throws).
Database test on a Neon branch: after one request, `tokens_enc` is populated for
both accounts.

### P0-7 · Developer docs refresh (S) `[H]`

**Build.** README gets a "Developing" section: run tests, how fakes work, PR
rules, link to `docs/plan/`. Fix the tool count wherever it is hard-coded.

**Acceptance.** A new contributor can run `npm test` from the README alone.

**Phase gate P0:** review model checks: tests exist and run in CI; lockout and
encryption have tests; no secret ever appears in test fixtures or logs.

---

## Phase 1: Trust layer

### P1-1 · Change log and connections (M)

**Goal.** Chris can ask "what did you change in my Workspace this week?" and
"which Claude connections exist, and which account does each act as?"

**Build.**
- Table `change_log (id BIGSERIAL, at TIMESTAMPTZ, acting_as TEXT, connection
  TEXT, tool TEXT, target TEXT, summary TEXT, before JSONB, after JSONB,
  dry_run BOOL)`. `before`/`after` hold the read-back objects, never tokens.
- A `recordChange()` helper used by the write wrapper in P1-3; until then,
  call it explicitly from `workflow_brand_mailbox`, `admin_make_super_admin`,
  `admin_set_2sv_enforcement`, `admin_move_user_orgunit`, `admin_set_user_photo`.
- Tools: `workspace_recent_changes { since?, tool?, actingAs?, limit=50 }`,
  `workspace_list_connections` (from `oauth_tokens`: client, account, created,
  expires, last_used), `workspace_revoke_connection { accessToken_prefix,
  confirm }` (adds `revoked_at` column; `getAccessToken` ignores revoked).
- `api/mcp.js` updates `oauth_tokens.last_used_at` once per request.

**Acceptance.** Unit tests with fake-db. Manual: brand a test alias, then
`workspace_recent_changes` shows one row with before/after.

### P1-2 · Plain-English errors (S)

**Build.** Replace `errorResult` in `src/tools/util.js` with a translator:
map Google reason codes and common messages to `{ what happened, likely cause,
what to do }`. Cover at least: `forbidden`/`Access restricted to service
accounts…` (delegation needed, link to DEPLOY Part 5), `notFound`, `invalid`
(which field), `rateLimitExceeded`/`quotaExceeded` (wait N seconds),
`unauthorized_client`/`invalid_grant` (Admin console entry mismatch),
`Unauthorized operation for the given domain` (customer ID / API not enabled),
`insufficientPermissions` (which scope). Keep the raw message at the end under
"Technical detail".

**Acceptance.** Unit tests, one per mapping. Unknown errors still show the
raw message.

### P1-3 · Write wrapper: dry-run, confirm, read-back (L)

**Goal.** One place that makes every mutating tool safe.

**Build.**
- `src/tools/write.js` exports `defineWrite({ name, description, inputSchema,
  destructive: bool, plan(args, clients) → { summary, target, readBefore() },
  apply(args, clients), readAfter(args, clients) })`. It adds `dryRun` and (if
  destructive) `confirm` to the schema, runs `plan` first, returns the plan
  when `dryRun`, refuses destructive calls without `confirm: true`, calls
  `apply`, then `readAfter`, records to `change_log`, and returns
  `{ done, summary, before, after }`.
- Convert these to `defineWrite` (destructive = true): every `*_delete_*`,
  `admin_suspend_user`, `admin_delete_user`, `admin_reset_user_password`,
  `admin_sign_out_user`, `admin_make_super_admin`, `admin_action_mobile_device`,
  `admin_action_chrome_device`, `workflow_offboard_employee`,
  `gmail_batch_delete`, `gmail_update_forwarding_settings`,
  `gmail_update_vacation_settings`, `drive_delete_file`, `drive_empty_trash`,
  `calendar_delete_calendar`, `workspace_remove_account`,
  `licensing_remove_license`, `admin_delete_domain`, `admin_delete_group`.
- Convert these to `defineWrite` (destructive = false) as the exemplars for the
  rest: `admin_update_user`, `admin_add_user_alias`, `gmail_update_send_as`,
  `gmail_create_filter`, `calendar_create_event`, `drive_share_file`.
- Remaining write tools are converted in P5-1; until then they call
  `recordChange` directly.

**Acceptance.** Unit tests: dry-run never calls `apply`; destructive without
confirm refuses; read-back value is what is returned; change_log row written.
Manual: `admin_add_user_alias` with `dryRun: true` on the rentals account
returns a plan and changes nothing.

### P1-4 · Account-scoped guardrails (S)

**Build.** Each `google_accounts` row gets `allowed_domains TEXT[]` (default:
the account's own domain). Admin tools that take a `userKey`/`email`/`groupKey`
refuse targets outside `allowed_domains` for the acting account unless
`crossDomain: true` is passed. Purpose: a connection bound to Appliance Rentals
cannot casually change AI Systems users.

**Acceptance.** Unit tests. Manual: from the rentals connection,
`admin_get_user ops@robinsonaisystems.com` is refused with a plain message;
with `crossDomain: true` it works.

### P1-5 · Result shape and size limits (S) `[H]`

**Build.** `ok()` truncates arrays over 200 items with a `truncated` note and
`nextPageToken` passthrough; strips `etag`, `kind`, and base64 bodies over
64 KB from results (replace with length). Document in util.js.

**Acceptance.** Unit tests.

**Phase gate P1:** review model confirms every destructive tool is wrapped,
change_log never contains credentials, and errors are readable by a
non-developer.

---

## Phase 2: Operations tools Chris needs now

### P2-1 · Calendar settings (S)

**Build.** `calendar_update_calendar { calendarId='primary', summary?,
description?, timeZone?, location? }` via `calendars.patch`. Validate
`timeZone` against `Intl.supportedValuesOf('timeZone')`.

**Acceptance.** Manual: set the rentals primary calendar to `America/Denver`
(Chris already did this by hand on 2026-09-30; the tool must read it back
correctly) and the "Deliveries & Service" calendar stays Denver.

### P2-2 · Email health check (M)

**Build.** `workflow_email_health { domain }`: resolve MX, SPF (root and
`send.` for Resend), DKIM selectors `google` and `resend`, DMARC; check Gmail
routing basics (`users.settings.sendAs.list` for the acting account, aliases
from Directory); return a table of PASS/WARN/FAIL with the exact record to add
for each FAIL. Use Node `dns.promises`. Also report whether the DMARC policy is
`none`/`quarantine`/`reject` and recommend the next step with a date.

**Acceptance.** Unit tests with a stubbed resolver. Manual against
`robinsonappliancerentals.com` and `robinsonaisystems.com`; both reports
committed as examples in `docs/plan/examples/`.

### P2-3 · Safe single DNS record via Vercel (M)

**Build.** `dns_list_records { domain }`, `dns_add_record { domain, type, name,
value, ttl?, dryRun?, confirm? }` (destructive = false but confirm anyway),
`dns_delete_record { recordId, confirm }` (destructive). Uses Vercel REST
(`GET/POST /v2/domains/{domain}/records`, `DELETE /v2/domains/records/{id}`) with
`VERCEL_API_TOKEN` and `VERCEL_TEAM_ID`. Only domains whose nameservers are
`*.vercel-dns.com` are accepted; otherwise explain where DNS actually lives.

**Acceptance.** Unit tests with a fake fetch. Manual: `dns_list_records` shows
the `_dmarc` record Chris added by hand.

### P2-4 · Where is this setting? (S)

**Build.** `workspace_where_is_setting { query }`: a curated map (JSON file
`src/data/console-map.json`) of ~60 common Admin console and Gmail settings
that have **no API**, each with the deep link and 2–4 clicks. Start with: DKIM
key generation, Gmail routing rules, services on/off per OU, Gemini
on/off, data regions, session length, password policy, recovery options,
Marketplace app allow-list, calendar sharing defaults, Drive external sharing,
Meet settings, Chat external, directory visibility, Groups for Business
settings, Takeout, Vault retention, billing/plan, user license assignment UI.
Fuzzy match on keywords.

**Acceptance.** Unit test for matching. Every link opens the right page when
Chris is signed in as an admin (spot-check 10).

### P2-5 · Workspace health report (M)

**Build.** `workflow_health_report { scope='all'|'<domain>' }`: for every user:
2SV enrolled/enforced, admin?, recovery email/phone set, last login, suspended;
third-party OAuth tokens per user with scopes beyond `openid/email/profile`
flagged; auto-forwarding rules present; groups with external posting allowed;
unused licenses (when P2-6 works); OUs and which users are in root; Drive
files shared with "anyone with the link" (sample via `drive.files.list q=
"visibility='anyoneWithLink'"` for the acting account). Return a Markdown
report with PASS/WARN/FAIL and one-line fixes.

**Acceptance.** Manual run on both accounts, reports committed under
`docs/plan/examples/`. Unit tests for the scoring rules.

### P2-6 · Fix licensing and show the plan (S)

**Build.** Pass `customerId` = the real customer ID (`admin.customers.get
('my_customer')` → `id`) and handle the API-not-enabled error with a plain
message naming the API to enable in the Cloud project (Enterprise License
Manager API). Add `workspace_plan_summary`: lists SKUs with assignment counts
and says whether Gemini is included (Business Starter/Standard/Plus → yes).

**Acceptance.** Manual: returns the plan for both domains without error, or a
plain message telling Chris exactly which API to enable.

### P2-7 · Google Business Profile and Search Console readiness (S)

**Build.** `workflow_search_presence_check { domain }`: uses
`siteVerification` to list verified sites/domains for the acting account and
reports which of `robinsonappliancerentals.com` and `www.` are verified; tells
Chris the one-click path to Search Console and Business Profile if not.
(Business Profile has no API we hold a scope for; this card is read-only
reporting plus console links.)

**Acceptance.** Manual report committed.

### P2-8 · Weekly digest (S)

**Build.** `workflow_weekly_digest { domain }`: last 7 days from the Admin
Reports API (logins, admin actions), change_log entries, unread counts per
label (Leads/Support/Billing) for the acting mailbox, and any FAIL from a
fresh `workflow_email_health`. Plain-English Markdown. Optional `emailTo` sends
it from the acting account (requires `confirm: true`).

**Acceptance.** Manual run; sample committed.

**Phase gate P2:** review model checks the DNS tool cannot touch non-Vercel
zones or delete without confirm, and that the health report never prints
tokens or secrets.

---

## Phase 3: Workflows in Chris's language

### P3-1 · Add a staff member (M)

**Build.** `workflow_add_staff_member { email, firstName, lastName, business:
'appliance-rentals'|'ai-systems', role: 'driver'|'technician'|'office'|'admin',
phone?, aliases?[], sendWelcome? }`: creates the user in the right OU with a
one-time password, requires 2SV enrollment within 7 days (Google's grace
period via enforcement), adds aliases, shares the business calendar(s) with
the right level (driver/technician: see+edit "Deliveries & Service"; office:
make changes and manage sharing), shares the business Drive folder, brands the
mailbox via `workflow_brand_mailbox` with the business signature, optionally
emails Chris the login details (never the new user directly unless
`sendWelcome: true` and `confirm: true`). Read back everything.

**Acceptance.** Dry-run shows the full plan. Unit tests with fakes for each
role mapping. Manual against a disposable test user that Chris then deletes.

### P3-2 · Offboard, refined (S)

**Build.** Convert `workflow_offboard_employee` to `defineWrite`, add
`dryRun`, remove calendar/Drive shares granted by P3-1, remove send-as aliases
from the departing mailbox, and record everything in change_log.

**Acceptance.** Unit tests; dry-run manual.

### P3-3 · Set up a new business (L)

**Build.** `workflow_set_up_business { businessName, domain, ownerEmail,
roleAliases: ['support','billing','leads','no-reply',...], timeZone, brand?:
{ displayName, signatureHtml, avatarBase64Url? } }`: verifies the domain is
on the Workspace (adds as secondary if not and reports the verification TXT),
creates the OU, creates or moves the owner user, adds aliases, Gmail labels and
filters per alias, a business calendar in the right time zone, the standard
Drive folder set (the nine folders created for Appliance Rentals on
2026-09-30), brands the mailbox, and runs `workflow_email_health`. Fully
dry-runnable. This is the one-sentence version of everything done by hand on
2026-09-30.

**Acceptance.** Dry-run against a fictional domain returns the complete plan
without calling any write. Unit tests for each step's idempotence (running
twice changes nothing the second time).

### P3-4 · Mailbox branding, extended (S)

**Build.** `workflow_brand_mailbox` gains `avatarBase64?` (uses
`admin.users.photos.update`, needs no delegation), `labels?[]` with
`filterTo?` (creates label + to:-filter pairs), and `vacation?` passthrough.
Read-back includes labels and filters.

**Acceptance.** Unit tests; manual on the rentals mailbox is a no-op (already
branded) and the read-back proves it.

### P3-5 · Inbox triage helpers (S)

**Build.** `gmail_inbox_summary { label?, since? }` (counts, top senders,
oldest unanswered thread per label) and `gmail_find_unanswered { label, olderThanHours }`
(threads where the last message is inbound). Read-only.

**Acceptance.** Unit tests with fake Gmail data.

### P3-6 · Owner guide (S) `[H]`

**Build.** `docs/OWNER-GUIDE.md`: for Chris, in plain English: the ten things
to ask for by sentence ("brand the mailbox", "add a driver", "how healthy is my
email", "what did you change this week"), what each will do, what it will ask
him first.

**Acceptance.** Chris reads it and says it makes sense.

**Phase gate P3:** review model checks workflows are idempotent, dry-run is
complete, and nothing emails a third party without `confirm`.

---

## Phase 4: Appliance Desk integration support

The app-side spec is `APPLIANCE-DESK-INTEGRATION.md`. These cards are the
connector-side prerequisites.

### P4-1 · Widen delegation deliberately (S)

**Build.** Add `https://www.googleapis.com/auth/calendar` and
`https://www.googleapis.com/auth/drive.file` to `DELEGATED_SCOPES` **only
after Chris approves in the PR body** and updates the Admin console entry.
`workspace_delegation_status` lists both the configured and the authorized
scopes and flags any mismatch (attempt a tiny read with each scope).

**Acceptance.** Status tool shows every scope `works: true`.

### P4-2 · Delegated calendar and Drive clients (S)

**Build.** `src/auth/service-account.js` exports `delegatedClients(userEmail,
scopes)` returning `{ calendar, drive }` limited to the requested subset of
`DELEGATED_SCOPES`. Used only by P4-3 tools.

**Acceptance.** Unit test that requesting a scope outside `DELEGATED_SCOPES`
throws.

### P4-3 · Business-calendar and folder tools for the app (M)

**Build.** `workspace_business_calendar { business }` returns the calendar ID
for "Deliveries & Service" (creating it if missing, Denver time) and
`workspace_business_folders { business }` returns the nine folder IDs (creating
missing ones). Both idempotent, both usable by the app's service account
through the same database (`business_resources` table: business, kind, key,
google_id).

**Acceptance.** Running twice returns identical IDs. Manual: returns the
existing `c_dd214eeb…@group.calendar.google.com` and `13yNQodb…` folder tree.

### P4-4 · Service-account issuance notes for the app (S) `[H]`

**Build.** Append to DEPLOY.md "Part 6": how to create the app's own service
account (separate from the connector's), which scopes, and the Admin console
entry. Cross-link `APPLIANCE-DESK-INTEGRATION.md`.

**Acceptance.** Chris can follow it in 15 minutes.

**Phase gate P4:** review model confirms the connector's scopes grew by exactly
two, each approved, and the app uses its own identity rather than the
connector's.

---

## Phase 5: Structure and documentation

### P5-1 · Convert remaining write tools to `defineWrite` (L)

**Build.** Every mutating tool in every module. Group by module; may be 3–4
PRs. Each PR's body lists the tools converted.

**Acceptance.** `grep -c "defineWrite" src/tools/*.js` matches the count of
mutating tools; a lint script (`scripts/check-writes.mjs`) fails CI if a tool
name matching `_(create|update|delete|add|remove|set|move|send|assign|reset|
suspend|patch|modify|trash|empty|revoke)_` is not wrapped.

### P5-2 · Remove plaintext token write (S)

**Build.** After P0-6 has been live for 30 days, stop writing
`google_accounts.tokens` and set it to `'{}'::jsonb` on next refresh. Do not
drop the column.

**Acceptance.** Database test on a branch.

### P5-3 · Local mode parity or retirement (S)

**Build.** Decide with Chris: either make `src/index.js` use the same
multi-account/db layer (local SQLite via `better-sqlite3`), or mark it
deprecated in README and remove the `bin` entries. Recommendation: deprecate.

**Acceptance.** README matches reality.

### P5-4 · Final docs and version 2.0 (S) `[H]`

**Build.** README tool catalog regenerated from the registry
(`scripts/gen-catalog.mjs`), ARCHITECTURE.md updated, `package.json` version
2.0.0, CHANGELOG.md summarizing P0–P5.

**Acceptance.** `npm run gen:catalog` produces no diff on a clean tree.

---

## Status ledger

Update this table in every PR. Statuses: `TODO`, `IN_PROGRESS`, `IN_REVIEW`,
`MERGED` (code shipped but acceptance may still be outstanding), `DONE`, and
`BLOCKED (reason)`.

| Card | Status | PR | Notes |
| --- | --- | --- | --- |
| P0-1 | IN_REVIEW | #6 | Tests, fakes, DB tests, CI added. CI runs DB tests on a throwaway Postgres on every PR (no secret needed). Not yet proven: red-on-failure demo (do once on the PR) |
| P0-2 | TODO | | |
| P0-3 | IN_REVIEW | #6 | Fix + unit test done. Manual Drive upload check needs Chris's go-ahead (writes to his Drive) |
| P0-4 | MERGED | #7 | Tool + unit tests done (token host check, size/redirect/timeout/private-address limits). Manual copy of the brand PDF needs Chris's go-ahead (writes to his Drive) |
| P0-5 | MERGED | #6 | Lockout + constant-time compare + tests. Manual 5-wrong-tries check on the preview still to do |
| P0-6 | MERGED | #8 | Code + tests done (crypto round-trip/tamper; DB tests on real Postgres). Needs Chris to set `TOKEN_ENCRYPTION_KEY` in Vercel (DEPLOY.md Part 6) before it takes effect; the Neon-branch check on both real accounts happens after that. Plain copy still written until P5-2 |
| P0-7 | IN_REVIEW | #7, #19 | Developing section added; hard-coded README tool count corrected to 348 in #19. Generated catalog remains P5-4. |
| P1-1 | MERGED | #10 | Table, helper, 3 tools, last-used tracking; explicit logging added to brand_mailbox, make_super_admin, set_2sv_enforcement, move_user_orgunit, set_user_photo. Last-used is written at most once a minute per token (not every request). Manual check (brand a test alias, see one row) needs Chris's go-ahead: it changes a real mailbox |
| P1-2 | MERGED | #9 | 12 mappings + unit tests; unknown errors and network failures unchanged |
| P1-3 | MERGED | #13 | Shipped with P1-4 in one PR. |
| P1-4 | MERGED | #13 | Shipped with P1-3. |
| P1-5 | MERGED | #9 | Etag is kept (contacts_update needs it). |
| P2-1 | MERGED | #14 | `calendar_update_calendar` via defineWrite (dry run, read-back, change log), time zone checked against the IANA list. Manual Denver check on the rentals calendar still to do: it changes a real calendar |
| P2-2 | MERGED | #14 | `workflow_email_health`: unit tests with a stubbed resolver. Deviation: adds an INFO result (Resend records are optional). Manual runs on both domains and the committed examples need live DNS, which this sandbox cannot reach |
| P2-3 | IN_REVIEW | #20 | `dns_list_records`, `dns_add_record`, `dns_delete_record` via Vercel's API; only domains whose real nameservers are Vercel's; add is idempotent, refuses CNAME clashes, always confirms, reads back. Chris set `VERCEL_API_TOKEN` (sensitive, Production only) and `VERCEL_TEAM_ID` in Vercel on 2026-10-02; takes effect on the next production deploy. Manual check still to do: `dns_list_records` on the domain whose `_dmarc` record Chris added by hand. Endpoints checked against Vercel's docs on 2026-10-02: list is `GET /v5/domains/{domain}/records` (the card said v2), add is `POST /v2/domains/{domain}/records`, delete is `DELETE /v2/domains/{domain}/records/{id}` (the card left out the domain). SRV is not offered until proven live. Review fixes: case-exact TXT compare, trailing-dot-safe hostnames, all pages read (stops rather than guess past 5000 records) |
| P2-4 | MERGED | #14 | `workspace_where_is_setting`, 47 settings (card said ~60). Deviation: a .js file, not .json, so the serverless bundle always includes it. Direct links are from memory of Google's URL patterns: spot-check of 10 by Chris still to do; entries without a link give click paths only |
| P2-5 | MERGED | #14 | `workflow_health_report`: scoring rules unit tested. Deviation: "unused licences" means licences held by suspended or 90-day-inactive accounts, because the API cannot show purchased seats. Deep checks (apps, forwarding) cover the first 100 active users. Manual runs and committed examples still to do |
| P2-6 | MERGED | #14 | Real customer ID in `licensing_list_assignments`; switched-off-API errors now name the API to enable; `workspace_plan_summary` added. Manual run on both domains still to do |
| P2-7 | MERGED | #14 | `workflow_search_presence_check` (read-only). Manual report still to do |
| P2-8 | MERGED | #14 | `workflow_weekly_digest`: emailing needs confirm:true. Manual run and committed sample still to do |
| P3-1 | MERGED | #17, #18 | `workflow_add_staff_member`: roles map to calendar/Drive levels (driver/technician: edit calendar, no Drive access (Chris, 2026-10-01); office/admin: manage calendar, edit folder). Safe to run twice. Deviations: Chris said drivers/technicians need no Drive access; the nine standard folders were read from the live Drive; emailing needs `confirm` (login to an address, or welcome to `personalEmail`); 2-step: Google's API cannot require it for one person (the field is read-only), so the tool reports enrolment status and points to the org-unit policy (Admin console > Security). Hardening #18 also: a failed step is no longer "confirmed", a driver who already has Drive access is flagged (never silently removed), owners are never downgraded, mailbox branding is skipped when already applied, sharing lists are read to the end, and offboarding now verifies the shares are gone and respects the domain limit. `ai-systems` has no calendar/folder listed so those steps are skipped. Manual run against a disposable test user (Chris deletes it) still to do: it creates a real account |
| P3-2 | MERGED | #15, #18 | Offboarding already had dryRun/confirm/read-back/logging from P1-3. Added: removes send-as aliases and sets the out-of-office reply (the old description promised the reply but the code never did it) before suspending, via delegation; each is skipped with a reason when delegation is off. Also removes the calendar/Drive shares granted by P3-1. #18 hardened failed-step/read-back behavior. Left as the guard wrapper rather than direct `defineWrite` (same safety behavior). |
| P3-3 | MERGED | #17, #18 | `workflow_set_up_business`. Deviations: (1) the nine folder names are exactly the real Appliance Rentals folders (read from the live Drive, 2026-10-01); override with `folders`; (2) always needs `confirm` (adds a domain and a paid account) and `crossDomain` on a limited connection; (3) stops at the DNS step on an unverified domain; (4) labels/filters only when the connection IS the owner; (5) calendar and folder are created under the connection's own account then shared with the owner. Fictional-domain preview proven by test; manual run against a throwaway domain still to do. |
| P3-4 | MERGED | #15 | Added `avatarBase64`, `labels` (+`filterTo`), `vacation`, `dryRun`. Deviation: labels are only created when the connection IS that mailbox, because the delegated robot identity may not create labels (that needs a wider scope, which needs Chris's written approval). Manual no-op/read-back check on the rentals mailbox still to do. |
| P3-5 | MERGED | #15 | `gmail_inbox_summary`, `gmail_find_unanswered`; read-only; looks at up to 100 conversations and says when it stopped. #18 hardened inbox classification accuracy. |
| P3-6 | MERGED | #15 | `docs/OWNER-GUIDE.md` is shipped and now lists add-a-staff-member and set-up-a-business; Chris still needs to read it and confirm it makes sense. |
| P4-1 | IN_REVIEW | #21 | Chris approved `calendar` and `drive.file` by name on 2026-10-02 ("I approve calendar and drive.file for the robot identity"). `DELEGATED_SCOPES` is now exactly the Gmail pair plus those two. Each call requests only the subset it needs, so Gmail branding keeps working before the Admin console entry is updated. `workspace_delegation_status` tries each permission on its own, names any that fail and says what to type. Chris still has to edit the Admin console entry (DEPLOY.md Part 5), then run the status tool: needs `allScopesWork: true` |
| P4-2 | IN_REVIEW | #21 | `delegatedClients(userEmail, scopes)` returns only the clients for the scopes asked; anything outside `DELEGATED_SCOPES` throws (tested). Nothing uses it yet beyond the status tool: the business tools act as the connection's own account, so the robot's new permissions are held in reserve |
| P4-3 | IN_REVIEW | #20 | `workspace_business_calendar`, `workspace_business_folders` + `business_resources` table (contract-tested on the in-memory fake and on a real Postgres 16, 44 DB tests passing). Acts as the connection's own account, so it needs no delegation. Idempotent; a remembered ID that no longer exists is not trusted; the main folder is searched across all of Drive and two matches stop it rather than guess; the preview and the read-back look at Drive itself. Manual check still to do: returns the existing `c_dd214eeb…` calendar and `13yNQodb…` folder tree |
| P4-4 | IN_REVIEW | #21 | DEPLOY.md Part 5 updated and Part 8 added (the app's own service account, its four scopes, the Vercel variables, how it finds the IDs). Cross-linked to APPLIANCE-DESK-INTEGRATION.md. Chris can follow it in about 15 minutes |
| P5-1 | TODO | | #19 hardens the hosted runtime and tests, but the actual remaining-write conversion and CI checker are still TODO. |
| P5-2 | TODO | | Not before 30 days after P0-6 ships |
| P5-3 | TODO | | Needs Chris's decision: deprecate local mode? |
| P5-4 | TODO | | #19 corrects README drift; generated catalog/version/changelog work remains TODO. |

Completed before this plan (2026-09-30, Fable 5.1): multi-account support
(PR #1), account-choice fix (PR #2), domain-wide delegation + mailbox branding
(PR #3), refresh-token security fix (PR #4).
