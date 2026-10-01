# Deploying the hosted version

This gets you a private web address that Claude (on any device — phone, browser, desktop) can talk to. Three accounts are involved: **Google Cloud** (you set this up — nobody else can do this step for you, it needs your Google login), **Neon** and **Vercel** (already connected to this session — Claude sets these up for you).

## Part 1 — Google Cloud setup (you do this — 10 minutes)

This is the one part that has to happen in your own Google account, in a browser.

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and create a new project (or pick an existing one). Name it anything, e.g. "Workspace MCP".
2. Go to **APIs & Services > Library** and enable each of these (search each by name, click Enable — takes a couple minutes total):
   - Gmail API, Google Drive API, Google Calendar API, Google Sheets API, Google Docs API, Google Slides API, Google Forms API, Tasks API, People API, Google Chat API, Admin SDK API, Groups Settings API, Enterprise License Manager API, Alert Center API, Chrome Policy API, Cloud Identity API, Site Verification API, Google Vault API, Admin Data Transfer API (if listed — some are folded into Admin SDK).
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

Some Gmail settings (adding "send mail as" identities, setting a signature on a mailbox you are not signed into) are only allowed through a Google **service account** with **domain-wide delegation**: a robot identity your Workspace trusts to act as its users. This server asks for exactly two permissions for that robot, both about Gmail settings, and uses it only in `workflow_brand_mailbox` and `workspace_delegation_status`.

1. Open [console.cloud.google.com](https://console.cloud.google.com/) and select the **same project** that holds this server's OAuth client (APIs & Services > Credentials shows it).
2. **IAM & Admin > Service Accounts > Create service account.** Name it `workspace-mcp-delegate`. No roles needed. Create.
3. Open the new service account > **Keys** > **Add key** > **Create new key** > **JSON**. A file downloads. Keep it private; it is a password.
4. Still on the service account, copy its **Unique ID** (a long number; also called the OAuth2 client ID).
5. Open [admin.google.com](https://admin.google.com) > **Security** > **Access and data control** > **API controls** > **Manage Domain Wide Delegation** > **Add new**. Paste the Unique ID as the Client ID. In OAuth scopes paste exactly:

   `https://www.googleapis.com/auth/gmail.settings.basic,https://www.googleapis.com/auth/gmail.settings.sharing`

   Authorize.
6. In Vercel > this project > **Settings > Environment Variables**, add `GOOGLE_SERVICE_ACCOUNT_JSON` with the entire contents of the downloaded JSON file as the value (all environments). Redeploy when Vercel offers.
7. Ask Claude to run `workspace_delegation_status` with a `testUser`. It should report `works: true`. Google can take a few minutes to apply step 5.

To turn it off later: delete the environment variable, delete the key in Google Cloud, and remove the client ID from the Admin console list.

## Part 6 — Encrypt the stored Google sign-ins (optional but recommended, ~3 minutes)

By default the server keeps your Google sign-in tokens in the database as plain data. With this step on, it also keeps an encrypted copy and reads that copy first, so a leaked copy of the database would not hand over access to your Workspace.

1. Make a key: 32 random bytes written as base64. The easiest way is to ask Claude: "make me a TOKEN_ENCRYPTION_KEY". (Any tool that makes 32 random bytes and shows them as base64 works; the result is a 44-character string ending in `=`.)
2. In Vercel > this project > **Settings > Environment Variables**, add `TOKEN_ENCRYPTION_KEY` with that value, for **all** environments. Redeploy when Vercel offers.
3. Nothing else to do. The first time each connected account is used, its encrypted copy is created automatically.
4. Keep a copy of the key somewhere safe (a password manager). If the key is lost or changed, the server notices it cannot read the encrypted copy, says so in the logs, and falls back to the plain copy, so nothing breaks while the plain copy still exists.

If the setting is missing or wrong, the server keeps working exactly as before and logs one warning.
