# P10-6 — launch information and protected pilot preflight

This is the existing roadmap P10-6's source-readiness contribution, **not a new subsection or a second roadmap**. The original provider pilot and publication acceptance remains OPEN until the actual Google and external MCP evidence exists; the owner approved only a bounded non-billable two-user pilot, not a release or public activation (issue #205).

<!-- bundle-plan:start -->
```json
{
  "workKind": "ENGINEERING",
  "baseRevision": "0d47c4e2474b70320256b3f8f0963b59521912f9",
  "outcome": "Prepare the real P10-6 OAuth app for honest external review and safe owner-managed two-user pilot preflight, without credentials or permission/activation changes.",
  "integrationBoundary": "Public homepage, privacy/data-use and deletion/support information; current incremental Google scope groups; passphrase-protected owner-only, redacted config/pilot readiness check; existing OAuth and account sessions unchanged.",
  "newEngineering": "Add public truthfully scoped app/disclosure/help pages, wire accessible homepage/account-portal notices, add pure fail-closed preflight over actual OAuth source scopes and deployment config, expose a protected existing passphrase/lockout operator read without state mutation or secret/subject leakage, test both positive and denied HTTP flows.",
  "estimatedProductionLines": 440,
  "relatedWorkDecision": "P10-6 source preparation stays separate from authentic Google OAuth console configuration, live identity/Hub/MCP provider acceptance, and owner-selected checked release. No early promotion, Google mutation, public enrollment, production flags or legacy retirement.",
  "subsections": [
    {
      "id": "P10-6",
      "acceptance": [
        "Run off -> pilot -> public; first deploy with public off and unchanged owner login and prove original owner/native/Hub continuity around each relevant release.",
        "Use two separately owner-authorized disposable verified Google identities (ordinary Gmail and Workspace admin when available), with own exact resources and cleanup; prove actual client login, authorized reads, one separately approved reversible write, revocation, wrong-account refusal and owner continuity.",
        "Prepare public application identity, verified domains, privacy/support/delete-account information, incremental scope inventory, Google-sensitive/restricted verification requirements and actual exception or assessed paid-review applicability without spending or submitting binding agreements.",
        "Record source/deployment/client/identity/mode/scopes/provider/revocation/cleanup receipt and actual provider/permission limits; preserve all original 29 accepted tasks and do not treat source fixtures as external acceptance."
      ],
      "remainingEngineering": [
        "Implement pre-pilot operator-only redacted configuration/capability checks with rigorous denial and no provider calls.",
        "Implement public source-grounded app purpose/data-practices/support/deletion information and integrate with homepage, account portal and current incremental scopes.",
        "Provide automated contract/handler tests and source-pinned Google Console implementation checklist; preserve truthful pending external provider and review gates."
      ],
      "remainingWork": [
        "Owner creates and configures separate public Google OAuth project, client and approved tester identities.",
        "After separately approved checked release, verify original owner/Hub and actual independent Google user A/B end-to-end sign-in, denial, read, revocation and cleanup.",
        "Obtain review of public data-use/legal disclosures and actual Google domain/scope/brand verification requirements and separately authorize the exact reversible pilot write before calling it passed."
      ]
    }
  ]
}
```
<!-- bundle-plan:end -->

## Delivery — source readiness contribution only

Source `4a9c6a929fab6931caea95f3af94fc9ed6a7173d` implements public service/data-use/support/deletion information, notices before incremental Google account linking, exact provider scope inventory, owner-passphrase-and-lockout protected configuration preflight, and one-use browser-bound signed Google OIDC subject discovery **without creating a principal, grant, agent token, or Google mutation**. An explicit operator Google Console and public-verification checklist accompanies the code.

Original P10-6 criterion mapping remains honest:
1. OFF → pilot → public with owner/Hub continuation: OFF remains default; no actual deployed new source/owner/Hub continuity proof is claimed here.
2. Two distinct real Google identities/custom MCP clients, scope/denial/revocation/cleanup and one separately approved reversible write: unperformed. Protected subject discovery is not public enrollment or custom MCP pilot acceptance.
3. Public app identity, privacy/support/delete information and Google scope/verification: source implementation exists; final owner-approved privacy/retention/support, owned verified hostname, sensitive/restricted scope categorization and Google verification/exception remain external.
4. Complete source/provider receipt and original 29 preserved tasks: source-pinned pending acceptance rows added; zero real provider passes inferred from synthetic tests.

