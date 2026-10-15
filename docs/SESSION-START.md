# SESSION-START — reconcile, accept released work, implement, close out

## Autonomous execution contract

“Do N bundles” authorizes continuing the full documented process without routine
permission stops: reconcile → perform eligible acceptance → implement → verify →
review/merge → cleanup/handoff → next outcome until N and eligible obligations are
satisfied. Checkpoints preserve progress; they do not end otherwise feasible work.

On a terminal failure, diagnose and repair; on green CI, handle reviews and merge
when authorized. During pending CI, do useful independent scoped work, then recheck
at a meaningful transition. Repeated unchanged results require a different action,
not a busy loop. Never silently stop or imply background execution after a turn ends.

Before a blocker can justify stopping, identify its exact error/evidence, investigate
its cause, check already-recorded decisions and attempt authorized remedies. Isolate
one blocked operation and continue independently eligible work. If nothing authorized
can proceed, explain to the owner: what is blocked, why, what was tried, what specific
input/permission/resource or fix you believe would unblock it, and your recommended
next action. Ask genuinely missing owner input promptly while independent work proceeds.
An actual execution limit gets an explicit incomplete recoverable checkpoint, never
a completion claim. Preserve every real safety, spending, release and approval gate.


## Implementation bundles advance the approved product to completion
<!-- BUNDLE_SCOPE_VERSION_1 -->

“Do N bundles” sets substantial NEW completion workload within the existing plan.
It does not require new features or production-code changes when the remaining
requirements are deployment, configuration, integration or genuine acceptance.
Never expand scope merely to create code. Old implementation, checklist discovery,
repeated permission-denied probes, audit prose, waiting and status updates count zero.

Select in this order after acceptance catch-up:
1. Finish confirmed OPEN engineering in roadmap order. REVIEW means resolve a
   specific undecided requirement once; it is work to do, not a stopping point.
2. When no eligible engineering remains, pursue a substantial connected completion
   outcome from the original requirements, with existing acceptance task IDs.
3. If all remaining paths are actually blocked, report project completion state,
   each exact prerequisite, attempted remedy and the smallest actionable owner
   request. Ask during the session, not merely as a suggested future task.
   Optional P8-6 never blocks standalone completion. Do not propose new phases
   until every approved requirement is reconciled and the real finish path is known.

The default ENGINEERING bundle retains the normal guide of 2–5 full original
subsections and 400–800 meaningful production lines, excluding tests/docs/generated
or mechanical changes. One substantial subsection may qualify. These are workload
guides, not padding requirements. Completing a small remainder contributes to the
same bundle; continue related work rather than paying publication overhead per helper.

A COMPLETION bundle finishes substantial previously unmet real-world criteria,
possibly with zero production lines. It must deliver new verified results, not
recount the engineering behind them. Preserve original subsection IDs and full
criteria, and review substantive workload explicitly. A single read, already
recorded pass, small fix or newly invented subcard does not become a bundle.
Eligible acceptance is always required; count a substantial acceptance outcome
once only when explicitly planned as a completion bundle. Other obligations remain
additional. Full product acceptance and code completion remain separate states.

### Plan once, retain scope, verify the outcome

Use the existing execution card, never a second roadmap. Before doing the selected
work preserve one JSON object between `<!-- bundle-plan:start -->` and
`<!-- bundle-plan:end -->` in a fenced `json` block. Common fields:
`baseRevision` (full current SHA), `outcome`, `integrationBoundary`,
`newEngineering` (state explicitly when none is needed), `estimatedProductionLines`,
`relatedWorkDecision`, and `subsections` with existing `id`, full original
`acceptance` strings and `remainingEngineering` strings.

ENGINEERING is the default. For `workKind: "COMPLETION"`, use
`estimatedProductionLines: 0` if appropriate, an empty `remainingEngineering` list
and a nonempty `remainingWork` list per subsection, plus `acceptanceTasks` listing
the existing precise queue IDs. Freeze the whole intended outcome, not convenient
passing fragments. No production-code minimum applies to this mode.

Run `npm run session:bundle -- --card docs/EXISTING-CARD.md`, commit the plan
locally before the work and retain its exact SHA. This recovery commit belongs in
the outcome PR; it is not a separate plan-only PR or permission stop. Already-started
work retains honest transition evidence; never invent a historical planning commit.

