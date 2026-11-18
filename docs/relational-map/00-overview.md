# Relational map — overview

Workspace Unleashed by Robinson AI Systems (`google-workspace-mcp`) is a
hosted-only, remote MCP server that gives authorized MCP clients real,
guarded control over Google Workspace — mail, files, calendar, tasks,
people, chat and the admin side (users, groups, domains, licensing,
reports, Vault). It is independent of Google LLC and of any Hub: it stands
alone at `https://workspace.robinsonaisystems.com/api/mcp` with its own
OAuth, and a Hub may optionally discover and relay it.

This folder is the readable diagram of how the whole system connects.
Start here, then read the per-area files. The older narrative in
[`docs/plan/ARCHITECTURE.md`](../plan/ARCHITECTURE.md) is historical
context; where it and this map disagree, the code — and therefore this
map — is the truth.

## The whole system on one page

```mermaid
flowchart LR
  subgraph clients["MCP / HTTP clients"]
    C1["Claude / Muse and other<br/>native MCP clients"]
    C2["Hub (optional) — discovers<br/>and relays via RTC"]
    C3["Browser — sign-in, consent,<br/>owner and developer pages"]
  end

  subgraph hosting["Hosting — same api/ handlers, two shapes"]
    V["Vercel serverless functions<br/>vercel.json rewrites + maxDuration"]
    R["Development Rack — rack-server.mjs<br/>standalone Node HTTP server"]
  end

  subgraph doors["Entry points — api/"]
    MCP["api/mcp.js — native MCP endpoint"]
    RTC["api/rtc-gateway.js — RTC HTTPS door<br/>/api/contract, /api/tools, /api/results …"]
    OAUTH["api/oauth/* — this server as<br/>OAuth authorization server"]
    GACC["api/google/* + api/auth/google/*<br/>Google account linking / public sign-in"]
    MISC["api/index, account, owner/*,<br/>developer/*, rtc/passes, well-known/*,<br/>brand, privacy, support, data-deletion"]
  end

  subgraph core["Core — src/"]
    REG["Tool registry — src/tools/index.js<br/>388 registered tools"]
    GUARD["Guard layer — src/tools/guards*.js<br/>preview · confirm · read-back · change log · undo"]
    RTC CAT["RTC catalog — src/rtc/catalog.js<br/>profiles, areas, listing, meta-tools"]
    ID["Identity — src/oauth/*, src/principals/*<br/>legacy owner tokens + P10 principals"]
    GAUTH["Google client factory<br/>src/auth/google-auth-hosted.js"]
  end

  subgraph store["State — Postgres"]
    DB[("src/db.js + src/principals/store.js<br/>Neon driver on Vercel, pg pool on the Rack<br/>(STORE_TRANSPORT)")]
  end

  subgraph google["Google"]
    GAPI["Google Workspace APIs<br/>via googleapis — Gmail, Drive, Docs,<br/>Sheets, Slides, Forms, Calendar, Tasks,<br/>People, Chat, Admin SDK, Licensing, Vault …"]
    SVC["Service account — domain-wide<br/>delegation (Alert Center, delegated<br/>Gmail settings, reserved scopes)"]
  end

  C1 -->|"Bearer token, Streamable HTTP"| MCP
  C2 -->|"RTC pass, workspace_* aliases"| RTC
  C3 --> OAUTH
  C3 --> GACC
  C3 --> MISC
  V --> doors
  R --> doors
  MCP --> REG
  RTC --> REG
  MCP --> ID
  RTC --> ID
  REG --> GUARD
  GUARD --> GAUTH
  RTC CAT --> REG
  ID --> DB
  GAUTH -->|"stored refresh tokens,<br/>auto-refresh, persisted"| DB
  GAUTH --> GAPI
  GAUTH --> SVC
  SVC --> GAPI
  GUARD -->|"change_log, undo records"| DB
  RTC -->|"passes, rate limits, stored results"| DB
```

## How a tool call flows

1. A client connects to `api/mcp.js` (native MCP) or `api/rtc-gateway.js`
   (RTC) with a credential this server issued — a legacy owner bearer token
   (`oauth_tokens`) or a P10 principal token (`p10a_…`).
2. The handler checks the token in Postgres, resolves which principal and
   which linked Google account the call acts as, and builds a fresh MCP
   `Server` for that request (serverless keeps no memory between calls).
3. `ListTools` is filtered by the connection's RTC profile / areas / mode
   (`src/rtc/catalog.js`); `CallTool` is checked by `allowedTool` before
   the registry handler runs.
4. The handler receives Google clients built for exactly that account
   (`buildHostedApiClients` or `buildPrincipalApiClients`). Writes pass
   through the guard layer: preview/confirmation where required, then the
   Google call, then read-back, then a `change_log` entry that powers undo.
5. Results return as MCP results, or — on the RTC door — as write receipts
   and stored result handles (`rtc_results`).

## Map files

| File | Area |
| --- | --- |
| [01-clients-and-entry-points.md](01-clients-and-entry-points.md) | Who connects, and every HTTP door in `api/` |
| [02-identity-oauth-and-principals.md](02-identity-oauth-and-principals.md) | Server-issued OAuth, Google linking, legacy owner vs P10 principals, delegation |
| [03-tool-registry-and-guards.md](03-tool-registry-and-guards.md) | The 388-tool registry, tool families, guard/undo safety layer |
| [04-google-clients-and-scopes.md](04-google-clients-and-scopes.md) | Google client factory, scope groups, service-account delegation |
| [05-data-store.md](05-data-store.md) | Postgres schema families, encryption, Neon vs `pg` transport |
| [06-rtc-and-hub.md](06-rtc-and-hub.md) | RTC catalog, passes, results, and the optional Hub relationship |
| [07-hosting-and-release.md](07-hosting-and-release.md) | Vercel and Rack hosting shapes, release identity, checks |

## Invariants the diagram depends on

- **Hosted-only.** The old local stdio mode was retired (2026-10-02);
  there is no local mode to diagram.
- **No owner fallback on the public path.** A P10 principal token never
  reaches owner credentials; public tool execution stays off unless
  `publicMode` is enabled *and* `PUBLIC_P10_TOOL_EXECUTION_VERIFIED=true`.
- **The server never calls the Hub.** Hub initiates discovery and relay;
  Workspace owns the canonical RTC contract.
- **State lives only in Postgres.** Functions/servers are stateless;
  warm-instance caches (`src/once.js`) hold only "schema/migration already
  ran" success flags.
- **Database changes are additive** (`CREATE/ALTER … IF NOT EXISTS`) so
  old and new code run against the same database during a release.
