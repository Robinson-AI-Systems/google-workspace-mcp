# P10 native-client compatibility: Meta Muse Android OAuth

Owner request 2026-10-25: fix the existing production Workspace MCP so the Meta Muse Android custom connector can sign in using the public client ID it requests. This is a **P10-3/P10-6 defect correction**, not a newly completed original subsection or a release authorization. Separate P11 inventory work remains on its existing draft PR. Do not change existing client identifiers, Google grants, paid permissions, owner tokens, or public enrollment.

External observation (not a Workspace live test): [independent September 24 Muse Android MCP experiment](https://github.com/thetangstr/agentdash/issues/674) reports an opaque pre-issued client ID, exact `https://agent.meta.ai/api/hatch/oauth/callback`, S256 PKCE, no client secret and no RFC 8707 `resource` parameter at either authorization or token exchange. This experiment is evidence of one Muse behavior, **not** proof that the deployed Workspace connector works.

<!-- bundle-plan:start -->
```json
{
  "baseRevision": "706494bda986af080e54d34aa51e799167126647",
  "workKind": "ENGINEERING",
  "outcome": "Repair P10 native OAuth interoperability for the observed Muse Android public-client flow without weakening authorization isolation",
  "integrationBoundary": "oauth_clients Postgres bootstrapping, authorization/token endpoints and direct remote MCP; all other clients, Google grants and approvals unchanged",
  "newEngineering": "Backwards-compatible pinned public Muse client and exact callback; canonical resource fallback only for that client; scoped tests and owner-facing connection guidance",
  "estimatedProductionLines": 70,
  "relatedWorkDecision": "P10-3 OAuth client binding and P10-6 native client compatibility are a single small repair; do not count either completed subsection again or merge unrelated P11 changes",
  "subsections": [
    {
      "id": "P10-3",
      "acceptance": ["New and existing client authorization remains registered-client, exact-redirect, S256 PKCE, single-use-code, issuer/resource and token-family bound; legacy owner records and revocation retain their existing security boundaries"],
      "remainingEngineering": ["Support observed Muse public client while keeping every other client on its current exact resource contract"]
    },
    {
      "id": "P10-6",
      "acceptance": ["Native clients must use real supported OAuth, be independently verified for principal reads and isolation; source tests alone do not establish per-client live acceptance"],
      "remainingEngineering": ["Offer a stable Muse Client ID and test its exact known callback and no-resource OAuth exchanges; separately record real Muse device acceptance"]
    }
  ]
}
```
<!-- bundle-plan:end -->

## Frozen acceptance criteria

1. A known public client ID `muse` is idempotently enrolled only with `https://agent.meta.ai/api/hatch/oauth/callback` and no secret. Bootstrap does not change any previously registered clients or change real Google grants.
2. Public Muse authorization without a `resource` argument binds internally to the configured canonical MCP resource; any supplied foreign resource, invalid/foreign redirect, missing S256 challenge, invalid owner/principal, bad CSRF or unapproved account fails closed.
3. Muse exchanges/refreshes/revokes its own tokens with no client secret and optionally omitted resource, while cross-client tokens, wrong verifier, replay and revocation remain denied. Other clients still require their previously supported credentials and exact resource for principal grants.
4. No new Google OAuth app/client ID, general public enrollment, provider scope, paid license approval, bearer-copying or unsafe PROD mutation. README/user guide gives the user the stable ID and hosted MCP URL (not a GET registration link).
5. Focused unit and **disposable real-Postgres** regressions, syntax, full normal CI, exact-head review, secure release and a subsequent *real* Muse Android sign-in/provider-read test are distinct checkpoints; don't mark success based on source/CI alone.

## Delivery and limitations

Record commits/CI and live-client receipt here after work. A normal scheduled, checked release is required before the new client ID becomes active in production; this patch is not permission for an off-schedule release.
