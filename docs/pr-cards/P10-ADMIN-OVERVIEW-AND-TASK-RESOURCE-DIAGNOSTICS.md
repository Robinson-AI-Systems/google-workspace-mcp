# Pilot provider findings: composed owner overview and exact Tasks probes

Observed via the owner's authenticated, existing Claude Full native client on Vercel READY `ab26461a0fe3179b9b085937e437d977b7d0134b`: own-domain Admin lists and optional fields refusals PASSED; explicit `crossDomain:true` customer-info and Reports individually PASSED. A composed overview still reported "Refused" on organization despite explicit intent. Its policy section reported a generic area/profile exclusion because the installation-owner reference baseline is intentionally unavailable for the independent user (not a missing Full grant). Invalid Task list ID returned `google_probe_failed` from the exact-resource probe, rather than the separate existing basic readiness classifier. Zero groups on the allowed domain is NOT proof of a defect, and Licensing disabled/Vault not installed/Alert Center tenant DWD are provider prerequisites, not code fixes.

<!-- bundle-plan:start -->
```json
{
  "workKind": "ENGINEERING",
  "baseRevision": "ab26461a0fe3179b9b085937e437d977b7d0134b",
  "outcome": "Repair real Claude Full native MCP acceptance regression: explicit customer-wide overview authorization reaches the appropriate guarded Directory child, malformed Task list identifiers classify as invalid resources, and customer-bound policy audit limits are truthful.",
  "integrationBoundary": "P8-7 real Google app diagnostics, P8-8 composed owner overview, P10-6 independent principal/RTC domain separation; customer OAuth grants and original owner state remain untouched.",
  "newEngineering": "Forward ephemeral crossDomain consent to approved customer-wide overview child callers without persistent widening; distinguish installation-owner policy baseline unavailability from ordinary profile limits; report provider invalid task list ID as invalid_provider_resource with no raw sensitive error text.",
  "estimatedProductionLines": 75,
  "relatedWorkDecision": "Three linked original completion criteria touched by one real end-user provider acceptance session. Focused security correctness outcome; no claims of full P10-6 acceptance, unrelated changes or arbitrary line padding.",
  "subsections": [
    {
      "id": "P8-7",
      "acceptance": [
        "workspace_dev_check_integration(spec) reports what is ready and what is missing with exact console steps, without changing anything; tests distinguish provider missing/invalid resource from inability to read."
      ],
      "remainingEngineering": [
        "Real invalid Task list identifier response currently returns generic google_probe_failed in exact-resource probe."
      ],
      "remainingWork": [
        "Live retest against reviewed, deployed revision."
      ]
    },
    {
      "id": "P8-8",
      "acceptance": [
        "workspace_admin_overview reads account's owner state via guarded child tools; customer-wide reads require explicitly owner-chosen authorization, with truthful status not_readable when unavailable."
      ],
      "remainingEngineering": [
        "Overview forwards crossDomain to policies only, not owner-chosen organization section. Installation-owner policy baseline must not be exposed to separate users."
      ],
      "remainingWork": [
        "Native owner-approved overview customer section retest on live source."
      ]
    },
    {
      "id": "P10-6",
      "acceptance": [
        "Preserve standalone native MCP user isolation and actual customer ownership while testing real multi-client Google reads, negative permissions and authorized cross-domain exception."
      ],
      "remainingEngineering": [
        "Regression review across the composed calling boundary, preserving Full/Google scope distinction."
      ],
      "remainingWork": [
        "Second separate pilot client consent/denials/refresh/revoke and original owner continuation remain pending."
      ]
    }
  ]
}
```
<!-- bundle-plan:end -->

## Acceptance checks
- [ ] Explicit approved `crossDomain:true` is forwarded **only for customer-wide child tools** of owner overview and is not persisted, passed to Google or reused by own-domain child tools.
- [ ] Without `crossDomain`, restricted customer-wide metadata receives no Google call; own-domain sections retain their existing protections.
- [ ] Independent pilot principals cannot read the installation owner's policy baseline. Overview explains that limitation, without describing it as an unrelated connection profile failure or green policy result. Original owner baseline continues to work.
- [ ] Invalid Google Tasks list ID produces `missing/invalid_provider_resource` for actual gaxios 400 response variants, never raw Google data; 404, 403 and 5xx continue distinct.
- [ ] Existing Google provider tests, permissions and original owner credentials unchanged. Source tests and full Actions checks required; real live provider acceptance separately deferred until checked release.
