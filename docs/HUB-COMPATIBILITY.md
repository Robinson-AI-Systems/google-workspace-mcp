# Robinson Toolkit Hub compatibility reference

**Owner decision, 2026-10-19 (clarified after Hub specification adoption):** This independent MCP server is a Hub-compatible provider, not a Hub client. The **Hub initiates** discovery, authorization and selected tool calls. The coding agent sees **one Hub MCP connection and a fixed, small set of gateway tools**, even as thousands of provider tools become searchable. The human and coding agent do their own planning. **Never create a server-to-Hub callback, brand-specific Hub adapter, unconditional eager `tools/list` expansion or provider-side automated planning.**

## Governing shared specification

- [Frozen RTC 1 contract](https://github.com/Robinson-AI-Systems/robinsons-toolkit-hub/blob/main/docs/CONTRACT.md) is the cross-repository baseline.
- [Hub connection compatibility specification and per-server checklist](https://github.com/Robinson-AI-Systems/robinsons-toolkit-hub/blob/main/docs/HUB-CONNECTION-SPEC.md) explains optional standards-based OAuth, independently delegated identity, bounded RTC meta-tool search/describe/call, pagination and result/refusal rules.
- Work from the **latest reviewed Hub main specification**; record the exact Hub commit and the selected provider's exact source and deployed commits whenever demonstrating compatibility. Treat a future breaking contract change as a separate versioned design decision, **never** a silent per-server wire-protocol tweak.

## Required integration boundaries

1. **Stay standalone.** Existing direct MCP clients and original provider credentials must continue working without Hub, and an authorized user may exercise the provider's full legitimate capabilities. Development-team spending, TEST and no-production safeguards are not permanent end-user product policy.
2. **Advertise, don't push.** Serve truthful public RTC 1 `/api/contract` metadata, stable tool prefix, areas, modes, profiles and authorization availability. Do not connect outward to Hub.
3. **Lazy, bounded tool access.** Serve the standard RTC meta-tool search/describe/call family under the *provider's own* authorization and risk checks. A Hub query returns a **small bounded search page** and fetches an individual schema only on demand. Preserve actual page/offset/cursor fields and exact denial codes. No eager full catalog into the agent context.
4. **Provider-owned consent.** Support the provider's independent RTC credential verification and, where implemented, standard OAuth protected-resource/issuer discovery, S256 PKCE, resource-bound consent, token refresh and revocation. The Hub never creates or widens provider scopes. A protected whoami identity that does not attest complete mode/profile/area grants is only enough for the Hub's **read-only** fallback; source must not claim full/write authorization from a successful OAuth callback.
5. **Accurate results.** Keep outputs bounded, protect large pages and handles from cross-account/caller reuse, and reject expired, revoked or narrowed permissions. Unexpected provider POST results must not be retried without a safety guarantee.
6. **Workspace completion proof belongs to Workspace.** Verify actual serving RTC 1 manifest, independent direct MCP / HTTPS behavior, provider-owned identity and scope, bounded search/results, authorization/refusals, real harmless LIVE Google read and revocation, and the Workspace's own shared-PostgreSQL RTC1 conformance suite. Original owner OAuth refresh and legacy owner continuity have independent acceptance criteria. **Do not require a successful Hub-owned LIVE enrollment, relay, registry, Sandbox or connection before accepting Workspace's provider contract.** Hub must itself verify real Hub enrollment, consent, discovery, routing and renewal in the Hub project. Historical TEST proofs are retained and never relabeled LIVE.

## Provider-side conformance matrix — reviewed Hub main `43eed4658527f32c9fca9666b0d31ecf8894b22d`, Workspace READY `912e4fb330608de1fa45639eb656f3faea9fd733`

| Requirement | Workspace evidence and outcome | Hub responsibility |
| --- | --- | --- |
| Standalone RTC 1 manifest, prefixed tools, mode/profile/area/counts and `POST /api/mcp` | **Verified**: deployed manifest/source ancestry; original native read and passed service RTC1 conformance against the real local Workspace process. | Locate and validate the provider origin and truthful identity. |
| Bounded permission-filtered search/describe/call/batch, continuation, isolated expiring results and refusal codes | **Verified**: `test/unit/rtc-https.test.js`, `test/unit/rtc-semantic-coverage.test.js` and `scripts/rtc-workspace-conformance.mjs`; pinned upstream runner PASS `catalog, meta, reads, writes, passes, safety, budget, limits.two_instance` using two Workspace processes/shared disposable Postgres. | Call one selected tool lazily; translate valid next-page indicators into bounded Hub cursor; never eager-load all tools. |
| Read-only / area policies, developer TEST-only fixtures, writes / readback / audit and instant revocation | **Verified**: independent original TEST proof, genuine disposable direct `mode:live` Google read and deny+revoke on ready `912e4fb` in `docs/plan/evidence/2026-10-18-live-rtc-acceptance.json`; source conformance and original native tests. | Preserve caller permissions and perform its own authenticated routed LIVE tests when ready. |
| Optional standard OAuth protected-resource, issuer, DCR, PKCE, resource, refresh | **Available in server source, source/CI verified where covered**; optional for RTC 1 and never substituted for original real P10 dual-user or owner bearer/refresh acceptance. | Implement Hub-owned OAuth enrollment and automatic refresh; accept compliant RTC1 manual passes as another transport. |
| Actual Hub LIVE registration, Hub caller isolation, Hub provider selection, relay/Sandbox | **Not a Workspace acceptance criterion.** Historical original Hub TEST proof retained in `docs/plan/evidence/2026-10-17-final-hub-route-acceptance.json`. | Independently implement and accept this in the Hub repo, including any Hub-side production prerequisites. |

This matrix is source-pinned to the already deployed provider implementation and existing real-provider evidence; it does not claim a new real Hub LIVE call, a Google write, general public OAuth release, or already served changes from this PR. The former `P9-HUB-LIVE` **historical row ID** is retained in the Workspace queue but its owner-approved acceptance scope is now provider conformance only. Its previous Hub-live intent is superseded and owned exclusively by Hub. No new owner tokens or temporary passes are requested merely to re-prove already accepted provider scope.

When implementing a future tool or modifying authorization, include this contract compatibility check in the existing repository roadmap/card and tests, rather than duplicating the Hub's provider-independent router here.

## RTC 2 adoption — owner decision, 2026-10-31

**Adopted, not yet implemented.** By the owner's dated decision of 2026-10-31, **RTC 2 is adopted** as RTC 1's successor under the contract's §9 versioning rule. The primary record is the hub repo's `docs/DECISIONS.md` entry of 2026-10-31, and the adopted RTC 2 specification lives in the hub repo (`Robinson-AI-Systems/robinsons-toolkit-hub`). This section records the adoption for Workspace. It changes no current behavior: the RTC 1 text above remains the accurate description of what this server implements and has proven today, and Workspace's conformance claims remain RTC 1 claims until the follow-on card below lands.

The five rulings:

- **D1 — Result recovery = content pages.** RTC 2 §7 stands as written: oversized results are recovered as content pages.
- **D2 — OAuth optional-but-specified.** RTC 2 specifies the standard OAuth profile, but it stays optional; scoped passes remain the required connection baseline.
- **D3 — Handle lifetime = 24 hours**, carried unchanged from RTC 1.
- **D4 — Health path in the advertisement.** The advertisement includes the health path as a SHOULD-level manifest field.
- **D5 — The RTC 1 freeze holds for R-3.** No shipped dialect in this server is amended to chase the hub conformance suite's unversioned post-freeze drift; the freeze is superseded only by RTC 2's adoption here as the §9 successor.

What RTC 2 supersedes on this server's discovery/connection surface — at contract level; the implementation is the follow-on, not this addendum:

- **Discovery/advertisement:** the manifest gains the D4 health field and RTC 2's dialect declarations, superseding the RTC 1 advertisement shape as the target contract.
- **Connection:** OAuth remains optional-but-specified (D2) and passes remain the required baseline; RTC 2 does not raise the required connection floor.
- **Result recovery:** content pages (D1) become the contract's recovery shape, superseding RTC 1's result-recovery arrangement as the target contract.
- **Handle lifetime:** fixed at 24 hours (D3), carried from RTC 1 — stated in RTC 2 so no server guesses.

**Follow-on:** Workspace's own RTC 2 adoption and conformance proceed through Workspace's own card. This addendum is the pointer and the dated adoption record, not the adoption build.
