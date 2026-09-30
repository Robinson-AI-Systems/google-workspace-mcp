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

## Part 4 — Add it to Claude as a custom connector

1. In claude.ai, go to **Settings > Connectors > Add custom connector** (or a Project's connectors, if you want it scoped to one project).
2. Enter the URL: `https://YOUR-VERCEL-URL.vercel.app/api/mcp`
3. Claude will redirect you to a small login page on your own server. If more than one Google account is connected, **pick the one this Claude connection should act as**, then enter the `ADMIN_PASSPHRASE` from Part 2.
4. Done. Every tool in this connection now acts as that mailbox. Ask Claude to run `workspace_whoami` any time to confirm which one it is in.

To switch a connection to a different account, disconnect and reconnect it and pick the other account. Connections made before the account picker existed keep working and use the default account.

## Notes on how the login works

Claude's connector system expects your server to speak OAuth. Since this server only ever has one real user (you), the "OAuth" here is intentionally simple: a single passphrase gate rather than a full multi-user account system. Nobody without that passphrase (and access to the URL) can connect — but treat the passphrase, and the Vercel URL itself, as sensitive, since together they control your entire Workspace.
