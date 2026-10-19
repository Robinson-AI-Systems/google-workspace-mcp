# P9-3 — Workspace RTC 1 provider conformance, not Hub enrollment

Owner decision October 19, 2026: Hub dynamically discovers, consents, connects to, and routes Workspace. Workspace is a standalone conforming *provider*. An actual successful Hub LIVE connection is **not a Workspace completion requirement**. Never make Workspace discover/register with Hub, add bespoke Hub callback/router, or tie end-user use to a Hub federation setting. The owner-approved Hub compatibility reference on main is retained.

Governing source: [RTC 1 CONTRACT](https://github.com/Robinson-AI-Systems/robinsons-toolkit-hub/blob/43eed4658527f32c9fca9666b0d31ecf8894b22d/docs/CONTRACT.md) and [Hub-initiated connection spec](https://github.com/Robinson-AI-Systems/robinsons-toolkit-hub/blob/43eed4658527f32c9fca9666b0d31ecf8894b22d/docs/HUB-CONNECTION-SPEC.md). Hub's OAuth-native enrollment transport is optional for RTC1; already valid pass-based RTC1 does not become nonconformant.

<!-- bundle-plan:start -->
```json
{
  "workKind": "ENGINEERING",
  "baseRevision": "12c0647b1a7ea1b284e14807b3b5ffc4ed680d2f",
  "outcome": "Make provider-only RTC1 compatibility the Workspace completion boundary; prove already deployed RTC1 source and real owner read separately from any Hub live onboarding, and remove misleading Hub acceptance marker.",
  "integrationBoundary": "Workspace public RTC1 manifest and regression tests, docs/HUB-COMPATIBILITY.md, authoritative docs/plan/TASKS.md acceptance row, existing handoff. No Hub repo changes, provider OAuth grants, new Google scopes, credentials, release, or production writes.",
  "newEngineering": "Remove provider manifest's obsolete Hub D4 acceptance marker; assert RTC1 provider identity, bounded contract, safe tool prefix/metadata, guarded direct door and optional discovery; reconcile formerly P9-HUB-LIVE row to provider-side conformance without renaming historical ID.",
  "estimatedProductionLines": 2,
  "relatedWorkDecision": "This is owner-directed conformance/acceptance correction, NOT a new product feature or a completed engineering bundle. Historical D4/TEST acceptance remains recorded. Direct LIVE P9-LIVE-DIRECT remains PASSED independently; Hub-side onboarding remains a Hub issue, not a Workspace blocker.",
  "subsections": [
    {
      "id": "P9-3",
      "acceptance": [
        "Verify RTC1 stable manifest, prefix, counts, version, areas, modes/profiles, direct MCP/HTTPS doors and bounded search/describe/call/result semantics against source and checked deployment.",
        "Verify RTC1 read-only/area denial, exact revocation, oauth.refresh_settings, writes/confirmation/audit and two-instance shared PostgreSQL rate limits using real Workspace conformance runner and authentic direct LIVE read where already owner-approved.",
        "Keep optional Hub-initiated OAuth as a compatible transport and preserve independently usable Workspace without mandatory Hub registration, outreach, caller adapter or deployed Hub federation.",
        "Preserve prior genuine TEST Hub/Workspace proof and separate Hub-owned LIVE onboarding as historic/delegated evidence; update only the Workspace acceptance boundary with source pins."
      ],
      "remainingEngineering": [
        "Audit latest reviewed Hub spec against Workspace source, current merged-head conformance CI and current deployed LIVE read evidence.",
        "Remove misleading Hub D-4-specific manifest conformance status; write bounded provider conformance regression assertions and repeat mandatory exact-head CI.",
        "Update authoritative P9-HUB-LIVE acceptance row, owner continuity and public docs without falsely claiming a LIVE Hub relay; update permanent issue #205 handoff."
      ]
    }
  ]
}
```
<!-- bundle-plan:end -->

## Frozen checks before changes

1. Workspace already in service: checked Vercel READY `live=912e4fb330608de1fa45639eb656f3faea9fd733`; the independent, owner-authorized P9-LIVE-DIRECT evidence shows real Google `mode:live`, read, area/write/broker/batch denials, exact revocation and original owner continuity. No repeat provider grant should be issued just to retest.
2. Existing Workspace RTC CI must demonstrate all applicable actual local service checks, not merely the upstream reference fake; see `scripts/rtc-conformance-ci.mjs` and `scripts/rtc-workspace-conformance.mjs`, with two real PostgreSQL-sharing processes and fake Google. This does not represent a new deployed Google or Hub LIVE proof.
3. An actual Hub running, federation enabled, upstream registered, Hub OAuth consent, Hub Sandbox or Hub routing are the Hub's own acceptance. A Hub showing `upstreamEnabled:false` is **not a Workspace product failure**.
4. `P10-OWNER-CONTINUITY` still independently requires original Workspace bearer/refresh/native access proof; remove Hub-specific connection test wording only, do not infer original owner bearer pass from ordinary native `whoami`.
5. No independent owner approval for an unscheduled release is present. The already approved second pilot tester's fresh-grant flag is to be applied only after a checked deployed source/config process, and Stage 2 remains OFF.

## Execution method

Connected GitHub API only in this environment, no local repo/shell. Commit this plan before code, push feature branch, use mandatory exact-head Actions `check,unit,db,rtc,test,release-policy`; inspect all failures and reviews. Do not claim complete P9 provider criterion before valid evidence is reviewed; avoid unnecessary release while other completion work is available. No complete new roadmap subsection/bundle claimed solely from this correction.
