## October 19 — new-source v1 hard push: real post-release owner/database reconnaissance and live-HTTPS acceptance (IN PROGRESS)

**This is fresh production evidence, NOT another rollout.** Independently verified `main=live=Vercel READY=d67c5d6ba545f7cfd3b31ca6eef239e025dfb2ef`, aliases including `workspace.robinsonaisystems.com` and the registered MCP Vercel origin, with previously authorized checked release receipt. The existing original owner ChatGPT-connected Workspace adapter again returned a genuine nonmutating `workspace_whoami` for the expected linked account, `matches:true`. Read-only production Neon SQL counts found **17 unrevoked and unexpired legacy owner bearer rows, all 17 refresh-capable, 2 original owner accounts, 2 verified pilot Google identities, 2 principal users, but only 1 active independent pilot Google grant and 1 active pilot MCP agent connection**. A later genuine whoami call advanced an original OAuth token `last_used_at` timestamp, supporting continued existing-bearer dispatch; the old refresh-token replay, original restricted RTC TEST proof and two-real-client adversarial acceptance remain **PENDING**. No secret/token/subject ID was copied or revoked.

**Fresh engineering step:** A bounded no-secret remote-HTTPS acceptance runner and a distinct real-production GitHub Actions job are being added in the existing P10-6/P10-3 acceptance scope (frozen [card](../pr-cards/P10-V1-LIVE-HTTP-ACCEPTANCE.md)). It verifies public GET/HEAD privacy, help, deletion, refusal of unauthenticated account, RTC manifest exact live SHA, both deployed aliases and OAuth S256/refresh/RFC7009 metadata against actual serving HTTPS. A real CI result must be recorded **after the job runs**; local fake-route tests are never claimed as live. The runner cannot certify operator-approved legal/retention disclosures, owner refresh/migration, real second-subject consent, two independent authenticated MCP clients, provider revocation or actual customer DWD. It never asks Google for consent or reads/writes customer objects. **Authoritative 32 PASSED / 8 PENDING remains unchanged.** No off-cycle deployment, new Google account, charge or credential change is authorized by this work.

---

## October 19 — owner-approved fast-track v1 early release (CURRENT, supersedes older completion wording)

**Immediate finish line: secure, independently usable, verified v1 early production for approved/allowlisted users, not full Google API-method parity.** The owner expressly moved exhaustive provider API coverage to mandatory **post-v1 continuous releases**, without weakening its no-gap objective or erasing pending tasks. [Canonical v1 acceptance gate](V1-RELEASE-GATE.md), [machine classification](v1-release-gates.json), [full API coverage obligation](../PROVIDER-API-COVERAGE.md). Public general enrollment, provider OAuth verification, distribution and directory publication are separate gates; the initial release must accurately disclose Testing/allowlist restrictions.

**Required original v1 acceptance remains NOT PASSED:** `P10-OWNER-CONTINUITY`, `P10-VERIFY-GOOGLE`, `P10-MCP-PILOT`, `P10-OWNER-MIGRATION-LIVE`, `P10-6-PUBLIC-DISCLOSURE`, `P10-6-OWNER-SUBJECT-PROBE`. Original `P9-LICENSE-PAID` and `P10-CUSTOMER-DELEGATION` remain **PENDING**, specifically **not** certified or advertised as tested v1 capabilities; require independent billable-operation approval or customer-owned DWD when later completed. Other passed records remain passed. Total authoritative queue still **32 PASSED / 8 PENDING**; no acceptance is upgraded by a scope decision.

**Source and release status at adoption:** PR #235 OAuth PKCE S256/RFC7009 revoke/atomic legacy owner authorization and PR #236 Tasks v1 14/14 method mapping are **MERGED**, source-main `b557eab28847b5adc60e8a09c65cfe0908864843`, exact-source GitHub required CI green. Verified production was READY at **older** `ab26461a0fe3179b9b085937e437d977b7d0134b`, so new fixes are not yet live/provider accepted. No manual release or second real independently consented client claimed. `npm run v1:readiness` is read-only/fail-closed and does not certify production from supplied flags. Recheck source/deployment every session.

**Fast-track ordering:** preserve all deployed eligible acceptance; checked normal release of ready code when permitted; original owner bearer/refresh proof; second Google identity's own consent and actual two-client OAuth/provider/isolation/denial/revoke; portal/privacy/owner migration/accurate selected feature acceptance; independently verified production v1 receipt. Correct real defects in bundled PRs. Do not execute full API-method expansion ahead of unmet v1 criteria merely because method-parity ledger is open. This is a release-scope decision, not new product bundle credit or permission to skip CI, genuine testing, specific Google/paid approvals, or release policy. Actual Hub LIVE discovery is Hub-owned.

---

## October 19 historical — Sonnet Phase 2 partial; OAuth security repair subsequently MERGED in #235, NOT YET LIVE at v1 planning

Owner supplied the independently performed Sonnet Phase 2 client report:
[bounded sanitized evidence](evidence/2026-10-19-sonnet-phase2-partial.json).
The existing Claude Full connection still showed the approved owner mailbox,
valid Google read and correct direct domain/cross-customer refusals. Sonnet could
observe only **one connection in its session**, which is not evidence of a
server-wide count or two independent verified OAuth users. The second person
did not complete their own Google sign-in, so principal A/B provider reads,
wrong-subject and token-replay/refresh/revocation across two real clients
remain **PENDING**, not failures or successes. Original owner bearer/refresh
was not touched or proven by this session. Haiku Phase 1 real evidence retained.

