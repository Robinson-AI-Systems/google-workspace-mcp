# P10 D — owner dual-login recovery and migration

Source: [approved P10-7 original scope](../plan/designs/USER-AUTHORITY-AND-PARALLEL-SIGNIN.md). P10-6 is a distinct external provider/publication gate and cannot be silently marked complete by migration source work. This card introduces no new roadmap scope.

<!-- bundle-plan:start -->
```json
{
  "workKind": "ENGINEERING",
  "baseRevision": "1982453fbe07057e86c423ff820c601d2ede61c8",
  "outcome": "P10-7 owner migration tooling: an independently verified Google subject may be explicitly linked by the existing passphrase-authenticated owner, with reversible dual-login recovery and no change to existing Google grants or agent credentials.",
  "integrationBoundary": "Original owner login and bearer issuance, separate PUBLIC Google OIDC login and one-use transaction/cookie, additive owner identity/proof SQL, dry-run readback/owner guide, old connection and new authorized login matrix.",
  "newEngineering": "Add passphrase-guarded owner enrollment + dry-run snapshot, single-use browser-bound Google verification and owner-specific sign-in proof, persistence/readback with idempotent and foreign-subject refusal, legacy-new-login switch default on, tests for theft/replay/cross-principal/old bearer/rollback.",
  "estimatedProductionLines": 660,
  "relatedWorkDecision": "One substantial sensitive security/migration subsection P10-7 remains independently implementable. Original P10-6 real pilot/provider-publication requires a distinct public Google app, authorized two real identities, deployed isolation, explicit owner pilot decision, and possibly external publication review. Do not fabricate that evidence or activate flags; P10-7 real optional retirement remains owner-controlled.",
  "subsections": [
    {
      "id": "P10-7",
      "acceptance": [
        "First deliver migration tooling and dual-login recovery; retirement is a separately chosen runtime action, not a scheduled date or automatic consequence of Google sign-in.",
        "While authenticated through existing owner passphrase, start a fresh Google proof transaction to link selected verified issuer/sub to the explicit legacy-owner principal; never claim ownership by email/first login/admin hostname.",
        "Display exact affected connections/accounts, preserve existing encrypted grants and permissions, and verify old AND new auth before enabling the new owner login.",
        "Existing bearer connections remain mapped to owner without reissue; explicit user-selected reconnect/revoke only. Keep legacy callback/refresh compatibility until active owner connections accounted for.",
        "Snapshot encrypted data and reversible migration mapping; dry-run counts and independent post-readback required. Changing flags never restores plaintext or old insecure schema.",
        "Turn off legacy NEW sign-in only after owner explicitly chooses retirement and both login/recovery paths are demonstrated; existing old connector tokens are not silently revoked; rollback stays dual-login forward-compatible.",
        "Prove foreign subject/stale proof theft denial, migration twice idempotent, rollback preserves principals, retirement off/on behavior and retained owner bearer policy; real retirement remains pending explicit approval."
      ],
      "remainingEngineering": [
        "Build protected fresh-passphrase-to-Google owner link, irreversible-free snapshot/readback and subject-only mapping.",
        "Add one-time Google owner login with protocol-bound proof; retain original bearer/grant issuance, and gate only future passphrase auth on optional retirement flag.",
        "Prove idempotency, denial/race and rollback in unit and disposable-real-Postgres tests, preserve operator guide and owner compatibility."
      ]
    }
  ]
}
```
<!-- bundle-plan:end -->

## Delivery
Pending implementation and exact-head verification. No real Google credentials, OAuth-project changes, publication, public activation, provider write, spend or owner-login retirement are authorized by this card.
