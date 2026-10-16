# Authorized Google direct RTC acceptance — real pre-business mailbox

This is an **opt-in local operator procedure**, not an Actions test with live credentials, a production activation, or a dedicated TEST tenant. The owner authorized tagged temporary objects and exact-ID cleanup in the existing real mailbox **ops@robinsonappliancerentals.com**. Never send outside mail, create Workspace users, edit unrelated settings or other accounts, change DNS, or widen Google scopes.

## Prerequisites before any provider mutation

1. Verify actual main, both required Actions checks, the checked **scheduled main → live** promotion, and **independently** confirm Vercel's live deployment ID, READY state, source commit and HTTPS origin. Do not treat preview as TEST; do not manually deploy. The runner compares a manifest-reported revision but this alone is not independent deployment provenance.
2. Through the existing owner-protected service pass page, authorize a **short-lived** full-profile test-mode write pass for the connected approved mailbox with exact areas workspace, files, calendar, mail; separately issue a read_only pass restricted to mail. Protect pass secrets in local environment only, never in a GitHub comment, chat, PR, logs or fixtures. Ensure RTC_TEST_ACCOUNT_EMAILS explicitly authorizes only the approved mailbox before issuance. This is a trusted mode guard, not proof of separate test infrastructure.
3. Use an independently owned disposable calendar controlled by the same mailbox, with no invitees. Record and verify its exact ID and unchanged prior state. Its ID must not be primary. Do not invent a test-calendar ID. The fixture tool checks ownership and refuses an arbitrary calendar.
4. Configure protected local environment values: RTC_ORIGIN (exact live HTTPS origin); RTC_TEST_ACCOUNT (the approved mailbox above); RTC_EXPECTED_REVISION (40-character independently verified deployed source commit); RTC_TEST_CALENDAR_ID (exact owned calendar ID); RTC_WRITE_PASS; RTC_READ_ONLY_PASS; RTC_ACCEPTANCE_REPORT (a **new** private filename under a trusted private directory). Pass tokens never go in command-line args.

Once all prerequisites are actually evidenced, run:

```sh
node scripts/google-test-acceptance.mjs --owner-authorized-fixtures
```

Before any fixture creation, the script fingerprints the owned non-primary calendar, its sharing rules and every active event across at most ten 100-item pages, and previews all scenarios. Missing or repeated pages fail closed. It compares the same fingerprints after cleanup and refuses acceptance if unrelated calendar state changed; it never attempts to restore unrelated changes. Only digests and counts enter the private report, not event contents or sharing addresses. This proves the observed calendar baseline, not a mailbox-wide or Drive-wide no-change audit. Cleanup-only deliberately uses the durable fixture ledger without requiring a new baseline.

The script verifies the service manifest source revision and separate write/read identities, asks Gmail to confirm the real mailbox, proves read-only and area-denial cases, previews tagged Drive/calendar/Gmail fixtures, creates by stable UUID, verifies exact returned IDs and repeats the same UUID rather than creating uncertain duplicates. Gmail fixtures are inserted locally into the account, not sent to anyone. It uses guarded cleanup with exact IDs, checks provider read-backs, and revokes both passes after successful cleanup. A local PASS means only **this direct authorized mailbox flow** was exercised. It does **not** prove a dedicated isolated TEST account, all Google tools, the Hub relay, Sandbox, or independently verified deployment.

## Failed run and recovery

The private report checkpoints exact run IDs and Google IDs before/after important steps, and is replaced atomically to retain recovery evidence across crashes. Never put it in GitHub. A failed run may have created objects even if its provider response was lost. Do not start an unrelated run, guess IDs or bypass the service-owned durable ledger.

Review the first failed phase, inspect exact recorded objects against their tags/owner, reconcile any unrecorded reservation using an owner-reviewed procedure, and use the **same original write pass and connection** with the recorded IDs. For a separately verified run, RTC_RUN_IDS_JSON is an object mapping the scenario to its real prior UUID (for example, keys files, calendar or gmail); use a fresh RTC_ACCEPTANCE_REPORT filename and run:

```sh
node scripts/google-test-acceptance.mjs --owner-authorized-cleanup
```

Cleanup-only does not require the prior read-only pass to remain valid, but still verifies current deployed revision, approved write-pass identity and actual Google mailbox. A new pass cannot own an old fixture run. If the original write pass is expired or revoked, stop and obtain an owner-reviewed exact-ID recovery plan; **do not** widen account/connection ownership. Any pass left valid after a failed run must be revoked through the owner's guarded mechanism once safe cleanup/recovery is completed.

A permanent ledger update may include sanitized results, source and independently verified deployment identity, counts, denied operations, disposition and re-entry requirements; never include actual pass secrets or unrelated mailbox data. Genuine deployed, Google, Hub and Sandbox acceptance remain separately tracked in TASKS.md and the hosting policy.

## Optional exact-ID read-only acceptance after an eligible checked release

For a separately owner-authorized **read-only TEST** pass, validate existing nonproduction Google objects by their actual provider IDs without recreating fixtures or touching mailbox, calendar, or Drive state. Source/CI alone cannot satisfy this scenario. Independently verify Vercel READY deployment revision and original pass identity/areas/account according to the prerequisites above. Store the existing short-lived read-only pass only in protected environment variables; the tool never prints Google object IDs or bodies.

