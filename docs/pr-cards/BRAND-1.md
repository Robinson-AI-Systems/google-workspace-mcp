# BRAND-1 — One Workspace Unleashed look, plain words, the controls people asked for, one front door

**Status:** Built 2026-11-09 on branch `claude/brand-1`, from `main` after PUBLIC-1 (#295) and the Muse front-door copy (#296).
**Owner rulings (2026-11-09):** every page carries the Workspace Unleashed brand and no other business's; public pages speak plain words; a person can change what each app may do and pause every app's changes at once; the public sign-in is the one front door for everyone, the owner included — owner pages are development and testing scaffolding.
**Guide:** the branding gap brief of 2026-11-09 (used as a guide, corrected where it was wrong: e.g. it treated PUBLIC-1 as not yet merged, missed that every account-page button answered with raw JSON, and missed that the authorize endpoint's *default* page was the owner passphrase page).

## Build

| Area | What |
|---|---|
| `src/brand/brand.js`, `src/brand/assets.js` | One shell for every page: Robinson AI Systems company tokens (charcoal, graphite, Mist White, grey, emerald→teal) with the Workspace accent Violet `#9A7BFF`; product mark (from `docs/unleashed-workspace.png`), company icon and favicon embedded; header with mark and tagline; footer with the Google trademark notice, "We never ask for your Google password here." and the site links; system fonts only |
| `api/brand.js`, `vercel.json`, `rack-server.mjs` | `/brand/*` and `/favicon.ico` served (was 404); only the four known images |
| `src/brand/access-levels.js` | The three access levels in words, checked against `allowedTool` (Read only blocks every write; Everyday blocks admin, workspace-settings, DNS, licensing and Vault writes; Full blocks none) |
| Home, privacy, support, delete pages | Outcome-first home ("Let your AI assistant work with your Google Workspace, safely"), per-app connect steps with the full address (Claude, ChatGPT, Muse with Client ID `muse`, Claude Code); privacy and delete pages rewritten in plain words keeping every honest limit; support page no longer shows an operator to-do |
| `api/oauth/authorize.js` | Robinson Appliance Rentals styling (Manrope, evergreen/ivory) removed; every state on the shell; Approve page offers the three access levels as explained choices (Full pre-selected) and accounts as cards; refusals name what happened and the next step, technical reason in small print. **One front door:** with public sign-in on, the default page for any app is the public Google sign-in; the owner pages answer only when asked for by name (`auth_method=owner` / `owner_google`) and say "Development and testing only" |
| `api/account.js` | Signed-out page: what the page is for + "Sign in with Google", no pilot wording. Signed-in "My Workspace connections": apps by the name people know with status tags (can make changes / read-only / changes paused), **per-app access-level switch**, **"Make all my apps read-only" / "Let my apps make changes again"**, Google accounts with services in words (not scope strings), "All permissions at once" (default) or one service, organisation access folded and explained, data and sign-out. Buttons answer with a page and a plain notice (303 back), never raw JSON; scripts that omit `return=page` still get JSON |
| `src/principals/store.js` | `principal_settings.writes_paused`; `setConnectionProfile`, `setWritesPaused`, `getWritesPaused`; `readPrincipalAccess` carries `writesPaused` |
| `api/mcp.js`, `src/principals/clients.js` | While paused, every connection of that person runs with `allow_writes:false` |

## Tests

- New: `test/unit/brand-and-controls.test.js` (tokens, no other brand or outside font anywhere in served source, assets, plain-words ban list on every public page, access-level wording against enforcement), `test/unit/account-portal-controls.test.js` (status tags, per-app level, pause/resume, refused change page, JSON for scripts, CSRF), DB case in `test/db/principal-public-multi-account.test.js` (level change and pause enforced through the real MCP server; another person cannot change it).
- Updated copy assertions in existing suites; one-door default asserted in `p10-mcp-authorize.test.js`.
- Unit 150 files / 2,238 tests; DB 10 files / 121 tests (real Postgres 16); `npm run check` green. Pages viewed at 412px width in Chrome.

## Not in this card (ONE-DOOR follow-on)

Moving the owner's existing daily connections from the owner principal onto an ordinary user principal, converging the owner scope sets onto the public contract, and retiring the `OWNER_ID` execution exception — after this is live and the owner has connected once through the public door.