**CI/review:** first PR candidate unit suite found a genuine support copy construction bug; fixed in `4a9c6a929fab6931caea95f3af94fc9ed6a7173d` alongside a browser same-origin form policy regression. Exact corrected-head CI/review/merge proof must be recorded at closeout; no historic red test is treated as passed.

**Accounting:** P10-6 stays OPEN and counts zero whole completed subsections or bundles. All genuine Google app, checked release, owner/billing/legal and public mode approvals remain separate; see issue #205 and the original task IDs.


## Owner-approved maintenance clarification — 2026-10-17: standalone identity-only pilot

This note records a *new owner separation-of-concerns decision*; it does not revise the frozen source-readiness bundle plan above or change the original P10-6 full-product acceptance criteria. **Workspace can be used independently of Hub.** Hub's expired TEST grant cannot prevent a Workspace-only two-identity sign-in pilot; Hub relay and TEST refusal acceptance remains PENDING separately and must never be marked passed on historical receipts. The owner approved identity-only Stage 1 earlier today and explicitly corrected the erroneous Hub activation dependency.

Stage 1 acceptance criteria before and after `PUBLIC_SIGNIN_MODE=pilot`:
1. Independently prove checked serving READY `live` revision and original directly connected owner Workspace identity/account-list read; keep owner passphrase, owner Google OAuth and legacy bearer/refresh infrastructure unchanged. Record any still-untested original owner bearer/refresh replay separately, never infer a pass.
2. Verify separate Google OAuth client, verified two-subject allowlist, V2 encryption and `PUBLIC_P10_TOOL_EXECUTION_VERIFIED` absent/false; preserve the existing real Postgres isolation source+CI evidence. Permit exactly the two verified subjects to **sign in**, not to execute MCP tools.
3. Owner's earlier explicit Stage 1 approval authorizes only Vercel Production `PUBLIC_SIGNIN_MODE=pilot` and its environment configuration; a changed Vercel environment variable does **not by itself guarantee a new deployment**. Use only an independently authorized checked source release or **separately approved off-cycle production deployment of the exact verified live SHA** to apply it. Verify the new READY deployment, canonical alias, `pilotRosterCount=2`, `currentMode=pilot`, `toolExecutionFlagEnabled=false`, `legacyOwnerNewSignInEnabled=true`, and owner `workspace_whoami` / list-account continuation. If isolation or old owner access fails, set the mode to `off` and apply it with the same authorized, independently verified deployment procedure; the env edit alone is not a runtime rollback.
4. Actual independent Google A/B session and wrong-subject refusal/CSRF/log-out acceptance require authenticated browser observations; report them as PENDING until witnessed. Same for two real MCP clients, replay, revocation, original bearer/refresh matrix, and production Hub connection/denials.
5. Stage 2 tool execution, all real provider writes, public sign-in, customer-wide delegation, legacy owner sign-in retirement and off-schedule source releases are **not** authorized. Do not mark `P10-OWNER-CONTINUITY`, `P10-VERIFY-GOOGLE`, or `P10-MCP-PILOT` PASSED merely because Stage 1 mode is active.

This is a maintenance/decision-alignment correction, not an invented roadmap subsection or completed implementation bundle; source functionality remains unchanged.


## P10-6 incident maintenance plan — 2026-10-17: real invited tester callback refusal

This is a **targeted P10-6 incident repair**, not another new batch subsection, duplicate roadmap or claim of fully passed two-user external acceptance. The owner's two-user identity-only pilot is already active on serving Git revision `c0f407ecafc17f07a6fe3502996b7e269c5497ba`. One independently verified browser user has passed, and a second approved, newly verified Google subject receives the common OAuth callback error. Preserve live pilot admission boundaries, original owner login, Google grant isolation and the current execution-disabled flag.

**Frozen incident acceptance criteria before code changes:**
1. Record only *allowlisted error classifications and fixed processing phases* for failed server-side Google callbacks, never raw exceptions, provider error responses, state/nonce/cookies, token data, private subject IDs, verified email addresses, account IDs or client metadata.
2. Preserve one-use browser/state cookie matching, signed Google issuer/audience/nonce validation, exact pilot subject admission, original-owner reserved-email protections and generic outward HTTP 400 errors without identity enumeration.
3. Cover actual route behavior in unit tests: invalid browser cookie, unapproved subject, original-owner reserved principal, and unexpected provider/store errors cannot expose values; successful independent user still gets a session, replay still fails.
4. Verify exact-head typecheck and focused/full CI and review before merging. Do not mark a real second-user provider pass based on tests or logs. A separate owner-approved checked production release is required before collecting new production failure classifications; the current pilot configuration and serving `live` remain unchanged by this code PR.

