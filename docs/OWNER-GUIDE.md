# Owner guide: what to ask Claude for

You do not need tool names. Say what you want in a sentence. This page lists the things worth asking for, what Claude will actually do, and what it will ask you first.

**The safety rules that apply everywhere**

- Anything that deletes, suspends, resets a password, signs someone out, changes forwarding or hands out admin rights **does nothing until you say yes**. Claude first shows you what it would do and what is there now.
- You can always say "just show me what would happen" (a **preview**). A preview changes nothing.
- After a change to one of those protected actions, Claude asks Google what it holds *now* and tells you that, not just what it sent. If Google does not show the change, it says "not confirmed". Mailbox branding reports what it could and could not apply in its result.
- Every real change is written down. Ask "what did you change this week?" any time.
- Each Claude connection can only manage its own business's domains. Asking about another domain gets a refusal unless you say you really mean it.

## Twelve things to ask for

| Say this | What happens | What it asks you first |
|---|---|---|
| **"How healthy is the email for robinsonappliancerentals.com?"** | Checks where mail is delivered, who may send as you, the signing records and the spoofing policy. Gives each a green/yellow/red result and the exact record to add for any red one, with dates for tightening the policy. Changes nothing. | Nothing. |
| **"Give me a health report for the whole company"** (or one domain) | Checks who has 2-step sign-in, how many admins there are, stale accounts, apps with wide access, mail being forwarded away, groups open to outsiders, licences nobody uses, files open to anyone with the link. A one-line fix beside each problem. Changes nothing. | Nothing. For one business, name its domain. |
| **"What did you change this week?"** | Lists every change made through this connector: when, which account, what, and before/after. Previews are left out unless you ask for them. | Nothing. |
| **"Send me this week's digest"** | A plain summary of the last 7 days: sign-ins (and suspicious ones), admin actions, changes, unread mail in Leads / Support / Billing, and any red email-health items. | It shows it to you first. It only **emails** it if you give an address and say yes. |
| **"Where do I turn on DKIM?"** (or "block sharing outside the company", "turn off Gemini") | Finds the Admin console page for settings Google gives no tool for, with the link and the clicks. | Nothing. |
| **"What plan are we on and who has a licence?"** | Names the plans, how many people hold each and whether Gemini is included. | Nothing. |
| **"Brand the mailbox for sam@..."** | Sets the sender name, signature, send-as addresses, optional photo and out-of-office reply. | You can ask for a preview first. It acts on the mailbox you name, so check the name. |
| **"Change the time zone of the rentals calendar to Denver"** | Changes the calendar, then reads it back to prove it. | A preview if you ask. |
| **"Offboard Sam"** | Puts up an out-of-office reply, removes the role addresses Sam can send as, takes Sam off the business calendar and Drive folder, suspends the account, signs Sam out everywhere, removes app access and app passwords, and (if you say so) hands files to someone and deletes the account. | **Always asks first**, showing what Sam's account and mailbox look like now (including the role addresses it is about to remove). If you asked for deletion, the summary says PERMANENTLY DELETE and your yes covers it. Without domain-wide delegation the mailbox steps are skipped and the result says it is *not confirmed*. |
| **"Add Sam as a driver for Appliance Rentals"** (or technician, office, admin) | Creates Sam's account with a one-time password, adds any extra addresses, shares the business calendar and Drive folder at the right level (driver/technician: see and change calendar events, no Drive folder access; office/admin: manage the calendar, edit the folder), brands the mailbox, and tells you whether they are signed up for 2-step sign-in (Google only lets 2-step be required for a whole group of people, so turn that on in Admin console > Security > 2-step verification for their organizational unit). Safe to run again: it only does what is missing. The password is shown to you once, never saved in the change record. | Nobody is emailed unless you ask. If you want the login sent to you, or a welcome note sent to Sam's personal email, it **asks first**. A preview shows the whole plan. |
| **"Set up a new business: Evergreen Hauling, evergreenhauling.com, owner ops@..."** | Adds the domain (or gives you the DNS record to prove you own it, and **stops** until that is done), then creates the business's folder in the Admin console, the owner's account, role addresses like support@ and billing@, a calendar in the right time zone, the nine standard Drive folders, the owner's mailbox branding, and finishes with an email health check. Safe to run again after you add the DNS record. | **Always asks first** (it adds a domain and a paid account), and a preview shows the full plan. It also needs your yes to work outside the business this connection normally manages. Labels and filters are made only when the connection is signed in as the owner. |
| **"What's waiting in my inbox / the Leads label?"** | Counts conversations (the newest 100), who is waiting longest for a reply, and the oldest unanswered one per label. Bounces, no-reply and mailing-list mail are not counted as waiting. "Which leads have waited over a day?" lists them oldest first (it looks at the newest 500 and says so if older ones may be missing). Changes nothing. | Nothing. |

## Also useful

- **"Which mailbox am I acting as?"** shows the Google account this connection uses.
- **"Who is connected?"** lists every Claude connection, when it was last used, and which account it acts as. **"Switch off the connection that starts 1a2b3c4d"** shuts one off for good (it asks first).

## Not available yet

- Changing DNS records from here (it needs a Vercel access token you have not created yet).