Set `RTC_ORIGIN`, `RTC_TEST_PASS`, `RTC_EXPECTED_ACCOUNT`, `RTC_EXPECTED_REVISION` and `RTC_READ_FIXTURES_JSON` **in a private runner environment**, not a command argument, repository file, report, issue or chat. The JSON value is an array of at most twelve exact approved `{name,args}` entries. For example an owned Drive resource uses the tool name `workspace_drive_get_file` and an `args` object with the `fileId` of the original approved TEST object. The calendar event entry supplies its *real* `calendarId` and `eventId`; primary calendars are categorically refused. The eligible tools and required IDs are fixed in `scripts/smoke-readonly-fixtures.mjs`, not inferred from a tool-name pattern. Any invalid/unknown/duplicated fixture, extra parameter, wrong mailbox/area, advertised-tool mismatch, unreadable result, or provider ID mismatch makes the run fail without counting the object as accepted. Never invent a fixture ID.

Once these prerequisites are verified, the protected runner may execute:

```sh
node scripts/smoke-readonly-fixtures.mjs --authorized-fixtures
```

The runner performs only read-only GET/resource-detail invocations with `detail:'full'` and numbered owned result-page recovery, using the existing exact account/TEST profile checks. Its console summary has tool/status/reason only; never log IDs or provider content. A successfully read resource establishes only that precise TEST object/permission, not blanket Google account, Hub, delegated user, webhook, or write/cleanup acceptance. The P0-2-EXACT-FIXTURE-READ queue row stays pending until actual separately recorded provider receipts and checked live provenance exist.


## Full audited P0-2 TEST catalog casebook (source candidate #138)

The reviewed read-only catalog has thirty default bounded safe probes, twelve optional exact-ID resource probes in `RTC_READ_FIXTURES_JSON`, and 123 additional individually enumerated operation names requiring **separate owner-authorized exact arguments**. A protected runner may set `RTC_REVIEWED_READ_CASES_JSON` to a JSON array such as `[{"name":"workspace_admin_get_user","args":{"userKey":"authorized-owner@example.test"}}]`. This example identity is fictional: supply real approved IDs only in a protected local environment, never a PR, chat, public report, workflow log or GitHub secret literal.

Each named case must appear in the existing read-only source inventory; the runner validates live advertised input schema, hard page and argument limits, active TEST profile and account/area permissions, then checks observed result shape. Omitted cases remain **NOT_PROBED**, never pass. No bulk implicit admin, report, Vault, transfer, Google policy, export, cross-domain or mailbox-content exploration is authorized by connecting this runner. The 123 case classes are conservative evidence gates rather than a guarantee that all Google plans and real API responses will match: unexpected outputs require source-backed provider contract investigation and a regression before acceptance. Exact owner-approved fixture IDs and independent TEST pass authorization remain mandatory, including for initially zero-argument reads that reveal customer-wide data. A report without real provider receipts does **not** close original P0-2 or the release acceptance queue.


The complete runner uses a single already-authorized catalog inventory (rather than one metadata discovery request per read), and its real HTTPS fetcher automatically paces all baseline, discovery, provider and result-page requests at a conservative default 1.15 seconds apart to remain below the typical 120/minute TEST-pass limit. A provider 429 receives at most one bounded `Retry-After` retry; a repeated 429 stays a failure, never an inferred pass. A deliberately lower owner-selected pass limit may still require a narrower manifest or a suitably approved pass; never raise limits or widen grants autonomously. Synthetic fetchers are not artificially delayed.

## Customer-wide read approval for the extended P0-2 catalog (engineering candidate)

Selecting an exact read in `RTC_REVIEWED_READ_CASES_JSON` is **not** permission to inspect customer-wide Google directory, reports, security, Vault, policies, users, other businesses or large exports. Such calls additionally require an owner-reviewed authorization for the actual TEST account, object and scoped purpose. The protected local runner explicitly sets `RTC_OWNER_APPROVED_CUSTOMER_WIDE=true` only after that independent approval and existing service TEST-pass grants; leave the variable unset otherwise. A false/missing value produces `NEEDS_APPROVAL` in the sanitized report, **not** a hidden skip or a successful read. The flag does not add OAuth scopes, change the connection profile, bypass a Google or MCP area/domain check, or authorize writes. Never put mailbox IDs, private fixture arguments, TEST passes or full audit outputs in GitHub.

For all 165 reviewed reads, identity, correct deployment, source/handler output shape, native result handles, permissions and denied-path evidence must be recorded by the protected runner before calling a particular operation externally accepted. Any unreadable, malformed or missing fixture remains a failing/ungathered scenario, never a fabricated PASS. Missing published Google API permissions or owner intent must be investigated per source and quarantined to that scenario. Document bugs on existing cards; commit only the runner's sanitized report after genuine receipt.

## Owner scope decision — October16,2026

Owner2026-10-16T13:59:34Z explicitly stopped actual Vault connection testing because the required Workspace subscription upgrade is not needed. Exclude `vault_list_matters` and `vault_list_holds` from active live test manifests; keep the tools, denied historical receipts and source contracts. Do not buy a license, repeat Vault probes, remove other test cases or claim live Vault success. This reviewed owner exclusion is not an unresolved requirement to upgrade the subscription.