**Planned changes:** `api/auth/google/callback.js` and its existing route unit tests; no schema, OAuth scope, login policy, provider account or environment update. Small incident maintenance; zero roadmap bundles claimed.


## P10-6 migration incident — frozen protected preflight acceptance, 2026-10-17

**Proven incident:** Production Google OAuth returned `principal_bind/reserved_identity` for the correctly allowlisted second subject. The owner has explained that the same approved test mailbox was connected to the original legacy Workspace MCP before P10. Original owner `google_accounts` contains two distinct mailboxes and both retain live bearer/refresh connections. Simply bypassing the reserved identity check or deleting a legacy row would expose, strand or silently revoke existing owner grants. The owner approved **pursuing a controlled migration**, not an unreviewed production data rewrite or retirement of legacy MCP connections.

**Freeze criteria before source changes:**
1. Reuse the *existing passphrase-locked, browser-bound, one-use Google-verified pilot identity probe* to show an owner-only **read-only** assessment of whether the genuinely verified Google account is one of the original connected legacy mailboxes. Never accept a typed subject or email as proof of account identity.
2. For an already connected legacy Google account, show only the necessary account-specific migration impact: default/nondefault status, stored encrypted legacy grant existence, active bearer/refresh-capable connection counts (including NULL/default selectors when applicable), unconsumed outstanding login codes, and explicit safe/blocked staging guidance. Do not expose bearer/refresh values, encrypted credentials, provider exceptions or mailboxes to external callers/logs.
3. Preserve all original owner grants, old bearer/refresh access, owner account selectors, default routing, P10 pilot subject admission, cross-principal isolation, existing one-use provider transaction and Google nonce checks. This PR MUST NOT disable `reserved_identity`, move any principal, grant, or token, or mutate production account records.
4. Add real PostgreSQL-backed non-writing before/after account/token and default-selector regression assertions plus protected route tests for verified legacy tester, independent tester, foreign browser and replay. CI `test` and `release-policy` green at exact head, review/merge only by normal rules; this preflight source does **not** satisfy the real second-user login or entire migration.
5. **Handoff:** before a future separately approved transfer/reclassification, identify the actual selected mailbox through this authenticated verified probe, enumerate dependent original-owner connections, and obtain the owner's explicit choice on retiring or migrating those connections. Design/implement atomic change and rollback as a separate guarded follow-on when account-specific consent and deployment prerequisites are known. No off-cycle deployment or production account/grant change follows from this PR alone.

**Planned touch points:** `src/principals/owner-migration.js` (read-only targeted assessment), `api/auth/google/callback.js` (existing owner-verified probe display), `test/unit/p10-pilot-probe.test.js`, `test/db/principal-store.test.js`, this existing P10-6 card and permanent incident issue #205. This is source safety/recovery within existing P10-6; not a fabricated new roadmap subsection or completed production migration.


## October 18 — owner-approved legacy testing mailbox pilot coexistence correction (P10-6)

**Owner decision:** Keep the original MCP's Google grants, active bearer/refresh connections and default mailbox selection working while allowing the previously approved Google testing identity to sign into its *separate*, identity-only pilot principal. This is a P10-6 incident fix, not general legacy-account migration or public activation. Production incident proof in issue #205: signed Google subject passed admission but a previous owner `google_accounts` row rejected it with `reserved_identity`. The existing authenticated migration impact preview from PR #213 is retained.

**Acceptance criteria frozen before implementation:**
1. On verified Google OIDC login only, admit the *explicitly designated* legacy testing subject by exact `sub` through a separate protected Production `PUBLIC_PILOT_LEGACY_SUBJECTS` allowlist. Require `PUBLIC_SIGNIN_MODE=pilot`, presence in the ordinary two-subject `PUBLIC_PILOT_GOOGLE_SUBJECTS`, and `PUBLIC_P10_TOOL_EXECUTION_VERIFIED` not true. No email/host/domain hint may confer this exception. Without all conditions, the existing `reserved_identity` denial remains. The ordinary new independent user still signs in unchanged.
2. The exception creates/recovers only a separate user **identity + browser session**; it never copies owner grants, changes owner account rows/default, transfers bearer/refresh credentials, issues MCP connections or permits Google account linkage to a reserved mailbox. Every ordinary `upsertLinkedAccount` reserved-email guard remains, including for the exception principal. Any attempt to enable P10 tool execution or public sign-in closes this narrow exception until a separately reviewed actual migration.
3. Add a server-side fail-closed guard on session/account-scoped execution: while a previously reserved email is shared solely for this testing exception, no original owner account/token/default can be resolved from a new user session, and no account can be linked under that reserved email. Do not weaken existing foreign-principal, PKCE/state, nonce, CSRF or OAuth boundaries.
4. Test normal/denied route paths, configuration removal and expiry, wrong pilot subject, production/public mode, tool execution true, misleading Google emails and replay/foreign browser. In a real disposable PostgreSQL test, assert the pilot principal can be created separately and signed in while original legacy grants, bearer/refresh and default mapping are byte-for-byte preserved; replay/reserved linkage still denied. Run exact-head `test`, `release-policy`, `check`, `unit`, `db`, `rtc` and review before merging.
5. Update the owner guide/configuration and existing acceptance handoff accurately. No production credentials, account data, owner grants or environment variables are changed in the implementation PR. Real A/B browser acceptance remains OPEN. Setting the separate exact-subject Production switch and deploying it require the repository's independent approval/release gates; no off-cycle release follows merely from this source change.

