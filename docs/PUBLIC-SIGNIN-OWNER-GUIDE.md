# Parallel Google sign-in: P10-B owner setup and user safety

## October 18 observed state and owned-domain preparation

Canonical production remains the existing Vercel alias. An actual secure owner-passphrase
readiness submission returned all nine configuration checks present, pilot roster two,
identity-only pilot enabled, legacy owner sign-in enabled and Stage 2 tool execution OFF.
This supersedes historical missing-client setup statements; it is not full pilot acceptance.
The separate server-only secret is `GOOGLE_PUBLIC_OAUTH_CLIENT_SECRET`.

The owner selected **workspace.robinsonaisystems.com** for preparation, separately from
the apex website being changed by another agent. No project-domain attachment, DNS,
canonical resource, OAuth redirect or credential change has been performed.
Vercel's project-specific configuration read recommends a CNAME for `workspace` to
`f99774aaf7af8941.vercel-dns-017.com.`; recheck this recommendation when attaching the
hostname. The authoritative nameservers are Spaceship's `launch1.spaceship.net` and
`launch2.spaceship.net`; a Vercel DNS write would not change that authoritative zone.
Preserve all existing apex, www, MX and TXT records and coordinate with the website agent.

The controlled transition must first attach only the selected service hostname, establish
its exact authoritative DNS and valid HTTPS, and verify Google domain ownership with an
account that is an Owner/Editor of the separate OAuth project. A real Site Verification
read reported root/www unverified for the connected Rentals account only; another
account's ownership remains unknown. Vercel verification does not establish Google ownership.
Then review the exact homepage/privacy/support/deletion URLs and proposed callback
`https://workspace.robinsonaisystems.com/api/auth/google/callback` in the separate Google
application. Retain the existing working pilot callback and owner application. Do not
change `PUBLIC_BASE_URL` or the MCP resource until registered-client/resource compatibility,
old bearer/refresh behavior, browser cookies, protected Origin checks and rollback have
been checked and the production configuration transition is authorized. Existing clients
and all seventeen original owner access records must remain usable; never revoke them
as migration cleanup. Deployment still follows the independent checked release policy.

