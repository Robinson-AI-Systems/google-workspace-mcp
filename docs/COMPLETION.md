# Completion schedule — Workspace Unleashed by Robinson AI Systems

**Reconciled:** 2026-11-03 (fleet audit; created under the RAS MCP Standard conformance-correction process)
**Code baseline:** `main` at `0d073a4a9645bce7da2721674c3d53d4ed9d211c`
**Release baseline:** `live` at `a76a7544766b12805e3ae4477058d7429ccdc749` (the VER-1 change on main rides the next checked promotion)
`main` is one commit ahead of `live` at reconciliation time.

## Fleet facts (verified 2026-11-03 night)

| Item | State |
|---|---|
| Tool census | **385 tools**, all unique names, counted by paging the live server's own tool search to exhaustion (39 pages) through the working owner connection. Matches the 2026-10-30 census exactly; the occasional "387 registered" figure is not supported by any count taken tonight. |
| Accounts on the server | Two Google accounts enrolled since 2026-09-30: `ops@robinsonaisystems.com` (default) and `ops@robinsonappliancerentals.com` ("RAR"). The working Muse connection acts as ops@ — re-verified after tonight's release (979 messages). |
| Second connection (RAR) | The hosted connect failed twice on 2026-11-03. Root cause found in code and **fixed, released and proven live the same night**: dynamic client registration ignored a declared `token_endpoint_auth_method` of `none` and forced a secret the public client never holds, so every token exchange failed as `invalid_client`. After the fix, from a clean network path: registration declaring `none` returns `none` with no secret; authorize returns the sign-in page; a token exchange with a bogus code fails as `invalid_grant` (authentication passed), not `invalid_client`. The only remaining step is the owner's single tap on the connect link, picking the RAR account — and per the owner's ruling it waits behind the login-conformance presentation (rows 3–4). |
| Personal Gmail track | Code answer, read-only: the server's enrollment code has **no domain gate** — an account is filed under whatever email Google's verified exchange reports, and `allowed_domains` is computed after enrollment and only scopes admin/business tool reach. The one possible blocker is Google-side (an "Internal" consent screen would refuse a consumer account before the server is involved) and is unverified. The conforming enrollment route is the public Google sign-in plus link-while-signed-in; its live readiness for linking is unproven. No personal sign-in has been attempted. |
| Front door | Title read back live after tonight's release: **"Workspace Unleashed by Robinson AI Systems"** (was the stale "Workspace MCP by Robinson AI Systems" until PR #257). The assigned mark (Break-Out, Violet `#9A7BFF`) is filed in this repo at `docs/unleashed-workspace.png` with the brand spec (PR #255); whether the served pages display it is not yet verified. |
| Address divergence (open) | The repository homepage field names `google-workspace-mcp-five.vercel.app`; the working connection and production run on `google-workspace-mcp-chris-projects-de6cd1bf.vercel.app`; the branded host is `workspace.robinsonaisystems.com`. Which single address is canonical is unresolved — recorded here rather than guessed. |
| Release machinery | Checked `main → live` promotion runs on the nightly schedule (`.github/release/promote-live.mjs`, one release per Denver day, exact-head required checks `test` + `release-policy`). Tonight's connection fix shipped the same day under the repo's own exceptional-release procedure (`.github/release/manual-exception.mjs`): leased fast-forward with every guard precondition verified, receipt branch `release-exceptions/2026-11-03/a76a7544766b12805e3ae4477058d7429ccdc749`, daily receipts untouched. |
| CI speed | The `test` and `release-policy` checks on tonight's PRs completed in seconds-to-~2 minutes of wall time; within the fleet doctrine's spirit (target 30 s, cap 1 min, slow-but-green still passes). No re-optimization opened from tonight's runs. |

## Conformance rows (RAS MCP Standard, Library D-001 at f134c849)

Rows close only on live evidence. A new Standard section opens a correction row here automatically.