Delivery JSON retains every subsection and original criterion in order, with
`criteria: [{"criterion": "original text", "evidence": "concrete proof"}]`,
`remainingEngineering: []` when finished, and `remainingWork: []` for completion.
Also supply actual `productionAdded`, `productionRemoved`, `newEngineering`,
`planComparison`, `relatedWorkDecision`, and `decision`:
`CONTINUE` while incomplete; `SUBSTANTIAL` when at guide; otherwise
`SUBSTANTIAL_EXCEPTION` with concrete `exceptionEvidence` of substantial new work.
Zero-code completion therefore requires an explicit substantive review, not a waiver.

Run `npm run session:bundle -- --card docs/EXISTING-CARD.md --planned-at FULL_SHA
--report /tmp/bundle-delivery.json`. Never rewrite a frozen plan to match a smaller
delivery. Multiple small ENGINEERING contributions can be combined and counted once;
a COMPLETION bundle preserves one whole connected plan/task list.

### Closeout accounting

Run `npm run session:finish -- --bundles N --report PATH` using the actual owner
target. The sanitized JSON has `baseRevision` and `bundles`, each with `outcome`,
`subsections`, `merges` (new permanent evidence/source commits on origin/main),
`productionAdded`, `productionRemoved`, `proof`, and `scopeReview`.
`scopeReview.plans` lists `{cardPath, plannedAt, delivery}` objects; also include
its combined `newEngineering`, `planComparison`, `relatedWorkDecision`, `decision`
and any `exceptionEvidence`. Completion bundles additionally retain
`workKind: "COMPLETION"` and the frozen `acceptanceTasks` list.

A completion claim requires those existing tasks to change from not-passed at the
session baseline to PASSED in merged permanent records, with new genuine evidence
and unchanged scope, prerequisites and source pin. Every named subsection must
map to newly passed work. Previously completed engineering may host NEW acceptance;
it is not counted again as engineering. Reused passes, copied receipts, changed
gates and shared tasks across bundles cannot satisfy the new-work target. Genuine
acceptance artifacts may form the substantive outcome PR without a source change;
this permits real evidence publication, not filler documentation-only PRs.

These commands check accounting, not evidence truth, permission, substantiality,
CI or product readiness. Independently review all required gates. Maintenance
requests such as this workflow correction claim zero product bundles.

An unmet target stays incomplete. For a real execution limit, use `stop.kind:
"EXECUTION_LIMIT"`, nonempty `stop.evidence`, `stop.nextAction`, an exact current-main
`checkpoint`, and the actual failed `constraint`. For true external exhaustion use
`EXTERNAL_EXHAUSTION`, evidence/nextAction and `stop.bySubsection` evidence/remedies
for EVERY remaining ID. Unresolved OPEN/REVIEW rows refuse that exhaustion claim.
Neither path is success; the command exits 2 with INCOMPLETE_CHECKPOINT. Elapsed
minutes, clean git, main ahead of live or inability to find 400 lines is not a blocker.

### Reuse reconciled scope and isolate external prerequisites

Read TASKS.md's current disposition, not stale historical candidate handoffs.
Merged candidate branches do not need reimplementation. Reopen reconciled criteria
only for changed relevant source/provider contracts, a real failure or new evidence.
Record missing engineering immediately; do not hide it behind a future activation date.
P5-2's November 1 gate restricts production retirement, not implementing its dormant
behavior and synthetic database proof now.

P8-8 already authorizes a dated authenticated Admin Console walkthrough, comparison
with guidance/readbacks, and correcting missing map coverage. It does not require
new owner scope approval, an observation-storage feature or a new phase. Use an
available authorized browser route. If access is missing, investigate that route
and ask for the exact necessary sign-in/account or role action. Do not ask for
policy changes, broader OAuth scopes or customer-wide reads without their real approval.
An API checklist is not an observed console walk.

Original-runner/pass ownership is binding for recovering ITS old fixtures. It does
not block unrelated read-only checks or a separately authorized fresh TEST run.
Do not seize a rotating grant, copy credentials, recreate uncertain fixtures or
claim that a new pass owns an old run. Identify each check's actual prerequisite,
remedy, responsible party and re-entry trigger, then continue independent work.

## Count complete predefined batch subsections

