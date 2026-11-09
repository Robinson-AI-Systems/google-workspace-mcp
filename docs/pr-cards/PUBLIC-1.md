# PUBLIC-1 — Truly public sign-in, add accounts in the product, no cookies on the connect leg

**Status:** Built 2026-11-09 on branch `claude/public-multi-account`, from `main` `c11baf8`.
**Owner ruling (2026-11-09):** Workspace sign-in is public. Anybody signs in with any Google account they control: no roster, pilot list, developer grant or pre-built email. A second or third account is added the same way inside the product. Acceptance: a stranger with a non-pre-approved account connects cold, unaided.
**Design:** RAS MCP Standard D-006 MC-7.0 (cookie-free return leg, the GitHub Unleashed public-connect pattern) and D-001 public sign-in.

## Build

| File | What |
|---|---|
| `src/principals/store.js` | `principal_connect_handles` table; `issueConnectHandle` / `readConnectHandle` / `consumeConnectHandle` (one-use, hashed, 15 min, bound to client + redirect + resource + PKCE challenge); `consumeCookieFreeTransaction` (only transactions created cookie-free); `accountContext` (a derived scoped context acting as another account the same person linked; the connection stays the home for results, change log and rate windows); `principalSignInEmail`; refresh persistence writes the acting account's grant |
| `src/principals/clients.js`, `src/principals/delegation.js` | Build Google clients and load delegation for the acting account |
| `api/mcp.js` | Public connections switch among their own person's accounts (`account` on any tool call) |
| `api/auth/google/start.js` | Public connect asks for the complete permission set in one sign-in; "add another account" from the Approve page spends the page's handle instead of needing a session cookie; both legs cookie-free |
| `api/auth/google/callback.js` | Finds cookie-free transactions by their one-use state; links the sign-in account in the same round trip (refusals recorded, never blocking); ends on the Approve page with a fresh handle; a refused added account returns to Approve with the reason |
| `api/oauth/authorize.js` | Branded "Continue with Google" page and one Approve page: signed-in address, receiving site, every linked account (pick the default), access level, **Add another Google account**, Approve |
| `test/unit/public-connect-flow.test.js` | A browser with no cookies at all connects cold, adds a second account, approves; handles are single-use and app-bound; a refused add comes back with its reason |
| `test/db/principal-public-multi-account.test.js` | Real Postgres: two accounts on one person, derived contexts, the change log names the acting account, a stranger's account and forged contexts refused, the real MCP server switches accounts, handle and cookie-free transaction rules |
| Existing tests | Mocks extended; the "no flow cookie" callback refusal now reads the generic refusal (only cookie-free transactions match without one) |
| `docs/PUBLIC-SIGNIN-OWNER-GUIDE.md`, `CHANGELOG.md` | The ruling, how it works, the owner checklist |

## Acceptance

- `npm run check` green; unit suite 148 files / 2,220 tests; DB suite 10 files / 120 tests against a real Postgres 16.
- Live acceptance (a stranger's cold connect from Muse) needs, outside the code: `PUBLIC_P10_TOOL_EXECUTION_VERIFIED=true` on the rack (lost in the November 8 move), the Google app published to In production, and later Google's restricted-scope verification. Recorded in the owner guide as a non-blocking checklist.
