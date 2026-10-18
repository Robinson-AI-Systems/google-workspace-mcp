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
