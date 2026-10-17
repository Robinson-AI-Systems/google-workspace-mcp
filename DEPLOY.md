# Deploying the hosted version

This gets you a private web address that Claude (on any device — phone, browser, desktop) can talk to. Three accounts are involved: **Google Cloud** (you set this up — nobody else can do this step for you, it needs your Google login), **Neon** and **Vercel** (already connected to this session — Claude sets these up for you).

## Part 1 — Google Cloud setup (you do this — 10 minutes)

This is the one part that has to happen in your own Google account, in a browser.

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and create a new project (or pick an existing one). Name it anything, e.g. "Workspace MCP".
2. Go to **APIs & Services > Library** and enable each of these (search each by name, click Enable — takes a couple minutes total):
   - Gmail API, Google Drive API, Google Calendar API, Google Sheets API, Google Docs API, Google Slides API, Google Forms API, Tasks API, People API, Google Chat API, Admin SDK API, Groups Settings API, Enterprise License Manager API, Alert Center API, Chrome Policy API, Cloud Identity API, Site Verification API, Google Vault API, Admin Data Transfer API (if listed — some are folded into Admin SDK). Alert Center requires its separate service-account authorization and explicit runtime opt-in (see Alert Center below); ordinary Google sign-in does not request its scope.
3. Go to **APIs & Services > OAuth consent screen**. Choose **Internal** if this option is available (it will be, since you're a Workspace admin) — this keeps it private to your own domain. Fill in an app name (e.g. "Robinson Google Workspace MCP") and your email, save.
4. Go to **APIs & Services > Credentials > Create Credentials > OAuth client ID**. Application type: **Web application**. Name it anything.
5. Under **Authorized redirect URIs**, add (you'll fill in the real address after Part 2 deploys — come back and add it then):
   `https://YOUR-VERCEL-URL.vercel.app/api/google/callback`
6. Click Create. Copy the **Client ID** and **Client Secret** — you'll paste these into Vercel in Part 2.

## Part 2 — Neon + Vercel (Claude does this for you)

Tell Claude "go ahead and provision it" once you have your Google OAuth Client ID and Secret from Part 1, and it will:

1. Create a Neon Postgres database to hold your login tokens.
2. Create a Vercel project connected to this code's GitHub repo.
3. Set the required environment variables:
   - `DATABASE_URL` — from the Neon database
   - `ADMIN_PASSPHRASE` — a random passphrase Claude generates (this is the password you'll type once to authorize Claude to connect — treat it like any other password)
   - `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` — from Part 1
   - `PUBLIC_BASE_URL` — the Vercel deployment's own URL
4. Deploy it.

Once deployed, go back to Google Cloud Console (Part 1, step 5) and make sure the redirect URI exactly matches your real Vercel URL, e.g. `https://robinson-google-workspace-mcp.vercel.app/api/google/callback`.

## Part 3 — Connect your Google Workspace account(s) (you do this — 1 minute each)

Visit `https://YOUR-VERCEL-URL.vercel.app/api/google/authorize` in a browser, signed in as your Workspace **super admin** account, and approve access. This is what lets the server act on your whole Workspace, not just your own inbox.

**More than one business on the same Workspace?** Repeat this once per mailbox. To skip Google's account chooser and give the account a friendly name, use:

`https://YOUR-VERCEL-URL.vercel.app/api/google/authorize?account=ops@yourbusiness.com&label=Your%20Business`

The server asks Google which mailbox actually signed in and files the tokens under that email, so you cannot mislabel one. The first account you ever connect becomes the *default* (used by any Claude connection that never picked one). The home page of the server lists every connected account.

Upgrading from the single-account version needs nothing from you: on its first request the new code copies the existing sign-in into the account list as the default. The old `google_auth` table is left in place so an older deployment can keep running against the same database; drop it by hand whenever you like.

## Part 4 — Add it to Claude as a custom connector

1. In claude.ai, go to **Settings > Connectors > Add custom connector** (or a Project's connectors, if you want it scoped to one project).
2. Enter the URL: `https://YOUR-VERCEL-URL.vercel.app/api/mcp`
3. Claude will redirect you to a small login page on your own server. If more than one Google account is connected, **pick the one this Claude connection should act as**, then enter the `ADMIN_PASSPHRASE` from Part 2.
4. Done. Every tool in this connection now acts as that mailbox. Ask Claude to run `workspace_whoami` any time to confirm which one it is in.

To switch a connection to a different account, disconnect and reconnect it and pick the other account. Connections made before the account picker existed keep working and use the default account.

## Notes on how the login works

Claude's connector system expects your server to speak OAuth. Since this server only ever has one real user (you), the "OAuth" here is intentionally simple: a single passphrase gate rather than a full multi-user account system. Nobody without that passphrase (and access to the URL) can connect — but treat the passphrase, and the Vercel URL itself, as sensitive, since together they control your entire Workspace.

## Part 5 — Let the server brand other mailboxes (optional, one time, ~15 minutes)

Some Gmail settings (adding "send mail as" identities, setting a signature on a mailbox you are not signed into) are only allowed through a Google **service account** with **domain-wide delegation**: a robot identity your Workspace trusts to act as its users. This server may ask for exactly four permissions for that robot: two about Gmail settings, plus `calendar` and `drive.file` (added 2026-10-02 at Chris's written approval). Each action asks only for the ones it needs, so Gmail branding keeps working even if you have not added the last two yet. The robot is used by the mailbox tools (branding, offboarding, adding staff, the health report). The two newer permissions are held in reserve for the business apps: today only `workspace_delegation_status` uses them (it tries each one to prove it works), because the business calendar and folder tools act as the connection's own account and need no robot.

1. Open [console.cloud.google.com](https://console.cloud.google.com/) and select the **same project** that holds this server's OAuth client (APIs & Services > Credentials shows it).
2. **IAM & Admin > Service Accounts > Create service account.** Name it `workspace-mcp-delegate`. No roles needed. Create.
3. Open the new service account > **Keys** > **Add key** > **Create new key** > **JSON**. A file downloads. Keep it private; it is a password.
4. Still on the service account, copy its **Unique ID** (a long number; also called the OAuth2 client ID).
5. Open [admin.google.com](https://admin.google.com) > **Security** > **Access and data control** > **API controls** > **Manage Domain Wide Delegation** > **Add new**. Paste the Unique ID as the Client ID. In OAuth scopes paste exactly:

   `https://www.googleapis.com/auth/gmail.settings.basic,https://www.googleapis.com/auth/gmail.settings.sharing,https://www.googleapis.com/auth/calendar,https://www.googleapis.com/auth/drive.file`

   If you set this up earlier with only the two Gmail permissions: open the existing entry, **Edit**, and replace its scope list with the line above (the Client ID stays the same). Authorize it.
6. In Vercel > this project > **Settings > Environment Variables**, add `GOOGLE_SERVICE_ACCOUNT_JSON` with the entire contents of the downloaded JSON file as the value (all environments). Redeploy when Vercel offers.
7. Ask Claude to run `workspace_delegation_status` with a `testUser`. It tries each permission on its own and should report `allScopesWork: true`. If one is missing it names it and says exactly what to type in the Admin console. Google can take a few minutes to apply step 5.

`drive.file` is deliberately narrow: the robot can only see files and folders it created itself, not the rest of anyone's Drive.

To turn it off later: delete the environment variable, delete the key in Google Cloud, and remove the client ID from the Admin console list.

## Part 6 — Encrypt the stored Google sign-ins (optional but recommended, ~3 minutes)

By default the server keeps your Google sign-in tokens in the database as plain data. With this step on, it also keeps an encrypted copy and reads that copy first, so a leaked copy of the database would not hand over access to your Workspace.

1. Make a key: 32 random bytes written as base64. The easiest way is to ask Claude: "make me a TOKEN_ENCRYPTION_KEY". (Any tool that makes 32 random bytes and shows them as base64 works; the result is a 44-character string ending in `=`.)
2. In Vercel > this project > **Settings > Environment Variables**, add `TOKEN_ENCRYPTION_KEY` with that value, for **all** environments. Redeploy when Vercel offers.
3. Nothing else to do. The first time each connected account is used, its encrypted copy is created automatically.
4. Keep a copy of the key somewhere safe (a password manager). If the key is lost or changed, the server notices it cannot read the encrypted copy, says so in the logs, and falls back to the plain copy and re-encrypts it with the new key, so nothing breaks.

If the setting is missing or wrong, the server keeps working exactly as before and logs one warning.

## Part 7 — Let Claude change DNS records for domains hosted at Vercel (optional, ~3 minutes)

The `dns_list_records`, `dns_add_record` and `dns_delete_record` tools talk to Vercel's DNS service. They only work for domains whose nameservers are Vercel's (`ns1.vercel-dns.com`, `ns2.vercel-dns.com`); for any other domain they say where the DNS actually lives and change nothing.

1. Go to vercel.com/account/tokens, create a token (name it e.g. "Workspace DNS"), and set its scope to your team (Robinson AI Systems). Copy it once; Vercel will not show it again.
2. In Vercel > this project > **Settings > Environment Variables**, add `VERCEL_API_TOKEN` (mark it **Sensitive**) and `VERCEL_TEAM_ID` (your team's ID, shown under Team Settings > General). Use the **Production** environment only: preview builds do not need the power to change DNS.
3. Redeploy when Vercel offers. Environment variables only apply to deployments made after they were added.
4. Never paste the token into a chat, a commit or a document. If it ever is, delete it on the tokens page and make a new one.

To turn it off: delete the token on that page; the tools then say the token is missing or refused.

## Part 8 — The business app's own robot identity (when the appliance desk app needs Google, ~15 minutes)

The appliance desk app must **not** borrow the connector's robot. It gets its own service account, so each can be switched off separately and each has only the permissions it needs. The app's design is in `docs/plan/APPLIANCE-DESK-INTEGRATION.md`.

1. In Google Cloud (the same project as the connector is fine): **IAM & Admin > Service Accounts > Create service account**, name it `appliance-desk-google`, no roles. Under **Keys** create a **JSON** key and keep it private. Copy the service account's **Unique ID**.
2. Admin console > **Security > Access and data control > API controls > Manage Domain Wide Delegation > Add new**. Client ID: that Unique ID. OAuth scopes, exactly:

   `https://www.googleapis.com/auth/calendar,https://www.googleapis.com/auth/drive.file`

   Those two are enough for the calendar and Drive features. The plan also lists `gmail.readonly` and `gmail.send` for the app's email features; **do not add them yet.** Unlike the two above they are not approved, and a delegation scope applies to *every* mailbox in the domain (the `GOOGLE_IMPERSONATE_USER` variable is only a setting, not a limit). They need your separate written approval when the app's email features ship.

3. In Vercel > the **appliance-desk** project > Environment Variables: `GOOGLE_SERVICE_ACCOUNT_JSON` (the file's contents, Sensitive) and `GOOGLE_IMPERSONATE_USER=ops@robinsonappliancerentals.com`. Production only until it has been tested.
4. The app finds the business calendar and folders by asking this connector: ask Claude for `workspace_business_calendar` and `workspace_business_folders` for Appliance Rentals. They return the IDs and remember them in the shared database table `business_resources`, which the app can read.
5. Never reuse one key for both identities, and never paste a key into a chat or commit it. If one is exposed, delete that key in Google Cloud and make a new one.


## RTC 1 read-only TEST passes (owner setup)

First set `RTC_TEST_ACCOUNT_EMAILS` to an explicit comma-separated list of approved **non-production scratch mailboxes** that are connected through Google OAuth. Do not list an ordinary production mailbox. Without this setting, pass creation is denied.

After deployment, visit `/api/rtc/passes` on the configured `PUBLIC_BASE_URL`
HTTPS origin. Enter the existing owner passphrase and an already-connected
Google account; optionally narrow the allowed areas, hours (default 24, max
720) and requests per minute (default 120, allowed 1–600). The pass is
**read_only**, **test** and **non-production**. It appears only once in the
owner's browser; copy it directly into a protected agent secret environment,
never a chat, URL, shell argument, PR, repository secret file or logs.

Revoke by using `workspace_list_connections` to identify its `pass_…`
identifier, then `workspace_revoke_connection` with `confirm: true`.
The pass wire secret is kept hashed at rest. The rate-limit counter is atomic
in Postgres across Vercel instances. Issuance does not grant any Google
permission beyond the bound account. For non-production Toolkit Hub D-4
acceptance, a deployed RTC HTTPS tool door and actual direct/relay/Sandbox
checks with revocation are still required. No production or write pass
issuance is enabled by this setup page.


## RTC 1 HTTPS tool API (pass-only)

The Vercel rewrites expose public `GET /api/contract` and
`GET /api/openapi.json`; with an owner-issued TEST pass in the
`Authorization: Bearer` header they expose `GET /api/tools`,
`GET /api/tools/{name}`, `POST /api/tools/{name}`,
`POST /api/tools/_batch`, `GET /api/whoami`, and
`GET /api/results/{handle}`. Calls reuse the *same guarded registry*
as the standalone `POST /api/mcp` connector. Legacy MCP names remain
unchanged; the HTTPS catalog exposes collision-safe `workspace_`
aliases. Ordinary OAuth connector tokens are rejected by HTTPS.

Read-only TEST passes cannot perform any changes, including through
meta dispatch or batch. Rate limits are atomic in Postgres. This is
an implemented surface with offline tests, **not** proof of deployed
RTC conformance, an authenticated Hub connection or GitHub encrypted
relay/Sandbox acceptance. The Hub D-4 card specifies the real testing
and pass revocation required before claiming success.


## Authorized non-production RTC route check

With a connected scratch mailbox explicitly listed in
`RTC_TEST_ACCOUNT_EMAILS`, create a short-lived read-only TEST pass on
`/api/rtc/passes`. Store the pass in the protected runner environment as
`RTC_TEST_PASS` (never in a repository, URL, command argument or chat).
Set `RTC_ORIGIN` to the server's exact public HTTPS origin. Optionally
select a harmless read with `RTC_READ_TOOL` and provide its JSON input via
`RTC_READ_ARGS_JSON`. Then:

```bash
node scripts/rtc-live-probe.mjs --authorized-read-only
```

The command checks manifest, authenticated identity, scoped tool metadata
and a real read via the HTTPS door. It prints no secrets or provider result
body. The run does **not** certify the encrypted GitHub relay or Vercel
Sandbox. Record time, route, deployed commit and outcome privately for the
Hub D-4 handoff. Revoke the pass with
`workspace_revoke_connection` using its `pass_...` identifier and
`confirm:true`; then run:

```bash
node scripts/rtc-live-probe.mjs --verify-revoked
```

Only an observed revoked-pass refusal counts as revocation proof.
Do not run real tests without an approved non-production scratch pass.


## Multi-service scratch-account smoke (P0-2)

The read-only smoke script does **not** run against real Google in CI.
Once the owner has approved a connected non-production mailbox and created
a scoped TEST pass through the protected page, set `RTC_ORIGIN` (exact HTTPS
origin), `RTC_TEST_PASS` (protected secret), `RTC_EXPECTED_REVISION` (the
independently verified 40-character READY deployment source SHA), and `RTC_EXPECTED_ACCOUNT`
(the exact scratch mailbox) in the authorized runner environment. Do not
paste the pass into shell arguments, code, PRs, chat or logs. Then run:

```bash
node scripts/smoke-readonly.mjs --authorized-read-only
```

It verifies the actual Google identity and asks only safe one-item Gmail,
Drive, Calendar and Tasks listings for areas the pass authorizes. Missing
areas are explicitly NOT_AVAILABLE; permission/provider failures are FAIL,
not success. An oversized result is retrieved through its expiring handle.
It outputs outcomes only, never personal Google records. Save the observed
outcomes, UTC time and exact deployed commit for the Hub D-4 acceptance.
After use revoke the pass and separately verify the revocation. Do not
trigger a manual Vercel deployment to run this test; wait for the scheduled
checked `main → live` promotion.


## Gmail Postmaster Tools (P7-4, opt-in read-only)

The owner approved the `https://www.googleapis.com/auth/postmaster.readonly` OAuth scope on October 2, 2026. The server advertises the new read-only domain and delivery-statistics tools, but **connecting a scope is not automatic for previously authorized accounts**. For each business account that elects to use Postmaster, an authorized owner visits `/api/google/authorize?account=<their-email>` and completes Google's OAuth consent again. No service-account delegation, broad mailbox access or production release is authorized by this step. Before using statistics, the domain must already be registered/verified in Google's Postmaster Tools console, and the account must be allowed to read it. A domain with insufficient traffic can legitimately have no published metrics. Never paste tokens or confidential reports into PRs. The v1 read-only scope is distinct from newer Postmaster v2 write/admin scopes, which remain unapproved. Real TEST provider evidence and deployed commit proof are tracked separately in `docs/plan/TASKS.md`.


## Cloud Identity Policy API (P7-2, read-only)

The owner approved `https://www.googleapis.com/auth/cloud-identity.policies.readonly` on October 2, 2026. The server requests it only for account OAuth sign-ins; **do not add it to `DELEGATED_SCOPES`** without a separate owner grant. Each existing account that needs policy reads must revisit `/api/google/authorize?account=<their-email>`, approve the new scope, and hold Google Super Admin permission with the Cloud Identity Policy API enabled. The underlying API returns customer-wide explicit policies, not calculated per-domain effective settings. A connection restricted to one business must ask the owner and pass `crossDomain: true` before accessing organization-wide data. Missing, inherited and unsupported settings are not automatically compliant. Proof of actual connected TEST access/deployment remains pending in the status ledger.

### Explicit TEST write passes

The owner-only `/api/rtc/passes` page defaults to read-only. It may issue a **TEST-only** write pass only for an account already connected and explicitly listed in `RTC_TEST_ACCOUNT_EMAILS`. In the owner-authenticated form, choose areas, check the TEST writes authorization box, repeat the exact account email, and choose 1–24 hours. For fixture work choose `workspace,files,calendar,mail`; never change unrelated business settings. Keep the one-time secret in a protected agent environment, never chat or a report; record only the non-secret pass identifier and revoke it after acceptance. Tool confirmation, domain restrictions, durable fixture IDs and cleanup still apply. Read-only passes marked for Robinson’s Toolkit can explicitly last up to 365 days; that flag and all permissions are shown in connection metadata. This does not authorize a live release, scope expansion or production access. Use the scheduled checked release to obtain the implementing revision.

Both read-only runners require RTC_EXPECTED_REVISION from independent deployment inspection, never from the public manifest alone. RTC_EXPECTED_ACCOUNT is mandatory for reads. A read pass must include workspace for identity verification; Gmail must report the exact expected mailbox before other provider reads proceed. Revocation-only checks also verify the source revision, without making a Google call. Scheduled promotion provenance remains a separate gate. No response data or secret is printed.

### Alert Center: separate service-account authorization

Google requires a service account and domain-wide delegation for Alert Center;
ordinary user OAuth cannot authorize it. This API is available to all Workspace
customers; no Google scope allowlist or paid upgrade is the remedy.
Official instructions: https://developers.google.com/workspace/admin/alertcenter/guides/auth

Its only scope, `https://www.googleapis.com/auth/apps.alerts`, permits **read and
write**. Obtain explicit owner authorization before authorizing this scope on the
existing service-account client ID in Admin Console. Only then set
`GOOGLE_ALERT_CENTER_DELEGATION_ENABLED=true` in the protected runtime. The existing
`GOOGLE_SERVICE_ACCOUNT_JSON` supplies the key; the selected connected account
must be an administrator with Alert Center access. The client requests only this
one scope for that account. Existing Gmail/Calendar/Drive delegation scope lists
and ordinary Google login are unchanged. Without this separate opt-in Alert
Center refuses locally, before a provider request. Workspace TEST read-only and
write-confirmation guards still apply to its tools. Enabling this option alone
cannot grant Google privileges; Google must independently authorize delegation.

### Token retirement timing (owner decision, October 16, 2026)

The owner removed the earlier 30-day/November 1 waiting policy. Retirement can
run as soon as all connected accounts have an intact encrypted copy and observed
genuine refresh, a checked encryption-aware release is serving, incompatible old
instances have drained, and the encrypted recovery/reconnection plan is reviewed.
There is no replacement calendar date (`notBefore` is null). The protected
operator script still requires explicit confirmation; normal OAuth requests never activate retirement. The protected owner page at
`/api/owner/token-readiness` now offers a separate explicit activation form with
exact confirmation and deployment-drain/recovery attestations, reusing owner
authentication, lockout and exact same-origin validation. Keep the encryption key and encrypted data;
recover by a compatible forward fix, encrypted restore or account reconnection,
never by rolling back to plaintext-only code. Activation changes durable storage
mode; each account's plaintext clears only on its next successful save/refresh.

Final retirement review also closes the retained single-account google_auth copy: only after encrypted-only activation and a successful account refresh, clear a legacy credential whose refresh token exactly matches that account’s pre/post renewal token. Unmatched credentials and the table remain intact; no activation-time bulk erase. Sanitized inspection adds legacyPlaintextCopies; real PG tests cover unrelated-account refusal, rotation, next-refresh timing and no resurrection. Actual live counts remain unverified until release.

The protected activation form refreshes every existing connected account after mode activation, using only its saved grant and verifying mailbox identity. This combines the approved cutover and required next-renewal checks in one authenticated operator action. On any error, inspect aggregate state before retrying; activation is durable/idempotent and no scopes are added.
