# P10-6: Pilot completion consent versus future customer onboarding

## Owner clarification (2026-10-19)

**Do not conflate development acceptance preparation with permanent customer onboarding.** This project's two independently approved Google pilot testers must be able to explicitly request all supported direct-user provider scopes **together in advance**, with all applicable Google Cloud APIs enabled, so the agent can run the full planned live acceptance without repeated accidental authorization interruption. Preserve one existing authentic Full Claude MCP client while separately consenting Google; rerun only unproven acceptance, not already passed disposable provider reads/writes.

Future public sign-in should be **low-friction**: identify the supported Google service requested by the user and get that user's explicit Google permission for the service as needed. Do not present a giant sensitive/admin consent request as the normal customer default; an advanced voluntary comprehensive option may remain under a disclosure without imposing a hard developer limit on end-user authority. Do not auto-approve scopes or extend a user's agent profile, bypass Google verification, obtain a customer Admin role/DWD or turn on billable actions merely from client Full profile.

<!-- bundle-plan:start -->
```json
{
  "workKind": "ENGINEERING",
  "baseRevision": "aa70eb92d993c7275f0794417b05441db565321d",
  "outcome": "Make full-scope pilot preflight intentionally separate from low-friction, service-by-service public onboarding; finish demonstrated result-shaping defects before requesting another owner live acceptance round.",
  "integrationBoundary": "P10-2 protected first-party account portal and P10-6 direct pilot acceptance; provider-owned user OAuth grants unchanged. Existing owner, delegated customer and agent profiles remain isolated. No unscheduled live release or Google credential mutation.",
  "newEngineering": "Pilot-specific explicit complete-consent page and public self-service on-demand scope selection; accurate owner guide and acceptance status; reduced Slides create receipt and bounded Drive list; typed Search Console invalid-input response; complete regression tests.",
  "estimatedProductionLines": 240,
  "relatedWorkDecision": "One completion-flow corrective bundle related to P10-2 and P10-6. This is incremental reviewed engineering correcting owner intent, not a new production feature cap; no full roadmap item is called PASSED until its entire real-world acceptance.",
  "subsections": [
    {"id":"P10-2",
     "acceptance":["Verified Google sign-in and self-service provider consent are principal-owned and never borrow the original-owner OAuth grant; legitimate end users can choose the needed Google permissions and retain independent agent authority."],
     "remainingEngineering":["Present one comprehensive *pilot acceptance* permission preflight without forcing it as the default for future ordinary public users; preserve explicit individual-service and advanced user choice."],
     "remainingWork":["Actual new broad Google consent still requires user's real Google permission and Google provider review, not source alone."]},
    {"id":"P10-6",
     "acceptance":["Prove two distinct real independent Google principals and genuine native MCP client/provider reads/writes, cleanup, revocation/replay/refresh, wrong-account denial and original owner continuity; retain sanitized LIVE evidence and truthful product readiness."],
     "remainingEngineering":["Avoid already-observed oversized Slides create and Drive list transport outputs and return schema-consistent Search Console invalid-input guidance."],
     "remainingWork":["Second pilot principal/client, actual broad consent, remaining Google advanced reads and owner bearer/refresh, revocation/negative acceptance stay pending."]}
  ]
}
```
<!-- bundle-plan:end -->

## Criteria/checks

- [ ] Authenticated two-user **pilot** account page presents one complete Google consent request as the primary **test preflight**; provider still verifies explicit user approval and matched link scopes.
- [ ] **Public** account page presents a simple one-service Google authorization selector as the default; optional comprehensive scope choice is visibly advanced, not mandatory or unavailable. No silent scope expansion or automatic consent.
- [ ] Both use the same CSRF-protected POST link endpoint, verified identity, browser-bound one-use PKCE and fail-closed callback; preserve owner and existing active Full MCP grants.
- [ ] Slides create receipts keep exact returned identifier/title and guarded readback while avoiding provider's full large presentation payload. Drive listings avoid eager bulk photo/webViewLink fields; clients can get individual metadata when needed.
- [ ] Search Console invalid-domain/missing Google scope returns a valid, explicitly UNKNOWN (never false positive) structured outcome.
- [ ] Unit and source contract tests cover pilot/public UX, ordinary full choice, errors, output size and successful guarded write/no-op. Required CI, review, docs, source ancestry and owner release policy before any production promotion.
