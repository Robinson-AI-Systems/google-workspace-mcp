# Robinson Google Workspace MCP: implementation plan

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

## How to run the plan

1. Open `IMPLEMENTER.md`, copy the prompt at the top into a new session with
   the implementing model, and name the task card ID you want done (for
   example `P0-3`).
2. The model works one card per PR, in the order in TASKS.md, unless a card
   says it may be grouped. Chris prefers fewer, larger PRs over many small
   ones; cards marked "may group with" can share a PR.
3. Every PR: branch `ai/<model>/<card-id>-<slug>`, tests pass locally,
   `npm run check` passes, the PR body follows the template in IMPLEMENTER.md,
   and TASKS.md's status ledger is updated in the same PR.
4. Chris merges. Vercel deploys `main` automatically. Preview deployments of
   branches share the production database, so every schema change must be
   additive and must tolerate old and new code running at once (see
   ARCHITECTURE.md, "Database rules").
5. At the end of each phase, run the phase-gate review with the review model
   using the review prompt in IMPLEMENTER.md. Fix what it finds before
   starting the next phase.

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
| P7 | God Mode expansion (proposed 2026-10-02) | P7-1 to P7-8 | about 12 days, none built |

Phases are sequential. P0 came first because there were no tests; there are
now, and every later card relies on them to prove it did not break something.
Only P0-2 (the live read-only smoke test), P5-2 and P5-4 are not built (P6-1, full group settings, is an optional extension and is built, awaiting a live check); see the
ledger in `TASKS.md` for the exact state of every card.

## Rules that never bend

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
