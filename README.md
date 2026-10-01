# Robinson Google Workspace MCP

[![ci](https://github.com/Robinson-AI-Systems/google-workspace-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Robinson-AI-Systems/google-workspace-mcp/actions/workflows/ci.yml)

A Claude connector that gives Claude real, working control over your Google Workspace — not just email and calendar, but the admin side too: creating/suspending users, managing groups, adding domains and aliases, pushing Chrome policies, running security audits, and more. **337 tools** across every major Google Workspace service, and it can hold sign-ins for more than one mailbox (e.g. one per business on the same Workspace), with each Claude connection bound to the one you pick.

Built for one goal: you should be able to tell Claude what you want done in Google Workspace — in plain English — and have it actually happen, without you opening the admin console.

## Roadmap and how to contribute

The implementation plan lives in [`docs/plan/`](docs/plan/README.md): current
architecture, ordered task cards with acceptance checks, the test strategy,
and a paste-ready prompt for the implementing model (Claude Sonnet 5.5). Start
with `docs/plan/README.md`.

## Developing

You need Node 20 or newer.

```
npm ci            # install
npm run check     # syntax check every source file
npm test          # unit tests (about 5 seconds, touches nothing real)
npm run test:db   # database tests; needs TEST_DATABASE_URL pointing at any Postgres or a Neon branch
```

- Tests never call Google or the real database. `test/helpers/fake-google.js` stands in for the Google clients and `test/helpers/fake-db.js` for `src/db.js`; `test/contract/db-contract.js` runs the same checks against both so the fake cannot drift from the real thing. Database tests work inside their own temporary schema and clean up after themselves.
- Never put a real token, passphrase or key in a test or a log. Tests use obviously fake values.
- Database changes must be additive (`IF NOT EXISTS`); old and new code run against the same database at once.
- One task card per pull request, branch `ai/<model>/<card>-<slug>`, ledger row in `docs/plan/TASKS.md` updated in the same PR. The full rules are in [`docs/plan/`](docs/plan/README.md).
- GitHub runs check, unit tests and database tests (on a throwaway Postgres) on every pull request.

## What's covered

| Area | Tools | Examples |
|---|---|---|
| Gmail | 56 | send/read/search mail, labels, filters, vacation responder, delegates, forwarding |
| Drive | 36 | files, folders, sharing, permissions, revisions, trash, export |
| Calendar | 21 | events, sharing, recurring events, Meet links, free/busy |
| Sheets | 23 | read/write cells, formatting, sorting, conditional formatting, protection |
| Docs | 15 | create/edit content, tables, images, export to PDF/Word |
| Slides | 14 | build decks, shapes, images, text, export |
| Forms | 8 | create forms, questions, read responses |
| Tasks | 11 | task lists and tasks |
| Contacts / Directory | 9 | personal contacts + company directory search |
| **Admin: users/groups/orgunits/domains/aliases/roles/devices** | 92 | the core of "manage my whole Workspace" |
| Admin Reports | 8 | login/admin/drive/groups audit logs, usage reports |
| Licensing | 5 | assign/reassign Workspace licenses |
| Chat | 8 | spaces, messages, members |
| Chrome Policy | 3 | push Chrome/ChromeOS settings without the console |
| Cloud Identity | 3 | nested group membership, security posture |
| Domain verification | 3 | verify a new domain end-to-end |
| Vault | 5 | legal holds, matters |
| Data Transfer | 3 | bulk-transfer a departing employee's files |
| **Mailbox branding (delegated)** | 2 | `workflow_brand_mailbox` sets sender name, signature and send-as aliases on any user's Gmail via domain-wide delegation; `workspace_delegation_status` checks the setup |
| **Accounts, connections, change log** | 7 | `workspace_whoami` (which mailbox this connection acts as), list/default/remove connected Google accounts, `workspace_list_connections` / `workspace_revoke_connection` (which Claude connections exist; switch one off), `workspace_recent_changes` (what was changed through this server) |
| **Workflows (compound actions)** | 5 | `workflow_onboard_employee`, `workflow_offboard_employee`, `workflow_add_domain_and_start_verification`, `workflow_audit_external_sharing`, `workflow_security_snapshot` |

The "workflow_*" tools are the ones worth knowing about specifically: instead of you (or Claude) stringing together six separate admin calls to offboard someone, `workflow_offboard_employee` does the whole checklist — suspend, sign out everywhere, revoke third-party app access, revoke app passwords, transfer their files, remove from all groups — in one call.

## Two ways to run this

1. **Hosted (recommended, matches "custom connector" usage from claude.ai on any device)** — see `DEPLOY.md`. Runs on Vercel, stores your login token in Neon (Postgres), reachable from claude.ai on your phone, browser, anywhere.
2. **Local (simpler, one computer only)** — runs on your machine, launched automatically by the Claude desktop app. See below.

### Local setup

1. `npm install`
2. Create a Google Cloud project and OAuth client (see "Google Cloud setup" in `DEPLOY.md` — same steps apply, just skip the Vercel/Neon parts).
3. Copy `config.example.json` to `config.json` and fill in your OAuth client ID/secret.
4. Run `npm run authorize` — this opens a Google sign-in link. Sign in as your Workspace **super admin** account (this is what unlocks the admin tools, not just your own mailbox).
5. Add this to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "google-workspace": {
      "command": "node",
      "args": ["/full/path/to/google-workspace-mcp/src/index.js"]
    }
  }
}
```

6. Restart Claude Desktop.

## Two auth modes (either setup)

- **OAuth (default)** — you log in once as yourself. If that account is a Workspace super admin, every admin tool works too.
- **Service account + domain-wide delegation** — for acting as *other* users automatically without them each logging in. Set `authMode: "service_account"` in config.json (or `GWS_AUTH_MODE=service_account`), plus `serviceAccountKeyFile` and `impersonateUser`. Needs the extra Workspace Admin Console step of authorizing the service account's Client ID under Security > API Controls > Domain-wide Delegation with the scopes listed in `src/auth/scopes.js`.

## A few things worth knowing

- **Safety on risky tools.** About 50 tools that delete, suspend, reset, sign out, change forwarding or hand out admin rights do nothing until you pass `confirm: true`, and every changing tool in that group accepts `dryRun: true` to preview exactly what would change. After a change the tool asks Google what it now holds and returns that (plus whether it could confirm), and the change goes in the change log (`workspace_recent_changes`; previews are hidden unless `includeDryRuns: true`). The full list is the table in `src/tools/guards.js`.

- **Nothing here is placeholder code.** Every tool calls the real Google API method it claims to. A handful of things Google's public APIs genuinely cannot do (some settings only exist in the admin console UI) are left out rather than faked.
- **Data Transfer API** (`datatransfer_*` tools, used by `workflow_offboard_employee`) isn't in Google's current client library, so it's implemented as a direct REST call — same effect, just built by hand instead of generated.
- Destructive tools (delete user, delete file, revoke access, etc.) do exactly what they say — there's no confirmation step inside the tool itself. Think before calling them, the same as you would in the admin console.
