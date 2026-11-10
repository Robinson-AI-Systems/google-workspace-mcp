# Changelog

Changes to the codebase, not claims of successful live Google or Hub provider acceptance. Release version is package metadata; only the separately scheduled checked `main → live` process can promote production.

## Unreleased — post-2.0.0 source changes (October 12, 2026)

- **Muse front door (November 9, 2026):** the home page gains "Connect your AI app" with the D-006 MC-8 Muse sentence (Client ID `muse`, Client Secret blank) and describes the public sign-in as it now works (any Google account; add more the same way).
- **Public sign-in, several accounts (November 9, 2026, PUBLIC-1):** owner ruling — anyone signs in with any Google account they control, no roster. The connect leg carries no cookies (D-006 MC-7.0): one-use handles end on a single Approve page with **Add another Google account**; the sign-in account is linked in the same Google round trip; public connections can use every account their own person linked (`account` on any tool call), never anyone else's.
- **Multi-account (November 9, 2026):** one owner connection can now work with every linked Google account. Any tool call may name `account` (email or label); leaving it out keeps the connection's own account. `workspace_call` and `workspace_batch` pass it through, and a batch may mix accounts (e.g. three inboxes in one request). Public sign-in connections still use their one account (naming another is refused) until per-account isolation for public sign-in is built. Undo still only reverses changes made by the same account.
- **Slimmer compact listing (November 9, 2026):** the compact tool list keeps every field name, type, choice list and required marker but leaves out the explanation text inside input fields (as it already did for output schemas); `workspace_describe_tool` still returns the full schema. Compact discovery drops from ~4,977 to ~3,473 estimated tokens, leaving room for new tools.
- **P7-3 / #51:** one allowlisted, paginated read-only Reports API for additional application audit streams using existing granted permissions; live plan coverage not yet verified.
- **P7-4 / #52:** Postmaster v1 verified-domain and delivery-metric reads, guarded per connection; added already approved `postmaster.readonly` OAuth scope. Existing connected accounts need explicit new consent and real provider proof.
- **P7-2 / #53–#54:** guarded read-only Cloud Identity organization policy inventory, configurable 21-rule baseline, honest missing/inherited-status handling and preservation of observed risks despite incomplete pagination. Added previously approved read-only policy OAuth scope; **not** a per-domain effective policy certification.
- **P8-1 / #55 (pending):** machine-readable schemas/validation for the five new read-only APIs, bounded result handles, accurate domain counts and partial field-projection behavior. Exact-head CI/merge and Hub acceptance separately required.

## 2.0.0 — 2026-10-12 (code milestone; release deployment not verified)

- **P0 safety:** automated unit/disposable-Postgres testing, sign-in lockout, encrypted token storage alongside legacy tokens, streaming Drive upload, bounded remote uploads and developer setup instructions.
- **P1 trust:** account-scoped domain restrictions, change logs, credential revocation, plain-language Google errors, guarded mutation previews, confirmation and provider read-back where observable.
- **P2 operations:** mailbox and DNS health, Workspace and calendar settings, security/plan checks and owner-friendly settings guidance.
- **P3 workflows:** staff and business provisioning, mailbox-branding, offboarding, security inspection and other repeatable multi-step operations.
- **P4 integrations:** hosted app-facing calendar, Drive and mailbox interfaces with narrowly scoped delegated service-account support.
- **P5 hardening:** owner-retired local mode; a fail-closed assembled-registry safety classification with 156 reviewed read tools, 209 handler-provenance-guarded writes and five meta dispatchers; generated README catalog, deterministic drift check, package/lockfile version 2.0.0. Plaintext token retirement **not** included: P5-2 is blocked until November 1, 2026 and per-account encryption evidence.
- **Additional phased work:** RTC read-only profiles, protected TEST pass pathways, compact results, developer fixture reservation/reconciliation and owner overview have implementation and automated tests, but their genuine deployed Google TEST and Hub direct/relay/Sandbox/revocation acceptance is outstanding. These are **not** being certified as live-ready by this changelog.

Earlier milestones are tracked in [the roadmap ledger](docs/plan/TASKS.md). No production activation, extra Google scopes, or provider writes are implied by the version number.
