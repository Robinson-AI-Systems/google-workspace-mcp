# Robinson Google Workspace MCP: implementation plan

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
- **Session accounting:** target five meaningful, reviewed, CI-green merged PRs with last PR number aligned to the next multiple of five, adjusting for existing PRs and concurrent agents. The boundary is a planning goal rather than permission to pad. If the full batch cannot safely merge, leave the session **INCOMPLETE**; report exact outstanding PRs, owner actions (if any), re-entry triggers and the remaining work instead of presenting a continuation prompt as completion.
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
3. **Build coherent work:** five substantial PRs is the normal session
   planning boundary, **not** evidence of completion and not a quota.
   Group related implementation; never pad or split needlessly. If fewer
   safe substantive PRs are possible, record the precise limitation.
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

The old October 12 exact-PR-number target is historical, not a binding
success metric. Owner update October 13: target five significant PRs per session, adjusting
the session count to end the final PR number on the next multiple of five.
Recalculate against actual current PR numbering and concurrent work. This
is a planning boundary; never manufacture work or weaken acceptance to reach it. No documentation-only PRs or placeholder implementation.
Mark externally blocked acceptance IN_PROGRESS with exact requirements
while advancing independently eligible work.

The future ending prompt must use the compact template in IMPLEMENTER.md,
identify the verified checkpoint/milestone/next action, recheck the blocker
register, honor every gate, update permanent handoff, and instruct its
successor to write another prompt following the same standard.

## Verified hosting and main protections — October 12, 2026

Follow [the verified hosting-cost operating policy](../HOSTING-COST-POLICY.md). Saved exact-main protection requires GitHub Actions `test` **and** `release-policy`; preserve existing review/agent merge flow, daily checked `main` → `live`, disabled automatic previews, low compute caps and all owner gates. Do not wait for Vercel preview checks or manually deploy at a batch boundary. Record this infrastructure checkpoint in the next substantive PR's status ledger; no documentation-only PR.