**Work boundary:** `src/principals/security.js`, `src/principals/store.js`, `api/auth/google/callback.js`, `src/principals/pilot-readiness.js`, existing P10 unit/real-Postgres tests and owner guidance. Not a complete legacy account transfer; no customer OAuth tool execution, provider writes, new provider, spending, or production mutation.


## October 18 completion acceptance continuation

Continue original P9/P10 acceptance on independently READY production `17beedb22d6f7e71db1c265a54b13166619b181f`, preserving all original criteria and 17 existing owner access records. This is incremental acceptance maintenance, zero engineering bundles. HTTP and protected readiness observations already executed before this recovery commit are recorded honestly, not represented as a pre-execution plan.

- Record genuine production GET/HEAD/POST, anonymous account denial and owner-authenticated sanitized readiness; retain authenticated owner OAuth/account-management gaps.
- Reconcile the stale missing-public-client statements against actual authenticated configuration, without exposing secrets or claiming A/B provider acceptance.
- Recheck read-only native owner identity/account list, aggregate isolation and Hub capability; do not take over the shared rotating developer checkpoint.
- Prepare owner-selected `workspace.robinsonaisystems.com` using actual Vercel DNS recommendations and Google verification requirements; leave DNS, OAuth redirect/canonical resource and credentials unchanged pending coordinated transition. The owner reports another agent is changing the apex website.
- Preserve all eleven pending task IDs and original criteria. No full PASS until its complete original proof exists. Publish sanitized evidence and a criterion-level permanent checkpoint; no off-cycle release or Stage 2 activation.


## October 19 owner completion directive — client identity, branding and authority audit follow-through

**Workstream:** existing P9-4/P10-6, not a new subsection, completed bundle, public-launch approval or change to the frozen P10-6 source-readiness plan above. **Base revision:** `be0999f50af0fe4b8a9f5ae0a7ecfa714206c490`. The owner requires independently usable native MCP, recognizable Robinson AI Systems attribution, and security-preserving end-user authority. Preserve the existing `robinson-google-workspace-mcp` machine identifier, `/api/mcp`, Google owner login/bearers, existing RTC TEST/LIVE passes, pilot roster, and every developer/release gate.

### Frozen targeted acceptance before source edits

1. Native SDK `initialize` keeps its technical `serverInfo.name` unchanged and adds truthful recognizable operator information through a separate human-readable title. Real direct SDK tool-list/read/denial regression remains covered; synthetic results are never counted as a new real client.
2. Public service pages and the protected owner OAuth, account and pass setup screens consistently identify **Robinson AI Systems** as the independent operator; anonymous pages explicitly say Google has not created, endorsed or authorized the connector. A trademark attribution accompanies the compatibility claim. Do not expose any owner mailbox or mutate account state just to render branding.
3. RTC OpenAPI human-facing title and NPM package description correctly identify this as a remote, independent MCP service rather than a Claude-only or officially endorsed Google integration; keep technical server, tool names, protocol, URL, schema and SDK compatibility stable.
4. Add focused tests for native MCP server identity, anonymous privacy, human-readable metadata, and nonendorsement text; preserve existing source/real-PostgreSQL authorization checks and exact-head required CI/review. Do not claim desktop or mobile client acceptance from SDK tests.
5. Record exact source paths and classifications for any newly audited developer-policy assumptions. Existing P9 classification is bounded: it does NOT attest a completed entire-repository audit. No unreviewed permission removal or new backend spending grants.
6. Document the owner-preferred display name and any real provider/platform naming restriction with a compliant candidate requiring owner approval; do not edit a public plugin listing or publish/invite users. Independently verify desktop and mobile clients only when real supported client routes and owner-authorized credentials exist; retain original P10-6 acceptance as PENDING.

