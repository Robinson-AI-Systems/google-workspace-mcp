# Identity, OAuth and principals

There are **two identity worlds** in this server, deliberately kept apart.
Both end at the same tool registry, but they resolve credentials, linked
Google accounts and policy through different code and different tables.

```mermaid
flowchart TD
  subgraph legacy["Legacy owner world — src/db.js + src/oauth/*"]
    L1["Client registers / authorizes<br/>api/oauth/register, authorize"]
    L2["oauth_clients · oauth_codes"]
    L3["oauth_tokens — bearer token<br/>bound to one google_account at login"]
    L4["legacyOwnerContext(token)<br/>in src/principals/store.js"]
    L5["buildServer(multiAccount) →<br/>buildHostedApiClients(account)"]
    L1 --> L2 --> L3 --> L4 --> L5
  end

  subgraph p10["P10 principal world — src/principals/*"]
    P1["Google sign-in<br/>api/auth/google/start + callback"]
    P2["principals (kind=user) ·<br/>principal_google_identities (issuer + sub)"]
    P3["principal_connections — p10a_ tokens<br/>principal_oauth_codes · principal_refresh_uses"]
    P4["readPrincipalAccess(token) →<br/>scopedStore(context) — trusted mint check"]
    P5["createIsolatedPrincipalServer(context) →<br/>buildPrincipalApiClients(context)"]
    P1 --> P2 --> P3 --> P4 --> P5
  end

  L5 --> REG["Tool registry"]
  P5 --> REG
  GLINK["Google mailbox linking<br/>api/google/authorize + callback<br/>→ google_accounts (encrypted tokens)"] --> L5
  PLINK["Per-principal linking<br/>principal_google_accounts (grant ciphertext)<br/>principal_defaults · principal_settings"] --> P5
```

## The server as OAuth authorization server

`src/oauth/` holds the machinery: `bearer.js` (token parsing),
`cimd.js` / `client-documents.js` (client identity metadata documents),
`client-compat.js` (CORS and client quirks), `login-guard.js` (login
attempt throttling, backed by `login_attempts`), `connection-settings.js`,
`google-setup-state.js`, and `connector-address.js` (named connector
paths under `/api/mcp/:connector`).

## Principals (`src/principals/`)

- `store.js` — schema and access for principals, identities, linked
  accounts, connections, sessions (`user_sessions`), settings, deletion
  requests, link/sign-in denial logs. `readPrincipalAccess`,
  `legacyOwnerContext`, `listAccounts`, `accountContext`, `scopedStore`.
- `clients.js` — `buildPrincipalApiClients(context)`: Google clients built
  only from that principal's own grants; there is no owner fallback.
- `google.js` / `canonical-entry.js` — Google identity verification and
  the canonical sign-in entry.
- `delegation.js` — user-chosen delegation: `principal_delegations` and
  `principal_delegation_subjects` record which subjects (e.g. other users
  in a domain) a principal's grant may act for, verified against Google.
- `owner-migration.js` — one-way bridge that links the legacy owner's
  existing `google_accounts` and `oauth_tokens` to the fixed owner
  principal, with login proofs (`principal_owner_login_proofs`).
- `security.js` — `publicMode(env)`: public execution is **off by
  default**; `api/mcp.js` additionally requires
  `PUBLIC_P10_TOOL_EXECUTION_VERIFIED=true` before any `p10a_` token may
  dispatch a tool.
- `session.js`, `pilot-readiness.js`, `public-information.js`,
  `tenant-store.js` — browser sessions, pilot gates, public pages, and
  tenant-scoped storage helpers.

## Per-person controls that shape dispatch

A principal's settings freeze into the server built for them: profile,
areas, listing mode, cost policy — and **writes paused** ("make all my
apps read-only") maps to `allow_writes: false`, which the RTC catalog
then enforces for every connection that person holds.
