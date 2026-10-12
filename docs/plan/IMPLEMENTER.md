# Implementer guide: prompts, PR template, checklists

**Standing owner workflow (2026-10-12):** plan around a useful outcome; five substantial PRs is the normal upper planning boundary, not a quota or proof of acceptance. No docs-only PRs or placeholders; track each external dependency and its precise re-entry trigger. See the authoritative plan README.


## Canonical compact continuation prompt

Use this format at the end of every session. Replace only the
milestone-specific details; the full rules live in the authoritative
README.md, IMPLEMENTER.md and TASKS.md. Do not copy their entirety
into the prompt or create parallel instruction files.

```
Resume Robinson-AI-Systems/google-workspace-mcp from actual current main.
Inspect concurrent branches/PRs, CI at the exact head, unresolved reviews,
owner decisions and the permanent handoff. Follow docs/plan/README.md,
IMPLEMENTER.md, TASKS.md and docs/HOSTING-COST-POLICY.md.

Outcome: <CONCRETE USER/DEVELOPER MILESTONE>.
Remaining acceptance: <CODE, TEST, DEPLOYED AND LIVE INTEGRATION CRITERIA>.
Next eligible action: <ONE PRECISE IMPLEMENTATION OR AUTHORIZED PROOF>.
Recheck TASKS.md blocked/deferred items when dependency merges, owner input
or environment changes resolve their conditions. Do not re-request
previously recorded decisions.

Complete the next normal five-PR batch around coherent useful outcomes
without padding; fewer PRs is acceptable if gates or actual work require
it. Preserve review and exact-head CI, authorization, data integrity,
recovery, scoped TEST accounts, scheduled checked daily main→live,
disabled previews, idle resource limits and owner gates. Distinguish
fakes/reference tests from deployed and real-provider acceptance.

Update the existing permanent handoff and blocker register through a
substantive PR. Report verified main, actual capability and acceptance,
merged PRs, remaining failures and exact external proof required.
Generate the next compact continuation prompt using this same standard.
```

At session start choose the highest-priority eligible milestone and
explicitly reconnect any newly unblocked card to the roadmap.
Do not stop at the PR boundary if an important partial safety defect
still needs fixing; do not bypass gates merely to fill a batch.

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
## Outcome and card
<USABLE CAPABILITY, CARD ID(S), AND REQUIRED ACCEPTANCE>

## What this does (for Chris)
Two to five sentences in plain English. What changes for you, what it will
ask you before acting, anything you need to do (an env var, an Admin console
click) spelled out as numbered steps.

## What changed (for the next developer)
- file: what and why

## Proof by layer
- Merged implementation at exact commit: verified / pending
- `npm run check`: pass/fail
- `npm test`: N passed, N failed (paste the summary line)
- Database tests (`npm run test:db`; CI runs them on a throwaway Postgres): ran / not needed because <reason>
- Smoke report (once P0-2 exists): attached at docs/plan/smoke-report-<date>.md / not needed because <reason>
- Deployed HTTPS service at exact commit: verified / not verified
- Real connected Google / custom MCP / Hub route acceptance: verified / blocked, exact authorized account and denial tests
- Manual check: exact results and redacted evidence

## Deferred work, blockers and next action
For each gap: exact blocker, evidence or decision, dependency, re-entry condition and next action.

## Suggested follow-up
Ideas you had but deliberately did not build.

## Ledger and permanent handoff
TASKS.md card, re-entry table and next eligible action reconciled.


```

## Checklist before opening any PR

- [ ] Branch from fresh `main`; one card (or an allowed group).
- [ ] `npm run check` passes: assembled semantic inventory requires audited exact read-only declarations and genuine guarded-write provenance; `dryRun` alone proves nothing.
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
4. The exact PR head passes `test` and `release-policy`, including applicable reviews. A successful main merge is not a production deployment; only scheduled checked main→live promotion provides that evidence.
5. The agent updates the outcome-based handoff and resumes the next eligible work without needing a redundant merge announcement.

## When the model gets stuck

Before declaring a blocker, investigate and attempt authorized fixes to code,
configuration, dependencies and documentation, and reconcile owner decisions
already supplied. Implement and test everything that does not need the missing
external resource. A blocked operation, release or provider acceptance check
does not block independent approved milestones: record the exact missing
permission/credential/evidence, its re-entry trigger and next action, then
inspect the remaining roadmap and continue. Never relax a safety gate, create
fabricated provider evidence, or stop solely to write a continuation prompt.

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