Code review confirmed metadata previously advertised `plain` PKCE and lacked
an OAuth RFC 7009 token revocation endpoint; the legacy owner code helper
accepted weak/missing challenge and had a SELECT/UPDATE code replay race.
An existing P10-3/P10-6 security-repair branch
`fix/p10-oauth-discovery-revocation-20261019` now enforces S256 for
**new** owner and V2 authorizations, adds strictly client-owned owner/V2
token-family revocation with durable owner refresh tombstones, and single-use
atomic legacy code consumption. Includes synthetic route regressions and
real-PostgreSQL race and cross-client/non-revocation tests. **This work is
not yet source-accepted or live until required CI/review/merge and a checked
policy-compliant release.** No production state/Google grants, previously
issued bearer/refresh tokens, current Full connection, or owner Google data
changed. Client A/B real consent is still an independent approval/browser
action, and actual Hub federation is the Hub's responsibility.

---

## October 19 late — reconciled post-#233 main/live, actual Enterprise read and no-gap pre-audit

**Current baseline supersedes older same-day branch/disabled-API paragraphs below.**
Main is `834b004b9fee5b86e5248b3ad618f45f94b4396b` (#233 merged,
all required merged-main CI families including release policy successful).
#232 and #231 are also merged; no open PR was found at the checkpoint.
Independently checked Vercel production READY `dpl_2essafTNKQDEakUrf8txxNfa1XSP`
serves `ab26461a0fe3179b9b085937e437d977b7d0134b` on
`workspace.robinsonaisystems.com`, matching live branch; newer #232/#233
fixes are **not** on the serving source. No unscheduled release performed.

The original owner ChatGPT Workspace connection passed a genuine provider
`workspace_plan_summary` read with nonzero Business Standard assignments,
complete one-page coverage, then `licensing_list_assignments` returned real
existing Google assignments; both were nonmutating. Thus Enterprise License
Manager is **not currently disabled for this authenticated owner read**.
New merged standalone `licensing_list_product_assignments`, guarded PUT
`licensing_replace_assignment`, cursor extension, foreign-domain denial
and full licensing/billing acceptance are **NOT LIVE-tested** and remain pending
a compliant checked source release and any independently required provider grants.
Sanitized evidence: [real licensing receipt](evidence/2026-10-19-live-enterprise-licensing-read.json).
No paid action, new grant or credential modification occurred.

The generated 384-tool registry is **not** method-complete evidence across
Workspace APIs. [Provider pre-audit](../pr-cards/PROVIDER-API-COVERAGE-PREAUDIT.md)
records Google-published API families lacking verified method-by-method mapping,
including Apps Script, Classroom, Keep, Meet, Drive Activity/Labels and more;
`docs/PROVIDER-API-COVERAGE.md` is the authoritative method-parity gate.
Only seven Workspace Enterprise licensing methods are source-mapped; Cloud
License Manager's unrelated 19 VM licensing methods require separate Google
Cloud IAM/consent/approval and portfolio ownership. Keep these all explicitly
OPEN until reconciliation and source/provider proof. Full product completion
and P10-6 do not follow from the Haiku Phase 1/one Claude client:
Sonnet Phase 2 second real user/client isolation, PKCE/replay, owner bearer
refresh/revocation, customer-specific delegation and publication remain
separately pending. Live Hub federation is not a Workspace gate.

---

# Robinson Google Workspace MCP: implementation plan

## October 19 — complete Workspace license method parity and no-gap contract (source only)

Owner requirement: custom MCP services must aim for **every provider API operation**, not just frequent workflows. [Operation-by-operation coverage ledger](../PROVIDER-API-COVERAGE.md) is now a mandatory scope/audit input, with the existing P2-6/P9-2/P10-6 source bundle [plan](../pr-cards/P2-P9-ENTERPRISE-LICENSING-METHOD-PARITY.md). The Google Workspace Enterprise License Manager API (`licensing.googleapis.com`) has 7 methods. Source branch `feat/p2-p9-workspace-license-complete-20261019` adds direct native `listForProduct` and PUT `update`, user-accessible paging for SKU lists, explicit customer-wide list opt-in, guarded billable PUT, and typed/live-source-gated checks. These features are **not live** until exact-head CI, code review, merge, then checked release; even afterwards provider permission and paid mutation acceptance remain separate.

Google Cloud License Manager (`licensemanager.googleapis.com`) is a different Cloud IAM/VM license API with 19 methods; all 19 are a separate **OPEN** Google Cloud integration coverage responsibility. Do not falsely count them as implemented by Workspace's Enterprise licensing support or use customer Workspace OAuth tokens for Cloud. No owner/API billing mutation was performed. Full product-wide API inventory and P10 two-client acceptance remain incomplete. Older branch status below is historical.


## October 19 — post-#231 native client acceptance and targeted repairs