The PR workload target is 2–5 whole predefined batch subsections on average,
using the existing roadmap/design IDs such as H-3 or B-5. Technical slices,
functions, tools, UI hookups, guards and packet checklist tasks are internal
implementation steps, not countable batch subsections. List the subsection IDs
and full scope before coding. Partial subsections count zero; count each once
when eligible engineering and required pre-merge proof are complete, with
external acceptance tracked separately. Use focused checks while building,
then the full required gates on the substantial assembled PR. See the governing
instructions' **PR workload is measured in predefined batch subsections** rule.

## 0. Reconcile and recover

Read the governing instructions and the current permanent handoff, not historical
status entries as new work. Verify actual main, live, the READY production revision,
open/unfinished PRs, exact-head CI and unresolved reviews. Preserve concurrent work.
Recover your interrupted/red PR first; inspect all failures and batch their remedies.

**Prepare once, then implement.** Run `npm run session:prepare` during startup to
consolidate local Node/dependency, container-memory and disposable-Postgres route
diagnosis. It runs no tests, installs nothing and grants no provider authority.
Use an existing supported runner/required exact-head CI for unavailable local modes;
missing local infrastructure blocks only that local proof. Preserve normal CI.
Do not keep cycling production build flags, substitute a dev-server result, provision
paid capacity, or ask the owner to perform a task the authorized runner can do.


## 1. Catch up released work before new implementation

Fetch main/live refs and independently verify the actual serving production origin,
source SHA and READY state. Workflow success, branch equality or a service self-report
alone is insufficient. Run `npm run session:status -- --deployed FULL_SHA --state READY`
with those observations, or use the same ledger and exact GitHub compare/deployment
evidence manually when no shell is available. The command is read-only: it does not
execute acceptance, release software or authorize provider operations.

Evaluate EACH outstanding check against its required revision in deployed ancestry.
Main/live equality is never a global acceptance prerequisite. Perform every currently
eligible authorized check before selecting new implementation; recheck BLOCKED rows
against current decisions and attempt authorized remedies. Defer only the affected
check with its exact missing prerequisite, investigated remedy and next action.
Missing history means fetch/compare that revision; it does not mean “not released.”
Preserve valid evidence until relevant changes invalidate it. Reading the queue or
observing a release is not acceptance execution. Preserve fixture and cleanup gates.

Reconcile all outstanding queue rows, including rows hidden by an output limit, in
the existing ledger/handoff. Before new implementation and final reporting, validate
that accounting with `npm run session:status -- --deployed FULL_SHA --state READY
--acceptance-review /tmp/acceptance-review.json`. This temporary sanitized extract
is not a second ledger and must not contain secrets, provider bodies or private IDs.
It contains the printed `snapshot` digest, `deployed`, `deploymentState`, and `tasks`; every outstanding task needs
`id`, `requiredRevision`, current planner `disposition`, `outcome` and `evidence`.
Use `PERFORMED` with `result: PASS|FAIL` (and `nextAction` for FAIL), or `DEFERRED`
with `prerequisite`, `remedy` and `nextAction`. Existing recorded passes need no
retyping; optional `REUSED` entries reference their evidence. The checker requires a verified READY deployed revision and rejects
omissions or changes to any queue field via the snapshot digest; it cannot attest evidence truth or grant permission.
Without a shell, put the same item-by-item accounting in the permanent handoff.
Record actual results in the existing ledger; rerun the extract after ledger changes.
An inaccessible deployment/evidence source requires investigation and a specific
checkpoint, not fake observations or a project-wide stop.

Recheck at observed releases/configuration changes, after meaningful merges, and
before final handoff. A scheduled, delayed, recovery or separately authorized manual
release uses the same per-check procedure. Follow the checked release policy; never
initiate a release just to finish a development bundle.

### Recognize and escalate a release dependency — owner October 15

After independently verifying deployed READY/source and fetching required history,
identify each check whose required source is on reviewed main but absent from live.
`session:status` emits RELEASE NEEDED only for that confirmed source gap; unknown
history requires investigation, and source already in live requires deployment/build
follow-up rather than another release. Other permission/fixture gates remain separate.

