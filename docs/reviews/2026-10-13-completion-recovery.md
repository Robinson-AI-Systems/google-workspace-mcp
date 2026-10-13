# Completion recovery and role drift — 2026-10-13

Owner requested finishing the full intended MCP products and removing repeated manual
setup work for implementing agents. This review is based on the current source/check
output, not independent live-provider acceptance.

## Observed state
377 registered tools. Most planned provider functionality already exists. Finish P0-2 real custom-provider acceptance and the explicitly deferred P5 migration gates; do not rebuild working provider modules. Older TASKS text permitted Neon DB testing and only-main DB CI, conflicting with current isolated PR/CI testing. Corrected here. Compact broker listings do not mean the provider catalog was removed.

## Correction and finite finish path
1. Complete reusable developer authorization and private credential return; retain native
   OAuth refresh and full developer profiles under existing original service guards.
2. Prove native custom MCP initialization, actual permitted provider read/write with exact
   readback, denied resource/identity access, expiry/revocation and owned fixture cleanup.
   Run the approved scratch scenarios without owner-copying a new pass after each code fix.
3. Reconcile the authoritative work index against actual registered handlers and routed
   doors. Group the next missing provider workflow into a complete independently usable
   capability; implement its DTO/handler/guards/fixtures/readback together.
4. Finish documented supported coverage and universal-operation paths. Keep future extras
   separate; never call unimplemented catalog entries complete or narrow the product to
   the implementing agent's temporary development grant.
5. Complete hosted Hub H-2/H-3 and authentic routes using separate service authorization;
   neither standard ChatGPT connector access nor reference fixtures can substitute.

## Guardrails implemented with this substantive change
- Authoritative implementer rules distinguish product, builder and proof roles.
- Developer evidence CI rejects standard-connector/reference substitutes for custom runtime.
- Transport initialization does not claim provider, Hub, revocation or cleanup acceptance.
- Developer client invokes native /api/mcp; it cannot silently fall back to a standard connector.
- Full permission requests are allowed; production profiles/catalogs are unchanged.
- Protected renewable credentials remove routine copying; genuine fresh consent, financial,
  spending, destructive-data and provider login gates retain their separately defined scope.

## Finish discipline
Measure completion by named workflows and remaining acceptance, not PR number or tool count.
Do not add speculative safety work or repeat setup that is already configured. Fix a proven
security defect immediately, then return to the selected complete capability. Every new
restriction needs a specific threat or recorded owner requirement and a proving refusal test;
implementation convenience is not a reason to remove intended tool capability. Record real
external blockers with a runnable next action; a standard connector is not that action.

## Evidence limits
This PR implements the connection/evidence infrastructure, not every remaining provider
feature. See existing STATUS/TASKS/index for actual provider backlog. Review, exact-head CI,
deployed revisions, first genuine owner connection and provider scratch proofs remain
separate gates; no live or spending authorization is inferred.


## Owner account preference and calendar cleanup observation — October 13, 2026

The owner controls both `ops@robinsonappliancerentals.com` and
`ops@robinsonaisystems.com`. **Default to Appliance Rentals** for future
authorized Google MCP acceptance and active app-development fixtures:
`ops@robinsonappliancerentals.com`. The other account is an owner-approved
alternative, not an automatically interchangeable identity: every service
pass/connection, Google calendar, fixture ledger, ownership restriction
and revocation remains bound to its real issuing account. Existing approvals
and per-account scopes are not broadened. The current Production
`RTC_TEST_ACCOUNT_EMAILS` allowlist includes only the Appliance Rentals
account; do not expand it without separately checking authorized fixture
scope and isolation. Never create acceptance fixtures in a primary calendar.

An agent reported an actual authenticated Google Calendar exercise using
`ops@robinsonaisystems.com`: a temporary tagged event was created, read
back and deleted; a disposable secondary calendar was created, deleted and
independently checked absent from CalendarList. Subsequent event and ACL
reads returned not-found; the primary calendar was unchanged and no
invitations were sent. The owner confirms either mailbox belongs to them,
but prefers Appliance Rentals for subsequent acceptance.

