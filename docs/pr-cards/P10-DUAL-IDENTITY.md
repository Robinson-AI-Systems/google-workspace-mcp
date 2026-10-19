# P10-B — dual identity foundation execution card

Source of truth: `docs/plan/designs/USER-AUTHORITY-AND-PARALLEL-SIGNIN.md` P10-1..3, `docs/plan/TASKS.md`. This card is an execution plan, not a second roadmap.
Starting main: `c6f64546214946a55f7355146f68bed220b906eb`; existing P9 provider acceptance remains release-gated; old owner/Hub grants must remain untouched.
Public execution remains OFF until the P10-4 full isolation gate.

<!-- bundle-plan:start -->
```json
{
  "workKind": "ENGINEERING",
  "baseRevision": "c6f64546214946a55f7355146f68bed220b906eb",
  "outcome": "Deliver P10 approved outcome B: additive isolated principal storage, independently verified Google public identity/link, dual owner-compatible MCP OAuth/session/account lifecycle, with new-user dispatch disabled until P10-4.",
  "integrationBoundary": "Postgres V2 principal/identity/session/OAuth/connection/account grant tables; Google OAuth2Client OIDC+PKCE; public auth routes; native MCP OAuth split; guarded owner compatibility and explicit no-public-dispatch until tenant isolation.",
  "newEngineering": "Build principal-scoped encrypted persistence, actual Google SDK verified login and link flows, registered-client/resource/PKCE principal OAuth with rotation, and user account session/security lifecycle with real DB race tests.",
  "estimatedProductionLines": 1750,
  "relatedWorkDecision": "The approved architecture explicitly groups P10-1/P10-2/P10-3 as one interdependent identity foundation. P10-4/5 owner versus public dispatch isolation are subsequent gates; no Hub modification, public activation, credential setup, paid provider test or off-schedule release.",
  "subsections": [
    {
      "id": "P10-1",
      "acceptance": [
        "Add scoped V2 Postgres principal, Google identity/account, default, session, OAuth transaction/code/connection and delegation ownership stores with composite references and versioned encryption, while preserving every legacy owner bearer and ciphertext.",
        "Explicitly map old database/token/Hub grants to a fixed legacy owner adapter without public fallback; old upgrades twice and owner bearer/read/refresh/deny must still work.",
        "Verify foreign reference denial, concurrent account refresh compare-and-swap, exact scoped store membership, developer caller inventory and public dispatch disabled before P10-4."
      ],
      "remainingEngineering": [
        "Implement idempotent additive V2 schema with trust-bound encrypted scoped records and token CAS.",
        "Implement server-verifiable legacy owner context adapter and default-off public context.",
        "Real disposable Postgres and fake tests for upgrade twice, denial, CAS race and ownership."
      ]
    },
    {
      "id": "P10-2",
      "acceptance": [
        "Introduce separate PUBLIC Google OAuth SDK with verified OIDC JWT, stable issuer/sub identity, hashed state/nonce/browser binding and S256 provider PKCE; default public sign-in OFF.",
        "Offer public start/callback/session/logout, pilot verified subject admission and browser-bound one-use callback; existing owner OAuth project and login never change.",
        "Add authenticated incremental Google grant linking, independently verify identity and ownership, encrypt grants and preserve missing refresh token; test tampering, replay and consent rejection."
      ],
      "remainingEngineering": [
        "Implement verified public Google SDK flows, secure cookies, state, nonce, PKCE and durable single-use SQL.",
        "Implement authenticated incremental scope-linking preserving old grants, no email-based owner claim.",
        "Mock realistic Google token/JWKS responses and execute SQL / route denial tests."
      ]
    },
    {
      "id": "P10-3",
      "acceptance": [
        "Offer neutral MCP authorization choice while continuing existing owner sign-in; V2 OAuth code and token exchanges bind registered client/redirect, S256 PKCE, resource, immutable principal/account/policy.",
        "Use dedicated hashed V2 access/refresh store with atomic single-use refresh family replay denial, user session and account management; never dispatch V2 tools until P10-4 isolation.",
        "Prove two-user HTTP/real-Postgres code replay/foreign account/revoke/CSRF separation and owner OAuth/native/RTC regression."
      ],
      "remainingEngineering": [
        "Create dual issuer `/api/oauth/authorize` and token route with exact V2 protocol boundary.",
        "Implement user account portal with owned grant/account/agent controls and recoverable deletion preview.",
        "Test real-PG refresh race, one-time code, cookie session and owner continuity."
      ]
    }
  ]
}
```
<!-- bundle-plan:end -->

## Delivery

