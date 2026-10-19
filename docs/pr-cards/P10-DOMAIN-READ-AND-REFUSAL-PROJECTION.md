# P10 direct-user: domain-safe admin discovery and refusal-preserving field projection

Owner's 2026-10-19 external Claude pilot found real Google advanced reads working after comprehensive OAuth: Tasks (one scratch task create/read/delete), Chat, own Admin Directory, own Reports, Cloud Identity security, Chrome Policy, Site Verification and Postmaster; Gmail, Calendar, Drive, Docs/Sheets/Slides/Forms and Contacts passed earlier. This is **partial acceptance**, not all P10-6. Live independent client remains Full and reuses the current grant.

Owner approved completing remaining test and setup work, including scoped customer-wide metadata reads and administrator-related disposable fixtures. Approval is NOT permission for unbounded unrelated-provider data or arbitrary destructive administrative mutations, purchases, production configuration edits or weakening individual end-user isolation. A user-agent explicitly requested crossDomain:true is the existing user-owned opt-in path; do not make it a silent default.

<!-- bundle-plan:start -->
```json
{
  "workKind":"ENGINEERING",
  "baseRevision":"41cfae5c8481bf66b618efe384e02d35ec2d8a4a",
  "outcome":"Make cross-domain reads explicit instead of accidental, and ensure field filtering cannot disguise a refusal as an empty successful result.",
  "integrationBoundary":"Existing P9 user authority, P10 live direct multi-principal acceptance, typed RTC tool output, domain guard; no new Google provider credentials, no Hub dependency, no GCP Service Usage admin action, no default widening.",
  "newEngineering":"Default Admin Directory user/group lists to the principal's allowed domain; require explicit crossDomain=true for unfilterable whole-customer Admin info; preserve refusal/error semantics through optional RTC fields projection; classify invalid synthetic Google readiness IDs precisely.",
  "estimatedProductionLines":130,
  "relatedWorkDecision":"Security repair addressing two real owner-reported direct pilot failures across the same domain-guard/RTC dispatch; source engineering plus actual provider acceptance remains one coherent partial P9/P10 bundle, not an artificial completion of entire P10-6.",
  "subsections":[
    {"id":"P9-2",
     "acceptance":["Do not impose development-agent restrictions on end-user operations; preserve proper cross-tenant and user-selected domain authorization, confirmation, and provider checks."],
     "remainingEngineering":["In-source guard and typed result handling must be corrected and tested end to end."],
     "remainingWork":["Live user-selected customer-wide Google metadata checks require a deployed reviewed build and actual client approval."]},
    {"id":"P10-6",
     "acceptance":["Prove independently connected verified Google users, native MCP client/provider real reads/writes, per-account denial, refresh and revocation, original owner continuity and truthful cleanup and publication readiness."],
     "remainingEngineering":["Fix observed cross-domain listing leakage and loss of refusal on field filtering without permanently capping authorized user choices."],
     "remainingWork":["True second principal/client negative tests; Google Licensing API enablement; Alert Center customer DWD; no-resource Groups Settings and Vault edition limitations; live checked release and retest."]}
  ]
}
```
<!-- bundle-plan:end -->

## Checks
- [ ] Plainly scoped Admin groups/users listings default to an allowed domain, Google never receives a crossDomain field. Explicit crossDomain=true can list the owning customer's broader Workspace when entitled, never automatically.
- [ ] Whole-customer Admin customer info requires explicit crossDomain=true for domain-limited connections; unrestricted legacy owner requests work unchanged.
- [ ] Refusals and access errors remain visible with fields projection; an unknown field must return an explicit invalid request rather than empty fake success.
- [ ] Real impersonation/foreign-domain denials, no Google invocation for refused requests, authorized own-domain and opt-in cross-domain reads validated in unit tests.
- [ ] Reports and Cloud Identity existing correct opt-in behavior unchanged; no customer or other domain provider mutation during engineering.
- [ ] Reconcile and document genuine owner Claude reads and Scratch Tasks cleanup separately from still-pending P10 full acceptance.
- [ ] CI all required exact-head, check review, merge only when permitted; no off-cycle release just to ship this patch.
