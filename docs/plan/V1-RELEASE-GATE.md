## October 20 — original Workspace developer refresh accepted; two v1 gates remain

Owner explicitly transferred exclusive Workspace-only checkpoint ownership. Original October13 native bearer initialized and read real Google identity/accounts; one real-time refresh succeeded, retained the original refresh and full policy, and both renewed and original bearers still read. Protected refreshed state was independently read back; other five service records untouched. SQL confirms all17 original records active plus1 normal same-policy refresh record. This closes **P10-OWNER-CONTINUITY**, and retained completed migration/subject-probe receipts close their dependencies: **36 PASSED / 4 PENDING**. [New proof](evidence/2026-10-20-original-workspace-refresh.json). No ChatGPT-managed refresh is claimed.

**V1 still NOT READY:** P10-VERIFY-GOOGLE needs the live authenticated forged-POST proof; P10-MCP-PILOT depends on that row. Both real browser logins/logout/cleanup and all101 real-PostgreSQL handler tests are retained with distinct provenance. Cloud browser supports UI/read-only evaluation; controlled data: form was blocked in the earlier run. No alternate-surface bypass, session export or synthetic live pass. Resolve with an authorized browser test runner capable of submitting a controlled invalid-CSRF request in its own real pilot session; preserve existing grants. Paid licensing and customer DWD remain explicitly excluded pending capabilities. Production independently READY fbac5349; main2ec838c is tests/evidence only ahead of runtime. No release required to execute remaining tests.

# v1 early-release gate — finished usable product, not all APIs

**Owner-approved October 19, 2026.** The immediate milestone is an independently usable, secure, reliable, **invite-only early-production release** for approved real Google identities and supported OAuth-native MCP clients. The product is **not** considered released merely because code was merged, a deployment is READY, or an owner-only connection works. This decision revises the *first release boundary*; it does not remove or mark complete the original acceptance work.

[Machine-readable exact existing acceptance IDs](v1-release-gates.json) and the non-mutating gate `npm run v1:readiness` are the release checklist. The source of truth for *actual* acceptance is still the JSON `<!-- release-acceptance:start -->` block in `TASKS.md`; no parallel replacement acceptance ledger is authorized. The gate must be run after independent live/source observations. It prints a preflight, **not** a final Google/provider certification or a release authorization.

## What v1 includes

- Standalone remote MCP with the service's owned OAuth, successful protected-resource discovery and actual scoped client connection, authorized Google execution and proper consent; never depend on Hub.
- Multi-user account and client isolation with real second test identity; verify wrong-subject/client denial, S256, single-use code/replay, refresh and RFC7009 revoke after the fixes in #235 are actually serving.
- Original owner's existing active connection, original bearer and refresh continuation; real preserved credentials, reliable account link/unlink/owner recovery.
- Supported **already-implemented** user-facing API operations with honest scope/edition/permission states, functional current-user reads and tested guarded writes on owner-approved reversible fixtures, no blanket development-agent limitation on end users.
- Truthful app identity, owner domain, privacy/data-use/deletion/support and scoped-account consent/disconnect, appropriate protective defaults and audit/readbacks.
- Verified desktop/mobile native MCP compatibility **per client/version when supported and actually observed**; if a client/platform is unsupported or untested, say so explicitly, do not advertise it as certified.
- Required checked source, exact-head CI, reviewed PR, compliant release, independent production READY/source confirmation and post-release provider/source readbacks. Retain valid older provider tests until a relevant change invalidates them. No unnecessary reruns of destructive fixtures.

This is **not** public unrestricted enrollment, Google's commercial verification, or acceptance of every API method. Invite-only/Testing audience restrictions and Google consent app limits must remain clearly disclosed. Never silently switch `PUBLIC_SIGNIN_MODE` to public or add strangers to allowlists on the strength of this plan. Explicit owner permission is required for any off-schedule release, external credentials, Google fees, paid operations, customer DWD, destructive tests or public-mode transition.

## Required acceptance

The existing rows that must actually be `PASSED` for v1 are:

1. `P10-OWNER-CONTINUITY` — prove original owner bearer/refresh plus real limited RTC refusal on the protected source.
2. `P10-VERIFY-GOOGLE` — two independent Google principals' own consent, signed login/nonce, logout/cleanup; no guessing from a single connection.
3. `P10-MCP-PILOT` — two real independently authenticated clients/principals with provider read, denial, token replay/refresh/revoke and evidence from each.
4. `P10-OWNER-MIGRATION-LIVE` — owner linked sign-in/reversible unlink with preserved original credential continuity.
5. `P10-6-PUBLIC-DISCLOSURE` — accurate actual served policies, authenticated portal, retained privacy and owner review for intended early audience.
6. `P10-6-OWNER-SUBJECT-PROBE` — genuine safely verified subject-bound readiness and nonmutation evidence for approved testers.

These requirements are **not** satisfied in the baseline; current source is ahead of live. Retain the existing P10-6 original full-public phase acceptance separately as not yet accepted.

## Two capability-specific release exclusions (NOT erased)

- `P9-LICENSE-PAID`: license changes and purchases remain available only in the strictly user-authorized, properly guarded product path, but a **real charged write** is not a proven/advertised v1 capability. Provider-scope/billing results are honest. This existing task remains PENDING until approved specific paid fixture evidence.
- `P10-CUSTOMER-DELEGATION`: arbitrary external customer's own DWD setup is not a verified/advertised v1 feature. Secure source support may remain and must never leak owner tenant keys. Record clear feature eligibility/limits, preserve PENDING until a separately approved real Google customer-admin setup.