Alert the owner in the active chat when a release is needed to advance approved
completion. Before requesting approval, prepare the exact main SHA, required green
checks/reviews, source/live/deployed comparison, affected task IDs, remaining non-release
prerequisites, standard checked release route and post-deployment acceptance steps.
Explain whether the next scheduled release can clear it or a manual release would
unblock work sooner. Request explicit approval for that concrete manual release;
Do N bundles and permission to ask are NOT permission to release. Do not weaken
frequency/checked promotion policy or trigger a release merely to satisfy N.
Continue independent eligible work while waiting. After an authorized release,
verify actual serving READY/source and immediately reassess/run newly eligible
acceptance; never stop at a green release workflow alone.

## 1a. Choose a substantial outcome

Read the authoritative `docs/plan/TASKS.md` roadmap and highest-priority eligible task.
State its observable result and finite acceptance before editing. Read only its named
code seams, design sections and fixtures; reuse existing helpers and task/packet tools.
Group compatible adjacent roadmap slices into a complete usable workflow,
including callers, real integration and tests. Plan a suitable coherent PR
around 400–800 changed production lines plus tests; this is advisory and not a
reason to pad a smaller valid outcome or fragment a larger one. Explicitly
list included slice IDs and acceptance criteria before writing code. Larger
cohesive PRs require extra integration/risk/verification coverage. Preserve actual
migration ordering, risk isolation and every business/security/financial decision gate.
Do not revisit passing hardening without a demonstrated defect or approved requirement.

## 2. Finish the current roadmap outcome

Use the approved order, active card/packet and parent outcome from actual main.
Before coding, turn that outcome's remaining engineering into one finite checklist:
provider/domain behavior, callers/registry/doors or UI, failure/denial/replay paths,
fixtures and integration proof. Reuse the card; do not create another roadmap.
Complete that eligible integration before selecting later dependent units.
Helper completion, PR numbering and easier tickets do not establish outcome completion.

Investigate technical problems and inherited reviews in this unit; batch authorized
remedies rather than carrying implementable fixes as external acceptance. If an
essential owner-specific policy, fact or permission is missing, check recorded decisions
first, then ask the smallest precise question now with a recommendation and consequences.
Pause only its dependent path, record the answer and resume the same outcome/session.
Research public provider contracts independently; do not ask the owner to resolve them.
Where existing gates permit, continue safe configurable implementation while actual
activation/provider/professional acceptance remains separately restricted. Never invent
approval, widen permissions or mark unimplemented code as waiting for a release.

At handoff, name the same unfinished outcome unless its eligible engineering has proof.
Move to independent work only when the roadmap permits it; preserve genuine execution
limits, risk boundaries, approval gates and the existing release acceptance queue.

## 3. Build, verify, publish

Use focused behavioral tests/lint at meaningful seams while developing. Local commits
are recovery points, not reasons to run the entire suite or push after every small edit.
Before publishing the coherent tree, run all existing mandatory checks and applicable
unit/database/provider-shape/browser gates once. File changes invalidate affected proof.
On a shared LOCAL sandbox runner, cap Vitest workers (for example `--maxWorkers=2`) and
run at most two full suites concurrently; preserve the same test selectors/coverage.
Batch known CI/review fixes; inspect all failed jobs before the next correction push.
While CI waits, advance the approved immediate successor; at most two unmerged PRs.
Follow existing REST/Sandbox fallbacks if local execution is unavailable; report actual
Actions evidence honestly. Merge only exact-head green checks plus required reviews.


**Parallel CI is a maintained contract.** Independent verification families run as
sibling jobs; only actual setup/migration/seed and within-scenario state dependencies
remain ordered. Separate SQL jobs get separate disposable databases. Local shared
sandbox worker limits do NOT serialize isolated GitHub jobs. Preserve each existing
required aggregate check name, all family results, immutable dependency pins,
assertions, skip checks and read-only/no-secret rules. The CI layout guard rejects
accidental family chains, missing aggregate inputs, collapsed/serialized matrices
and missing/increased job timeouts. Do not add `needs` merely to save an install.

Timed root test/build phases use `scripts/ci-phase.mjs` with a 180-second feedback
budget and emit measured timing. Command failure or budget excess fails; normal
job timeouts remain separate safety bounds, not desired feedback durations. When
a phase grows, inspect code/fixture/runner timing and fix demonstrated slowdown or
split independent test files/cohorts into parallel jobs/shards while proving full
coverage and isolation. Do not raise the budget/timeout, skip assertions, loosen
performance thresholds or rerun blindly. A measured runner anomaly can use the
existing controlled same-head rerun policy, retaining the original failure. Compare
critical-path wall time (parallel jobs overlap), not a sum of all runner minutes.

