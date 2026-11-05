# RACK-1 — Store transport seam: the server's own database runs on plain Postgres

**Status:** Built 2026-11-05 (rack migration staging, Workspace Unleashed) on branch `ai/vivienne/rack-1-store-transport`. Delivered: `src/db-transport.js` — the one place that decides how this server's own Postgres store is reached — and the rerouting of all eight handle-construction sites through it (`src/db.js`, `src/principals/store.js`, `src/principals/delegation.js`, `src/principals/owner-migration.js`, `src/principals/tenant-store.js`, `api/developer/connect.js`, `api/developer/test-pass.js`, `api/developer/test-pass-issue.js`). The Neon HTTP driver remains the transport by default (the Vercel deployment; behavior unchanged); a pooled node-postgres transport serves a plain-Postgres store (the Development Rack) when the deployment declares `STORE_TRANSPORT=pg`. `pg` moves from devDependencies to dependencies. Proof: `test/db/store-transport.test.js` (the real store layer — both schema initializers, all 28 tables, registration and fixture-account round trips — against disposable plain Postgres through the production seam, no module mock) and `test/unit/store-transport.test.js` (selection rules and handle shape). Rides the next automatic promotion; no owner release fired. The rack build pins `main` directly, so staging does not wait for the promotion.
**Batch:** Rack migration program (owner-commissioned 2026-11-03 hosting decision; PenPal moved first). Not a roadmap subsection; counted under the migration program, not the batch averages.
**Design:** The migration dossier for this server (program records, 2026-11-05, dossier §2.1/§5 S-1): unlike Neon Unleashed, this store layer had **no** injection seam — `src/db.js` hard-wired `neon(DATABASE_URL)` and seven further sites built their own handles. The dossier's staging item S-1 is therefore "introduce the seam", with the repo's own real-Postgres test path (the `test/helpers/pg-neon-adapter.js` shape the whole db suite already proves the store layer against) as the proven pattern the pg half lifts into `src/`.
**Prerequisites:** None at source. The rack entrypoint + pinned release identity are the successor card (RACK-2).
**Baseline inspected:** `main` `dc11f8df623b46a1b0bc50847ba960e69cd3642b` (2026-11-05).
**Risk area:** The store holds Google login tokens (encrypted at rest), the connector's OAuth registrations/tokens and the principal store. A transport that mishandles parameters or row shapes could corrupt or expose them; the change is therefore behavior-preserving by construction — one selection point, both drivers behind the identical handle contract (tagged-template + `.query`, rows as plain objects, driver error codes and `.constraint` preserved — `src/db.js`'s concurrent-DDL retry reads exactly those fields), and the existing db suite is the parity harness.
**Budget:** 300.
**Effort:** One new module, eight one-line call-site reroutes, a dependency move, and transport tests.

## Read only these

- This card; the migration dossier §2.1 and §5 (S-1) in the program records.
- `src/db.js` (`db()`, `initSchema`), `test/helpers/pg-neon-adapter.js` (the pattern being promoted), `test/helpers/p10-postgres-neon-shim.mjs` (the principals-side proof of the same shape).

## Drift check RACK-1

| Card assumption | Actual | Kind | Correction |
|---|---|---|---|
| `src/db.js` is the only place the Neon driver is constructed | Refuted by census: eight construction sites — `src/db.js`, four under `src/principals/`, three under `api/developer/` — each with its own lazy cache and its own missing-URL behavior | widened | All eight route through `src/db-transport.js`; each site keeps its own cache, its own missing-URL guard and its own error wording, so no error contract changes |
| A hostname rule can select the transport (the Neon Unleashed precedent) | Refuted for this repo: the db suite sets `DATABASE_URL` to a plain-Postgres test URL and substitutes the neon module to prove the store layer — an automatic hostname switch would route around that substitution and break the suite's meaning | corrected | Selection is an explicit deployment declaration: `STORE_TRANSPORT=pg` selects pg; anything else (including unset) selects the Neon driver. A URL change alone can never reroute production. The rack environment declares it |
| The pg transport must emulate driver extras (transactions, `.query` variants) | Refuted by census: the handle is used as a tagged template everywhere, plus `.query(text, values)` in the developer endpoints (which already feature-test for it); no `.transaction()` anywhere | matches | The pg handle implements exactly the tagged-template contract plus `.query` and an idempotent `.end()` over a per-URL shared pool |
| `deleteOAuthClient`'s removed-counts are part of the handle contract | Bounded difference, recorded: through the Neon driver a non-RETURNING DELETE result carries a `count`; through pg (rows-only contract, same as the repo's own test adapter) the counts read 0 while the deletion itself is exact | noted | Not fixed here — the fleet's reconciliation rule already reads counts from the store, never from revoke confirmations (the same anomaly is on the production record for the Neon side). A `rowCount`-carrying handle is a possible later card, judged on its own |

## Build

| File | What |
|---|---|
| `src/db-transport.js` | New: transport selection (`STORE_TRANSPORT` declaration; default Neon), a per-URL shared pooled pg handle implementing the shared contract, and `storeSql(url, env)` — the Neon branch passes the URL through untouched (the driver's own construction behavior, including its missing-string error, is preserved); the pg branch refuses a missing URL rather than fall back to node-postgres environment defaults |
| `src/db.js`, `src/principals/{store,delegation,owner-migration,tenant-store}.js`, `api/developer/{connect,test-pass,test-pass-issue}.js` | Each site's `neon(process.env.DATABASE_URL)` becomes `storeSql(process.env.DATABASE_URL)`; the direct `@neondatabase/serverless` import leaves all eight files |
| `package.json` / `package-lock.json` | `pg` moves to dependencies (the rack runtime installs production dependencies only); no version change |
| `test/unit/store-transport.test.js` | Selection rules: default Neon for every URL shape, explicit declaration wins, unknown value refused, pg-without-URL fails closed, handle shape without connecting, shared-pool end semantics |
| `test/db/store-transport.test.js` | Real disposable Postgres through the production seam (no mocks): all 28 store tables created by `initSchema`, registration round trip (`createOAuthClient`/`getOAuthClient`/`listOAuthClients`/`deleteOAuthClient`), fixture Google account + change-log round trip |

## Acceptance

- `npm run check` green; unit suite green (2,141 tests); db suite green on disposable Postgres (104 tests, including the pre-existing suites running through the seam via their neon-module substitution, unchanged).
- No tool added, removed or re-described; tool surface stays 385 on a live-mode owner connection; no profile, guard or production-classification behavior changes.
- Deployed behavior on Vercel is unchanged: nothing there declares `STORE_TRANSPORT`, so the Neon driver is selected exactly as before. Live verification of that statement rides the next promotion's VER-1 read-back (the fleet health evidence for this server), not this card.
