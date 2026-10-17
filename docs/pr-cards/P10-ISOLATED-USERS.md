# P10 C — isolated normal-use Workspace clients and customer delegation

This execution card implements the already approved P10-4/P10-5 criteria from [the original design](../plan/designs/USER-AUTHORITY-AND-PARALLEL-SIGNIN.md), without adding another roadmap. The owner and already issued Hub TEST grants remain supported. Public execution stays disabled unless every original pre-pilot gate is satisfied.

<!-- bundle-plan:start -->
```json
{
  "workKind": "ENGINEERING",
  "baseRevision": "eece407e5f8e2a2094793355e9a5ca086567e5c1",
  "outcome": "P10 C: make every publicly issued MCP tool, account, result, guard, delegated-client and persistence path belong to the authenticated user and owned Google account without losing existing owner features.",
  "integrationBoundary": "Native MCP and RTC registry, search/describe/call/batch/bulk/undo; principal-bound database access, account, result, change and fixture records; Google OAuth client and independently configured tenant delegation; exact original owner adapter.",
  "newEngineering": "Inject immutable V2 principal/account AuthContext through all callers and persistence, remove owner/global fallbacks from public request paths, add tenant-only provider delegation and encrypted credential lifecycle, and exercise real two-process Postgres and API isolation fixtures.",
  "estimatedProductionLines": 1900,
  "relatedWorkDecision": "Original design Outcome C groups P10-4 and P10-5 as a single integration/risk boundary. P10-6/7 pilot/publication/migration depend on this proof. Do not activate PUBLIC_SIGNIN_MODE, change live credentials, release, mutate Google or modify Hub.",
  "subsections": [
    {
      "id": "P10-4",
      "acceptance": [
        "Before enabling pilot execution, finish all section2 imports and storage-bearing tools across native MCP, RTC, search/describe/meta, workspace_call, batch, bulk, undo, results, account/default/connection management, business resources, changes, dev fixtures and every guarded callback.",
        "Use explicit scoped clients/dependency injection; new users can never load installation-owner service account, global default account or business-resource state; machine-readable caller matrix proves coverage.",
        "Prove owner/userA/userB overlapping IDs and warmed parallel requests keep all state isolated; denied foreign IDs create zero provider clients/writes; cache, rate and undo use principal/account/credential-version keys.",
        "Run real disposable Postgres tests for cross-principal SQL denial, refresh races, result ownership/pagination, accounts, connections, change/undo visibility, fixture run ownership and rate counters across two processes; owner request matrix stays green."
      ],
      "remainingEngineering": [
        "Complete V2-scoped persistence and native/RTC dispatch contracts for all storage-bearing callers and guard callbacks.",
        "Inject V2 authenticated client and principal ownership for every registry tool, with no legacy/global fallback.",
        "Prove full matrix with adversarial two-process DB tests and original owner regressions."
      ]
    },
    {
      "id": "P10-5",
      "acceptance": [
        "Public users get only their own Google OAuth rights; privileged/admin operations require that customer's real permissions and configured delegated credential, never the installation owner's global credential.",
        "Provide independently tenant-configured delegated client, explicit scope/subject/customer binding, encrypted credential entry/lifecycle/revoke, independently verified admin/customer authority and truthful capability remediation without disabling unrelated user tools.",
        "Update delegated Gmail/Calendar/Drive, Alert Center and readiness callers; owner legacy delegation still works, no email/hd domain claim grants customer ownership.",
        "Test owner delegation continuity and A/B cross-customer denial, absent/revoked/wrong subject/scope/customer and no global-secret fallback before provider use, with exact SDK shapes; real customer activation stays separately gated."
      ],
      "remainingEngineering": [
        "Implement tenant credential registration/update/revocation and authenticated protected customer verification.",
        "Inject tenant-local delegated clients throughout eligible tools, excluding owner global configuration from public requests.",
        "Test denial before construction, SDK calls, owner compatibility and real Postgres isolation."
      ]
    }
  ]
}
```
<!-- bundle-plan:end -->

## Delivery

PENDING. Count neither P10-4 nor P10-5 as completed before full source, fixture, two-process PostgreSQL, review and exact-head CI evidence, and maintain the existing P9/P10 acceptance backlog separately.