### First-pass validation and review

Use the existing selected card/packet as ONE consumer checklist throughout the
bundle: changed symbol/contract -> actual callers -> persistence/provider -> full
fixture -> positive/denied/recovery proof -> focused command. Resolve original
requirements and recorded owner decisions once at the relevant revision; revisit
only changed boundaries or new failure evidence. No repeated whole-repo audit.
Prepare a complete realistic fixture early (identities/roles, required fields, exact
amounts/IDs, state transitions and recovery). Exercise the smallest existing route
through the actual handler/form control before the broad publication cycle. A
reference fake's success does not prove the actual service adapter; validate the
pinned boundary, method/args/receipt shape and real adapter together.

At the stable local pre-publication checkpoint, run
`npm run session:prepare -- --publish`: it fetches current main and predicts textual
merge conflicts without moving your branch/worktree. Resolve conflicts and review
changed shared contracts/fixtures BEFORE spending a publication CI cycle. A clean
prediction is not semantic compatibility or permission to merge. Reconcile again
only when main/your relevant inputs actually change, not in a status-check loop.
Batch independent reads, collect all completed failures, make one related correction,
and consolidate existing documentation once before publication. Use small job/status
metadata while CI is pending; inspect failed logs after completion. Reuse valid
evidence and record exact phases/timings where observable, with overlaps/unknown
time explicit rather than invented coding or idle durations.

- Trace inputs through the actual caller, helper/client, provider request and result.
  Verify method, path/version, scopes, query/body fields, pagination and response shape
  against the pinned schema/SDK or cited current provider contract **before** adapting
  fixtures. Test the captured outbound request; a permissive fake is not contract proof.
- Reuse realistic fixtures with required fields and relationships. Assert meaningful
  results, denied paths and applicable provider failures/ambiguous writes; prove no
  unintended call or replay. Never weaken a fake/assertion just to turn CI green.
- Search changed exports and data shapes for affected callers, fakes, DB adapters,
  catalogs and tests; update them together. Run existing repository/index/schema/catalog
  validators plus the affected behavioral tests before the full publication gates.
- Review the complete diff against the card and applicable security guide before
  opening the PR. Inspect inherited unresolved findings and all current review threads;
  record each fix or evidence-backed disposition under the repository's review rules.
  A reply alone does not resolve a finding; recheck reviews immediately before merge.
- When CI fails, collect every completed failing job/annotation and trace the root
  cause before one correction push. Reproduce with the smallest relevant existing
  command; retain a regression test for an actual behavioral defect. A repeated failure
  requires new diagnostic evidence, not another speculative fixture edit.

Record exact commands, results and unavailable checks truthfully in the PR. REST-only
sessions still inspect contracts, fixtures and the full diff before publication, then
use required exact-head Actions evidence for execution they cannot perform locally.
Do not invent commands, relax coverage or merge gates, or rerun unchanged passing checks
unless changes or new evidence invalidate them. Live proof remains in the release queue.

Use `npm run check` and affected `test/unit` tests; DB changes need `test:db`.
For RTC integration/runner changes, prepare `.rtc-hub` at the reviewed commit pinned
in `.github/workflows/ci.yml`, then run both `npm run test:rtc` and
`node scripts/rtc-conformance-ci.mjs`; the Vitest suite does not execute that runner.
Assert recorded Google client method and exact arguments; default fake `{ data: {} }`
responses cannot prove new request shapes.

**PR merge readiness and product acceptance are separate.** A safe implementation PR
may merge with deployment-dependent proof queued, when all pre-merge gates pass and
no explicit card/owner rule requires that proof before merge. Keep such a milestone
IN_PROGRESS/awaiting acceptance. An explicit pre-merge gate still blocks that PR; move
to independently eligible work. Never mark code/CI as deployed or real-provider proof.

## 4. Maintain one release acceptance queue

