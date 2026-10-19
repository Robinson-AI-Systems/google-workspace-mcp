# P10-6 — historical tester independently consented Google grant (existing identity, no transfer)

This is a guarded implementation contribution to the **existing** P10-6 two-user MCP acceptance, not a new roadmap phase, a claim of real-provider acceptance, or approval to turn on Stage 2. Owner decision: keep the two verified pilot identities plus the distinct original owner connection. Do not request another Workspace account.

<!-- bundle-plan:start -->
```json
{
  "workKind": "ENGINEERING",
  "baseRevision": "53549470c24aa4b8a9ddb60b07c689415d142ca7",
  "outcome": "Prepare an explicitly authorized fresh Google OAuth consent path for the existing legacy-overlapping second pilot identity, with independently encrypted V2 grant and zero change to original owner grants or bearers.",
  "integrationBoundary": "P10 principal store / additive PostgreSQL schema, Google PKCE link start and verified callback, signed-in account portal, OAuth owner reservation, production-off feature flag. No Hub or other-project code.",
  "newEngineering": "Add opt-in fail-closed one-subject legacy reconsent gate; allow only Google-verified same issuer/sub/email, independently consented per-user V2 grant; persist separate consent status while preserving the immutable historical pilot marker; keep existing owner account ciphertext, default and all native/RTC connections intact; deny wrong principal, email, subject, replay and unauthorized consent.",
  "estimatedProductionLines": 180,
  "relatedWorkDecision": "One original P10-6 unresolved product blocker. This is an engineering correction within that subsection, not a complete subsection/bundle or an authorization to change production flags, migrate credentials, release out-of-cycle, perform any Google write or mark provider acceptance passed. Real Google consent and tool-client A/B acceptance remain separate.",
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
        "Implement additive independent-consent status, strict same-subject grant store and browser opt-in behind disabled Production setting.",
        "Prove original owner account/token/refresh byte preservation, same Google email can be independently authorized only after verified new consent, and cross-principal/CSRF/forged-identity refusal with real PostgreSQL and route tests.",
        "Run focused and full required exact-head CI, code/review and merge on main; keep actual two-client/provider acceptance pending."
      ]
    }
  ]
}
```
<!-- bundle-plan:end -->

## Before implementation — frozen security acceptance

1. Flag `PUBLIC_PILOT_LEGACY_FRESH_GRANT_ENABLED` defaults OFF; only exact existing single `PUBLIC_PILOT_LEGACY_SUBJECTS` member in the two-person roster may start a fresh consent in `pilot` with Stage 2 tool execution OFF. The separate owner decision and Vercel Production change/release remain pending.
2. For the historical pilot user, first consent must return Google-SDK verified issuer/sub/email exactly matching the already verified distinct user identity and historical owner-connected mailbox. Never accept browser-supplied account/email hints or borrow existing owner `google_accounts.tokens_enc`, owner refresh/bearers/default or Hub passes.
3. New scopes/tokens are stored *only* as a new encrypted, owned V2 `principal_google_accounts` grant, with a persistent audited independent-consent marker. The previous `legacy_pilot_identity_only` historical marker remains unchanged. Subsequent normal consent, user-account operations and new scoped MCP authorization use only that V2 account. Unapproved legacy test identity and all other reserved owner accounts stay denied.
4. Before consent, both browsers remain isolated; denied link/CSRF/foreign subject/email and owner-bearer readback still work. After independently authorized consent, owner records unchanged, principal-bound account and refresh/revoke boundaries preserved. This source implementation alone cannot upgrade `P10-MCP-PILOT` or any full live acceptance to PASSED.

## Execution limits

No local checkout or outbound GitHub network is available in this session's shell. Plan is committed through the connected GitHub API before production edits. The standard local `npm run session:bundle` / `session:prepare` commands cannot be run against a local repo; required tests will instead be verified with repository exact-head GitHub Actions. Delivery/accounting must be described honestly and no bundle credited absent the original live acceptance.