P10-1..P10-3 implemented as one coherent source outcome with full frozen criterion-to-code/test mapping in `docs/plan/evidence/p10-bundle-delivery.json`. Real provider live acceptance is deferred behind deployed source, separate public Google OAuth configuration and P10-4/5 isolation. No public tool dispatch or release authorized.
## Post-merge security regression — anonymous homepage owner mailbox disclosure (2026-10-17)

This is a newly found defect against the original P10-3 owner-mailbox privacy criterion, **not** a new roadmap subsection, a repeat P10-B bundle or provider acceptance. The previously frozen P10-B plan and delivered criteria remain unchanged. The separate P10-6 real pilot still requires its own external approvals and evidence (tracked in issue #205).

### Correction acceptance, frozen before implementation

1. An anonymous GET/HEAD of the public homepage must not query or disclose existing owner or user Google account rows, labels, defaults or connection metadata, even if legacy owner accounts are present. It must not initialize migration, ask Google for tokens or touch provider state merely to render the entry point.
2. Public landing content stays useful for an MCP user without advertising any authenticated selection: a plain service description, relative MCP endpoint and a link to the separately authenticated account portal. No user identity/addresses, credentials, provider scopes, connection counts or environment secrets are rendered.
3. Protect no-cache and HTML response types; unsupported methods refuse; HEAD performs no write or data read. Existing owner OAuth/native/RTC and user portal contracts remain unchanged.
4. Add an actual handler regression test for anonymous GET/HEAD/POST and an explicit source-level import/owner-inventory guard; full exact-head CI and reviews before merge. Deployed anonymous reachability/privacy remains a separate source-pinned post-release check.

**Delivery scope:** Public-homepage-only security repair and regression tests; no public pilot activation, production change, credentials, Google mutation or bundle-credit claim. GitHub-only remote session uses required exact-head Actions for tests not executable in its unprovisioned local runner.


## October 18 — independently observed production cold-start DDL race (incident maintenance)

**Evidence before implementation:** Vercel's 7-day production error clusters showed two `NeonDbError` `23505` failures, specifically catalog constraint `pg_type_typname_nsp_index`, during `initSchema` / `initPrincipalSchema` on Oct 15 and Oct 17. The failed DDL attempted concurrently to establish `google_token_storage` or `principals`, despite `CREATE TABLE IF NOT EXISTS`. Serverless requests can enter the additive schema initializer simultaneously in different Vercel instances. This is a current reliability defect, not reopened P10 feature engineering and not a new roadmap subsection.

**Frozen repair acceptance (before source changes):**

1. A concurrent startup's narrow, recognizable PostgreSQL catalog-DDL collision must not produce an avoidable HTTP failure: retry the **entire additive initializer** a strictly bounded number of times after the other initializer can finish. Cover the observed `23505` system-catalog index only and relevant duplicate DDL races; never broadly retry provider actions, user writes, arbitrary `23505` or authentication failures.
2. Multiple callers in a single Vercel process must share one in-progress initializer. A failure must clear that shared state so later requests retry; successful return never depends on a stale promise across subsequent isolated test/schema runs.
3. Existing tables, original owner OAuth/RTC bearers, encrypted Google grants, pilot sessions, scope isolation, and migrations remain unchanged. Do not suppress an actual broken DDL, duplicate user data, or an unauthorized schema mutation. Read-only regression tests prove transient collision recovery, concurrent single-flight, bounded exhaustion, and unrelated SQL failures surfacing.
4. Run source syntax, focused tests and all required exact-head CI (including disposable real PostgreSQL), review, and normal PR merge before considering checked deployment. Production release follows the existing independent policy; post-release evaluate the runtime error clusters and original owner/native continuity. No production SQL rewrite, external Google action or manual release is authorized by this repair alone.

**Scope:** `src/db.js`, a focused `test/unit` initializer concurrency regression, and the existing card/handoff. This is security/reliability maintenance and earns zero P9/P10 batch subsections or completion bundles; pending original provider acceptance is not upgraded.

## October 18 real production privacy and owner-continuation acceptance

Original queue task P10-ANONYMOUS-HOMEPAGE-PRIVACY now PASSED on independently checked READY `0c2fa5b`. Fresh GET/HEAD/POST passed; protected existing-owner native OAuth and private PKCE/RSA exchange, account/default listing, real Google read, scoped denial, refresh and connection revocation all worked. Both disposable access rows are denied after cleanup and all17 original records/native access remain preserved. Exact sanitized proof is `docs/plan/evidence/2026-10-18-disposable-owner-native.json`. This closes the original privacy correction acceptance, not P10-OWNER-CONTINUITY, the P9 RTC matrix, P10-6, a new subsection or a whole completion bundle. Historical frozen implementation plan remains unchanged.
