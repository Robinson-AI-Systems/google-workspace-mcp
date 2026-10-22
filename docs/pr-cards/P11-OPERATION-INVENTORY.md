# P11-1 — initial reproducible operation inventory (IN PROGRESS)

Owner-requested continuation after accepted invite-only v1. This card keeps the original P11-1 scope; a limited initial seed is not a new completed subsection or product bundle. No runtime OAuth, grants, Google provider operation, paid account, or live deployment changes.

<!-- bundle-plan:start -->
```json
{
  "workKind": "ENGINEERING",
  "baseRevision": "706494bda986af080e54d34aa51e799167126647",
  "outcome": "Create a reproducible, fail-closed local verifier and machine-readable initial Workspace operation inventory using the real tool registry, with honest unknown and live-unverified dispositions.",
  "integrationBoundary": "Offline inventory validation and report only; no provider call, credential handling, endpoint dispatch, policy mutation or production release. Reuse the guarded src/tools/index.js registry.",
  "newEngineering": "Add a checked inventory schema/validator, method-versus-tool reconciliation and explicit family gap diagnostics, initial published method snapshots and negative regression tests.",
  "estimatedProductionLines": 180,
  "relatedWorkDecision": "P11-1 remains OPEN after this first foundation. Continue official discovery coverage for remaining APIs and exact test/source/live evidence before P11-1 acceptance; do not claim a bundle from this scaffold.",
  "subsections": [
    {
      "id": "P11-1",
      "acceptance": [
        "Reproducible current-interface enumeration; duplicate/orphan/missing-row validation; every operation disposition and credential uncertainty visible; generated family gap report; source and live evidence separately pinned; no invented percentage."
      ],
      "remainingEngineering": [
        "Implement and validate an offline machine-readable inventory with all required per-operation fields and tested missing/duplicate/unregistered mappings.",
        "Enumerate EVERY current in-scope Google Workspace API family, resource, version, public method and workflow against dated official REST/discovery references; include uploads, downloads, export, long-running, pagination and batch variants.",
        "Reconcile every method to actual source guard, handler and tests; record unknown, missing and official retired/UI-only dispositions without assuming user permissions.",
        "Pin exact live READY revision/provider evidence separately, and continue generated family-gap and drift checks against fresh official discovery schemas."
      ]
    }
  ]
}
```
<!-- bundle-plan:end -->

## In-scope first foundation

Inventory the existing Tasks v1 and Workspace Enterprise License Manager v1 method tables first because the current coverage standard already contains their official method lists and tool mapping. Tool existence proves only registry mapping, not correct dispatch, auth, source-test pass or Google provider/live parity. All other Google API families remain explicitly unenumerated, so denominator/coverage percentage is forbidden. Verification must fail on duplicate/missing declared method rows or orphan tool references in these seed families. Follow docs/plan/designs/MAXIMUM-AUTHORITY.md and docs/PROVIDER-API-COVERAGE.md for the full unfinished requirement.
