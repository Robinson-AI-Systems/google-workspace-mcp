# Implementer guide: prompts, PR template, checklists

## Prompt to paste into the implementing model (Sonnet 5.5, medium effort)

Replace `<CARD>` with the card ID, for example `P0-3`.

```
You are implementing one task card in the Robinson Google Workspace MCP
repository (github.com/Robinson-AI-Systems/google-workspace-mcp).

Read, in this order, before writing any code:
1. docs/plan/README.md
2. docs/plan/ARCHITECTURE.md
3. docs/plan/TESTING.md
4. The card <CARD> in docs/plan/TASKS.md, and any card it says it may group with.
5. The actual source files the card names. Trust the code over the docs; if
   they disagree, fix the doc in the same PR.

Then:
- Create branch ai/sonnet/<CARD>-<short-slug> from the latest main.
- Implement exactly what the card says. Do not add features it does not ask
  for; if you think something is missing, write it under "Suggested follow-up"
  in the PR body instead of building it.
- Write the tests the card's acceptance checks require. Run `npm run check`
  and `npm test` and paste the real output summary into the PR body.
- Update the status ledger row for <CARD> in docs/plan/TASKS.md in the same
  PR (IN_REVIEW, with the PR number once known).
- Open a PR using the template in docs/plan/IMPLEMENTER.md. Write it for Chris,
  who is not a developer: plain English, no unexplained jargon.

Hard rules (from docs/plan/README.md, repeated because they matter):
- Never widen DELEGATED_SCOPES without Chris's written approval in the PR.
- Never log, print, return, or put in a test fixture a real token, passphrase,
  key, or connection string.
- Schema changes are additive only; old and new code must run together.
- Every write tool reads back and returns what Google now holds.
- Destructive tools require confirm: true and support dryRun: true.
- If you cannot finish, say so plainly: mark the card IN_PROGRESS with what is
  missing. Never present partial work as done.

When you finish, stop. Do not start the next card unless told to.
```

## Prompt for the phase-gate review (Opus 5.5 or Fable 5.1, read-only)

```
Review phase <N> of the Robinson Google Workspace MCP plan. Read
docs/plan/README.md, ARCHITECTURE.md, TASKS.md (phase <N> cards and the
ledger), and the diff of every PR listed in the ledger for that phase.

Report, in this order:
1. Security: any way a token, key, or passphrase could leak; any write that
   bypasses defineWrite/confirm; any scope widening; any schema change that is
   not additive.
2. Correctness: acceptance checks that were claimed but not actually proven
   by a test or a committed smoke report.
3. Drift: code that disagrees with ARCHITECTURE.md, or docs that are now wrong.
4. Plain English: PR bodies or tool descriptions Chris could not understand.

For each finding give file:line, what is wrong, and the smallest fix. Do not
write code. End with GO or NO-GO for the next phase.
```

## PR template

```
## Card
<CARD ID and title>

## What this does (for Chris)
Two to five sentences in plain English. What changes for you, what it will
ask you before acting, anything you need to do (an env var, an Admin console
click) spelled out as numbered steps.

## What changed (for the next developer)
- file: what and why

## Proof
- `npm run check`: pass/fail
- `npm test`: N passed, N failed (paste the summary line)
- Database tests (`npm run test:db`; CI runs them on a throwaway Postgres): ran / not needed because <reason>
- Smoke report (once P0-2 exists): attached at docs/plan/smoke-report-<date>.md / not needed because <reason>
- Manual check from the card's acceptance list: what you did and what you saw

## Not done / known gaps
Honest list, or "None".

## Suggested follow-up
Ideas you had but deliberately did not build.

## Ledger
TASKS.md row updated to IN_REVIEW.

🤖 Generated with Claude <model>
```

## Checklist before opening any PR

- [ ] Branch from fresh `main`; one card (or an allowed group).
- [ ] `npm run check` passes (it includes `scripts/check-writes.mjs`, which fails if a changing tool has no `dryRun`).
- [ ] `npm test` passes and new behavior has new tests.
- [ ] No secret in code, tests, fixtures, logs, or PR body.
- [ ] Any new table/column uses `IF NOT EXISTS`; nothing renamed or dropped.
- [ ] Any new write tool: dry-run, confirm (if destructive), read-back, change_log.
- [ ] Any new env var: documented in ARCHITECTURE.md and DEPLOY.md, with the
      exact steps for Chris to set it in Vercel.
- [ ] Tool descriptions say what the tool does, what it needs, and what is
      irreversible, in plain English.
- [ ] TASKS.md ledger updated.
- [ ] PR body follows the template and is readable by a non-developer.

## Checklist Chris uses before merging

1. The "What this does (for Chris)" section makes sense to you. If it does
   not, ask; do not merge.
2. The Proof section shows real test output, not just "tests pass".
3. If the PR asks you to add an env var or click something in Google, do that
   first, then merge.
4. Vercel shows a green production deploy after merge. Open the server's home
   page: the tool count should match what the PR says.
5. Say "merged <CARD>" to the implementing model so it starts the next card.

## When the model gets stuck

- A Google API refuses with "insufficient permissions": the scope is missing
  from `ALL_SCOPES` (for the connection's own account) or from
  `DELEGATED_SCOPES` + Admin console (for delegated calls). Adding to
  `ALL_SCOPES` requires every connected account to re-authorize at
  `/api/google/authorize`; say so in the PR.
- Vercel preview behaves differently from local: previews share the production
  database. Check `initSchema` ran and the change is additive.
- The passphrase page or token endpoint changed: test a full reconnect from a
  Claude project before marking done.
- Unsure whether something is destructive: treat it as destructive.