The marked JSON block in the authoritative status ledger is the running queue, not a
second roadmap. Preserve existing card IDs/evidence and reconcile older open obligations
into it before declaring the catch-up complete. Keep each task's priority, exact minimum
reviewed source revision, procedure, prerequisites, gates, last evidence and disposition.
`dependsOn` names acceptance tasks that must have recorded genuine PASSED evidence;
source implementation dependencies remain in the existing work index. Split broad seed
rows into exact scenario rows as fixtures/revisions are reconciled. No fake pass entries.
After every meaningful merge, add any new deployment-dependent checks in that PR; pin
its source commit, never a guessed future merge SHA. After a release, execute cleared
checks only when that source is in deployed ancestry. If a permitted squash/rebase
removed the pin, reconcile it to the independently verified merged implementation
commit before handoff; never mark it passed or repin to unrelated code.
Execute cleared checks promptly, record sanitized read/write/denial/readback/cleanup proof, and retain
failed/uncertain fixture recovery tasks. New changes, rollback, authorization or environment
changes reopen affected proof. NEVER copy credentials/private fixture IDs into the queue.

## 5. Checkpoint and finish

Before reporting session completion, reconcile the acceptance queue again against
actual deployment and finish its accounting above. Report performed checks/results,
reused proof and each deferred check's exact prerequisite/remedy/next action, alongside
bundle outcomes, subsection IDs, merged PRs, checks/reviews and cleanup. Update existing
status/cards/index and the permanent merged-PR handoff. Reaching N bundles or pushing
a checkpoint does not complete the session while eligible obligations remain.
An actual execution limit requires an explicit incomplete, recoverable handoff.


**Remaining-work visibility.** Run `npm run session:status` for current
roadmap counts and unfinished IDs in approved order alongside the separate
release acceptance queue. Counts describe the existing index/ledger's coarse
units; counts do not establish completed subsections or live acceptance.
Record actual completed slices and remaining engineering in existing cards
and handoffs; never promote an incomplete card to improve the numbers.
Follow the designated roadmap order rather than the milestone in an old handoff.

At each PR handoff record production additions/deletions (excluding tests,
docs, generated files, fixtures and formatting), completed slice IDs and
acceptance evidence. Evaluate 400–800 production lines and 2–5 complete batch subsections
per PR on rolling averages over the latest five merged implementation PRs;
unrecorded historical measurements stay unknown, never invented.


Keep a short progress note on interrupted branches: head, done/proof, one next action,
CI/review state, successor and exact blocker. Diagnose and attempt authorized remedies
before deferring; isolate the operation and continue approved independent work. Limited
release frequency is planned queued acceptance, never a project-wide stop.

When the current owner prompt sets a bundle target, continue until that target
is met or the evidence-backed incomplete-checkpoint rule above applies. Only
without an explicit target do normal sessions use available recoverable context. A suitable PR may integrate
several adjacent small slices (typically targeting 400–800 changed production lines
plus tests), but contracts, review risk and end-to-end behavior determine size;
a smaller complete subsection contributes toward the planned substantial bundle; a larger coherent bundle is legitimate. Session PR count is set only by the current owner prompt.
Do not count a passing helper as a completed outcome. After each verified
merge, checkpoint the exact head/CI/reviews, completed slices, implementation
and deployed/real-acceptance state, and one next action. Continue the planned bundle after checkpoints. A demonstrated execution limit
requires an explicitly incomplete handoff with exact recovery action; a clean
checkpoint or speculative context concern does not establish bundle completion.
Persist unfinished work on its existing approved card, not only in chat.
Report completed roadmap slices and acceptance deltas, first-pass CI failures
and correction cycles, not PR count as a productivity metric.
Historical workflow-maintenance sessions do not redefine the current task. Follow
the current owner scope and preserve safety; report genuine execution limits honestly.
At completed-session end update status/cards/index, verify final main, leave a permanent
handoff on the final merged PR and automatically give a short continuation prompt:
repository + verified handoff + next outcome + queue pointer. Refer to the repository
for rules/order rather than recopying them. Preserve interrupted-session obligations.

## 6. Safety and specialized procedures

Governing instructions, existing PLAYBOOK/hosting rules, owner decisions and the card's
specific safety procedures remain binding. Reuse saved authorized developer connections.
Security, money-out approval, production activation, spend, isolation, exact fixture
cleanup, secret handling and all required local/Actions tests are unchanged.
