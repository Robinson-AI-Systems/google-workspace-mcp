# Reusable developer connection — owner authorized 2026-10-13

## Outcome and boundary
Let the implementing agent connect once, retain its developer authorization securely,
refresh access and run approved tests without repeated owner-page pass creation or copying.
This does not restrict the production MCP catalog, supported operations or runtime profiles.
Development authority applies to the implementing/testing agent and approved test resources;
it is not a blanket read_only restriction on the finished product. Full test profiles remain
available for genuine fixture writes; independent money-out, paid capacity, live activation,
production data destruction and resource-isolation gates remain unchanged.

## Integration and acceptance
- Reuse native OAuth code + S256 PKCE, existing owner consent and refresh/revocation logic.
- Mobile owner opens one prefilled link; no bearer or account ID copied through chat.
- Credentials remain in protected client storage, never MCP tool results or instructions.
- Expired access refreshes within the existing grant; revoked/invalid grants require consent.
- Each standalone service remains usable without Hub; rtool manages multiple connections.
- Native MCP testing uses the connected developer principal and existing write guards.
- Separate source, offline tests, deployed revision and real provider/scratch acceptance.

## Resume
Implemented mobile PKCE/RSA authorization handoff in each standalone service and native
rtool OAuth connection/refresh/check/call commands in Hub's CLI. Product catalog/profile
filters unchanged. New service-owned developer_oauth_handoffs table is additive and lazily
initialized by the developer endpoint, separate from native provider/account storage.
Unit/CLI tests run locally; SQL race/expiry tests require disposable CI Postgres.
CI provenance guard separates standard connectors and custom-service proof. Exact-head CI,
reviewed deployment, initial owner consent and real provider/scratch acceptance pending.

## Role-drift and completion review
Read docs/reviews/2026-10-13-completion-recovery.md. Review the actual source/index
before extending scope: preserve full product capability, isolate builder permission,
use the native custom service for acceptance, and finish finite supported workflows.

## Connection review corrections — 2026-10-13

Authenticated polling retries return the same encrypted authorization code until the
original request expires; native OAuth token exchange remains single use. The trusted
service client-IP helper and atomic per-IP SQL counter enforce concurrent start quotas.
Backend outages return retryable 503 instead of malformed-request 400. Native 32-character
Google authorization codes are accepted, and its consent page retains the requested
profile while leaving the final choice to the owner.

Evidence must explicitly track all eight layers exactly once. Deployment-provider metadata
can prove only deployment; runtime acceptance must use the actual custom-service transport.
Full provider acceptance includes permitted reads/writes, resource and identity denial, and
provider readback. Schema validity alone supplies none of these observations.

Regression tests cover these failures; exact PR CI and real provider acceptance are separate.

Follow-up review: completed handoffs remain immutable until expiry even if another process
starts setup for the same client. Hub acceptance requires a Hub-mediated RTC route and
its readback; standalone MCP initialization or a bare service RTC request is insufficient.

## Agent connection recovery when private plugin tools are absent

The owner's phone/Android client is not a reason to repeat provider setup or to stop
custom-service acceptance. A private plugin's tools being absent from this conversation
is distinct from missing provider credentials, expired access tokens, revoked service
grants and a runtime that cannot issue HTTPS requests.

1. Read this card and inspect this conversation's actual terminal/HTTP capabilities.
   If a native custom-service tool is callable, use it. Otherwise use the existing
   rtool native developer client against this service's verified deployed OAuth/MCP origin.
   A cloud agent runtime can do this while the owner stays on mobile; the owner's PC
   is not the runner. Standard provider connectors remain infrastructure tools only.
2. The shared client is in Robinson-AI-Systems/robinsons-toolkit-hub:
   packages/cli/bin/rtool.js and packages/cli/src/{developer-client,developer-vault,developer-checkpoint}.js.
   Configure RTOOL_SERVERS with this service's alias and independently verified exact
   origin; use OS keychain storage or RTOOL_DEVELOPER_VAULT_DIR in a private non-Git directory.
   Run developer-check, developer-tools and developer-call using the syntax below.
   These developer commands call the standalone service directly; they do not require
   Hub federation to be finished.
