# P10-6: Comprehensive direct-user consent and trustworthy provider readiness

Owner authorization 2026-10-19: stop serial one-API/one-scope setup, support a single deliberately user-initiated full-capability Google consent request across applicable **user-OAuth** APIs with fallback individually approved module grants. Never borrow owner credentials, bypass Google approval or imply customer-admin domain-wide delegation is an ordinary OAuth scope. Preserve existing Full MCP agent and its authorized Google grant until a successful independent consent.

<!-- bundle-plan:start -->
```json
{
  "workKind": "ENGINEERING",
  "baseRevision": "e17600775d001080f80b55948a7411319ab7c46f",
  "outcome": "Let a verified direct-user principal request all applicable Google OAuth tool permissions in one disclosed interactive consent instead of serial grant popups, with accurate diagnostics for API-disabled vs missing permission and bounded provider outputs.",
  "integrationBoundary": "Isolated P10 public account portal, Google OAuth scope groups/one-use protected start and callback, read-only provider readiness reporting; no owner-token migration, customer DWD, silent provider authorization, payment, enabled enrollment or scheduled release.",
  "newEngineering": "Expose explicitly reviewed full direct-user consent and relevant individual modules across the existing protected POST/CSRF/nonce/PKCE link route; preserve incremental grant/session invariants; clarify missing scope vs disabled API; make blank Doc text unambiguous and add owner-only reversible Drive trash controls where feasible. Write route/tool/regression and real-database evidence.",
  "estimatedProductionLines": 440,
  "relatedWorkDecision": "One source-consent bundle for current P10-6 readiness and P10-2 verified-Google user linkage. Existing full P10-6 and P10-MCP-PILOT external two-user criteria remain PENDING until actual client/provider acceptance, not counted complete from this source PR. Google administrative customer DWD, entitlement and monetized scopes cannot be assigned by developer consent.",
  "subsections": [
    {
      "id": "P10-2",
      "acceptance": ["Google-verified pilot principals link only their own independently consented exact Google account and requested scopes, with original owner grant continuity and provider denial preserved."],
      "remainingEngineering": ["Comprehensive explicit user OAuth scope option plus selective per-domain choices through the existing principal-bound, one-use CSRF/PKCE flow; no new owner fallback."],
      "remainingWork": ["Live Google full-scope consent and advanced real provider reads remain dependent on actual owner Google approval."]
    },
    {
      "id": "P10-6",
      "acceptance": ["Use two separately owner-authorized disposable verified Google identities (ordinary Gmail and Workspace admin when available), with own exact resources and cleanup; prove actual client login, authorized reads, one separately approved reversible write, revocation, wrong-account refusal and owner continuity.", "Record source/deployment/client/identity/mode/scopes/provider/revocation/cleanup receipt and actual provider/permission limits."],
      "remainingEngineering": ["Account portal accurately exposes all supported ordinary OAuth capabilities before public rollout, with tested error/scope diagnostics and safe bounded tooling."],
      "remainingWork": ["Second actual client/principal, wrong-subject and revoke/refresh, owner old-bearer continuity, customer admin optional delegation and Google verification/approval remain pending."]
    }
  ]
}
```
<!-- bundle-plan:end -->

## Verification and delivery checkpoints

- Consent request must be initiated by authenticated first-party account session, POST and CSRF, one-use state/nonce and exact requested group; authorize Google to grant or deny every scope. Never auto-click consent.
- Full user OAuth option covers all implemented user-OAuth tool families and advanced read scopes; dangerous customer DWD/Alert Center stays separately authorized, without developer-imposed permanent product ceiling.
- Unsupported/denied scopes do not imply enabled API or server failure. Prior linked refresh grant and old owner sessions remain untouched on failed consent.
- Unit route and contract tests cover full group, invalid selection, cross-browser and replay, scoped portal, and API-versus-scope error distinction; preserve source-line acceptance status until real provider re-test.
- Obtain actual full CI/test/review and merge only on verified exact-head checks. No off-cycle production release without checked approval.
