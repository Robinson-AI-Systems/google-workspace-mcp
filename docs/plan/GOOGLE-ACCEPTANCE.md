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

The script verifies the service manifest source revision and separate write/read identities, asks Gmail to confirm the real mailbox, proves read-only and area-denial cases, previews tagged Drive/calendar/Gmail fixtures, creates by stable UUID, verifies exact returned IDs and repeats the same UUID rather than creating uncertain duplicates. Gmail fixtures are inserted locally into the account, not sent to anyone. It uses guarded cleanup with exact IDs, checks provider read-backs, and revokes both passes after successful cleanup. A local PASS means only **this direct authorized mailbox flow** was exercised. It does **not** prove a dedicated isolated TEST account, all Google tools, the Hub relay, Sandbox, or independently verified deployment.

## Failed run and recovery

The private report checkpoints exact run IDs and Google IDs before/after important steps, and is replaced atomically to retain recovery evidence across crashes. Never put it in GitHub. A failed run may have created objects even if its provider response was lost. Do not start an unrelated run, guess IDs or bypass the service-owned durable ledger.

Review the first failed phase, inspect exact recorded objects against their tags/owner, reconcile any unrecorded reservation using an owner-reviewed procedure, and use the **same original write pass and connection** with the recorded IDs. For a separately verified run, RTC_RUN_IDS_JSON is an object mapping the scenario to its real prior UUID (for example, keys files, calendar or gmail); use a fresh RTC_ACCEPTANCE_REPORT filename and run:

```sh
node scripts/google-test-acceptance.mjs --owner-authorized-cleanup
```

Cleanup-only does not require the prior read-only pass to remain valid, but still verifies current deployed revision, approved write-pass identity and actual Google mailbox. A new pass cannot own an old fixture run. If the original write pass is expired or revoked, stop and obtain an owner-reviewed exact-ID recovery plan; **do not** widen account/connection ownership. Any pass left valid after a failed run must be revoked through the owner's guarded mechanism once safe cleanup/recovery is completed.

A permanent ledger update may include sanitized results, source and independently verified deployment identity, counts, denied operations, disposition and re-entry requirements; never include actual pass secrets or unrelated mailbox data. Genuine deployed, Google, Hub and Sandbox acceptance remain separately tracked in TASKS.md and the hosting policy.
