# P10-6/P10-3 — owner-authorized real-live HTTPS v1 acceptance harness

This is a **substantive real-production acceptance contribution** to the original existing P10-6 public-disclosure and P10-3 direct OAuth/client compatibility criteria. It is *not* a new roadmap milestone or a substitute for real two-user OAuth, owner migration, legal review, original bearer/refresh or paid provider authorization. The private 2nd subject/client and original 17 access records are not modified.

<!-- bundle-plan:start -->
```json
{
  "workKind": "COMPLETION",
  "baseRevision": "d67c5d6ba545f7cfd3b31ca6eef239e025dfb2ef",
  "outcome": "Make bounded source-pinned actual production HTTPS disclosure, portal privacy, OAuth S256/RFC7009 discovery, canonical alias and RTC manifest acceptance continuously executable from trusted CI runner, preserving genuine v1 blockers.",
  "integrationBoundary": "Only unauthenticated GET/HEAD on public routes of the already owned production host and canonical OAuth alias, read-only GitHub ref lookup and safe fail-closed assertions. Never call Google, send tokens, enter user sessions, trigger a provider mutation or modify live environment. No direct MCP token generation or testing of private principals.",
  "newEngineering": "Implement standalone public-HTTPS smoke runner with strict origin allowlist, bounded payloads/timeouts, source SHA and RTC1 consistency checks, safe redirects, S256/RFC7009 endpoint assertions and explicit proof limitations. Add deterministic local mock tests; wire a separate non-gating GitHub workflow triggered on this PR and subsequently on live pushes.",
  "estimatedProductionLines": 0,
  "relatedWorkDecision": "Original pending six v1 acceptance tasks retain their statuses. This work can truthfully produce novel deployed HTTPS evidence for portions of P10-6 and P10-3, but any full subsection completion or bundle credit awaits all original real browser/agent/owner criteria. Protect standard CI and scheduled release; avoid external Google operations.",
  "acceptanceTasks": ["P10-6-PUBLIC-DISCLOSURE", "P10-MCP-PILOT"],
  "subsections": [
    {
      "id": "P10-6",
      "acceptance": [
        "Run off -> pilot -> public; first deploy with public off and unchanged owner login and prove original owner/native/Hub continuity around each relevant release.",
        "Use two separately owner-authorized disposable verified Google identities (ordinary Gmail and Workspace admin when available), with own exact resources and cleanup; prove actual client login, authorized reads, one separately approved reversible write, revocation, wrong-account refusal and owner continuity.",
        "Prepare public application identity, verified domains, privacy/support/delete-account information, incremental scope inventory, Google-sensitive/restricted verification requirements and actual exception or assessed paid-review applicability without spending or submitting binding agreements.",
        "Record source/deployment/client/identity/mode/scopes/provider/revocation/cleanup receipt and actual provider/permission limits; preserve all original 29 accepted tasks and do not treat source fixtures as external acceptance."
      ],
      "remainingEngineering": [],
      "remainingWork": [
        "Verify public pages and OAuth discovery on a genuine independently READY source using distinct production HTTPS public routes.",
        "Record bounded absence of unauthenticated owner mailbox information and protected portal refusal.",
        "Independently obtain owner final policy/support retention approval and genuine second subject and native client evidence; do not call whole P10-6 passed."
      ]
    },
    {
      "id": "P10-3",
      "acceptance": [
        "Preserve existing owner native MCP OAuth credentials/refresh while introducing additional independent principal OAuth clients with source-and-DB-isolated access.",
        "Verify genuine separately authenticated client A and B with proper resource binding, PKCE, signed owner/user consent, wrong-client/refusal, refresh/replay/revoke, and harmless provider readback."
      ],
      "remainingEngineering": [],
      "remainingWork": [
        "Check real deployed OAuth metadata S256, registered endpoints and no plaintext challenge advertisement without tokens or registration.",
        "Obtain genuine second principal and client-provider lifecycle proof separately; synthetic discovery is not 2-client acceptance."
      ]
    }
  ]
}
```
<!-- bundle-plan:end -->

## Exact acceptance for this PR

- [ ] Run mocked local tests for positive source-bound pages, S256/revocation and private denied portal, plus hostile redirect/canonical mismatch, wrong source, overflow, timeout and missing metadata.
- [ ] Run only public unauthenticated HTTPS GET and HEAD through GitHub Actions, compare exact current deployed RTC source against independent `live` SHA, compare both aliases, check account GET refusal and disclosures. Suppress PII/bodies/tokens in logs.
- [ ] Record outcome as new **bounded** real-live evidence; do not flip any original pending task to PASSED without all its criteria.
- [ ] Execute exact-head unit/real-DB/RTC/check/release CI, reviewer handling, merge when allowed. No second off-cycle release merely to run the probe.
- [ ] Keep existing authenticated Google read/17 owner token counts and one active public client observations separate from anonymous probe evidence.

## As-observed baseline

At `d67c5d6ba545f7cfd3b31ca6eef239e025dfb2ef`, main/live/Vercel READY match. Last real production read-only SQL: 17 unrevoked, unexpired legacy OAuth access rows, 17 unrevoked refresh-capable rows, two original owner accounts, two linked Google identity subjects, only ONE active public Google grant and ONE public MCP connection. Original owner `workspace_whoami` succeeds via connected service and one original OAuth row had a new use timestamp; no original refresh/replay or distinct client B asserted. Do not publish subject IDs, opaque tokens or private Google object data.
