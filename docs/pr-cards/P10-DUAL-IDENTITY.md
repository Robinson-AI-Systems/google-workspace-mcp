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