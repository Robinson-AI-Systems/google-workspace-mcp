<!-- Current repair also records no-change daily receipts: backups cannot publish later same-day development after a successful no-op. -->
# Daily production release policy

Owner-approved 2026-10-12. Pull requests target `main`; `main` is the default development branch. Do not merge PRs into `live` or push directly to it. Do not run Vercel CLI production deployments or manually promote a preview during routine development.

`.github/workflows/daily-live.yml` alone promotes a checked main snapshot to `live`, at most once per America/Denver calendar day. The primary scheduled trigger remains 00:01 Denver with off-minute 00:17 and 01:17 recovery triggers if GitHub drops or delays a scheduled event. All three use the same checked release script and its atomic branch + dated tag operation; whichever trigger succeeds first wins and later invocations skip. Trigger redundancy is not permission to make extra releases. No changes means no release; failed, pending or missing required checks or diverged history refuse promotion. Nothing force-pushes. Existing customer billing and MCP production-access gates remain unchanged.

Vercel projects linked to this repository must track `live` for production and have automatic preview deployments disabled. `vercel.json` permits Git deployments only for `live`, including future linked projects. Keep existing GitHub CI and any existing local browser/build tests enabled; use local fixtures rather than paid Vercel previews. Emergency releases require a separate explicit owner instruction. The release schedule is independent of development PR batch counts.

The repository-specific required check names are in `.github/release/policy.json`. Repositories without application CI require the release-policy tests; this does not claim their application code has been tested. Public GitHub Actions standard runners do not incur Vercel build charges. Production traffic, cron execution, storage, database services, Vercel subscriptions and existing sandbox resources can still incur costs.

## Initial setup and recovery

Before merging this policy, create `live` from the existing `main` SHA and read back both branch references. This rollout performs that provisioning through the authenticated GitHub connector; it is a one-time setup action, not a routine release. The scheduled job intentionally refuses a missing live branch rather than silently recreating a deleted production branch. If live is deleted, investigate and restore its last verified released SHA before the next run. Never initialize an existing live branch over its current history.

For a new Vercel project, set Settings → Environments → Production → Branch Tracking to `live`, disable automatic Preview deployments, then read back both settings. Repository Git configuration does not change Vercel's production-branch setting by itself. Apply the Git rule to each nested Vercel project root too. No Vercel deployment success is required to merge development PRs; existing app CI and the release-policy check must pass. A checked snapshot is promoted; a merge racing the final push can reach production the following day.

## Active development and release races (owner, 2026-10-13)

`main` holds ongoing checked development; `live` identifies the released snapshot. Agents continue merging into `main`, never into `live`. A commit merged after a release belongs to the next scheduled release; do not keep live synchronized on every merge or trigger extra daytime builds. The release job refreshes changed remote refs and waits up to ten minutes for missing/pending exact-head checks. A completed failed check, diverged history or exhausted window refuses promotion. Atomic daily markers and non-forced fast-forwards remain mandatory. The schedule is 00:01 America/Denver, with native DST and possible GitHub queue delays.

An explicit owner request can authorize a one-off manual release after the exact candidate passes required checks. Read fresh main/live refs, require ancestry, update live without force and with an expected-head lease, then verify Vercel production reaches READY for that SHA and the production alias resolves to it. If an authenticated API connector rather than the atomic GitHub runner performs this exceptional one-time release, create the corresponding `release-markers/YYYY-MM-DD` branch at the same released SHA and verify it independently, so all later scheduled triggers skip that local Denver date. The marker is an immutable release receipt, not a development branch, and must never be recreated at a different SHA. A partially completed release requires explicit investigation and receipt reconciliation before another attempt. A branch update alone is not deployment-success evidence. This exception does not authorize automatic releases at agent batch boundaries, new provider production permissions or spending.

## Missed-event recovery (owner repair, 2026-10-14)

The primary remains 00:01 Denver. Backup events run at 00:17, 01:17 and 05:37 Denver,
plus 12:43 UTC (06:43 MDT / 05:43 MST). Each invokes the same atomic, checked,
once-per-Denver-day promoter. These are recovery opportunities, not extra releases.
GitHub can omit every scheduled event; backup configuration alone does not prove reliability.
Verify the actual run, daily receipt, released SHA and Vercel production deployment.

If all events are missed, the signed-in owner `christcr2012` can Run workflow on
`main` with `recover_missed_daily` checked. The default is false; other actors,
branches and invocations fail closed. Recovery retains exact-main CI, ancestry,
atomic marker and read-back checks and skips if a release already occurred that day.
No provider production permission, plan, spending limit or preview setting changes.


## Explicit owner-authorized emergency extra release on a consumed Denver day (October 19, 2026)

**Narrow owner-directed exception, not a general bypass.** The owner again explicitly authorized an *unscheduled manual release and deployment* after being informed that both today's scheduled tag and manual receipt already exist, so one **additional** production promotion is permitted for this specific October 19 fast-track v1 outcome **only after** a reviewed and merged policy change. The regular scheduled promoter, `live-promotion/YYYY-MM-DD` tag, `release-markers/YYYY-MM-DD` branch, branch protections, required checks and no-force requirement remain unchanged. Never rewrite, delete or repoint today's existing tag or branch to pretend there was only one release.

The authenticated connector operator must run/independently reproduce the `.github/release/manual-exception.mjs` guard on **fresh** exact `main`, `live`, currently READY deployed source, required GitHub Actions checks, actual owner approval, checked Git ancestry and a **complete** filtered inventory of `release-exceptions/YYYY-MM-DD/` branches. Fail closed on unknown state, prior exception, an unready previous deployment, stale refs or any missing gate. No Vercel preview/manual promotion and no changes to provider auth, customer data, Google flags or environments. Only a checked main SHA may be released.

For this one emergency promotion, use `update_ref(branch_name="live", expected_sha=OLD_LIVE, sha=CHECKED_MAIN, force=false)` (or equivalent atomic checked fast-forward) then create the immutable exact-source release receipt branch `release-exceptions/YYYY-MM-DD/FULL_40_SHA` at that released SHA. Read back both, re-check unmodified original day receipts. Never update an existing exception branch; on receipt-creation conflict or interrupted deployment, **reconcile the partial release**, don't repeat the blind mutation. The ordinary scheduled release for the next Denver day remains enabled; this supplemental receipt is an immutable audit record, not a substitute for or deletion of normal daily receipts. No second exceptional release the same day without a separately reviewed owner decision and safety policy update; blanket ongoing exceptions are prohibited.

Finally, independently verify Vercel production READY **and** the canonical and alias routing to the exact released SHA, and perform only authorized nonmutating original-owner continuity checks. Any discrepancy is a release incident rather than success. `npm run v1:readiness` is still **BLOCKED** until actual six real-world acceptance rows pass; a production deployment alone does not certify v1.
