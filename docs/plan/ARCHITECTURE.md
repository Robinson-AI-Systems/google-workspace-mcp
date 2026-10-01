# Architecture, as of 2026-09-30

Read this before touching code. It describes what exists, why, and the
conventions every card must keep. Where the code and this page disagree, the
code is the truth and this page gets fixed in the same PR.

## One-paragraph summary

A Node.js (ES modules) MCP server. In hosted mode it runs as Vercel serverless
functions under `api/`, keeps all state in a Neon Postgres database, and is
reached by Claude at `https://<host>/api/mcp` with a bearer token the server
itself issued. It holds Google sign-ins for one or more mailboxes
(`google_accounts`); each Claude connection is bound to one of them at login.
Tool calls act as that mailbox through the Google APIs. A separate, narrowly
scoped service account lets two tools act *inside* other users' Gmail
settings. A local stdio mode (`src/index.js`) exists for Claude Desktop and
uses a file-based token; it has not been maintained alongside the hosted mode
and is out of scope for this plan except where a card says otherwise.

## Request path (hosted)

```
Claude ──bearer──▶ api/mcp.js
                     │ initSchema()           additive CREATE/ALTER IF NOT EXISTS
                     │ getAccessToken(token)  → oauth_tokens row (has google_account)
                     │ ensureMigrated()       legacy single-account → google_accounts (copy, once)
                     │ buildServer(account)
                     ▼
               tool handler(args, clients)
                     │ clients = buildHostedApiClients(account)
                     │   → OAuth2 client with that account's stored tokens (auto-refresh, persisted)
                     │   → googleapis clients: gmail, drive, calendar, admin, …
                     ▼
               ok(value) | errorResult(err)    src/tools/util.js
```

`api/mcp.js` creates a fresh MCP `Server` + `StreamableHTTPServerTransport`
per request (serverless has no memory between calls). Tool list and handlers
come from `src/tools/index.js`, which merges every tool module with
`mergeNamespaces` (duplicate names throw at import time).

## Connector login (how Claude gets its bearer token)

OAuth 2.1 with PKCE, served by the files under `api/oauth/` and
`api/well-known/`:

1. Claude discovers metadata at `/.well-known/oauth-authorization-server`.
2. Claude registers a client (`api/oauth/register.js`, dynamic registration →
   `oauth_clients`).
3. Claude sends the person to `api/oauth/authorize.js`: a page with an
   **account dropdown** (which `google_accounts` row this connection acts as)
   and the **passphrase** (`ADMIN_PASSPHRASE` env var). On success it stores an
   auth code in `oauth_codes` with `google_account`.
4. Claude exchanges the code at `api/oauth/token.js` → `oauth_tokens` row with
   `google_account`; 30-day access token plus refresh token.