Before general publication Google requires the applicable brand/domain/scope review;
restricted scopes may also require an external security assessment unless an exception
applies. No paid review is authorized. Reviewed official guidance:
[OAuth production policy](https://developers.google.com/identity/verification/authentication-policy-compliance)
and [restricted-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).
The current public policy remains prelaunch information requiring the operator's final
privacy, retention and support review. Do not claim public or Google approval.

The existing owner login, its `GOOGLE_OAUTH_CLIENT_ID/SECRET`, encrypted existing Google grants, owner `ADMIN_PASSPHRASE`, and existing custom MCP/Hub TEST connections are retained. The new **public** Google sign-in requires a **different Google Cloud OAuth client/consent screen/project**, using `PUBLIC_GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_PUBLIC_OAUTH_CLIENT_SECRET`. The exact redirect to register on that separate client is `<PUBLIC_BASE_URL>/api/auth/google/callback`. On Vercel Production, set the public client ID as **Config** and the server-only GOOGLE_PUBLIC_OAUTH_CLIENT_SECRET as **Secret**. Never store the new OAuth secret under a PUBLIC_-prefixed variable or save it as Config. Do not edit or substitute the owner application's OAuth credentials or authorize production rollout from development.

## Owner decision — October 17, 2026: Hub is optional for standalone Stage 1

**Do not gate the independent Workspace product's identity-only two-user pilot on Hub availability, a Hub pass, Hub cloud adapter scope or Hub release schedule.** Hub is an optional RTC gateway; its historical continuity checks remain required as independently tracked Hub/Workspace integration acceptance, but cannot prevent authorized direct Workspace Google login. The owner explicitly corrected the earlier mistaken coupling and approved the narrowly restricted Stage 1 activation.

Stage 1 `PUBLIC_SIGNIN_MODE=pilot` is eligible after a source/CI-verified READY production snapshot, genuine direct original-owner `workspace_whoami`/account-list continuation, separate verified Google OAuth client and precisely two approved verified subjects, existing principal/DB isolation source proof, and unchanged legacy login/owner credentials. It is **identity-only**, with `PUBLIC_P10_TOOL_EXECUTION_VERIFIED` absent/false. Preserve the normal direct owner route and confirm it again after an actual independently verified Vercel Production deployment that includes the new setting. **An environment-variable change alone does not guarantee a deployment.** Never force an off-cycle release/redeployment or preview promotion without the separate explicit release approval required by `.github/RELEASE-POLICY.md`; use the next allowed scheduled checked release if that approval is absent. Confirm the canonical production alias serves the new configured revision, not an older snapshot. Verify the protected readiness report and both independent tester browser sessions; until they are observed, mark their real acceptance as pending.

Do not falsify `P10-OWNER-CONTINUITY` or interpret this Stage 1 configuration as a pass for the original bearer/refresh, Hub-specific relay/denials, real user/provider login negative cases or two-client MCP checks. Those remain open in their own acceptance rows. Stage 2 tool execution, public enrollment, real provider writes, legacy retirement and manual source release each retain their original independent authorization/testing gates.

## Default state and activation

`PUBLIC_SIGNIN_MODE=off` is the safe default. This is a **deployment/developer gate** for new enrollment, not a permanent prohibition on end-user capabilities. `pilot` admits only subjects explicitly listed in `PUBLIC_PILOT_GOOGLE_SUBJECTS` after the Google SDK verifies `sub`; `public` permits eligible verified new users. A typed email, user-agent, `hd` or matching Workspace email suffix does not authorize a principal or customer delegation. Deployment of this P10-B source does **not** authorize changing either flag. P10-4 must prove whole-tool/storage separation first, P10-5 must prove customer-scoped admin/delegation, and P10-6 must prove real two-user custom MCP acceptance/public readiness.

Owner login remains available through `/api/oauth/authorize` with `ADMIN_PASSPHRASE`, including previously issued bearer/refresh tokens; Google account names are not shown to an anonymous visitor. The new user's separate choice is available only when configured and enabled. New public Google sign-in is handled under `/api/auth/google/start`, `/api/auth/google/callback`, `/api/auth/session`, `/api/auth/logout`, and `/api/account` with Secure, HttpOnly, SameSite cookies and CSRF checks.

For initial Google sign-in, request `openid email profile` only. Identity is the stable verified Google issuer/sub, *not* the email. A user separately links an account using a protected authenticated POST through their account portal, with incremental mail/files/calendar/tasks/contacts scopes. Provider scope refusal leaves previous grants intact; missing refresh tokens on subsequent consent do not erase an existing refresh grant. All V2 grants require the existing `TOKEN_ENCRYPTION_KEY` and are encrypted using a versioned principal/account/purpose AAD envelope; missing encryption configuration fails closed. No raw token in chat, URL, issue or access log.

### MCP tokens and safe proof

V2 MCP `p10c_` authorization codes, `p10a_` bearer and `p10r_` refresh are distinct from owner credentials. Authorization binds principal/account, registered OAuth client, exact redirect, S256 PKCE and `PUBLIC_BASE_URL/api/mcp` resource. Refresh rotates and revokes on replay, and agent connections can be disconnected independently of browser logout. The account portal lists only the signed-in user's linked Google scopes and agent connections, supports local per-account disconnect, and clearly distinguishes local disconnect from unconfirmed provider revocation. Deletion is previewed and may be marked as a recoverable pending request; irreversible deletion/retention remains a separate reviewed step.

**Critical (P10 C):** Scoped public MCP tool execution is now wired in source but remains **OFF by default**. Both `PUBLIC_SIGNIN_MODE=pilot|public` and independently reviewed `PUBLIC_P10_TOOL_EXECUTION_VERIFIED=true` must be set by an authorized owner deployment **after** deployed source plus cross-principal P10-4 acceptance prerequisites are satisfied. Never treat these flags or synthetic/CI tests as proof of an approved real user pilot. Owner/Hub TEST grants and existing owner login are unaffected. Opening the account portal or opting into Google identity scopes does not enable tool dispatch.

### Needed external actions (not auto-performed)

Register a second Google OAuth project/application/client/consent screen with the exact public callback, arrange verified scopes and applicable privacy/support/verification, then explicitly approve pilot after P10-4/5. For **identity-only Stage 1**, apply the 2026-10-17 independent direct-Workspace decision above; keep new-user MCP tool execution OFF. For Stage 2 and public publication, satisfy the complete original provider/tenant acceptance and separately applicable approvals. There is no authorization here for a charge, real customer write, owner-grant migration, public rollout or retirement of existing owner login.


## P10 C — independent customer admin and delegated operations

The signed-in account portal offers an **optional** customer service-account entry form with Secure/HttpOnly session, CSRF and explicit user confirmation. A user must first link their own separate `adminVerify` Google scope, actually be an administrator recognized by the Admin SDK Directory for a verified Google `customerId`, and have independently authorized that service account's exact OAuth scopes under **their own** Admin Console. The server verifies Google Directory ownership and a real delegated JWT authorization before storing a principal/account/customer-bound AES-GCM encrypted key. No key enters a tool argument, URL or saved response. Account/subject and DWD authorizations cannot be inferred from email domain or `hd` claim. The owner legacy service-account configuration remains owner-only.

A customer may independently add only Google-Directory-verified target users of their own verified Workspace customer; wrong customer, missing scope, missing service account, or revoked grant refuses delegated operations before provider calls. Public Gmail and normal OAuth features remain usable without tenant delegation. Delegated Gmail settings, Calendar/Drive and Alert Center use customer-specific injected auth; ordinary users do not inherit installation owner business calendar IDs, developer TEST fixtures or owner's Vercel DNS token. The account portal can disable one tenant grant locally; it **does not claim** Google's provider-side Domain-Wide Delegation was revoked. A Workspace administrator may also remove authorization within their own Admin Console.

New independent tenant queries have owner-account composite foreign keys and separate OAuth-refresh CAS. Result retrieval, change history/undo and rate counters are separated by principal/account/connection/credential-version and readbacks are denied after revoke. Tests use two actual disposable PostgreSQL-connected Node processes and mock Google SDK requests, not real production identities. Manual external pilot and Admin Console setup are separately queued.


## P10-7 — owner migration and reversible dual-login (source candidate, not activated)

Owner login migration is independent of public enrollment. Keep `PUBLIC_SIGNIN_MODE=off`, `PUBLIC_P10_TOOL_EXECUTION_VERIFIED` unchanged, and `LEGACY_OWNER_SIGNIN_ENABLED=true` (default) throughout implementation and all non-production verification. **Do not change these production settings, credentials, or enable new real Google access without the separate owner-approved deployment/pilot.** The existing signed-in owner, saved encrypted Google grants, existing custom MCP access and refresh tokens, and Hub TEST passes are not migrated or revoked.

1. After a reviewed/checked deployment and an independently approved separate `PUBLIC_GOOGLE_OAUTH_CLIENT_ID and GOOGLE_PUBLIC_OAUTH_CLIENT_SECRET` client with callback `<PUBLIC_BASE_URL>/api/auth/google/callback`, open `/api/owner/migration` in a trusted browser. Enter **the existing Workspace MCP owner `ADMIN_PASSPHRASE`**, not a Hub password. Select **Preview affected records** to inspect actual owner account names, encrypted-copy indicators, existing agent client/account selectors and active connection counts. The preview is not public; do not paste it or any tokens into chat. Compare with the prior encrypted snapshot; no grant is copied.
2. Select the explicit checkbox and **Verify with Google and link my owner login**. A fresh browser-bound, one-use Google OIDC proof (not a matching email/domain or existing link) binds the verified Google issuer/sub to the fixed original owner principal. Independent readback with **Preview** shows the linked owner subject fingerprint. Repeating the same subject link is idempotent, never a new mailbox grant. A Google identity already owned by a public principal is refused.
3. Retain `LEGACY_OWNER_SIGNIN_ENABLED=true` and independently test *both* paths on an approved non-billable account: normal owner passphrase, then the new **Use my already-linked owner Google sign-in** option on the same registered MCP authorization URL. The latter uses Google OIDC and an HTTPS-only five-minute, browser-scoped owner proof bound to the registered client, redirect, MCP resource, PKCE challenge and OAuth state; final authorization still selects an existing owner mailbox and the user's profile and billing-consent choice. Old bearer/refresh tokens keep their existing policies; no new provider scopes are added to them.
4. To roll back the identity mapping, preview the exact linked owner `subjectFingerprint`, then re-submit the owner-migration form with the existing passphrase, confirmation checkbox, that fingerprint and **Unlink the selected Google owner login**. This removes only the chosen Google-to-owner mapping; it does **not** revoke a provider token, disconnect an agent, decrypt an account or make a public user the owner. Independently preview again and test retained existing passphrase/agent bearer. Link again through a fresh owner-approved Google proof if needed.
5. **Optional retirement is a separate owner decision** after real dual-login and recovery are proved, all active owner connections are accounted for and checked production ancestry/recovery are recorded. Only with explicit owner approval may an operator set `LEGACY_OWNER_SIGNIN_ENABLED=false`; it blocks *new* passphrase authorizations and future passphrase-based migration, not existing legacy MCP tokens or callback/refresh compatibility. Reset to `true` for forward-compatible dual-login recovery. A flag change does not restore historical plaintext and is not an instruction to delete tokens or the passphrase.

Pre-merge source and disposable-Postgres tests are not real Google subject proof, hosted deployment evidence or a completed P10-6 public pilot. Owner login migration may be implemented with P10-6/Google/public configuration still pending. Never turn on public tool execution merely because P10-7's source CI is green.


## P10-6: approved original testing mailbox — identity-only coexistence

A Google test account used earlier by the original MCP can be present in the **owner-only** `google_accounts` table even if it is not the owner's ordinary personal mailbox. The public login correctly raises `reserved_identity` to prevent accidentally inheriting that owner's encrypted grants and active bearer/refresh tokens. **Do not delete the legacy account, revoke its connections, remove its default selection, or bypass the normal reserved-email guard.**

The owner approved preserving the existing original MCP and letting the formerly connected, Google-verified TEST identity create its **separate browser sign-in only**. This source implements a distinct, fail-closed setting: `PUBLIC_PILOT_LEGACY_SUBJECTS`. It must contain exactly **one** Google-verified numeric subject ID already in `PUBLIC_PILOT_GOOGLE_SUBJECTS` (the historically connected test identity); do not enter email addresses, extra IDs, or the other independent tester. Configure it privately as an encrypted Production-only Vercel environment variable; no subject ID should appear in chat, source control or GitHub issues. The original public roster remains exactly two authorized independent users.

All of the following must hold before this exception permits enrollment: `PUBLIC_SIGNIN_MODE=pilot`, signed/nonce-verified Google OIDC identity, exact subject present in both protected lists, an ordinary browser **login** (not MCP authorization, owner recovery, or a scope-grant callback), and `PUBLIC_P10_TOOL_EXECUTION_VERIFIED` absent or false. Removing the exception, switching mode to `off`/`public`, or setting execution flag true prevents *new* legacy-overlap logins. The service **persistently marks the pilot user principal identity-only at creation** (independent of the original owner's mutable mailbox table). Account-link guards prevent this principal from linking *any* Google account irrespective of later flags, old sessions, or even a future owner-initiated removal of the legacy mailbox. The exception also requires exactly two distinct ordinary pilot subjects and one numeric legacy subject. Its account portal displays an identity-only notice and rejects account mutations. The original legacy tokens and Google grants are never read through the new principal. This is not shared access to the legacy mailbox or a migration of owner agent credentials.

**Activation/rollback:** This source does not set the variable or deploy itself. After exact-head CI, checked `main`/`live` and independent owner readbacks, the owner must explicitly authorize both the protected Production configuration and any unscheduled release/redeployment separately under `.github/RELEASE-POLICY.md`. Confirm actual new Vercel READY production source, canonical alias and sanitized pilot readiness `legacyPilotIdentityOnlyConfigured=true` and `legacyPilotIdentityOnlyEnabled=true` before asking the historical test identity to sign in. Then verify two independent browser principal sessions, empty newly enrolled tester Google connections, unchanged original two owner mailbox connections/bearers, CSRF/replay/wrong-account refusals and logout. Never mark real P10-6 two-client MCP or Google provider read/write acceptance passed by merely observing the browser portal.

To disable future coexistence, remove `PUBLIC_PILOT_LEGACY_SUBJECTS`, redeploy via the approved process, and recheck that the original owner still functions. Existing new-user browser sessions may persist to expiry but retain their database-persisted identity-only marker and cannot link Google accounts or acquire owner grants, even after an original mailbox deletion. Clearing this permanent marker requires a separate reviewed/approved owner migration; a full principal cleanup or actual legacy account transfer must be separately designed, confirmed, and approved. Identity-only coexistence is temporary testing safety, **not** a permanent end-user provider limitation after separately reviewed real migration and permissions.
