# Workspace Unleashed — which AI apps can connect

Updated 2026-11-09 (COMPAT-1). Address for every app: `https://workspace.robinsonaisystems.com/api/mcp`.

Every app below connects the standard MCP way: it finds the sign-in from the server's discovery documents, identifies itself (by registering itself, by a client ID card, or for Muse with the Client ID `muse`), sends the person to the Google sign-in and the Approve page, and gets its own connection.

"Built for" means the server supports exactly what that app is documented to send, with tests for it. "Tried live" means someone actually connected with that app against the live server. Only live tries count as proof.

| App | How it identifies itself | Built for | Tried live |
|---|---|---|---|
| Claude — web, desktop | client ID card or self-registration | yes | owner's daily use (pre-PUBLIC-1 sign-in) |
| Claude — phone apps | uses connectors added on web/desktop | yes | not yet |
| Claude Code | self-registration or card, local loopback callback (any port for cards) | yes | not yet |
| ChatGPT — web (custom MCP / plugins) | self-registration, OAuth | yes | not yet |
| ChatGPT — phone / desktop | uses what was added on the web | yes | not yet |
| Muse (Meta) | Client ID `muse`, secret blank, or the server's own Muse document | yes | sign-in reached live 2026-11-09; full connect not yet |
| OpenAI Codex (CLI and desktop) | self-registration, loopback callback | yes | not yet |
| Cursor | self-registration; may leave out the server name (now accepted) | yes | not yet |
| Windsurf / Devin Desktop | self-registration | yes | not yet |
| VS Code (GitHub Copilot) | client ID card or self-registration | yes | not yet |
| Google Gemini CLI | self-registration; may leave out the server name (now accepted) | yes | not yet |
| MCP Inspector (also in a browser) | self-registration; browser access allowed (CORS) | yes | not yet |
| Hermes Agent | self-registration | yes | not yet |

## What was added for this list (COMPAT-1)

1. **Leaving out the server name works for every app** (D-006 MC-4). Before, only Muse could omit the OAuth `resource` value; Cursor, Gemini CLI and some SDKs omit it and were refused. A wrong server name is still refused.
2. **Client ID cards** (CIMD, D-006 MC-3): an app may give the address of its own client card as its Client ID. The card is fetched safely (public HTTPS only, size and time limits, no secrets) and must name itself correctly. A card's loopback callback may use any port, because desktop apps pick one each time.
3. **Secrets sent as HTTP Basic** are accepted at the token and revocation doors (the standard's other way of sending them), and advertised.
4. **Browser-based apps** may call discovery, registration, token, revocation and the MCP door (CORS). These doors never read cookies, so this opens nothing to a web page that it could not already do.

## Known limits

- Every app still gets its connection only through a person's own Google sign-in and the Approve page; no app can skip them.
- An app that only supports a pasted static API key (no OAuth) cannot connect yet.
- Google may show an "unverified app" warning to new people until Google finishes reviewing the app's Gmail and Drive permissions.