5. Refresh: only honored if the refresh token exists in `oauth_tokens` for the
   same client (fixed in PR #4; before that, anyone could mint tokens).

Known weaknesses this plan fixes: no lockout on the passphrase page (P0-5), no
revocation list or token listing (P1-1 adds a connections table and tool),
passphrase compared with `!==` rather than constant time (P0-5).

## Google sign-in (how the server gets Google tokens)

`api/google/authorize.js` → Google consent (all `ALL_SCOPES`, with
`login_hint` from `?account=`) → `api/google/callback.js` →
`handleGoogleCallback` asks Gmail `users.getProfile('me')` which mailbox
approved, then `saveGoogleTokensFor(email, tokens, {label})`. The first
account ever saved becomes `is_default`. Tokens merge with `||` so a refresh
that omits `refresh_token` keeps the old one.

## Delegation (acting inside another user's mailbox)

`src/auth/service-account.js` loads `GOOGLE_SERVICE_ACCOUNT_JSON` (raw or
base64) and builds a `google.auth.JWT` with `subject = userEmail` and
**exactly** `DELEGATED_SCOPES` = Gmail settings basic + sharing. Only
`src/tools/mailbox-branding.js` uses it (`workspace_delegation_status`,
`workflow_brand_mailbox`). A broader "act as any user on any tool" design was
considered and rejected as too wide a grant. P4 adds Calendar and Drive scopes
for the Appliance Desk integration, each one approved by Chris and mirrored in
the Admin console's domain-wide delegation entry.

Service account in use: `robinson-s-toolkit-mcp@robinsons-toolkit-mcp.iam.gserviceaccount.com`
(client ID 115576530222062805971), authorized in Admin console → Security →
API controls → Domain-wide delegation.

## Database (Neon, project `google-workspace-mcp`, `long-king-81663618`)

| Table | Purpose | Notes |
| --- | --- | --- |
| `google_accounts` | One row per mailbox: `email` PK, `label`, `tokens` JSONB, `is_default` | Tokens plaintext today (P0-6 encrypts) |
| `google_auth` | **Legacy** single-account row (`id=1`) | Kept on purpose; old code reads it. Chris drops by hand later |
| `oauth_clients` | Claude's registered clients | |
| `oauth_codes` | Short-lived auth codes, with `google_account` | |
| `oauth_tokens` | Bearer + refresh tokens, `client_id`, `google_account` (NULL = default) | No revocation flag yet (P1-1) |

### Database rules

- Vercel builds **every branch** and previews share `DATABASE_URL` with
  production. Old and new code run against the same database at the same
  time. Therefore: additive changes only, idempotent `initSchema`, and never
  move or delete data a previous version reads.
- `initSchema()` runs on every request. Keep it cheap: `IF NOT EXISTS` only.
- Test against a Neon **branch** copied from production, never production.
  `scripts/test-db-upgrade.mjs` is the pattern. The branch
  `test-multi-account-upgrade` (br-soft-meadow-b7726s0b) exists from
  2026-09-30 and may be reused or deleted by Chris.

## Environment variables (Vercel, all environments)

`DATABASE_URL`, `ADMIN_PASSPHRASE`, `GOOGLE_OAUTH_CLIENT_ID`,
`GOOGLE_OAUTH_CLIENT_SECRET`, `PUBLIC_BASE_URL`, `GOOGLE_SERVICE_ACCOUNT_JSON`.
P0-6 adds `TOKEN_ENCRYPTION_KEY`. P2-3 adds `VERCEL_API_TOKEN` and
`VERCEL_TEAM_ID` (for DNS). Never print any of them.

## Tool module convention

Each file in `src/tools/` exports:

```js
export const tools = [ { name, description, inputSchema }, … ];
export const handlers = { [name]: async (args, clients) => ok(...) };
```

- Names are `service_verb_object` in snake_case; workflows are `workflow_*`;
  server-about-itself tools are `workspace_*`.
- Handlers receive `clients` from `buildHostedApiClients` (`gmail`, `drive`,
  `calendar`, `admin`, `adminReports`, `licensing`, `people`, `tasks`,
  `sheets`, `docs`, `slides`, `forms`, `chat`, `groupssettings`,
  `datatransfer`, `siteVerification`, `vault`, `chromepolicy`,
  `cloudidentity`, `alertcenter`, `classroom`) plus `actingAs` (email).
- Return `ok(value)`; throw or let Google throw and `api/mcp.js` wraps it with
  `errorResult`. P1-2 replaces `errorResult` with a translating version.
- Descriptions are written for Claude *and* for Chris: say what it does, what
  it needs, and anything irreversible.

## Known bugs at the time of writing

| Where | Symptom | Cause | Card |
| --- | --- | --- | --- |
| `drive_upload_file` | `part.body.pipe is not a function` | googleapis media upload wants a stream, not a Buffer | P0-3 |
| `licensing_*` | `Unauthorized operation for the given domain` | Needs the real customer ID (`C01wsqnnw`), not `my_customer`, when acting as a secondary-domain user, and/or the Enterprise License Manager API not enabled on the Cloud project | P2-6 |
| Calendar primary time zone | No tool can set it | Google exposes it only on `calendars.patch` of the primary calendar | P2-1 |
| DNS | No safe single-record tool; Vercel MCP only replaces whole zones | Needs a direct Vercel REST call | P2-3 |

## What exists outside this repo that the server depends on

- **Google Cloud project** holding the OAuth client (under Chris's personal
  Google account) and the service account (`robinsons-toolkit-mcp`). Moving
  these under the business Workspace is a someday cleanup, not in this plan.
- **Google Admin console** domain-wide delegation entry for the service
  account's client ID with the two Gmail scopes.
- **Vercel project** `google-workspace-mcp` (team `team_PUafLQmqT7LYBaBs8lEOPYMG`),
  production alias `google-workspace-mcp-chris-projects-de6cd1bf.vercel.app`
  (also `-five.vercel.app`).
- **Two Workspace accounts** connected: `ops@robinsonaisystems.com` (default,
  "Migrated from single-account setup") and
  `ops@robinsonappliancerentals.com` ("Appliance Rentals"). Both are super
  admins; both have 2-step verification enforced.
