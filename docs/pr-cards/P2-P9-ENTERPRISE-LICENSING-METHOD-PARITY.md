# Google Workspace licensing: full provider operation coverage

Google official REST v1 exposes exactly seven `licenseAssignments` methods, not five. Our source currently has 5 named tools, with an undocumented `listForProduct` helper only inside `workspace_plan_summary`. We will expose complete method parity and cursor paging, with no billing mutation or new production entitlement.

The similarly named `licensemanager.googleapis.com` is for Google Cloud Compute Engine third-party software licenses (Cloud IAM / `cloud-platform`, different authority and billing); no Google Workspace principal token is transferred to that API. Record separate provider-scope coverage in `docs/PROVIDER-API-COVERAGE.md` and a tracked roadmap gap; implementing that endpoint must obey repo ownership decisions and secure independent Google Cloud consent.

Reference Google: https://developers.google.com/workspace/admin/licensing/reference/rest and https://docs.cloud.google.com/compute/docs/licensemanager/rest

<!-- bundle-plan:start -->
```json
{
  "workKind": "ENGINEERING",
  "baseRevision": "4eb75cdb9ce14f6fe590c64aeb071af5c723191d",
  "outcome": "Close all seven Google Workspace Enterprise License Manager v1 REST method gaps with safe pagination, human-confirmed paid/billing mutations, and provider-owned authority; record separately scoped Cloud License Manager API coverage ownership.",
  "integrationBoundary": "Only Workspace Enterprise licensing.googleapis.com uses the existing user OAuth and Google Workspace principal. licensemanager.googleapis.com is separate Google Cloud provider auth/IAM/billing, not interchangeable with Google Workspace licenseAssignments; document separately without borrowing tokens or credential scope.",
  "newEngineering": "Expose listForProduct, update, list cursors; retain old result contract without silent truncation; extend paid-action guard and RTC registry; secure unfilterable customer-wide listings and validate real Google API response shape. Add reviewed authoritative coverage inventory for all seven methods and distinct Cloud provider operations.",
  "estimatedProductionLines": 110,
  "relatedWorkDecision": "Finish full seven-operation Enterprise License Manager API method parity in a single existing-provider bundle, not helper PRs or spec-only work. Record the cross-provider Google Cloud License Manager capability as its own independently authorized integration bundle without inflating current Workspace acceptance.",
  "subsections": [
    {
      "id": "P2-6",
      "acceptance": [
        "Licensing returns real Google customer ID, customer plan/SKU assigned user counts with complete pagination, accurate disabled-API feedback and exact provider-backed safe reads."
      ],
      "remainingEngineering": [
        "Enterprise License Manager user-facing coverage misses listForProduct tool, update (PUT) tool, page cursor access on listForProductAndSku."
      ],
      "remainingWork": [
        "Live owner-approved provider read once Google Enterprise API is enabled and granted."
      ]
    },
    {
      "id": "P9-2",
      "acceptance": [
        "Authorized end-user capacity is not silently capped by developer-only restrictions, while paid/consequential operations use transparent confirmation, existing provider scopes and readback/audit."
      ],
      "remainingEngineering": [
        "New PUT license change requires guarded confirmation, dry run and post-Google verified SKU; do not assume any Google OAuth scope is cloud-platform."
      ],
      "remainingWork": [
        "No production paid license mutation is approved; live proof only if separately authorized."
      ]
    },
    {
      "id": "P10-6",
      "acceptance": [
        "Standalone two-principal direct MCP product retains per-user/domain authorization, real provider access and denial. Completion remains separately dependent on real two-client OAuth/refresh/revocation."
      ],
      "remainingEngineering": [
        "Customer-wide license listing must never implicitly include another business domain without explicit request-local customer authority."
      ],
      "remainingWork": [
        "Actual second Google pilot client and original bearer lifecycle still pending."
      ]
    }
  ]
}
```
<!-- bundle-plan:end -->

## Acceptance
- [ ] All seven official Workspace `licenseAssignments` methods have explicit user-reachable MCP tools with exact SDK mapping and verified schema; existing names unchanged.
- [ ] Product and SKU list endpoints expose pagination without silently claiming a truncated first page is complete; existing array clients remain supported unless requesting pagination explicitly.
- [ ] Per-customer product/SKU enumerations cannot read across allowed domains without the user's deliberate `crossDomain:true` for that request; no extra authority or content leaks through forced args.
- [ ] PUT replacement requires same explicit confirm/dryRun/provider before-and-after as PATCH, and is marked as billing-risk in RTC catalog. A fake dryRun never performs a Google mutation.
- [ ] Provider errors remain errors, no fake 0 assigned licenses; tests cover positive, denial, invalid cursor, pagination, billing/mutation safeguards.
- [ ] Distinct Cloud License Manager provider capabilities have a documented separate ownership/implementation boundary and remain open until actual implementation/acceptance.
- [ ] PR exact-head and main CI passing, review and merge only under existing branch/release policy; no off-cycle deploy requested or executed.