Independent GitHub main/live/Vercel READY previously served `ab26461a0fe3179b9b085937e437d977b7d0134b` (#231). Owner's existing Claude **Full** custom MCP connection remained valid across new real provider reads: own-domain users returned one and groups returned zero; unqualified and field-projected outside-domain group settings and customer-info requests correctly refused; explicitly selected cross-domain customer-info and Reports usage reads succeeded. The empty own-domain groups list is not a software failure. **New findings**: the composed overview fails to propagate one-call cross-domain permission to the authorized organization child, unlike the successful direct tool; the overview's installation-owner-only Cloud Identity baseline needs a clear noncustomer explanation, not unauthorized bypass; and the *exact resource* Tasks 400 invalid-ID path still maps to generic error despite the separate API readiness diagnostic fix. These are in the frozen P8-7/P8-8/P10-6 branch card `docs/pr-cards/P10-ADMIN-OVERVIEW-AND-TASK-RESOURCE-DIAGNOSTICS.md`; require checked PR, future release and separate actual Claude retest. Enterprise License Manager API remains disabled in pilot Google Cloud project, Vault not entitled, Alert Center needs independently customer-owned delegation. Second genuine Google principal and token lifecycle still PENDING. Older source/pre-release statements below are dated history, not live claims.


## October 19 — current native Claude acceptance after broad pilot consent (supersedes stale branch status below)

Independently deployed `41cfae5c8481bf66b618efe384e02d35ec2d8a4a` is READY with owner original connection continuity. The existing Full/compact native Claude client remained active and used **49 independently Google-consented scopes** (previously 11); it passed direct Gmail, Calendar, Drive, Docs, Sheets, Slides, Forms, Contacts and newly Tasks disposable provider read/write/cleanup plus Chat read and narrow Google Admin/Reports/Cloud Identity/Chrome/Site Verification/Postmaster metadata. Production audited Tasks create/delete (one each) and earlier disposable writes. Full P10 pilot is NOT accepted until second independently verified client/account, wrong-owner refusal, refresh/replay/revocation and owner original bearer continuation. Current follow-up branch repairs default Admin customer-wide domain leakage and optional fields obscuring refusals. Licensing is truly API-disabled on pilot Google Cloud project despite claimed bulk API enablement; Vault is not entitled; Alert Center requires customer-bound DWD; no within-domain group exists for Groups Settings positive acceptance. Authenticated, explicitly authorized crossDomain:true stays a product option, never automatic. Owner approved finishing remaining applicable reads/admin pilot setup but no unrequested paid subscription or unrelated real-world administrator mutation. Source follow-up remains under CI/review/release control.


## October 19 — owner correction: God mode for customers is OPTIONAL, but pilot preflight is comprehensive

**Development acceptance:** request all available supported direct-user Google OAuth scopes in **one** protected provider consent for each of the two approved pilot users, to avoid serial scope/API enablement stops. This is separate from the existing native Claude **Full** MCP profile and from Google Cloud API enablement. Actual Google consent and admin/delegation entitlements remain provider-owned. Already proven provider scratch reads/writes/cleanup should not be rerun without a relevant source change.

**Product experience:** normal customer onboarding starts with a service-specific consent; a visible, optional **God mode** checkbox requests all direct-user permissions in one Google dialog. Pilot preflight starts checked; normal public use starts unchecked. Turning off a fully enabled God mode is a separate, confirmed account-local action: attempt provider token revocation, always revoke local Google account grant and its agent connections, disclose provider failure and let the user independently relink the SAME Google subject under selected scopes. No old agent credentials resume after relink and no other principal is affected. This is not a silent broad-to-narrow transfer, and does not imply arbitrary service-account DWD, customer privileges, licensed/purchased capabilities or Google app verification. See [owner corrected plan](../pr-cards/P10-PILOT-VS-PUBLIC-CONSENT.md) and [owner guide](../PUBLIC-SIGNIN-OWNER-GUIDE.md). #229 has merged to main; these follow-up changes remain on a branch, not live. Full P10-MCP-PILOT acceptance remains PENDING.


## October 19 — real Claude Full MCP acceptance and comprehensive-consent recovery (source awaiting CI/release)

The owner approved testing all supported Workspace services together, preserving Full agent authority and avoiding serial missing-API/scope interruptions. The preexisting Claude direct MCP client has completed genuine provider Gmail label creation/readback/deletion, Calendar disposable event creation/cancelled readback, Drive scratch folder create/rename/delete, Docs/Sheets/Slides/Forms create+cleanup and Contacts create/delete. Sanitized **production principal_changes** counts independently confirm every changing tool family and five Drive deletes; owner-provided client transcript supplies provider readback/cleanup details (issue #205). Tasks, Chat and advanced administration return missing user OAuth scopes, some customer-wide reads remain correctly blocked by cross-domain guards, and Alert Center requires separate customer-bound delegation. Full MCP profile is not Google scope consent or administrator status. One Full pilot agent connection exists; the second user/client, denial/replay/revoke, original bearer continuity and real advanced-provider reads remain PENDING. Original 32/8 acceptance ledger is not yet changed.

Current feature branch introduces a **single, explicitly user-initiated comprehensive Google consent** for all direct-user APIs, plus service-specific fallback and clearer scope-vs-disabled-API diagnostics; it is NOT live until checked merge and release. Google may reject unverified/restricted scopes. Customer service-account domain-wide delegation, user/admin roles, paid entitlements and original owner credentials remain separate. Google grants require real provider sign-in, are never assigned by the developer, and updating a grant can require a fresh agent connection. See [planned consent delivery](../pr-cards/P10-COMPREHENSIVE-CONSENT.md) and [owner guide](../PUBLIC-SIGNIN-OWNER-GUIDE.md).


## October 19 — Stage 2 pilot live; genuine new-user MCP acceptance remains pending

The owner authorized a two-user Stage 2 pilot execution check. Production `PUBLIC_P10_TOOL_EXECUTION_VERIFIED=true` and unchanged `PUBLIC_SIGNIN_MODE=pilot` are in a newly deployed independently READY Vercel revision `076f888a7287c219797d508b4aa6a98f9b60a148` (`dpl_4cyDJoqYbY7ZR3rHEps6xHLKLLQn`). The two original approved subjects remain the only pilot users; existing owner access is preserved. Read-only production inspection observes two principals, one independent encrypted user Google grant, **zero new-user native MCP client connections**, two original owner accounts and 17 live owner access records. Original owner identity and actual Gmail label read succeeded post-redeployment.

No real new-user native client Google read, cross-principal denial, refresh/revoke, or second user's independent provider consent has occurred. The next test is an explicit user-owned OAuth connection from two genuinely independent supported clients to `https://google-workspace-mcp-chris-projects-de6cd1bf.vercel.app/api/mcp`, choosing `read_only` for this nonwriting acceptance. Stage 2 itself is not read-only enforcement. Public enrollment, paid action, customer DWD, provider writes and legacy owner retirement are unauthorized. Hub live onboarding is not a server completion criterion. Historical prior Stage2 OFF guidance is superseded; see the current [operator guide](../PUBLIC-SIGNIN-OWNER-GUIDE.md), [P10 acceptance checklist](P10-PILOT-CHECKLIST.md), and [sanitized source/deployment receipt](evidence/2026-10-19-stage2-pilot-activation.json). The original acceptance ledger is unchanged at **32 PASSED / 8 PENDING**.

Agent entry: [AGENTS.md](../../AGENTS.md). Complete SESSION-START §§0–1 before
selecting new implementation; preserve the existing session:finish workload check.

## Owner clarification — 2026-10-19: Hub LIVE connection is Hub-owned, not Workspace completion

Workspace completion requires a compliant, independently usable **RTC 1 provider** under the frozen Hub contract and latest reviewed `docs/HUB-COMPATIBILITY.md`, not a deployed Hub instance discovering or enrolling it. New optional Hub-initiated OAuth onboarding is the Hub's integration responsibility; the Workspace issuer continues to own any credentials it actually issues. Historical `P9-HUB-LIVE` acceptance ID is retained for traceability but its remaining Workspace scope is a source/deployed **RTC1 conformance** check, not a Hub end-to-end integration. Existing direct LIVE read/deny/revoke evidence, service conformance on two Workspace processes/shared PostgreSQL and prior original native/TEST proof may be reused when valid. The Hub project owns its actual LIVE connection tests, registry, caller isolation and relay. Do not add Workspace-to-Hub callbacks or block Workspace's provider release on Hub federation state. This is a newer explicit owner decision and supersedes older text below that implied Hub LIVE proof was required for Workspace completion.

## Owner clarification — 2026-10-17: Workspace pilot is Hub-independent

The owner explicitly clarified that **Hub is optional**: the original Hub TEST RTC relay/denial and the separately planned generic Hub LIVE production integration must never block verified **direct Workspace** use. The original historical Hub evidence and any current expired pass are tracked honestly under the existing Hub-specific completion/continuity requirements and remain PENDING where fresh evidence is missing. Do not replace original proofs or mark those acceptance rows passed.

The owner has already approved **Stage 1 direct Workspace identity-only** for the two verified, configured Google subjects. The operating rules and exact guarded activation/rollback criteria are in `docs/PUBLIC-SIGNIN-OWNER-GUIDE.md` and `docs/plan/P10-PILOT-CHECKLIST.md`. Stage 1 may set only Production `PUBLIC_SIGNIN_MODE=pilot` after checked serving-source and direct original-owner readback, leaving tool execution OFF, old owner grants/sign-in unchanged and downstream real A/B browser provider acceptance still pending. Stage 2, public enrollment, optional owner retirement and real provider writes are not authorized by this clarification.

## New roadmap — user authority and parallel multi-user sign-in

Owner clarification October16,2026 Denver: development-agent spending/TEST restrictions must not become permanent product limits. Supported end-user operations need a usable consequence/approval path. Owner requested a concrete Sol5.6-ready roadmap and parallel Google sign-in that preserves the working owner login. P9 and P10-1..5/7 source engineering is merged; P10-6 real Google two-user pilot and public publication remain OPEN, and paid testing, public enrollment and optional legacy retirement are not activated. Original P0–P8 acceptance remains passed for its original scope; the newly added P9/P10 scope is unfinished.

Authoritative execution contract: [User authority and parallel sign-in](designs/USER-AUTHORITY-AND-PARALLEL-SIGNIN.md). Follow current engineering-readiness and acceptance dependencies; do not redo merged features. Do not interpret original29 passed acceptance rows as completion of the new scope. Add new source-pinned acceptance rows only when implementation exists.

## October 17 — original owner-operated Workspace acceptance complete

The owner asked this agent to complete the two remaining Hub-specific tests. Actual original Hub runner acceptance is now complete in Hub PR #227: separate local direct and GitHub-only encrypted relay both passed all five checks with exit0 against the existing independent Workspace RTC service. The same new TEST/read_only/nonwriting pass was then revoked by Workspace; original direct probe verified HTTP401 `pass_revoked`, and the original encrypted relay returned the exact same denial envelope. Earlier actual Sandbox direct, native Hub discovery/read/durable audit, read-only refusal and cleanup proofs remain accepted from Hub #224/#226 and Workspace #194/#196.

Sanitized exact source, UTC, command, route, exit, least-privilege and cleanup evidence: [final Hub route acceptance](evidence/2026-10-17-final-hub-route-acceptance.json). Hub executable source `f6f916b8f2f6a596583328540593f3098dc2ff27`; Workspace service source `42afbaaf138d293d6042acd874c0fd3c32f7ce0e`. The temporary Sandbox is stopped, temporary pass/PAT revoked, transport issue closed/zero comments, webhook inactive, bypass revoked, relay bindings empty and Dev credential entry inert. The standing useful Hub grant is preserved and another genuine native Hub read succeeded after cleanup.

**GOOGLE-RTC PASSED; P8-5 DONE. All 29 release acceptance tasks PASSED. All 48 required roadmap subsections are complete; optional P8-6 remains ON_REQUEST and does not block completion.** No reverse Workspace-to-Hub discovery or additional Workspace runtime release is needed. The remaining documented limitations retain their original dispositions: unsupported feature retired; no-resource exact GET cases development-tested; Vault live positives owner-excluded. No additional real Google positive call is claimed from this Hub transport proof. Other Hub fleet service obligations are outside Workspace completion.

Owner removed the arbitrary November1 waiting policy: encrypted-only cutover is already complete for both accounts with account/legacy plaintext0. Alert Center delegation is activated and the genuine original TEST list returned HTTP200 with an empty array; exact alert GET remains development-tested because there are no alerts.

## Session workload comes from the current owner prompt

There is no repository-default session PR count, upper quota or PR-number
alignment target. Follow the count or scope in the current owner prompt for that
session only; do not carry it into later sessions. If no count is specified,
continue the approved ordered work within a safe, recoverable context budget.
Keep checkpoints, complete coherent PRs and preserve all required gates.
The rolling sample used for per-PR workload statistics is not a session quota.
When the owner requests N **bundles**, those are substantial complete implementation
outcomes under the existing 2–5 subsection / 400–800 production-line averages,
not a PR count. Follow SESSION-START's current-target and finish rules. Corrective
fixes, read-only checks and clean git do not clear that target. A genuine shortfall
needs criterion-level remaining-work evidence and prompt owner escalation, not a
blanket claim that most cards are awaiting external acceptance.

## PR workload is measured in predefined batch subsections — owner clarification 2026-10-14

**Bundle, card and PR boundaries — owner alignment 2026-10-15.** A card defines
approved subsection scope; it is not automatically a PR or bundle boundary.
A bundle is a coherent usable implementation outcome, normally averaging 2–5
fully completed existing subsections and 400–800 meaningful production-code
lines (tests/docs/generated/formatting excluded). Select the related cards and
full acceptance before coding. One substantial subsection can qualify when its
full workload naturally warrants it; merely finishing a smaller card does not
make it a bundle. Preserve the pre-code plan and compare actual delivery under
SESSION-START’s **Bundle target and delivery boundaries** procedure and
`npm run session:bundle`; below-guide exceptions need concrete NEW workload proof,
not the mere fact that a card finished. Larger coherent outcomes are allowed when
reliably reviewable.
There is no 500/800-line ceiling, file-count ceiling, one-migration quota or
blanket one-risk-area rule. Related migrations may share a PR with explicit
ordering, upgrade/restore proof and safe rollout. Keep every distinct risk,
permission, confirmation and provider boundary independently enforced/tested;
shared delivery never combines or relaxes those controls. Split delivery only
for a concrete migration, dependency, safety or reviewability reason; record
that reason and the unfinished integration. A bundle spanning PRs counts once
when its intended outcome is fully implemented, verified and merged. Keep measuring the existing rolling per-substantive-PR workload averages even
when a bundle spans PRs; explain smaller justified deliveries rather than hiding
them in bundle totals. The current
owner prompt sets bundle count, never a standing repository quota. These rules
supersede older numeric/grouping restrictions in recipes or example cards.


**The countable work unit is a predefined batch subsection** in the authoritative
approved roadmap/design, such as H-3, H-4 or B-5 (use this repository's actual IDs).
The target is **2–5 fully completed batch subsections per substantive PR on
average**, alongside the existing 400–800 production-line average. Prefer the
substantial end when related work safely supports it. This does not redefine
“slice”: a technical slice may be a useful internal implementation step, but it
is not the unit used to satisfy the PR workload target.

**Freeze the counting boundary before coding.** List the existing batch-subsection
IDs and their full scope/acceptance in the PR. A function, endpoint, tool, UI
hookup, guard, helper, test or checklist item is work WITHIN that subsection.
Internal packet tasks, new JIT cards, subcards, commits and local checkpoints do
not create additional countable subsections. Do not subdivide, rename or relabel
work to increase the count. A partial subsection counts as ZERO completed
subsections; keep its remaining engineering against the same ID. Across PRs,
count each subsection once, when its full eligible engineering and required
pre-merge proof are complete. Keep external acceptance separately open where
existing rules permit; never hide unfinished engineering in that queue.

**Build a substantial coherent PR.** Group related whole batch subsections.
If one whole subsection naturally requires about 600 production lines, one is
a legitimate boundary. Larger coherent work is allowed when manageable. Never
pad code, combine unrelated risks, or claim completion with engineering missing.
The existing workload averages apply to these predefined subsections, not to
smaller technical slices, packet tasks or individual functions.

**Validate the assembled workload.** During implementation run focused tests
and lint at meaningful changed seams. A local check/checkpoint is not a PR
boundary. Assemble related subsection work before running the full required
publication checks, security/CI/review and applicable database/browser suites
on the coherent PR. Fix failures together; repeat checks when code changes or
new evidence warrants it. Do not rerun every broad suite and rewrite full
handoffs after every helper. Every existing mandatory gate remains binding.

Older references to “2–5 slices” or “completed slices” as a PR workload metric
mean **2–5 predefined batch subsections**. Technical slices and execution-packet
tasks retain their ordinary use as internal implementation aids; their count
does not establish completed batch subsections.


## Original Toolkit is reference-only — owner clarification 2026-10-14

`Robinson-AI-Systems/robinsons-toolkit-mcp` is the historical capability reference,
not an active implementation/deployment target. The standalone custom MCP servers
and optional `robinsons-toolkit-hub` replace it. Do not maintain/rebuild the original,
resume its recovery PRs, synchronize implementations back to it, or require a bridge.
Preserve its code/history for coverage and behavioral research. When the owner chooses a new provider MCP, its implementing agent inventories the
relevant legacy tool names, families, workflows and intended behavior, reconciles them
with current provider contracts, and tracks coverage in THAT project's cards/index.
The Hub stays provider-agnostic: discover/connect/authorize/route/read results for
new contract-compatible MCP servers without provider-specific handlers or a fixed
family list. Future services and legacy catalog parity are not Hub completion gates.
Do not copy provider capabilities into the Hub or start speculative server projects.
Mapped/planned is not implemented or accepted. Service autonomy and all existing
provider/security/owner gates remain binding.


## Efficient release-aware execution — owner instruction 2026-10-14

[SESSION-START](../SESSION-START.md) is the consolidated session procedure;
`npm run session:status` prints the read-only release acceptance queue and remaining-roadmap summary.
Its workflow/cadence/merge-versus-live-proof rules supersede older conflicting procedural
wording below, but never override explicit safety or pre-merge owner/card gates.
Use substantial cohesive outcomes; numeric production-line targets are advisory rather
than artificial hard caps. Full mandatory checks run before publication, with focused
checks during development. Product acceptance stays open until real evidence passes.
The owner explicitly authorized this cross-repository guidance/tooling optimization;
routine implementation sessions still prohibit filler/documentation-only PRs.

## Completion workload — owner correction October 15

SESSION-START.md's ENGINEERING / COMPLETION accounting governs “Do N bundles.”
Production-line guides apply to engineering; substantial genuine acceptance and
configuration completion can qualify without new code, with frozen original scope,
new passed queue evidence and substantive review. Never invent features to meet N.
P8-6 is optional. P8-8's dated console walk is already approved work, not an expansion.
Use TASKS.md's current reconciliation; older candidate handoffs are historical.

## Roadmap-throughput and context-safe execution — owner correction 2026-10-14

**Completion outranks PR count.** The goal is completed, usable, safely proven product
functionality, not GitHub activity. Each PR must integrate at least one whole eligible
roadmap slice; package multiple adjacent small slices from the same approved parent
outcome when their contract, risk, callers, integration and tests belong together.
Target **400–800 changed production-code lines per substantive PR on average**
and **2–5 fully completed predefined batch subsections per substantive PR on average**,
measured over the latest five merged implementation PRs when available.
These are planning averages, not hard bounds or a reason to pad code, split
coherent outcomes or bundle unrelated risks. Count production source changes
only, excluding tests, documentation, generated files, fixtures and formatting.
Record actual source additions/deletions and completed slice IDs with their
acceptance evidence in each PR/handoff. Missing historical measurements stay
unknown. A helper is not a completed slice; eligible engineering and pre-merge
checks must be finished. Deployed/provider acceptance remains separately open.
Explain legitimate smaller safety fixes and larger inseparable outcomes.

**Session scope follows the current owner prompt.** Do not invent small PRs
or pad changes to satisfy a number. Spend the chat's usable context
on complete outcomes; after each merged PR, preserve an exact recoverable
checkpoint (branch/head, card/slice coverage, focused and CI proof, open review,
deployed/live versus source, pending acceptance and next action). Before starting
another work unit, assess whether the remaining chat context can support its
implementation, corrections, tests, merge and handoff. If not, finish a clean
checkpoint instead of beginning work likely to be abandoned. Never use a
continuation prompt instead of completing currently feasible work.

**Remaining-work visibility.** Run `npm run session:status` for current
roadmap counts and unfinished IDs in approved order alongside the separate
release acceptance queue. Counts describe the existing index/ledger's coarse
units (including separately listed planned/blocked/optional work), not proof of completed subsections, time estimates or live acceptance.
Record actual completed slices and remaining engineering in existing cards
and handoffs; never promote an incomplete card to improve the numbers.
Follow the designated roadmap order rather than the milestone in an old handoff.

**Adaptive CI budget and measurement.** Validate focused behavior at meaningful
code seams, run required complete gates on the final coherent tree and fix all
reported failures in one root-cause-informed correction cycle where possible.
If repeated CI fixes occur, investigate contract/test drift and reduce the
*next* PR's risk surface; do not silently split the current work to manufacture
success. Track complete slices/outcomes, real acceptance closed, remaining
work, first-pass CI failures, correction pushes and actual review overhead.
Lines of code and merged PRs are diagnostic statistics, not progress scores.
Every safety, money-out, service autonomy, release and approval gate remains.

## Mobile and tool-unavailable connection recovery

Before treating absent private-plugin tools as an acceptance blocker, follow
`docs/pr-cards/DEVELOPER-CONNECTION.md` → **Agent connection recovery when private plugin tools are absent**.
Use this repository's own saved native OAuth connection through an authorized HTTPS-capable
runner; identify its exact origin and service identity, then run purpose-specific acceptance.
The owner's phone is not the execution runner. Missing tools in one chat do not establish
expired provider authorization. Keep the protected checkpoint single-runner and preserve
all operation, provider, production, spending and isolation gates.


## Independent MCP and optional gateway boundary — owner request 2026-10-12

This server remains independently connectable, authenticated, deployed and testable. Robinson's Toolkit Hub
is optional: one agent connection routes through this server's RTC HTTPS contract, not its internal dispatcher.
Provider credentials, account/project state, canonical tools, permission/write/approval guards and results remain
owned here. Hub credentials must not be accepted as service credentials; separately issued scoped service passes
are required. Shared `robinson-mcp-core` adoption is optional, export-by-export, after immutable publication and
original-service parity; it is not a prerequisite for RTC connectivity or real Hub acceptance.
The owner explicitly requests this focused docs/planning repair; routine no-docs-only implementation cadence
and every CI/review/security/production/deployment/spending gate remain unchanged.

**Start here.** Written 2026-09-30 by Claude (Fable 5.1) for Chris Robinson, to be
executed by a less expensive model. This folder is the whole brief: what the
server is today, what it should become, the exact order of work, how each
piece is proven done, and the prompt to paste into the implementing model.

Owner: Chris Robinson. He is not a developer. Every status update and every
question to him is written in plain English, with no jargon unexplained.

## What this plan delivers

**Status (audited 2026-10-02):** most of this plan is built and on `main`. The
server now loads 360 tools, has 1050 passing unit tests plus database tests in CI,
and has every item below in place except the last proofs described in
`TASKS.md` (the status ledger and the "Audit" section at its end say exactly what
is built, what is waiting on a live check by Chris, and what is not started).
The text in this section is what the plan set out to deliver:

The server began as a wide set of Google buttons (349 tools) that knew which
business it was acting for. When this plan is complete it will also:

1. **Be safe to leave running.** Tests on every change, lockout on the
   passphrase page, encrypted tokens, and a record of every change it makes.
2. **Refuse to do dumb things.** Preview mode and explicit confirmation on
   anything destructive; a read-back after every write so the result is what
   Google holds, not what we sent.
3. **Speak plainly.** Google's raw errors translated into what happened and
   what to do next.
4. **Do Chris's real tasks in one sentence.** Email health check, Workspace
   health report, add a staff member, set up a new business, brand a mailbox,
   a weekly digest.
5. **Reach the settings Google hides from its API** by handing Chris the exact
   console link and clicks.
6. **Power the Appliance Desk integration:** calendar sync, Drive filing and
   email history for the rental business app, through the same robot-identity
   pattern the mailbox-branding tool already uses.

## Which model to use

| Role | Model | Why |
| --- | --- | --- |
| Implementing every task card | **Claude Sonnet 5.5** | Strong at code, follows a written plan closely, a fraction of the cost of Opus/Fable. Set thinking/effort to **medium**. |
| Pure mechanical cards (marked `[H]` in TASKS.md: renames, doc edits, repetitive wiring) | Claude Haiku 4.5 | Cheapest; fine when the card leaves nothing to decide. |
| Phase-gate review (end of each phase, read-only) | Claude Opus 5.5 or Fable 5.1 | Catches design drift and security mistakes Sonnet may not. One review per phase, not per PR. |

Do not use Haiku for anything touching auth, tokens, delegation, or
destructive tools. Do not use Opus/Fable to write code here; the plan already
contains the design decisions and the cheaper model should execute them.


### Repository-owned execution pipeline and completion discipline — owner clarification 2026-10-13

This repository's README.md, IMPLEMENTER.md, TASKS.md, approved task cards and hosting policy **control** implementation. A continuation prompt is only a lightweight checkpoint/cadence guardrail: it never supersedes source evidence, policy, approvals or acceptance, and cannot invent new scope.

- **Advance the finish line:** choose an unfinished approved capability or acceptance item with a concrete owner/developer benefit. For each substantive PR, record the capability gained, what completion criterion it closes or advances, and what remains. Follow existing task dependencies and prioritize finishing a complete workflow over revisiting the same hardened area.
- **No hardening treadmill:** do not rework passing guards, tests, authentication, configuration or architecture without a reproducible defect, a failed acceptance criterion or a previously approved task. Record its specific evidence and fix; close it once verified, then move to the next approved milestone. Do not invent speculative tweaks to reach a PR number.
- **Blocked is local:** isolate missing qualified review, external authorization, provider evidence, deployment or other dependency to affected PR/check. Investigate a permitted remedy, preserve the gate and work on independently eligible roadmap items. Do not represent a created/open PR as merged.
- **Session accounting:** follow the current owner prompt's count/scope only. Keep truthful PR, CI, review and remaining-work evidence; do not claim unfinished work complete.
- **Handoff pipeline:** verify main and open/draft PRs; run and review exact-head checks; merge safely; verify post-merge main and live/deployed provenance separately; update the existing TASKS.md ledger inside substantive implementation; produce a compact prompt naming the next unmet finish criterion. New agents must read repository instructions first and recompute the checkpoint rather than trusting the prompt.

## Outcome-first autonomous development (owner instruction 2026-10-12)

This is the standing, authoritative development workflow; IMPLEMENTER.md
provides the practical PR/checklist/continuation template, and TASKS.md is
the authoritative work, decision, blocker and permanent-handoff ledger.
Do not create competing instruction files or documentation-only PRs.

1. **Verify actual state:** current main, concurrent branches/agents, open
   PRs, exact-head CI, reviews, owner decisions, TASKS.md status and
   blockers, and the hosting-cost policy. Repository evidence overrides an
   old checkpoint or copied prompt.
2. **Choose an outcome:** state the highest-priority eligible milestone,
   the usable capability to finish/materially advance, and its remaining
   acceptance criteria. Prioritize demonstrated security, correctness, CI
   and review defects ahead of feature expansion.
3. **Build coherent work:** group related complete batch subsections into
   substantial PRs. Session count comes only from the current owner prompt;
   never pad work or split a coherent outcome merely to create more PRs.

4. **Keep four acceptance layers separate:** merged implementation,
   meaningful automated verification (including disposable database),
   exact deployed HTTPS behavior, and genuine Google/custom-MCP/Hub
   provider integration. Mock/reference-server green tests and saved
   hosting settings do not prove real acceptance. A card is DONE only
   after its actual acceptance criteria pass.
5. **Investigate, remedy, then isolate blockers:** a blocked operation or
   acceptance check is not a project-wide stop. Diagnose code defects,
   configuration, outdated dependencies, stale documentation and owner
   decisions already supplied; attempt every authorized repair and finish
   independent implementation and verification before declaring anything
   blocked. Never bypass safeguards or invent external acceptance evidence.
   For an actually missing external permission, credential, decision or
   evidence source, record the precise blocker, required evidence,
   dependencies, re-entry condition and next action in TASKS.md. Recheck
   these triggers at startup and after owner input, dependency merges or
   environment changes; restore eligible work automatically. Review the
   remaining approved roadmap before concluding nothing can proceed.
6. **Follow all existing gates:** substantial PRs target main, require
   exact-head Actions `test` and `release-policy` plus applicable
   review, and can be merged only by authorized agents when safe.
   Keep security, ownership, auditability, recovery, TEST isolation,
   scope and independent owner-approval controls. No placeholders,
   undocumented side effects or unauthorized provider writes.
7. **Releases are independent of PR count:** the checked scheduled
   at-most-daily `main → live` process is the only automatic promotion;
   disabled Vercel previews remain off and no manual deploy is permitted
   for a development batch. Preserve Basic/queued builds, Neon resource
   limits and autosuspend, owner spending/production/destructive gates,
   and plaintext-token retirement's readiness, drain and recovery requirements (the owner removed the waiting date and completed activation). Stripe LIVE
   remains disabled wherever relevant; Cortiware remains deferred.

At the end, report the user/developer capability advanced, exact actual
proof, remaining acceptance and reasons, verified main/PRs/CI, and
blockers with re-entry triggers. Update TASKS.md's permanent handoff in a
substantive PR. Give a **compact** self-contained continuation prompt
pointing to this workflow and the handoff, which instructs each future
agent to repeat the same process.

## Order of work

**Design readiness (owner-requested review, October 14):** TASKS.md's P7-8
design and **Remaining-design review** record the resolved bulk-operation
choices and distinguish remaining implementation/proof gates from new owner
decisions. P7-8's design-first review is satisfied; do not ask for it again.
The review does not authorize production bulk changes, spending, new scopes or
optional/unplanned features. Follow the existing ordered cards and preserve
their specific execution and acceptance gates.

| Phase | Theme | Cards | Rough size |
| --- | --- | --- | --- |
| P0 | Safety and hygiene | P0-1 … P0-7 | 1 week |
| P1 | Trust layer: change log, confirm/preview/read-back, plain errors | P1-1 … P1-5 | 1 week |
| P2 | Operations tools Chris needs now | P2-1 … P2-8 | 1–2 weeks |
| P3 | Workflows in Chris's language | P3-1 … P3-6 | 1–2 weeks |
| P4 | Appliance Desk integration support | P4-1 … P4-4 (+ app-side spec) | 1 week here, more in the app repo |
| P5 | Structure and documentation | P5-1 … P5-4 | 1 week |
| P6 | Optional extensions (added 2026-10-02) | P6-1 | under a day |
| P7 | God Mode expansion (proposed 2026-10-02) | P7-1 to P7-8 (P7-6, P7-7 superseded by P8-2) | about 10 days |
| P8 | Robinson Tool Contract: small results, profiles and read-only, passes, HTTPS tool API, developer workflows, owner overview and guided settings; later conformance and the shared package (added 2026-10-10) | P8-1 to P8-8 | about 6 days, plus P8-5/P8-6 when the hub provides them |

Phases are sequential. P0 came first because there were no tests; there are
now, and every later card relies on them to prove it did not break something.
Historical implementation-gap summary superseded by October16 closeout: no open Workspace engineering remains; see the
ledger in `TASKS.md` for the exact state of every card.

## Rules that never bend

- **This server stays fully usable on its own.** It follows the Robinson Tool Contract (RTC 1, authority:
  `docs/CONTRACT.md` in `Robinson-AI-Systems/robinsons-toolkit-hub`) so Robinson's Toolkit can combine it with Chris's
  other servers later, but nothing here may depend on the hub being built.
- **Every door uses the same guards.** MCP, `workspace_call` and the HTTPS tool API go through the same wrapped
  handlers (safety layer, domain guard, profile).

- **Never widen `DELEGATED_SCOPES`** (`src/auth/service-account.js`) without
  Chris saying yes in writing, one scope at a time, with the Admin console
  list updated to match. The robot identity is deliberately narrow.
- **Never log, print, return or test-fixture a real token, passphrase, key or
  connection string.** Tests use fakes. The change log stores *what* changed,
  never credentials.
- **Never delete the legacy `google_auth` table** in code. Chris drops it by
  hand once no old deployment exists.
- **Additive schema only.** `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT
  EXISTS`. No renames, no drops, no type changes.
- **Every write tool reads back** what Google now holds and returns that, not
  the request we sent.
- **Destructive tools require `confirm: true`** and support `dryRun: true`.
  The list of destructive tools is in TASKS.md P1-3.
- **Plain English to Chris.** If a card needs his decision, the PR body asks
  the question in one sentence a non-developer can answer.
- **Nothing is done until its acceptance checks pass.** "Compiles" is not
  done. Partial work is marked `IN_PROGRESS` in the ledger with what is missing.

## Files in this folder

| File | What it is |
| --- | --- |
| `README.md` | This page |
| `ARCHITECTURE.md` | How the server works today, every moving part, and the conventions to keep |
| `TASKS.md` | The ordered task cards with acceptance checks, plus the status ledger |
| `TESTING.md` | The test strategy P0 builds and every later card uses |
| `IMPLEMENTER.md` | Paste-ready prompts (implement, review), PR template, checklists |
| `APPLIANCE-DESK-INTEGRATION.md` | The app-side spec for calendar sync, Drive filing and email history, to be executed in the appliance-desk repo |

## Related documents elsewhere

- `../../DEPLOY.md`: hosted setup, including Part 5 (domain-wide delegation),
  Part 6 (encrypting stored sign-ins), Part 7 (DNS at Vercel) and Part 8 (the
  appliance desk app's own robot identity).
- `../../README.md`: user-facing tool catalog.
- `../OWNER-GUIDE.md`: the plain-English list of what to ask Claude for.
- The Appliance Desk app's own plan lives in that repo at
  `docs/plans/overhaul/` and its Google-integration work is Stage 4 of the
  "Appliance Desk Completion Plan" doc Chris holds in Claude.


## Substantive session cadence and continuation

The current owner prompt sets the session PR count/scope. There is no standing
repository quota or PR-number alignment. Never manufacture work or weaken
acceptance. Routine implementation still prohibits filler/documentation-only PRs.
Mark externally blocked acceptance IN_PROGRESS with exact requirements
while advancing independently eligible work.

The future ending prompt must use the compact template in IMPLEMENTER.md,
identify the verified checkpoint/milestone/next action, recheck the blocker
register, honor every gate, update permanent handoff, and instruct its
successor to write another prompt following the same standard.

## Verified hosting and main protections — October 12, 2026

Follow [the verified hosting-cost operating policy](../HOSTING-COST-POLICY.md). Saved exact-main protection requires GitHub Actions `test` **and** `release-policy`; preserve existing review/agent merge flow, daily checked `main` → `live`, disabled automatic previews, low compute caps and all owner gates. Do not wait for Vercel preview checks or manually deploy at a batch boundary. Record this infrastructure checkpoint in the next substantive PR's status ledger; no documentation-only PR.
