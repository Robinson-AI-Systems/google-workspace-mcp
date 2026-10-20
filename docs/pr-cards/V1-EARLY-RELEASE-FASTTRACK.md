# Owner-approved v1 early-release fast track — October 19, 2026

## Decision, boundary, and frozen acceptance

This is the owner's October 19 product-scope decision: deliver a **finished, usable, production-ready v1 early release first**, while retaining **exhaustive provider API method coverage as mandatory ongoing roadmap work**. It supersedes the prior blanket requirement to finish *all* public Google APIs before initial release; it does NOT waive any security, isolation, truthful advertised feature support, billing permission, credential, external provider, release or review controls. Hub live discovery is Hub-owned. Public directory distribution and portfolio marketing remain outside this repo.

**This change is a release-policy/roadmap maintenance decision, not a product bundle**. Do not invent completion credit, erase original P10/P9 queue rows, change their PASSED/PENDING states, silently make pending work optional, or count existing provider passes as new. The approved initial audience is a bounded opt-in/allowlisted production early release until public-provider authorization/verification and privacy requirements are met. A public self-service GA launch is a separate, truthful milestone.

### Acceptance for this coherent release planning change

- [ ] Record the explicit v1 vs continuing API-coverage finish lines in canonical README, TASKS and plan README, with source-pinned actual baseline and no misleading DONE statement.
- [ ] Create **one runnable, fail-closed v1 readiness gate** consuming existing authoritative release-acceptance statuses; identify every mandatory v1 blocker, each deferred capability with its exact limitations, and verified READY deployment/source. Never infer actual client/provider tests from unit tests or main CI.
- [ ] Preserve all eight original pending queue entries and dependencies. Required v1 gates include P10 owner continuity, real independent identities/custom-client isolation, refresh/revoke, public disclosures, privacy, direct client and credential lifecycle, and checked deployment. Billing mutations and separate customer-admin DWD are *not advertised as verified* unless actually accepted, and remain mandatory for claiming their capability complete.
- [ ] Document v1-specific Google OAuth Testing/verification audience limits and do not claim general public enrollment or Google endorsement.
- [ ] Run exact-head CI/contract tests and code review. Merge only when required checks green; no unscheduled release, production switch, additional Google grants or charged operations under this plan.

### Execution and follow-through

Priority order after this scope update: (1) source/CI/review and checked scheduled release catch-up; (2) verify original owner and two independent pilot accounts/native clients, consent boundaries, refresh, revoke, SDK negative paths; (3) real available provider capability acceptance and privacy/disclosure checks; (4) limited early-release authorization and independently observed READY state. Do not delay steps 1–3 for missing optional API-family coverage. Keep all API gaps in docs/PROVIDER-API-COVERAGE.md with later method-level closure; no quiet disappearance.

### Evidence baseline

At planning time GitHub main `b557eab28847b5adc60e8a09c65cfe0908864843`, current live/READY `ab26461a0fe3179b9b085937e437d977b7d0134b`, main CI success, no open PR; #235 S256/revocation/atomic owner code and #236 Tasks 14/14 merged but unshipped. Canonical queue 32 PASSED / 8 PENDING; do not count a second real user/client as proven. Recheck all these observations before claiming v1 READY.
