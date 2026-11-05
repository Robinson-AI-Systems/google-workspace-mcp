# RACK-2 — Rack entrypoint: the Vercel function contract, standalone

**Status:** Built 2026-11-05 (rack migration staging, Workspace Unleashed) on branch `ai/vivienne/rack-2-entrypoint`, stacked on RACK-1's merge (main `5f98d52f`). Delivered: `rack-server.mjs` — a thin standalone HTTP server that runs this service outside Vercel by reproducing, route for route, the platform contract the `api/` functions are written against: the filesystem binding for all 27 function files, the `vercel.json` rewrites verbatim (front door, the two `/.well-known` OAuth documents, the six RTC doors onto `api/rtc-gateway.js` with rewrite-injected query parameters winning over the request's own), Vercel-shaped body parsing (per-function `bodyParser` config, 4.5 MB default, platform 400/413 shapes answered before the handler), and the chainable `res.status`/`res.json`/`res.send` helpers on a real Node `ServerResponse` — so the MCP streaming transport and the auth flows' `writeHead` redirects run untouched. Proof: `test/unit/rack-server.test.js` — a tree-walk completeness gate (a handler added without a route fails the test), the rewrite resolutions pinned against `vercel.json` itself, body-limit rules, and the release-pin rules. Rides the next automatic promotion; no owner release fired.
**Batch:** Rack migration program (owner-commissioned 2026-11-03 hosting decision; PenPal moved first). Not a roadmap subsection; counted under the migration program, not the batch averages.
**Design:** The migration dossier for this server (program records, 2026-11-05, dossier §1.2–§1.4, §5 S-2): the entrypoint holds no application logic — every request dispatches to the same handler module Vercel invokes — and it must not impose a shorter ceiling than `vercel.json`'s `maxDuration` values (60 s MCP, 30 s OAuth/Google); a standalone server imposes none, which satisfies the rule by construction.
**Release identity (the card's sharp edge, dossier §1.3):** `src/release.js` reads the deployed commit from `VERCEL_GIT_COMMIT_SHA`, which Vercel sets per deployment and nothing sets on the rack. The entrypoint pins it before accepting traffic, from `RACK_RELEASE_COMMIT` (declared in the rack environment) or a `release-commit.txt` written by the build recipe beside the entrypoint. A valid platform value is never overwritten; an unusable pin leaves the variable unset, so `workspace_whoami` honestly reports a null commit and the move's acceptance read-back fails by design rather than passing on a synthesized value.
**Prerequisites:** RACK-1 (merged, PR #266). Successor: rack enrollment, private deployment and the rehearsal (program phase 2).
**Baseline inspected:** `main` `5f98d52f82b77f083a192f044d1feebe9d569428` (2026-11-05, the RACK-1 merge).
**Risk area:** A route or body-parsing divergence would change public behavior only on the rack build — Vercel never executes this file (it is not under `api/` and `vercel.json` is untouched). The pinned route-table test compares the table against the actual tree and the actual `vercel.json`, so the two cannot drift apart silently in review.
**Budget:** 300.
**Effort:** One new entrypoint module and its route-table test.

## Build

| File | What |
|---|---|
| `rack-server.mjs` | New: `FILE_ROUTES` for all 27 `api/**/*.js` handlers (front door also at `/api`), `resolveRoute` with the nine `vercel.json` rewrites (RTC doors inject `door`/`tool`/`result`), `bodyLimitBytes` from each function's exported config, Vercel-shaped body parsing + platform error shapes, response decoration, `pinReleaseCommit` (see above), loopback-default listener on `PORT`/`HOST` |
| `test/unit/rack-server.test.js` | Tree-walk route completeness, rewrite resolutions read from `vercel.json`, body-limit rules, release-pin rules |
| `docs/pr-cards/RACK-2.md` | This card |

## Acceptance

- `npm run check` green; unit suite green (140 files / 2,147 tests) on the exact head, through the fleet's bench route.
- No handler, route, tool or `vercel.json` behavior changes; the Vercel deployment cannot see this file.
- The entrypoint's live proof (private rack instance answering the §8 battery's private half) belongs to the program's rehearsal phase, not this card.
