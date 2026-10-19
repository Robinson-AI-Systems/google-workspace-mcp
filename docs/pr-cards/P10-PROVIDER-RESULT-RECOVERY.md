# P10 direct MCP provider result usability: structured fallbacks and bounded Google output

Owner's 2026-10-19 external Claude real-client result exposed malformed Site Verification fallback and unnecessarily huge Slides/Drive payloads. These are actual completion gaps in the existing public provider tool catalog, not a new roadmap phase.

<!-- bundle-plan:start -->
```json
{
 "workKind":"ENGINEERING",
 "baseRevision":"aa70eb92d993c7275f0794417b05441db565321d",
 "outcome":"Make Site Verification refusal trustworthy and machine-readable and bound real provider create/list results at the Google SDK request without dropping unique IDs, authorization errors or original provider data needed for the operation.",
 "integrationBoundary":"src/tools/ops.js, src/rtc/structured.js, src/tools/slides.js and src/tools/drive.js, plus focused tests and owner guide; no provider authorization, live production change, release or cross-domain safety override.",
 "newEngineering":"Add precise missing-scope and disabled-API handling for optional Site Verification with typed WARN unknown, preserve unrelated forbidden and rate-limit errors; request field-limited Slides create and Drive list; regression-test receipt IDs, resource recovery and exact output types.",
 "estimatedProductionLines":150,
 "relatedWorkDecision":"Bundle related live P10-6 Google client tool-contract defects. In the already-approved P10-6 source work, no optional tool should silently assert verification failure or flood an LLM. Do not mark the original full pilot or publication criterion PASSED; separate customer DWD and second agent acceptance remain outstanding.",
 "subsections":[{"id":"P10-6","acceptance":["Record source/deployment/client/identity/mode/scopes/provider/revocation/cleanup receipt and actual provider/permission limits.","Use two separately owner-authorized disposable verified Google identities with own exact resources and cleanup and prove actual authorized reads, reversible writes, revocation, wrong-account refusal and owner continuity."],"remainingEngineering":["Make actual optional Site Verification readiness response typed and accurate under known API/scope errors; bound giant Slides/Drive outputs without losing direct-client operation identifiers."],"remainingWork":["Later deployed real Claude retest and second independent client/subject, logout/revoke/refresh, original owner bearer continuity remain PENDING."]}]
}
```
<!-- bundle-plan:end -->

CI/review/release: commit this plan first, source and positive/negative tests, run exact-head checks, merge only green. Do not perform Google writes, consent or off-cycle release. Preserve existing bearer/refesh grants and Full connection.
