# MAP-COUNTS-1: the relational map's numbers are checked against the code

## Owner request 2026-11-18

Chris: "Yes" to dealing with the Second Shift 48-hour run's relational-map findings (here: finding 13 on PR #319).

## Outcome and acceptance

- `scripts/check-map-counts.mjs` (the same dependency-free file across the fleet repos) reads `docs/relational-map/counts.json`, computes each stated count from the code at this commit, and fails if a value differs, a listed map file does not state it, or the map states a "<n> tools/modules/…" count (or a "~" approximation) the file does not list. It runs first in `npm run check`.
- Checked counts: 388 registered tools (from `scripts/gen-catalog.mjs --check`, which compares the README catalog with the assembled registry) and all fourteen per-area counts in `03-tool-registry-and-guards.md`, read from that just-verified catalog. All correct today.
- Proof the check bites: a wrong value in `counts.json` fails with the code's real number.

## Drift check

Docs and a check only; no tool or behaviour change.

## Also: RUNNER-DEADLOCK-1 (same morning)

With two of the three self-hosted machines offline, a release's promotion job waited for the newest required check on main, which was another release run's job queued behind it on the only runner, until its 15-minute timeout (seen live on rack-mcp). `.github/release/promote-live.mjs` now goes by the newest *finished* run of each required check: a queued copy no longer holds it back, a newer failure still blocks, nothing passes without a finished success. Acceptance: `.github/release/promote-live.test.mjs`.