| # | Row | Status | Evidence / what remains |
|---|---|---|---|
| 1 | Client compatibility | **PASS on the machinery; one owner step remains.** | The public-client connect path was broken in code, fixed (PR #256), released and proven live leg-by-leg (register / authorize / token shapes) from a clean network path on 2026-11-03. The existing connection worked before, during and after (whoami re-verified). Completing the second (RAR) connection needs the owner's one tap, gated by rows 3–4's presentation. |
| 2 | Client ID cards | **OPEN — not tested.** | ID-card support was deliberately not probed tonight (it is login handling, which the owner gated). |
| 3 | One public sign-in | **DOES NOT CONFORM (yet).** | Two sign-in modes coexist in production: the public Google sign-in and the legacy passphrase mode. The legacy switch (`LEGACY_OWNER_SIGNIN_ENABLED`) is **ON in production**, proven 2026-11-03 by the refusal-shape oracle on the owner readiness page; the brute-force lockout on those surfaces passes live (6th attempt answered locked). Remediation is prepared (one setting + one redeploy closes the sign-in page and two owner pages; issued connections and the Google-identity path are unaffected) and is the owner's decision, with the evidence in the three-accounts record. |
| 4 | Developer access boundary | **DOES NOT CONFORM.** | Five public-address surfaces are gated by the shared admin passphrase alone: the connection sign-in page (legacy mode), the add-account page, the pass-issuing page (passphrase alone can mint LIVE passes, including writes and standing billing), the developer TEST-pass issuer, and three owner pages (one can refresh accounts / retire stored tokens). Four were read back live and publicly reachable on 2026-11-03; the front door links to none of them. The Standard grades this row NOT VERIFIED naming exactly this migration. The switch-off in row 3 does **not** close the add-account, pass-issuing or token-readiness surfaces — they ignore the switch and need the follow-on code change. Decision is the owner's. |
| 5 | Release provenance (VER-1) | **FIXED IN SOURCE — closes on live read-back.** | PR #258 (merged, main `0d073a4a`) adds one resolver (`src/release.js`): version from the installed package + the deployment's own `VERCEL_GIT_COMMIT_SHA` (validated; unknown is stated as null, never synthesized). It feeds the MCP handshake (was hardcoded `1.0.0` against package `2.0.0`) and `workspace_whoami`'s new `server_release`. Acceptance: after the promotion carrying it deploys, whoami's `server_release.commit` must equal the deployed build and the handshake version must agree. The well-known manifests carry no version/revision slot and the front door displays no version — those are this row's named remainders, not invented fields. |
| 6 | Identity anchoring | **PASS.** | Connections act as the Google account picked at connect time; the server "default" is only a fallback (proven 2026-11-03: this connection acts as ops@ while RAR is also enrolled). whoami verifies the acting identity against Gmail itself. |
| 7 | Unleashed branding | **PASS for the name; PARTIAL for the mark.** | Full name "Workspace Unleashed by Robinson AI Systems" is on the front door, read back live after tonight's release. The assigned Violet Break-Out mark is filed in-repo; its display on the served surfaces is unverified. |
| 8 | Branded front door | **PARTIAL.** | The branded host `workspace.robinsonaisystems.com` exists and the front door carries the correct name and links only to sign-in-required account pages and disclosures. Open: the address divergence in the fleet facts above, and mark display (row 7). |
| 9 | Fleet health contract | **NOT VERIFIED tonight.** | No database-truth read of this server's public health surface was taken in this pass; do not borrow another server's verdict. |
| 10 | Production readiness gate | **PARTIAL.** | The repo runs a checked daily promotion with exact-head required checks and a written v1 release gate (`docs/plan/V1-RELEASE-GATE.md`); production serves real connections. It cannot read a full pass while rows 3–4 stand open. |
| 11 | Discovery & contract governance (RTC) | **PARTIAL — door contract verified in CI.** | The repo's own check suite verifies the RTC door budgets and contract surfaces on every run (`npm run check` green tonight: read_only 11 / everyday 18 / full 18 tools on the RTC door — a deliberately small governed surface, distinct from the 385-tool owner connection). Live promulgation evidence is not re-taken in this pass. |
| 12 | No global credential fallback | **IMPLICATED — see row 4.** | Tool access itself is per-connection OAuth against enrolled accounts. The shared admin passphrase is, however, a global credential for the five surfaces in row 4; this row cannot pass until that migration lands. |
| 13 | Version evolution | **PASS for tonight's changes.** | The registration fix and the VER-1 adoption are server-side; the existing connection needed no reinstall and was re-verified working after the release. |
| 14 | Pattern appraisal | **OPEN — not assessed in this pass.** | No appraisal of this server's patterns against the fleet's was performed tonight. |
| 15 | Capability completeness | **ADDENDUM DONE (2026-11-04 two-source re-census); completeness PARTIAL — capped by the amendment.** | Re-census under the RAS MCP Standard capability-completeness grading amendment (Library D-001 as amended 2026-11-04, Library PR #5): a service-first map built only from Google's official REST references (15 families / 113 resources / 486 methods) diffed against this server's executed registry (387 registered tools; 385 on a live-mode owner connection). Dispositions: **257 covered, 5 composed, 24 owner-excluded, 198 missing, 2 unverified** (full addendum below). The grade is capped at PARTIAL while plausibly-needed capabilities stand missing — headed by the OAuth client registration record, which has no read, update, list or delete anywhere in the product (the undeletable “Vivienne RAR connection probe” registrations are its living proof); build card [RECENSUS-1](pr-cards/RECENSUS-1.md) is filed with this addendum and the build is owned by this repo's existing queue. The Meet family (24 methods) is owner-excluded by the owner's recorded decision, not missing. The owner's rule that Workspace writes need his express authorization is a gate on the *use* of tools that exist, recorded here so it is never mistaken for a capability absence — and it hides none of the absences above. |
| 16 | Conformance-correction process | **RUNNING.** | This record was created under the process; the rows 3–4 correction is designed and evidence-backed, awaiting the owner's decision; row 5's correction is built and awaiting its live read-back. |
| 17 | Owner-obedience | **OPEN — no refusal census yet.** | This server's refusal mechanisms have not been classified the way Stripe Unleashed's have (47 mechanisms). The pass-issuing surface's LIVE-pass power behind a passphrase is recorded in row 4 as the first item any census must classify. |


## Row 15 addendum — capability completeness re-census (2026-11-04)

**Method (two sealed cartographers, Critic Step 0 pattern).** Cartographer A built the
service-first map from Google's official REST reference indexes only — no server repo,
tool list or prior census consulted: 15 families, 113 resources, 486 methods, 72 owner
workflows. Cartographer B built the server inventory from this repo's code only, at
`main` `544582deeac36b6712ccb601f03374a96b097fe2`, **executing** the registry
(`src/tools/index.js`): 387 tools, 387 handlers, zero duplicates, zero orphans; the
production policy filter simulated over that registry reproduces every recorded live
figure exactly (385 live-mode owner connection; 171 read-only / 313 everyday;
11/18/18 on the compact RTC door). Seals — service map sha256
`1693d1860815679f429e547b8fe20a69d1eef0bbe16e60b6a0fa39e5c8926a06`; server inventory
sha256 `bfbc009bc44b623dc7e678dd93c6369891c596cbce702391d8b4e0008369f914`.
Dispositions use the amendment's vocabulary exactly: COVERED (a tool implements the
method), COMPOSED (a named tool sequence implements it), OWNER-EXCLUDED (a recorded
owner ruling removes it), MISSING (no tool, no ruling), UNVERIFIED (a source could not
verify the leg). Lifecycle legs are dispositioned individually.

**Map counts (486 mapped methods).**

| Family | Mapped | Covered | Composed | Owner-excluded | Missing | Unverified |
|---|---|---|---|---|---|---|
| Gmail | 79 | 51 | 1 | 0 | 27 | 0 |
| Calendar | 38 | 20 | 0 | 0 | 18 | 0 |
| Drive | 59 | 25 | 0 | 0 | 34 | 0 |
| Docs | 3 | 3 | 0 | 0 | 0 | 0 |
| Sheets | 17 | 10 | 0 | 0 | 7 | 0 |
| Slides | 5 | 5 | 0 | 0 | 0 | 0 |
| Forms | 10 | 6 | 0 | 0 | 4 | 0 |
| People | 24 | 9 | 4 | 0 | 11 | 0 |
| Tasks | 14 | 14 | 0 | 0 | 0 | 0 |
| Chat | 55 | 8 | 0 | 0 | 47 | 0 |
| Admin SDK Directory | 113 | 91 | 0 | 0 | 21 | 1 |
| Admin SDK Reports | 5 | 3 | 0 | 0 | 1 | 1 |
| Admin SDK Licensing | 7 | 7 | 0 | 0 | 0 | 0 |
| Vault | 33 | 5 | 0 | 0 | 28 | 0 |
| Meet | 24 | 0 | 0 | 24 | 0 | 0 |
| **Total** | **486** | **257** | **5** | **24** | **198** | **2** |

Directory's one unverified count is a map-internal residual (the family's stated total
exceeds its own legible table by one method); Reports' one unverified item is the
`activities.watch` teardown leg, which the service map itself could not verify from
Google's index. Docs, Sheets, Slides and Forms delete/list legs live in Drive by
Google's design and are counted once, under Drive `files` (covered) — the
cross-family join the map demands is present in this server.

