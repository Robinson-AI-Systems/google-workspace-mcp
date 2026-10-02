# Testing strategy

There are no tests today. P0-1 builds this; every later card uses it.

## Three layers

| Layer | Runs | Talks to | Purpose |
| --- | --- | --- | --- |
| **Unit** (`npm test`) | Every PR, locally and in CI | Nothing real. `fake-google` and `fake-db` stubs | Prove logic: argument handling, dry-run, confirm, read-back, error translation, scope checks |
| **Database** (`npm run test:db`) | On `main` in CI, and locally when a developer sets `TEST_DATABASE_URL` | A Neon **branch** copied from production | Prove schema changes are additive and idempotent and that old data survives |
| **Smoke** (`scripts/smoke-readonly.mjs`) | By hand, after any change to auth or clients, and once per phase | The real Google accounts, read-only tools only | Catch tools that never worked |

## Fakes

### `test/helpers/fake-google.js`

```js
import { makeFakeClients } from '../helpers/fake-google.js';
const { clients, calls, when } = makeFakeClients();
when('gmail.users.settings.sendAs.list').resolves({ data: { sendAs: [] } });
when('gmail.users.settings.sendAs.create').resolves({ data: {} });
await handlers.workflow_brand_mailbox({ userEmail: 'x@y.com', aliases: [{ email: 'a@y.com' }] }, clients);
expect(calls.find(c => c.path === 'gmail.users.settings.sendAs.create').args[0].requestBody.sendAsEmail).toBe('a@y.com');
```

Implementation notes: build the object lazily with a `Proxy` so any
`service.resource.method` path resolves to an async function that records
`{ path, args }` and returns the configured value (default `{ data: {} }`).
`when(path).rejects(err)` to simulate Google errors; build errors with
`googleError(code, reason, message)` helper that matches the shape
`err.response.data.error.{code,message,errors[0].reason}`.

### `test/helpers/fake-db.js`

An in-memory implementation of every function exported from `src/db.js`,
keyed on the same table names. Tests import it and inject it with
`vi.mock('../../src/db.js', () => fakeDb)` so handlers and `api/*` modules
exercise real control flow without Postgres.

### Delegation in tests

`src/auth/service-account.js` reads an env var; tests set
`GOOGLE_SERVICE_ACCOUNT_JSON` to a **generated** key (`crypto.generateKeyPairSync
('rsa', { modulusLength: 2048 })`), never a real one, and mock
`google.auth.JWT` to return a stub auth. Scope checks are tested by asserting
the JWT constructor received exactly the scopes that call asked for (the Gmail pair by default; never anything outside `DELEGATED_SCOPES`).

## Database tests

- Always a Neon branch. `scripts/test-db-upgrade.mjs` is the template: assert
  the starting state, run `initSchema()` twice, run migrations twice, prove
  the second run is a no-op, prove legacy rows remain.
- Each schema-changing card adds a test here that starts from a branch copied
  from production **before** its change and proves old and new code could run
  together (read with the old query shape, write with the new).
- Connection string comes only from `TEST_DATABASE_URL`. Never commit one.
  Never pass one on a command line that gets logged; use the env var.

## Smoke test

`scripts/smoke-readonly.mjs` (P0-2) calls every read-only tool with minimal
arguments against a real account and writes a dated report. The allow-list is
explicit so it can never write. Run it:

- after any change to `src/auth/*`, `api/mcp.js`, or `src/tools/util.js`;
- at each phase gate;
- against **both** connected accounts (`SMOKE_ACCOUNT=ops@robinsonaisystems.com`
  and `ops@robinsonappliancerentals.com`).

## What "tested" means for a card

- New logic has unit tests that would fail if the logic were wrong (not just
  "returns something").
- Anything touching the schema has a database test on a branch.
- Anything touching auth or clients triggers a smoke run, and the report is
  attached to the PR.
- The PR body states exactly which of these ran and which did not, in words
  Chris can read. "All tests pass" with no tests added is not acceptable for
  a card that adds behavior.

## CI (`.github/workflows/ci.yml`)

```yaml
name: ci
on: { pull_request: {}, push: { branches: [main] } }
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run check
      - run: npm test
      - if: github.ref == 'refs/heads/main' && secrets.TEST_DATABASE_URL != ''
        run: npm run test:db
        env: { TEST_DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }} }
```

Chris adds `TEST_DATABASE_URL` as a repository secret pointing at a Neon
branch (Settings → Secrets and variables → Actions → New repository secret).
Until he does, database tests are skipped with a visible notice, never
silently.