**Evidence limit:** This is an agent-session observation, not a saved
service-specific signed receipt. No exact temporary calendar/event IDs,
source revision, developer connection identifier, reversible cleanup
journal or immutable provider exchange log has been supplied to this
repository. Do not use that statement alone to mark any of the eight
`docs/developer-evidence.json` layers verified, including custom MCP
transport, provider fixtures, Hub, credential revocation or RTC cleanup.
The next acceptance agent should recover any available private evidence
from the original run, then prove an authorized end-to-end session using
the preferred account and exact provider IDs. Never recreate fixtures
merely to make a missing historical report.

## Owner setup and branch housekeeping — October 13, 2026

- `main` and `live` were equal at `564463aae4e752bc431bcb8221fb5fb8b7d78893`,
  both mandatory checks green, and Vercel READY on that exact revision,
  before this maintenance branch. A deployed build is not a real Google test.
- Source of the observed **Forbidden origin**: two assigned Vercel aliases
  reach the same service, while POST requires its configured canonical
  `PUBLIC_BASE_URL`. Redirect alternate-host GET requests to the canonical
  setup page rather than accepting arbitrary Host headers as trusted origins.
  Keep POST origin authorization strict; no OAuth issuer/redirect changes.
  Make incomplete TEST allowlist configuration clear and reject the
  contradictory `for_hub` plus TEST-write choice.
- The owner previously requested the complete setup audit in draft #81.
  That branch predated #82/#83's renewable developer OAuth, and includes
  an unreviewed alternate-host origin relaxation plus a new Google callback
  state-cookie flow. Preserve its discussion for history; do not merge it
  wholesale or lose newer token/callback behavior. This cleanup PR cherry-picks
  the safe owner pass-page resolution, not the risky broad rewrite. The
  separate callback-state change deserves its own security/compatibility
  review if adopted later.
- Branch inventory before this maintenance work: 84 non-main/live refs,
  of which **80** were PR-head branches for already-merged PRs,
  **one** was open draft #81, and **two** were archival non-PR preparation
  branches (`ai/codex/hosting-cost-handoff-2026-10-12` and
  `ai/codex/p8-google-acceptance-runner`), plus this working branch.
  The former preparation work is already represented by
  `docs/HOSTING-COST-POLICY.md`; the latter is preserved and superseded by
  merged acceptance runner #66. Legacy topic branches may be ahead of
  their ancient merge base because the final implementation took a
  different commit path; that is not proof of missing source behavior.
- Branch deletion requires a ref-deletion capability; this agent's available
  GitHub connector does not expose it. **No refs are deleted, overwritten,
  force-updated or hidden.** Recheck that no branch gained a new PR or
  commit before a later privileged cleanup. At minimum, the 80 merged-PR
  topic branches are archival candidates; retain any branch with independent
  work or ongoing collaborators until independently reconciled.

### Still open

Actual permissioned custom Google MCP acceptance, Hub-mediated tests,
revocation and precise cleanup receipts; all planned broad bulk/policy
capabilities; and plaintext-token retirement no earlier than November 1,
2026 **and** after verified encryption for every account. This note records
owner preferences and cleanup evidence without claiming any missing proof.

## Google account-enrollment consent security follow-up — October 13, 2026

After reviewing the unmerged Google OAuth setup changes on former draft #81,
one additional security boundary required an independently reviewed fix:
the earlier public GET `/api/google/authorize` immediately started Google
OAuth without first authenticating the MCP owner. An external caller could
try to enroll their own mailbox into the owner's multi-account registry.
A browser-only nonce did not remedy authorization of *who* may start setup.

This follow-up now requires the existing database-rate-limited owner
passphrase before the Google redirect. Every request gets a short-lived
cookie-bound nonce and a signed-in-browser callback; unsolicited,
cross-browser, expired and malformed callbacks are refused before a
provider token exchange. Alternate Vercel aliases redirect to the
already-configured canonical Google origin first. Error messages omit
provider secrets. Existing already-connected mailboxes, provider tokens,
OAuth client redirect configuration, native MCP/RTC and renewable developer
authorization flows are not changed. The new gate applies to adding or
reconnecting a Google *provider mailbox*, which is appropriately a
separate owner operation, not normal AI developer retesting.

Security acceptance requires code tests and exact-head CI/review; the
actual mobile/browser consent flow and Google callback still need
live validation before a full end-to-end acceptance claim. Legacy draft
#81's broader Host-derived origin acceptance is deliberately not adopted.