**Scope/measurement:** brand/source metadata plus existing authorization and public setup seams, regression tests, classification inventory and P10 acceptance checklist. This is incomplete P10-6 supporting engineering/maintenance, **zero whole subsections and zero bundles** until original criteria pass. This tool-only environment can inspect GitHub and exact-head CI but cannot run `npm run session:prepare` or `npm run session:bundle` over a full checkout; that missing local check must remain visible and not be represented as passed. Do not rewrite the historical frozen plan, alter production/live, enable Stage 2, broaden grants, or use the Hub as a Workspace completion gate.

### Additional evidenced developer-policy copy leak, before code change

2026-10-19 source audit: `api/google/callback.js` successful **owner Google enrollment** response uses a product-unrelated admonition to prefer the Appliance Rentals account for future developer tests, and `api/google/authorize.js` still introduces the legacy owner setup under an older inconsistent Robinson label. Neither message should constrain or redirect an already-authorized end user's account choice. **Classify:** developer-only testing guidance leaked into user-facing setup text (remediate), and preexisting legacy owner-only enrollment requires the owner passphrase (valid security boundary, retain). **Frozen acceptance:** keep existing owner passphrase/state cookie/nonce and Google callback transaction untouched; change only public HTML attribution and explanatory copy, remove any test-account suggestion, retain HTML escaping and no-store/referrer/clickjack headers. Add actual successful callback handler and denied state/invalid code regression, showing the returned signed-in Google mailbox is still correctly escaped and unauthorized callback does not call provider or reveal a mailbox. Preserve public principal-scoped `api/auth/google/start` as separate independent-user enrollment; no owner credential migration, new Google consent, test mailbox override or release. The same P10-6 milestone remains OPEN; this code copy fix earns no standalone bundle.


### October 19 — observed P10-6 browser-origin recovery (incident plan frozen before code)

**Real observation:** An approved pilot tester opening `workspace.robinsonaisystems.com/api/account` received `invalid_session_or_scope`, and beginning Google login from that alias produced `Invalid Google sign-in`. The actual Vercel Production `PUBLIC_BASE_URL` remains `https://google-workspace-mcp-chris-projects-de6cd1bf.vercel.app`. The Google OIDC start establishes a ten-minute Secure, HttpOnly, host-only browser cookie; Google's registered callback returns to the configured Vercel host. Two hosts split the required browser-bound cookie. The owner then signed in using the configured canonical Vercel address and completed the fresh mail grant. A read-only Neon production check independently confirmed exactly one V2 Google linked account, one freshly consented historically connected pilot principal, two retained original owner accounts and 17 retained active owner access tokens. It does **not** certify original token replay, two native client sessions or all P10-6 acceptance.

**Acceptance frozen before source modification:**
1. A GET to Google pilot login start on an alternate supplied Host redirects to the **operator-configured validated canonical HTTPS** `PUBLIC_BASE_URL`, carrying only bounded known OAuth-start query parameters. The redirect happens before Google calls, transaction persistence or setting browser cookies. An untrusted Host can never determine the destination; missing/malformed canonical configuration refuses. Canonical requests retain existing JWT/nonce/PKCE/allowlist behavior.
2. A noncanonical GET to the V2 user account portal redirects to the same configured canonical portal before database/session lookup, so a browser does not appear logged out on a parallel hostname. An anonymous canonical GET gives a clear, safe sign-in link instead of an opaque `invalid_session_or_scope`. No private accounts are disclosed; authenticated reads and all CSRF-guarded POSTs are unchanged.
3. No production host/Google callback/environment mutations, provider scope changes, account migration, public/Stage2 activation, owner bearer or token revocation, spending or off-cycle release. After checked deployment, test real browser entry on both hosts and the configured callback, plus original owner continuation; do not assert runtime fix until served.
4. Route tests cover canonical vs alternate/hostile Host, query parameter bounded forwarding, no new OAuth state/cookie on redirect, bad PUBLIC_BASE_URL refusal, original valid same-host session path, anonymous login guidance, and explicit POST no-redirect protections. Keep existing real PostgreSQL and RTC gates.
   
**Roadmap/accounting:** This is incident repair within the existing incomplete P10-6 and is not a separately completed roadmap subsection or full completion bundle. Existing P9/P10 real acceptance and release gates remain unchanged.
