# Changelog

Changes to the codebase, not claims of successful live Google or Hub provider acceptance. Release version is package metadata; only the separately scheduled checked `main → live` process can promote production.

## 2.0.0 — 2026-10-12 (code milestone; release deployment not verified)

- **P0 safety:** automated unit/disposable-Postgres testing, sign-in lockout, encrypted token storage alongside legacy tokens, streaming Drive upload, bounded remote uploads and developer setup instructions.
- **P1 trust:** account-scoped domain restrictions, change logs, credential revocation, plain-language Google errors, guarded mutation previews, confirmation and provider read-back where observable.
- **P2 operations:** mailbox and DNS health, Workspace and calendar settings, security/plan checks and owner-friendly settings guidance.
- **P3 workflows:** staff and business provisioning, mailbox-branding, offboarding, security inspection and other repeatable multi-step operations.
- **P4 integrations:** hosted app-facing calendar, Drive and mailbox interfaces with narrowly scoped delegated service-account support.
- **P5 hardening:** owner-retired local mode; a fail-closed assembled-registry safety classification with 156 reviewed read tools, 209 handler-provenance-guarded writes and five meta dispatchers; generated README catalog, deterministic drift check, package/lockfile version 2.0.0. Plaintext token retirement **not** included: P5-2 is blocked until November 1, 2026 and per-account encryption evidence.
- **Additional phased work:** RTC read-only profiles, protected TEST pass pathways, compact results, developer fixture reservation/reconciliation and owner overview have implementation and automated tests, but their genuine deployed Google TEST and Hub direct/relay/Sandbox/revocation acceptance is outstanding. These are **not** being certified as live-ready by this changelog.

Earlier milestones are tracked in [the roadmap ledger](docs/plan/TASKS.md). No production activation, extra Google scopes, or provider writes are implied by the version number.