3. For the coordinating Repo Management runner, six saved native grants are retained in
   the existing Hub project's Development-only encrypted RTOOL_BUILDER_SESSION checkpoint.
   Retrieve only that named secret through authorized Vercel control-plane tools,
   privately restore an empty vault with restoreDeveloperCheckpoint and exact-origin
   validation, then saveDeveloperCheckpoint after token changes and before stopping.
   Never print, commit, attach, place in Library or send credential values to another chat.
   See Hub's DEVELOPER-CONNECTION card for the existing recovery procedure.
4. **One serialized runner owns that checkpoint.** It is not a concurrent shared token
   pool. Do not restore stale checkpoint copies over newer local credentials or run
   independent agents against the same rotating refresh tokens. A different agent
   coordinates acceptance with that runner, or uses its own separately authorized grant.
   Persist approved test evidence in the relevant repository so implementing agents can
   use it without receiving credentials.
5. Expired access normally renews with the saved refresh grant. An authentication failure
   alone does not prove owner consent is lost: check exact origin, deployment protection,
   saved record freshness and refresh outcome first. Avoid testing renewal by setting the
   client clock in the future against a live server: that can save an inaccurate expiry.
   If a saved access expiry is known stale, renew through developerAccess using actual
   current time and persist the replacement. Never replay a possibly executed mutation.
   Request new consent only after a genuine revoked/invalid grant or added authority is proved.
6. If this particular conversation has neither native custom tools nor an HTTPS-capable
   execution runtime, report that specific limit and coordinate the required run/evidence
   with the existing runner. Do not ask the mobile owner to install a desktop plugin,
   copy passes, reconnect the underlying provider, or certify a test the agent cannot run.

Commands below run from a checkout of the shared Hub CLI, with this service's exact
origin and protected vault configured. rtool can also be used when installed. The CLI
server alias must match the existing saved record; a renamed alias is a different record.
Deployment protection, where present, requires its authorized exact-origin access
in addition to service OAuth; do not disable protection or switch to a convenient alias.

```sh
node packages/cli/bin/rtool.js developer-check google
node packages/cli/bin/rtool.js developer-tools google
node packages/cli/bin/rtool.js developer-call google workspace_whoami --args '{}'
```

Initialize/tool discovery/identity, provider reads, fixture writes/readback/cleanup,
scope denial, renewal/revocation and Hub federation are separate evidence. Record
the exact deployed revision/origin before claiming real acceptance. Successful standard
connectors, source CI, mock providers or another service's connection prove none of
this server's independent acceptance. Preserve its complete product catalog and all
existing operation-specific approval/isolation/spending gates.

### This repository's purpose and first identity check

### Existing TEST pass recovery — October 16

A TEST pass created in the owner's phone browser is not automatically available
to the developer runner: only its hash is stored by the service. Never claim
server-side token recovery, ask for the token in chat, or substitute ordinary
OAuth access for TEST evidence. The existing-pass handoff uses
`scripts/connect-existing-test-pass.mjs start|poll` and `/api/developer/test-pass`.
It authenticates an already-issued, unexpired, non-revoked TEST pass pinned by
its exact identifier. It cannot issue, extend, widen or revoke credentials.
The owner signs in using that existing pass on the canonical service page;
RSA-OAEP ciphertext is stored for the original polling-secret/key-owning runner
for ten minutes, with strict Origin, input bounds and shared login lockout.
The runner verifies source, pass fingerprint, TEST mode and exact account before
writing the token to a new mode-0600 file in a private directory. No automatic
provider operation, retries of writes or ordinary-credential fallback occurs.

