# Testing strategy

As of 2026-10-02 the unit suite is 35 files and 1014 tests, all passing, and the
database suite runs in CI on every pull request. The read-only smoke test
against the real accounts (P0-2) is the one layer not built yet.

## Three layers

| Layer | Runs | Talks to | Purpose |
| --- | --- | --- | --- |
| **Unit** (`npm test`, `vitest.config.js`, files in `test/unit/`) | Every PR, locally and in CI | Nothing real. `fake-google` and `fake-db` stubs | Prove logic: argument handling, dry-run, confirm, read-back, error translation, scope checks, lockout, encryption |
| **Database** (`npm run test:db`, `vitest.db.config.js`, files in `test/db/`) | Every PR in CI (on a throwaway Postgres that lives only for that run), and locally when a developer sets `TEST_DATABASE_URL` | Real Postgres, inside its own temporary schema | Prove schema changes are additive and idempotent, old data survives, and the in-memory fake behaves like the real database |
| **Smoke** (`scripts/smoke-readonly.mjs`, **not built yet, card P0-2**) | By hand, after any change to auth or clients, and once per phase | The real Google accounts, read-only tools only | Catch tools that never worked against real Google |

`npm run check` also runs `scripts/check-writes.mjs`, which fails when a tool
that looks like it changes things has no `dryRun` (see ARCHITECTURE.md, "Safety
layer").

## Fakes and helpers (`test/helpers/`)

### `fake-google.js`

`makeFakeClients({ actingAs })` returns `{ clients, calls, when }`. Every
`service.resource.method` path resolves to an async function that records
`{ path, args }` and returns the configured value (default `{ data: {} }`).
`when(path).resolves(value)` / `.rejects(err)` configures a path;
`googleError(code, reason, message)` builds an error with the same shape Google's
client library throws (`err.response.data.error.{code,message,errors[0].reason}`).

```js
import { makeFakeClients } from '../helpers/fake-google.js';
const { clients, calls, when } = makeFakeClients();
when('gmail.users.settings.sendAs.list').resolves({ data: { sendAs: [] } });
await handlers.workflow_brand_mailbox({ userEmail: 'x@y.com', aliases: [{ email: 'a@y.com' }] }, clients);
expect(calls.find(c => c.path === 'gmail.users.settings.sendAs.create')).toBeTruthy();
```

### `fake-db.js`

`createFakeDb()` returns an in-memory version of the functions exported from
`src/db.js`, keyed on the same table names, so handlers and `api/*` modules run
real control flow without Postgres.

### `test/contract/db-contract.js`, `pg-neon-adapter.js`

The same set of checks runs against the fake (unit suite, `fake-db.contract.test.js`)
and against real Postgres (database suite), so the fake cannot drift from the real
thing. `pg-neon-adapter.js` opens an isolated schema per test run and mimics the
query shape the Neon driver uses, so `src/db.js` is tested unchanged.

### Delegation in tests

`src/auth/service-account.js` reads an env var; tests set
`GOOGLE_SERVICE_ACCOUNT_JSON` to a **generated** key
(`crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })`), never a real one,
and supply fake clients through the hooks `clients.gmailFor` and
`clients.delegatedClientsFor`. Scope checks assert that each call asked for
exactly the scopes it needed and that anything outside `DELEGATED_SCOPES` throws.

## Database tests

- Connection string comes only from `TEST_DATABASE_URL`. Never commit one. Never
  pass one on a command line that gets logged; use the env var.
- Tests work in their own temporary schema and clean up after themselves, so they
  are safe against any Postgres including a Neon branch copied from production.
- `test/db/upgrade.test.js` is the template: assert the starting state, run
  `initSchema()` twice, run migrations twice, prove the second run is a no-op,
  prove legacy rows remain. `scripts/test-db-upgrade.mjs` is a thin wrapper that
  runs the same suite.
- Each schema-changing card adds a test here that proves old and new code could run
  together (read with the old query shape, write with the new).

## Smoke test (planned, P0-2)

`scripts/smoke-readonly.mjs` will call every read-only tool with minimal
arguments against a real account and write a dated report. The allow-list is
explicit so it can never write. Run it:

- after any change to `src/auth/*`, `api/mcp.js`, or `src/tools/util.js`;
- at each phase gate;
- against **both** connected accounts (`SMOKE_ACCOUNT=ops@robinsonaisystems.com`
  and `ops@robinsonappliancerentals.com`).

Until it exists, the "manual check" lines in the TASKS.md ledger are the only
live-account proof, and many of them are still outstanding.

## What "tested" means for a card

- New logic has unit tests that would fail if the logic were wrong (not just
  "returns something").
- Anything touching the schema has a database test.
- Anything touching auth or clients triggers a smoke run (once P0-2 exists), and
  the report is attached to the PR.
- The PR body states exactly which of these ran and which did not, in words
  Chris can read. "All tests pass" with no tests added is not acceptable for
  a card that adds behavior.

## CI (`.github/workflows/ci.yml`)

On every pull request and every push to `main`, one job on `ubuntu-latest`
(Node 20) with a throwaway `postgres:16` service container:

```
npm ci
npm run check        # syntax check + scripts/check-writes.mjs
npm test             # unit tests
npm run test:db      # database tests, TEST_DATABASE_URL pointing at the throwaway Postgres
```

No repository secret is needed, so nothing for Chris to add. The throwaway
database holds no real data and disappears when the run ends. A failing test
turns the PR red; the one-time proof of that (card P0-1 acceptance) is still
outstanding.