**Symmetry ledger (create without teardown, grant without revoke).**

| Pair | Verdict | Evidence |
|---|---|---|
| OAuth client registration create ↔ delete | **SERVER-MISSING — the headline.** Create exists (open RFC 7591 dynamic registration); read (single, internal only), update, list and delete do not exist anywhere in the product. | `oauth_clients` is written by exactly two INSERTs (`api/oauth/register.js` → `createOAuthClient`, `src/db.js:612`, plus the seeded `muse` client) and read by one SELECT; all nine `DELETE FROM` statements in `src/`+`api/` were enumerated and none touches it; no deregister function, no HTTP DELETE route, no registration access token is issued, no sweep covers it. The three inert “Vivienne RAR connection probe” registrations cannot be removed short of direct database edits. Plan: card RECENSUS-1. |
| Principal deletion request ↔ execution | **SERVER-MISSING.** The portal records a deletion *request*; no code executes it. | `deletionPreview` returns `deleted:false`; `requestDeletion` records a row in `principal_deletion_requests` and returns `{pending:true, irreversible:false}`; no function reads those rows to erase anything; the server's own `/api/data-deletion` disclosure states irreversible erasure is “not yet” performed. Plan: owner decision on launch retention/erasure, then a build card from this repo's queue. |
| Enrolled account: legacy store ↔ P10 principal store | **ASYMMETRIC (server-side).** Legacy accounts hard-delete by tool; P10 accounts only soft-disconnect. | `workspace_remove_account` → `DELETE FROM google_accounts` (`src/db.js:571`, tokens included; connection rows and registrations survive it). P10 path is `disconnectAccount` (`src/principals/store.js:515`): status → `revoked`, connections revoked, account row and grant retained. Plan: resolves with the principal-deletion item above. |
| Token / connection grant ↔ revoke | **SYMMETRIC — covered on both stores.** | Soft revoke plus durable refresh-family tombstones (`oauth_refresh_revocations`), RFC 7009 self-service, portal and tool surfaces (`workspace_revoke_connection`); RTC passes revoke by id through the same tool. |
| Gmail forwarding address create ↔ delete | **SERVER-MISSING (small).** Add and list exist; no remove tool, though the platform offers the delete leg. | Inventory §1: forwarding address — create `gmail_add_forwarding_address`, list only, delete **no tool**. Plan: P11 provider-gaps bundle. |
| Owner-migration identity link ↔ unlink; delegation subject add ↔ remove | **SYMMETRIC — covered.** | `unlinkVerifiedOwner` (`DELETE FROM principal_google_identities`); `removeDelegationSubject` (`DELETE FROM principal_delegation_subjects`). |
| Forms responses delete; People “Other contacts” delete; Directory ASP/token create; ChromeOS device create/delete; Meet space delete | **PLATFORM HAS NO LEG** (map facts, not server gaps). | Recorded so no future census re-opens them as absences. |

