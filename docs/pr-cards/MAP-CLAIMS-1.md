# MAP-CLAIMS-1: every count, date and policy claim in the relational map is tied to its source

## Owner request 2026-11-20

The Second Shift run #2 findings (second-shift-20261120-094156) were handed over at Chris's direction: the relational map stated counts, dates, live-state claims and policy rules that nothing re-checked.

## Outcome and acceptance

- `scripts/check-map-counts.mjs` is the same dependency-free file in vercel-mcp, stripe-mcp, google-workspace-mcp, neon-mcp and github-mcp. Its new checks:
  - Counts are checked as number+label pairs (each `counts.json` entry has a `label`), so two counts swapping numbers is caught.
  - A count is still recognised with an identifier between the number and the noun ("253 registered vercel_* tools"). MAP-COUNTS-1 missed exactly this form.
  - Grouped numbers (1,243), approximations ("~", "about") and prefixed forms (-243, 0.243) never pass as the plain statement.
  - New `docs/relational-map/claims.json` ties each dated, live-state or policy claim to a source file and pattern (a STATUS entry, a code constant, a workflow line or a test name). The checker fails if the map no longer states the claim or the source no longer says it.
  - Every date (YYYY-MM-DD) in a map file must sit inside a registered claim. A date with no source fails the check.
- Proof the check bites: putting back a stale count, or adding an untied date, fails with the reason.

## Drift check

Docs and a check only; no tool or behaviour change.

## This repo

- Finding 6 and its low (388 in the overview): the 388 total and every per-area count are read from the catalog that `gen-catalog.mjs --check` has just proven equal to the registry. Each per-area table cell now states its own pair ("112 admin tools"), so two areas swapping numbers fails.
- 1 claim tied: the stdio mode retirement (Chris's 2026-10-02 decision, `docs/plan/TASKS.md`).
