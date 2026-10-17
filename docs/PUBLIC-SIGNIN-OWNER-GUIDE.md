# Parallel Google sign-in: P10-B owner setup and user safety

The existing owner login, its `GOOGLE_OAUTH_CLIENT_ID/SECRET`, encrypted existing Google grants, owner `ADMIN_PASSPHRASE`, and existing custom MCP/Hub TEST connections are retained. The new **public** Google sign-in requires a **different Google Cloud OAuth client/consent screen/project**, using `PUBLIC_GOOGLE_OAUTH_CLIENT_ID` and `PUBLIC_GOOGLE_OAUTH_CLIENT_SECRET`. The exact redirect to register on that separate client is `<PUBLIC_BASE_URL>/api/auth/google/callback`. Do not edit or substitute the owner application's OAuth credentials or authorize production rollout from development.

## Default state and activation

`PUBLIC_SIGNIN_MODE=off` is the safe default. This is a **deployment/developer gate** for new enrollment, not a permanent prohibition on end-user capabilities. `pilot` admits only subjects explicitly listed in `PUBLIC_PILOT_GOOGLE_SUBJECTS` after the Google SDK verifies `sub`; `public` permits eligible verified new users. A typed email, user-agent, `hd` or matching Workspace email suffix does not authorize a principal or customer delegation. Deployment of this P10-B source does **not** authorize changing either flag. P10-4 must prove whole-tool/storage separation first, P10-5 must prove customer-scoped admin/delegation, and P10-6 must prove real two-user custom MCP acceptance/public readiness.

Owner login remains available through `/api/oauth/authorize` with `ADMIN_PASSPHRASE`, including previously issued bearer/refresh tokens; Google account names are not shown to an anonymous visitor. The new user's separate choice is available only when configured and enabled. New public Google sign-in is handled under `/api/auth/google/start`, `/api/auth/google/callback`, `/api/auth/session`, `/api/auth/logout`, and `/api/account` with Secure, HttpOnly, SameSite cookies and CSRF checks.

For initial Google sign-in, request `openid email profile` only. Identity is the stable verified Google issuer/sub, *not* the email. A user separately links an account using a protected authenticated POST through their account portal, with incremental mail/files/calendar/tasks/contacts scopes. Provider scope refusal leaves previous grants intact; missing refresh tokens on subsequent consent do not erase an existing refresh grant. All V2 grants require the existing `TOKEN_ENCRYPTION_KEY` and are encrypted using a versioned principal/account/purpose AAD envelope; missing encryption configuration fails closed. No raw token in chat, URL, issue or access log.

### MCP tokens and safe proof

V2 MCP `p10c_` authorization codes, `p10a_` bearer and `p10r_` refresh are distinct from owner credentials. Authorization binds principal/account, registered OAuth client, exact redirect, S256 PKCE and `PUBLIC_BASE_URL/api/mcp` resource. Refresh rotates and revokes on replay, and agent connections can be disconnected independently of browser logout. The account portal lists only the signed-in user's linked Google scopes and agent connections, supports local per-account disconnect, and clearly distinguishes local disconnect from unconfirmed provider revocation. Deletion is previewed and may be marked as a recoverable pending request; irreversible deletion/retention remains a separate reviewed step.

**Critical:** P10-B intentionally issues credentials while *refusing public MCP tool execution* with `public_dispatch_not_enabled`. The P10-4 whole-tool/DB isolation proof must pass before pilot or public tool dispatch can be enabled; never remove that block as a shortcut. Real owner and TEST read-only acceptance remain separate from new P10 browser login and two-user provider proof.

### Needed external actions (not auto-performed)

Register a second Google OAuth project/application/client/consent screen with the exact public callback, arrange verified scopes and applicable privacy/support/verification, then explicitly approve pilot after P10-4/5. Until those prerequisites, preserve OFF and verify source/real disposable Postgres only. There is no authorization here for a charge, real customer write, owner-grant migration, public rollout or retirement of existing owner login.
