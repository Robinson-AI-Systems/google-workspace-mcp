# RECENSUS-1 — OAuth client registration lifecycle: owner list, read, update and delete for dynamic client registrations

Source: fleet capability-completeness re-census, 2026-11-04 (the addendum that closes
`docs/COMPLETION.md` row 15 under the RAS MCP Standard capability-completeness grading
amendment, Library D-001 as amended 2026-11-04, Library PR #5). Filed by the re-census;
**the build is owned by this repo's existing queue — this card enters the queue in its
normal order and does not jump the Workspace chat's build order.** The census evidence:
the `oauth_clients` table is written by exactly two INSERTs (dynamic registration via
`api/oauth/register.js` → `createOAuthClient`, `src/db.js:612`, plus the seeded `muse`
client) and read by one internal SELECT (`getOAuthClient`, `src/db.js:620`); all nine
`DELETE FROM` statements in `src/`+`api/` were enumerated and none touches it; no
deregister function, no HTTP DELETE route, no registration-management endpoint and no
cleanup sweep exists; no registration access token is issued at register time, so RFC
7591's optional registration-management surface has nothing to build on yet. Token and
connection revocation is complete (row evidence in the addendum) — it is the
registration *record* that can never be removed.

<!-- bundle-plan:start -->
```json
{
  "workKind": "ENGINEERING",
  "baseRevision": "c1fe0a5df659d2de21396d59d7536c68cc02c71d",
  "outcome": "An OAuth client registration created through this server's dynamic registration can be listed, read, updated and deleted by the installation owner through the product, with the same revocation discipline the server already applies to tokens — so a stray or retired registration (the three inert \u201cVivienne RAR connection probe\u201d registrations are the standing example) can be removed without direct database edits.",
  "integrationBoundary": "Owner-only surfaces consistent with the existing owner pages and guarded tool layer; the oauth_clients store in src/db.js; the existing connection revocation path (revokeConnection / oauth_refresh_revocations tombstones) for any tokens the deleted registration issued; no change to registration creation, the authorize/token/revoke flows, or any Google-side surface.",
  "newEngineering": "Add list/read functions for oauth_clients (owner-visible, secrets never returned in full); an owner-gated delete that removes the registration row and deals with its issued tokens in the same operation (revoke the token family with the existing tombstone discipline, or refuse naming the live connections — never strand silent live tokens); an update path for redirect_uris and client_name; audit/change-log entries for each mutation; tests mirroring the existing revocation tests.",
  "estimatedProductionLines": 420,
  "relatedWorkDecision": "Filed by the fleet re-census as the plan for COMPLETION.md row 15 item M1. Ownership stays with this repo's existing queue (the Workspace chat's build order governs); the re-census files the card and this queue entry only and performs no build work. Sibling missing-with-plan items from the same addendum (M2 principal-deletion execution; M3–M9 family depth) are separate cards/bundles in their own right and are not folded into this card.",
  "subsections": [
    {
      "id": "RECENSUS-1",
      "acceptance": [
        "The three inert \u201cVivienne RAR connection probe\u201d registrations become deletable through the product, and after deletion read back as gone (owner list/read no longer returns them; getOAuthClient finds nothing; a token exchange attempt for the deleted client_id fails as an unregistered client).",
        "The owner can list all dynamic client registrations and read one registration's stored facts (client_id, client_name, redirect_uris, auth method, created state) without any client_secret being returned in full.",
        "Deleting a registration with live issued tokens either revokes that token family in the same operation — with the durable refresh-family tombstone written, matching workspace_revoke_connection's discipline — or refuses and names the live connections; it never leaves a live token whose registration is gone.",
        "The seeded built-in `muse` client and any registration the owner has not explicitly selected are never deleted or altered by this surface; deletion requires the same explicit confirmation discipline as workspace_remove_account.",
        "Registration update (redirect_uris, client_name) is owner-gated, validated to the same rules registration creation applies, and read back after the change.",
        "Every mutation through this surface is recorded in the server's change log with the acting owner surface named, and is covered by unit tests plus the repo's real-Postgres test path where the revocation tests already run."
      ],
      "remainingEngineering": [
        "Add listOAuthClients / deleteOAuthClient / updateOAuthClient store functions beside createOAuthClient in src/db.js, reusing the existing revocation helpers for issued-token handling.",
        "Expose the lifecycle on one owner surface (owner page action and/or guarded owner tool) consistent with how workspace_remove_account and workspace_revoke_connection are gated today.",
        "Decide and record in the delivery whether RFC 7591 registration-management endpoints (registration access token issued at register time) are adopted or deliberately not adopted; the owner surface above closes the census finding either way."
      ]
    }
  ]
}
```
<!-- bundle-plan:end -->

## Delivery

Not delivered — card filed 2026-11-04 by the fleet completeness re-census. No code,
credentials, flags, releases or production data were touched by the filing. The build
belongs to this repo's existing queue; delivery evidence belongs in this section when
the queue builds it, including the read-back that the three probe registrations are
gone.
