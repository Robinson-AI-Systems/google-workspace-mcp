# Robinson Google Workspace MCP: implementation plan

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
make it a bundle. Larger coherent outcomes are allowed when reliably reviewable.
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
   and plaintext-token retirement's thirty-day time gate. Stripe LIVE
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
Only P0-2 (the live read-only smoke test), P5-2 and P5-4 are not built (P6-1, full group settings, is an optional extension and is built, awaiting a live check); see the
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
