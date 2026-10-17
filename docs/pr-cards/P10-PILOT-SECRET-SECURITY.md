# P10-6 — fix unsafe public-prefix name for OAuth client secret

Security/configuration compatibility correction within existing original P10-6 pilot readiness; this is **not** a new roadmap subsection or completed pilot. Vercel's 2026 Config/Secret type enforcement rejects a Secret named `PUBLIC_GOOGLE_OAUTH_CLIENT_SECRET` because `PUBLIC_` denotes public framework variables. Never ask an operator to downgrade an OAuth secret to Config.

<!-- bundle-plan:start -->
```json
{
  "workKind": "ENGINEERING",
  "baseRevision": "d59a6af5e795b61bf6e0960f211fd1c6f4c0ecdd",
  "outcome": "Permit the independent Google public sign-in application's client secret to be stored as a Vercel Secret without exposing it through a public framework-prefixed config name.",
  "integrationBoundary": "P10-6 separate OAuth client factory, offline readiness check, unit tests and owner Console/Vercel setup instructions; legacy Google owner client/grants, public mode and release controls unchanged.",
  "newEngineering": "Replace server-side public-prefixed client-secret environment variable with GOOGLE_PUBLIC_OAUTH_CLIENT_SECRET, update all active setup instructions and tests, assert the insecure legacy name is not accepted as a fallback.",
  "estimatedProductionLines": 4,
  "relatedWorkDecision": "Urgent isolated security/configuration hotfix. Smaller than a normal bundle because the approved pilot cannot store the required credential as a Vercel Secret; do not pad product scope or activate a new release.",
  "subsections": [{
    "id": "P10-6",
    "acceptance": [
      "Independent Google client uses a different ID and private server-side secret from the owner Google app and never falls back to either owner credentials or a PUBLIC_-prefixed secret.",
      "Vercel Production supports a Config type for the public client ID and a Secret type for GOOGLE_PUBLIC_OAUTH_CLIENT_SECRET, with the original owner credentials unchanged.",
      "Source readiness and protected pilot subject proof use only the independent private credential, with no new principal, grant or public mode activation.",
      "Test suite, operator checklist, plan and permanent handoff agree on the exact private secret key; real two-user OAuth pilot remains unperformed until configuration and independently approved activation."
    ],
    "remainingEngineering": [
      "Fix server-side Google OAuth client secret name and preflight references.",
      "Add fail-closed tests for missing old or public-prefixed secret as non-fallback.",
      "Correct user-facing operator procedures and verification guidance."
    ],
    "remainingWork": [
      "Operator saves the client ID as Config and private client secret as Secret in Vercel production.",
      "After separate release approval and environment uptake, test protected Google identity verification using designated pilot test users.",
      "Complete the remaining original real-provider P10-6 acceptance; do not infer any pass from source or CI."
    ]
  }]
}
```
<!-- bundle-plan:end -->

No deployment, OAuth credential, Google Console, public sign-in flag, owner grant or live customer data modification is authorized by this maintenance repair. Original P10-6 remains OPEN.