**Server-self surface (outside the 486).** The registration lifecycle above is this
server's own surface, dispositioned here rather than in the map counts: registration
create COVERED; registration read/list/update/delete MISSING (RECENSUS-1);
token/connection revoke COVERED; enrolled-account delete COVERED (legacy) / soft-only
(P10, plan above). Enrolling a Google account has no tool path by deliberate design —
enrollment is an owner ceremony through the browser doors (public Google sign-in +
link-while-signed-in; the legacy passphrase door), and that ceremony is the accepted
shape, not a missing leg; the missing leg is the registration *delete*, not the
enrollment door. Server-only families with no counterpart in the service map (Data
Transfer, Postmaster, DNS records, Chrome policies, Admin alerts) are inventoried but
not graded against the map; one symmetry note travels with them: Data Transfer has a
start leg and no cancel leg in this server.

**Missing-with-plan rows** (each is a MISSING disposition with its filed or named plan;
all remain MISSING for the grade cap until built):

| # | Missing capability | Plan |
|---|---|---|
| M1 | OAuth client registration read / update / list / delete | **Card [RECENSUS-1](pr-cards/RECENSUS-1.md), filed with this addendum**; build owned by this repo's existing queue (the census files the card; it does not jump the build order). |
| M2 | P10 principal deletion execution (request recorded, nothing executes) | Owner decision on retention/erasure first (the portal's own disclosure defers it to launch); then a build card from this repo's queue. |
| M3 | Chat depth — 47 of 55 methods: space patch/delete, member remove, message get/patch, reactions, pins, sections, read states, notification settings, custom emojis, availability, media, space events, space search/setup | P11 provider-gaps work already in the master queue (`docs/plan/TASKS.md`); bundle proposal to be filed by this repo's queue. |
| M4 | Vault depth — 28 of 33 methods: matter get/update/delete/undelete/close/reopen/permissions, exports (full lifecycle), saved queries, operations, hold account add/remove, hold update | P11 provider-gaps bundle; note the repo's own records show Vault unavailable on the customer's current edition — the capability absence stands regardless, the edition note travels with the plan. |
| M5 | Drive collaboration surface — comments and replies (10), file approvals (8), access proposals (3), revision update/pin (1), apps list/get (2), labels list (1) | P11 provider-gaps bundle. |
| M6 | Gmail security and migration surface — CSE identities/keypairs and S/MIME (16), message insert/import (2), language settings (2), watch/stop (2), send-as verify and single-gets, delegate single-get | P11 provider-gaps bundle; forwarding-address delete (symmetry ledger) rides the same bundle. |
| M7 | Push/watch channels server-wide — Calendar, Drive, Directory watch legs and channel stop | One design decision (a single notification-channel card) under P11 rather than per-family fragments. |
| M8 | People depth — contact groups create/get/update/delete and members modify (6), Other contacts list/search/copy (3, delete is platform-absent), contact photo set/remove (2) | P11 provider-gaps bundle. (Batch contact create/update/delete and batch get are COMPOSED via the single-contact tools, not missing.) |
| M9 | Directory stragglers — backup verification codes generate/invalidate/list (3), 2SV turnOff (1), ChromeOS batch status/commands surface (4), building-feature get/update/rename (3), member single-get/hasMember/patch (3), guest-user create (1), role-assignment and ASP single-gets (2), calendarList subscribe and per-user settings (6 of Calendar's 18), Forms watches (4 of Forms' 4), Reports entity usage (1), Sheets data-filter legs and batch clears (6 of Sheets' 7) | P11 provider-gaps bundle(s), split by family as the queue prefers. |

**Composition economy.** The server's composites already collapse the heaviest raw-API
workflows to one call (onboard employee ≈ 6 underlying operations →
`workflow_onboard_employee`; offboard likewise; inbox triage 1; scheduling with guests
and a Meet link 1 each; bulk operations on up to 20 users 1 guarded call; up to 10 reads
in `workspace_batch` 1). Remaining jobs over 3 calls are flagged
**COMPOSITION-OWED**: (1) reply to mail with an attachment sourced from Drive —
search → read → Drive download/export → send = 4 calls; proposal: let
`gmail_send_with_attachment` accept a Drive file ID and fetch the bytes server-side.
Jobs whose legs are MISSING (Vault export run; Forms watch renewal) are recorded as
missing above, not composition-owed — composition cannot be owed for legs that do not
exist.

**Declared limits carried forward.** Cartographer A: the Reports watch-teardown leg is
unverified (above); everything else in the map was read in full from Google's indexes.
Cartographer B: the live catalog was not independently re-paged (385 is proven from the
executed registry plus the simulated production policy filter, reproducing the repo's
recorded live census exactly); `test/`, most of `docs/` and most of `scripts/` were not
read — bounded and argued in the inventory (no served tool or route can hide there:
both doors' import graphs close over `src/tools/index.js`, and every HTTP surface is an
`api/` file plus `vercel.json`, all read and byte-verified); production database row
counts (how many stale registrations exist today) are not determinable from code.
Method-level dispositions were allocated leg-by-leg from the two sealed sources'
per-resource tables; where a map row groups methods (patch/update pairs, singleton
settings), the allocation follows the map's own stated family totals.