Protected runner environment: `RTC_ORIGIN`, `RTC_EXPECTED_REVISION`,
`RTC_EXPECTED_ACCOUNT`, `RTC_EXISTING_PASS_ID`, `RTC_HANDOFF_FILE` and, for poll,
`RTC_PASS_OUTPUT_FILE`. Keep key/poll-secret files private and outside Git/Library.
Start prints only the non-secret owner authorization link; poll prints only status
and scope metadata. Existing OAuth handoff rows use a distinct namespace and are
never accepted here. An expired handoff needs a fresh request, not a new TEST pass.

Owner's October 16 operating decision: use **24-hour** new TEST passes and retain
useful passes until the project no longer needs them or they expire. Do not revoke
them merely because a test/session ended. Earlier revoked grants remain revoked.
This preserves existing fixture cleanup and independent revocation-test evidence;
it changes no spending, test-resource, provider-scope or plaintext-retirement gate.
The handoff repair needs green checks/review/merge, a checked release and genuine
existing-pass sign-in before any live acceptance can be claimed.

Google Workspace mail, calendars, Drive/Docs/Sheets/Slides and authorized administration. Identify the selected account; prefer Appliance Rentals for approved tests; preserve account/domain/fixture boundaries.

Use `workspace_whoami` through this service's own saved `google` grant. The six connections were directly rechecked by the coordinating runner on October 13, 2026; all six authenticated initialize requests succeeded without desktop plugin activation. That transport observation does not complete this repository's provider/write/RTC/Hub acceptance. Current grants were saved after renewal; reverify actual identity, scope and deployed revision on the next run.

## Resumed substantial service/fixture outcome — October 15 owner correction

PR #142 completes P8-4 engineering as a contribution, not the requested bundle.
The remaining P8-5/P8-7 scope was stated in the active owner conversation before
implementation. Concurrent workflow PR #143 arrived after source checkpoint
3bc3a14; this formal transition plan records what remains NOW. It is not a
fabricated historical pre-code plan. The unpublished/source checkpoint already
contains immutable requests, owned-run inspection, HTTP audit receipts, canonical
namespace metadata and the actual-process/Google-fake integration assembly.
Those changes are reviewed with the retained P8-4 contribution as ONE workload.

<!-- bundle-plan:start -->
```json
{
  "baseRevision": "89f48c2602853031690b69b920b7d56317ff0b83",
  "outcome": "An independently testable Workspace service with exact owned fixture recovery and the real local service passing the reusable RTC contract",
  "integrationBoundary": "Hub conformance package -> actual Workspace HTTP/OAuth modules -> shared disposable PostgreSQL -> strict stateful fake Google; production fixture ledger and recovery through the same guarded registry",
  "newEngineering": "Retain already assembled source 89f48c2 and P8-4 PR142 as contributions. Remaining engineering is to finish actual-process conformance integration, remedy concrete failures found by that full boundary, pin the corrected immutable Hub dependency and complete durable recovery/receipt proof. No old provider/guard implementation or test volume is counted as new production.",
  "estimatedProductionLines": 50,
  "relatedWorkDecision": "P8-5 and P8-7 form the next related approved service/developer outcome; P8-4 is retained once. P8-6 shared runtime adoption is optional/unapproved, not included; P8-8 is the independent owner-console outcome. Hub K-2 dependency PRs are not separate bundles.",
  "subsections": [
    {
      "id": "P8-5",
      "acceptance": ["The Hub conformance package passes in Workspace CI against the actual local Workspace server with fake Google, retaining every named contract assertion and separating deployed Google/Hub acceptance."],
      "remainingEngineering": ["Finish two-process actual HTTP/OAuth/real-Postgres execution; fix demonstrated contract/integration failures, retain all probes with no skips, and pin the corrected reviewed Hub package source."]
    },
    {
      "id": "P8-7",
      "acceptance": [
        "Tagged Drive folder/Docs/Sheets, named TEST Calendar event and mailbox-local Gmail fixtures record every provider ID in durable owned runs/reservations.",
        "Cleanup touches only recorded owner/tag/parent-verified objects; foreign same-name objects remain untouched and Drive cleanup uses reversible trash.",
        "App integration reports actual API/scope/resource readiness or exact manual console remediation without changing settings.",
        "Dry run changes no provider state; destructive cleanup requires confirmation; writes read back and audit; no other user's data is acted on."
      ],
      "remainingEngineering": ["Complete immutable creation intent and owner-only recovery inspection integration across all three scenarios, including lost responses, same-run replay, changed-intent denial, no duplicate creation, exact cleanup, audit linkage and terminal cleaned-state proof. Reconcile existing integration-check and unit-negative evidence against the full original card, not as new code credit."]
    }
  ]
}
```
<!-- bundle-plan:end -->

