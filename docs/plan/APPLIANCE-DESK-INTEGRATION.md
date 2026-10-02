# Appliance Desk ↔ Google Workspace integration spec

Code for this spec lands in the **appliance-desk** repository
(christcr2012/appliance-desk), not here. It is kept with the connector plan
because the two share one design: a narrowly scoped robot identity (service
account with domain-wide delegation) acting as the Appliance Rentals mailbox.
It corresponds to Stage 4 of Chris's "Appliance Desk Completion Plan" and to
the overhaul cards O26/O27 (communication ledger) in that repo.

The implementing model must also read, in the appliance-desk repo: `AGENTS.md`,
`docs/HANDOFF.md` (top entries), `docs/ARCHITECTURE.md` (env vars, email
addresses), `docs/BUSINESS-RULES.md` (job statuses), `prisma/schema.prisma`
(`Job`, `RentalAgreement`, `Invoice`, `Customer`, `CustomerNote`).

## Goal, in Chris's words

Run the business from one place. Jobs show up on the Google calendar his phone
already uses. Signed agreements and invoices file themselves into Drive.
Every email to or from a customer shows on that customer's record, and he can
reply from there.

## Identity and permissions

- **A separate service account for the app** (not the connector's). Name:
  `appliance-desk-google`. JSON key in Vercel env `GOOGLE_SERVICE_ACCOUNT_JSON`
  on the appliance-desk project (never committed).
- Domain-wide delegation entry in Admin console for its client ID. **Today
  only these two are approved** (DEPLOY.md Part 8):
  `https://www.googleapis.com/auth/calendar` and
  `https://www.googleapis.com/auth/drive.file`
  (`drive.file` sees only files the app created).
  Feature 3 (email) needs two more,
  `https://www.googleapis.com/auth/gmail.readonly` and
  `https://www.googleapis.com/auth/gmail.send` (instead of `gmail.modify` so the
  app can never delete or relabel mail). **Those two are not approved.** A
  delegation scope applies to every mailbox in the domain, so Chris must approve
  them in writing, by name, before the email PRs (5 and 6) ship; add them to the
  entry only then.
- The app always impersonates `ops@robinsonappliancerentals.com`. Setting
  `GOOGLE_IMPERSONATE_USER` env var; refuse to start sync if unset.
- All Google calls go through one module `src/lib/google.ts` that builds the
  JWT client, exposes `calendar()`, `drive()`, `gmail()`, and wraps every call
  with retry (exponential backoff on 429/5xx, max 5) and a plain-English error
  mapper (reuse the table from the connector's P1-2).

## Feature 1: Jobs ↔ Calendar (two-way, conservative)

**Data.** `Job` gains `googleEventId String?`, `googleCalendarId String?`,
`googleSyncedAt DateTime?`, `googleEtag String?`. Business setting
`googleCalendarId` (default: the "Deliveries & Service" calendar
`c_dd214eeba2ec27ed60d341f7aed60beb32c7a883034f39be4153111ce846996d@group.calendar.google.com`,
returned by the connector's `workspace_business_calendar` tool, which also
stores it in the shared `business_resources` table).

**App → Calendar (authoritative for existence).** On job create/update/cancel
(server action), enqueue a sync: create or patch the event with
summary `"<JobType> · <Customer> · <City>"`, location = service address,
description = job URL in the desk + appliance list + notes, start/end from
`scheduledStart`/`scheduledEnd` (default 2 h), `extendedProperties.private
.applianceDeskJobId`. Cancelled job → event status `cancelled`. Completed job →
summary prefixed "✓ ". Store `eventId`/`etag`.

**Calendar → App (time only).** A daily cron (`/api/cron/calendar-sync`,
reuse the existing cron pattern) and a Google push channel (`events.watch` on
the business calendar, renewed weekly) read changed events with the private
property; if `start/end` differ from the job and the event's `updated` is
newer than `googleSyncedAt`, update the job's schedule and write an
`AuditLog` entry "Rescheduled from Google Calendar". Never create or delete
jobs from the calendar side. Conflicts: app wins if both changed since last
sync; log it.

**UI.** Job detail shows "On Google Calendar ✓ (opens in Calendar)" with the
`htmlLink`, or "Not synced: <reason>" with a retry button. Settings → Google
shows connection status, calendar name, last sync, failures.

**Tests.** Unit: event payload builder; conflict rule. Integration: against a
test calendar in a Neon preview run with the service account, create → patch
→ cancel, then read back.

## Feature 2: Documents → Drive

**Data.** `RentalAgreement.googleFileId`, `Invoice.googleFileId`,
`Customer.googleFolderId`. Business settings: `googleDriveRootFolderId`
(default `13yNQodb3ELaaOwnjziqpolwHtVYbKLaJ`, the "Robinson Appliance Rentals"
folder) and the subfolder IDs for Customers (`11bDit510A-4ixh9M4qmH4wZPog-_VPEg`),
Agreements (`1CGtqQkv2chVccMYchnxWYFQ1SaJeyuNq`), Invoices & Statements
(`1NchC9MD3Ye4KcOUoQNtEEyABwx0lhmea`), Inventory Photos
(`1DNb1-yFU2WflZneApP-aLTIikQIOnWFA`).

**Behavior.** When an agreement is signed, or an invoice/statement/work order
PDF is generated, upload the PDF to Drive: customer folder
`02 Customers/<Customer name> (<id>)` (create on first use), plus a shortcut in
the type folder (`03 Agreements (signed)` etc.). File name
`YYYY-MM-DD <Type> <Number> - <Customer>.pdf`. Store the file ID; never
re-upload if present (idempotent). Failures never block the business action;
they go to a retry queue (`GoogleSyncTask` table: kind, targetId, attempts,
lastError) processed by the daily cron.

**UI.** Document rows show a Drive icon linking to `webViewLink`.

**Tests.** Unit: naming and folder resolution. Integration: upload a 1-page PDF
and read back `webViewLink`.

## Feature 3: Customer email history (read + send)

**Data.** `CustomerMessage` table: customerId, direction (IN/OUT), gmailMessageId
(unique), threadId, from, to[], subject, snippet, sentAt, labelIds[], hasAttachments,
bodyHtml? (fetched lazily). `Customer` matching: any `CustomerContact.email`
or `Customer.email`.

**Ingest.** Cron every 15 min (`/api/cron/gmail-sync`) using Gmail
`history.list` from a stored `historyId` (fall back to `messages.list q=
newer_than:2d` on first run or on 404 history gap). For each new message whose
From or To matches a customer email, insert `CustomerMessage`. Also match
`leads@` messages to `Lead.email` and attach as `LeadNote` of kind EMAIL.
Store only metadata + snippet by default; fetch body on open.

**Send.** From the customer record: "Email <customer>" opens a composer; the
app sends via `gmail.users.messages.send` as `support@robinsonappliancerentals.com`
(send-as identity already exists) with the Evergreen signature, threading on
`threadId` when replying. Every send is also stored as OUT and logged to
`AuditLog`. Rate limit: 50/day initially; configurable.

**UI.** Customer record → "Messages" tab: timeline newest first, direction
badge, open in Gmail link; reply box. Lead record → same, read-only plus
"Reply".

**Privacy rule.** Only messages matching a known customer or lead are stored.
Everything else in the mailbox is never read into the app's database.

**Tests.** Unit: matcher, threading headers. Integration: send to a test
address Chris controls, then ingest and assert the OUT row and the IN reply.

## Sequence of PRs in appliance-desk (suggested, one card each)

1. `google-identity`: `src/lib/google.ts`, env vars, Settings → Google status
   page showing `whoami` (profile of the impersonated user). No features.
2. `calendar-sync-out`: app → calendar, job detail link.
3. `calendar-sync-in`: cron + watch channel, time-only inbound.
4. `drive-filing`: agreements and invoices, retry queue, UI icons.
5. `gmail-ingest`: metadata ingest, Messages tab (read-only).
6. `gmail-send`: composer, send-as support@, logging.

Each PR follows appliance-desk's `AGENTS.md` Definition of Done (tests, CI,
HANDOFF update) and updates `docs/ARCHITECTURE.md` there with the new env vars
and the delegation entry.

## What Chris does once (15 minutes)

1. Google Cloud (same project as the connector's service account is fine):
   create service account `appliance-desk-google`, download JSON key, copy
   its Unique ID.
2. Admin console → Security → API controls → Domain-wide delegation → Add new:
   that client ID with the two approved scopes (`calendar`, `drive.file`),
   comma-separated. Add the two Gmail scopes later, only after written approval
   (see Identity and permissions).
3. Vercel → appliance-desk → Environment Variables: `GOOGLE_SERVICE_ACCOUNT_JSON`
   (file contents), `GOOGLE_IMPERSONATE_USER=ops@robinsonappliancerentals.com`.
4. Merge PR 1; open Settings → Google in the desk; it should show the mailbox
   name and "connected".