Existing paid and customer-DWD queue entries remain in `TASKS.md` with their original scope and dependencies. Full method coverage remains an ongoing **required** roadmap objective, not an early-release gate. Source/stage states never mean an endpoint is live or a Google API is usable without independent authorization.

## October 19 exception-specific release authorization

After ordinary daily receipts were consumed, the owner explicitly renewed authorization for an exceptional unscheduled release and deployment. The separate reviewed, fail-closed exception in [the release policy](../../.github/RELEASE-POLICY.md) permits a **single additional** checked October 19 promotion with original receipts intact, exact-head green CI, leased nonforced update, a unique immutable supplemental receipt, and independent READY/source/alias verification. This is **not v1 acceptance** and not permission to enable public login, paid Google operations, new subjects or customer DWD. A failed release remains a recorded incident.

## October 19 — genuine production evidence without account permissions

The new [real production public-HTTPS smoke harness](../../scripts/v1-live-public-smoke.mjs) and [GitHub Actions workflow](../../.github/workflows/v1-live-public.yml) inspect the live source SHA, both approved production aliases, public disclosures, anonymous account refusal and OAuth S256/revocation discovery without any credential. The runner explicitly **does not** certify signed users, token refresh, Google grant, two distinct clients, owner migration or legal/policy approval. Never upgrade a pending row on code review/unit tests alone; record a genuine Actions live result before claiming an actual pass.

Independent read-only post-release Neon aggregate and connected owner whoami on READY `d67c5d6`: 17 still-active refresh-capable owner bearer records across 2 legacy owner Google accounts; 2 registered pilot subjects/principals but **1** active independent public Google grant and **1** active pilot MCP client. Owner-authenticated gateway continued to work and legacy token-use time advanced; **original refresh replay, second subject/client and protected portal/identity tests remain outstanding**.

## Fastest correct execution order

1. Source: #235 and #236 are merged into `main=b557eab28847b5adc60e8a09c65cfe0908864843`; deployment `ab26461a0fe3179b9b085937e437d977b7d0134b` was independently READY at planning. Reconfirm live/CI before applying the **next permitted scheduled release**. Do not attempt an unscheduled promotion without separate owner approval. Prioritize testing checks that are already eligible on the deployed revision.
2. No new Google test identities: retain approved two pilot Google identities plus the independently existing direct owner connection; obtain the **second identity's genuine own consent**. Protect old bearer/refresh. Use supported native clients, not synthetic token injection or a forced TEST shortcut.
3. Execute each required original P10 and data-use acceptance with real provider/client evidence, strict denial and cleanup, distinct scoped clients and actual ready revision. Fix any genuine v1 defect in a single coherent PR and reaccept only what changed.
4. Run `npm run v1:readiness -- --main SHA --live SHA --deployed SHA --state READY` using **independently observed** refs and production proof; it performs **only static preflight**. Review externally verified release evidence, real Google/issuer/owner, CI and security separately. Then record approved early-release checkpoint; invite-only v1 can be complete even though advanced provider coverage continues.
5. Schedule method-by-method API family bundles under `docs/PROVIDER-API-COVERAGE.md`, publishing truthful post-v1 coverage updates. No second open-ended "project completion push" before shipping v1.

## Public-launch boundary

Public self-service v1 GA, public directory listing, OAuth app verification, marketing/review/distribution and scope-use eligibility are **separate** from private early v1. Public mode cannot be enabled until actual provider approvals or documented applicable exceptions, owned domain and legal disclosures, open enrollment security and real audience/client testing are satisfied. Portfolio distribution is managed by Robinson AI Systems, not the standalone server. A deployed allowlisted service is usable production software without pretending public access is approved.

## Status at adoption

**NOT READY**. Required existing queue contains pending rows, newer source is not on READY production. Recorded baseline: 32 PASSED/8 PENDING; merged #235 and #236 exact-head CI green; Vercel READY serves `ab26461a0fe3179b9b085937e437d977b7d0134b` while `main` is `b557eab28847b5adc60e8a09c65cfe0908864843`. These are dated observations, not current-at-all-times facts. No release/consent/mutation or verified second independent client was caused by this plan.


## October 19 22:37 Denver — invite-only disclosure gate accepted

`P10-6-PUBLIC-DISCLOSURE` is now PASSED for the owner-approved early audience after real authenticated portal/public HTTPS observations, retained attributed owned-domain/Console evidence, and explicit operator acceptance of recoverable deletion, no irreversible erasure and no promised retention deadline. See [sanitized evidence](evidence/2026-10-19-approved-disclosure-browser-acceptance.json). Queue is 33 PASSED / 7 PENDING; the other five mandatory v1 rows remain PENDING. This does not approve unrestricted enrollment or Google/public distribution and does not substitute for token lifecycle or original-owner security acceptance. Earlier NOT READY baselines are dated history; current v1 verdict is still NOT READY.


## October 20 — recovered acceptance and remaining exact prerequisites

See [recovery receipt](evidence/2026-10-20-failed-thread-recovery.json). The original ChatGPT-held owner connection and both other connected accounts actually work; asking for a missing second connection or a known separate runner is incorrect. Existing-client refresh is still unobserved and cannot be inferred from active records or a metadata refresh. Recovered two-client, migration, direct RTC and signed-negative receipts remain valid at READY fbac5349; all dependencies and original criteria are unchanged. Authenticated browser CSRF/email/cleanup remains incomplete, and automatic approval review rejected Google account selection pending explicit named identity-only sign-in approval. 33 PASSED/7 PENDING; v1 NOT READY. No new release or public access is needed to finish these checks.
