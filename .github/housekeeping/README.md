# Current owner-authorized Git closeout — October 17, 2026 UTC

The owner requested documentation reconciliation, all necessary merges and Git cleanup in both repositories, followed by a Workspace release. The current exact-repository plan replaces the expired October13 inventory with newly inspected branch heads. It keeps main/live, existing archives and every immutable release marker. Every deletion remains protected by archive ancestry, exact remote SHA leases and a fresh open-PR head/base check. The source branch of this maintenance PR can retire itself only after its exact tip is merged. Cleanup refuses after October19,2026 UTC; the original October13 context retains its original expired deadline. No production source or credential changes occur during cleanup. The owner-requested Workspace release is a separate checked operation after cleanup.

One Workspace branch containing old TEST-withdrawal work is superseded: its helper and withdrawal tests exactly match main, and both request-time enrollment guards plus reused authorization row are present in current db.js. Its obsolete plaintext-storage tree must not be merged. The archive preserves its complete history before deletion. All other listed source tips are ancestors of the reviewed main snapshot. Concurrently advanced or open-PR branches remain protected. A successful Action and remote readback are required before claiming cleanup complete.

## Historical October13 maintenance

# Owner-authorized Git housekeeping — October 13, 2026

The owner requested full reconciliation of abandoned, duplicated and superseded Git work. This exact-repository manifest preserves all listed source tips under one non-production archive before retiring any branch. It protects open PR heads and bases, changed branch tips, main, live, and existing archives. Source deletion uses exact remote SHA leases. The archive keeps current main's file tree and original history as parents; **never merge it into main**.

Merged PR source history, including squash-merged commits, is preserved. Closed historical drafts are superseded recovery evidence, not new product acceptance. Anonymous work with unique useful behavior must be reconciled on current main instead of replaying stale snapshots. Branch-level reasons and PR numbers are in plan.json. The retained service credentials and provider acceptance remain separate.

The maintenance Action runs only after this checked PR merges into main, and refuses after October 15, 2026 UTC. No production deployment, credential access, provider data change or spending is performed. Its actual successful Action summary and independent remote branch readback are required before claiming cleanup complete. Three behavioral tests cover protected references, active/advanced branch retention, real Git archive ancestry and stale-lease deletion refusal. Do not weaken existing CI or merge gates.