This transition plan is a contribution plan, not a new bundle. Its small remaining
estimate cannot certify the workload alone. Final comparison must include actual
new engineering from PR142 and the resumed source, the necessary Hub package
implementation, exact production/test separation and all original criteria.


### Final preserved-plan comparison

All planned P8-5/P8-7 remaining engineering and original criteria passed at source
d8415e3 (Actions38779326658, all14 actual-service probes and all3 fixture lifecycles;
unit1697/PG59/RTC28). The transition contribution is122/27 Workspace production
plus98/27 necessary reusable Hub production:220 additions/54 deletions. Its
standalone report correctly remains CONTINUE_BUNDLE because this contribution is
below the ordinary substantial guide. It is combined with retained PR142's186/11
P8-4 contribution ONCE:406 additions/65 deletions across the3 complete approved
subsections. The original session baseline bbe2477371ffc79a645107ff031815bcb63baa23
predates the formal-plan marker. No historical P8-4 plan is fabricated, and no
accounting command establishes owner substantiality by itself. Coherent new service,
audit and owned recovery behavior plus the actual integration boundary justify the
combined workload. Test/harness/generated/docs and inherited fixture code receive
zero production credit. Deployed/provider/Hub acceptance remains separately gated.

## October 18 — secure LIVE read-only issuance completion repair

The P9-LIVE-DIRECT native portion has genuine proof in PR218, but the existing encrypted issuance handler/store/runner accepts only TEST mode. The ordinary live-pass form exposes its one-time credential only to the browser, so this runner cannot complete live RTC acceptance without an unsafe credential copy. Reuse the existing atomic encrypted issuance boundary rather than introducing another endpoint, database table or roadmap phase. This is a targeted completion-enabling repair, not a full subsection/bundle.

Frozen acceptance before code:
1. Preserve default TEST request/24-hour policy and existing callers; explicit LIVE requests are one-hour read_only, exact connected mailbox/areas, no Hub, no writes and billing denied. Live uses genuine account ownership, never TEST enrollment.
2. Display the exact immutable mode/account/areas/duration and restrictions before existing owner passphrase authentication. No credential is issued at start, anonymous GET or poll; strict Origin/lockout/registered RSA-client boundaries remain.
3. Atomically insert exactly one pass and its runner-only RSA ciphertext; concurrent/repeated approvals, altered mode/options, unknown mailbox and failed ciphertext persistence cannot leave duplicate/orphan grants. Preserve all old grants.
4. The private runner explicitly selects mode, pins source/account/areas/profile/write policy and verifies the live/test identity before writing a new mode0600 file. It must not print credentials, reuse a checkpoint for a changed mode or silently widen authority.
5. Run focused handler/runner checks, full check/unit, exact-head database/RTC CI and review before merge. Production LIVE issuance/acceptance still requires owner approval and checked release; no Stage2/canonical change, Google write, paid action or original-grant modification.

Implementation: preserved default TEST wire shape and 24-hour behavior; explicit LIVE is in the immutable handoff challenge, SQL mode/one-hour expiry/deny billing and private runner mode verification. Existing route and SQL atomic issue+ciphertext statement are reused; no migration or new endpoint. Handler/runner tests cover explicit LIVE display, POST/mode tampering, wrong returned identity and private output; real DB cases cover unenrolled LIVE, exact expiry/policy, old-pass preservation, concurrent duplicate refusal, altered scope and rollback in both modes. Real production acceptance remains pending checked release and protected owner approval.
