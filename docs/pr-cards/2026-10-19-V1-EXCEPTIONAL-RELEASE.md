# October 19 owner-authorized v1 same-day emergency release

This maintenance/release outcome is explicitly requested by the owner **after being told the ordinary one-per-Denver-day rule had already been consumed**. The owner repeated: "I hereby authorize an unscheduled manual release and deployment." Treat this as approval for **one exceptional additional checked release today**, not open-ended acceleration or permission to change Google grants, spend, disable protections or waive CI. Ordinary scheduled cadence stays unchanged.

## Frozen acceptance (no product bundle counted)

- Preserve existing `live-promotion/2026-10-19` tag and `release-markers/2026-10-19` branch **unmodified**, and preserve once-per-day scheduled promoter behavior and all its tests.
- Add a narrowly scoped **owner-approved, one-per-day maximum additional emergency exception** to release policy, with a unique immutable `release-exceptions/YYYY-MM-DD/<exact-40-sha>` branch receipt and explicit lease/ancestry/check-state safeguards; never overwrite markers/force push. Fail closed for unknown GitHub state, other actors, stale main, missing exact CI, or an existing exception receipt.
- Test positive/negative decision paths, original daily cap unaffected, and strict receipt shape; run exact-head `check`, `unit`, real Postgres `db`, `rtc`, `test`, `release-policy`, review with transparent Codex quota limitations.
- **Only after merged reviewed policy and green exact-main CI**: recheck refs, same-day receipts, no concurrent release, issue one leased fast-forward from old live to checked main; immediately create unique exact-revision exception receipt, verify independent GitHub readback. If unsuccessful, reconcile original state—no blind retries, no force.
- Verify Vercel independently READY for exactly released SHA and both established production aliases, then safe existing-owner whoami only; no test-clients, provider mutations or v1 completion claim. If deployment fails, record a concrete partial release incident (do not claim success).
- Update `docs/plan/TASKS.md`, guide, incident/PR with exact receipts and remaining v1 acceptance; treat CI, release, and provider acceptance as separate layers.

## Baseline

Main `803fdcf98947390033aaef89a8d40e9898ec0ada` CI all six success, live and Vercel READY `ab26461a0fe3179b9b085937e437d977b7d0134b` (6 commits behind); GitHub daily 2026-10-19 tag and same-day manual branch receipt **both** already exist, so ordinary manual-release path is **not valid**. Scope expands the timing exception only on reviewed source; original receipt never mutated and already completed 32/40 Google acceptance passes remain unchanged.

Maintenance/release authorization is not a counted roadmap implementation bundle. Workstream stays limited to Google Workspace MCP.
