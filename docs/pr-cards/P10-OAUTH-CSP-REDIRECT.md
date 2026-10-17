# P10-6 protected tester Google redirect — browser compatibility correction

Incident: during the approved disposable pilot owner reports clicking Google-verify does nothing visually. The deployed pilot-readiness HTML includes CSP `form-action 'self'` while a successful same-origin authenticated POST responds with an HTTP 302 to `https://accounts.google.com`. Chromium may enforce form-action across the redirect chain and silently refuse the external Google navigation. The deployed handler lacks non-sensitive request-outcome telemetry, so real browser pass is not yet established. Fix this concrete source failure and retain provider/browser acceptance PENDING.

<!-- bundle-plan:start -->
```json
{
  "workKind": "ENGINEERING",
  "baseRevision": "4e08189f1a4e65c02becd750aea1d6dfe176710b",
  "outcome": "Allow the protected P10-6 pilot verifier's legitimate Google OAuth redirect to navigate in Chromium without relaxing credential intake or any unrelated route.",
  "integrationBoundary": "Only the owner-passphrase pilot readiness form CSP and its exact handler route tests; Google origin explicitly allowlisted for form redirect, all cross-origin POST, owner lockout, strict canonical Origin, no token leakage, public OFF and existing owner credentials unchanged.",
  "newEngineering": "Add https://accounts.google.com to the exact route's form-action directive on both HTML GET and POST 302, assert Google OAuth navigation is eligible under that directive, and test arbitrary-origin form requests still reject.",
  "estimatedProductionLines": 1,
  "relatedWorkDecision": "Scoped P10-6 pilot acceptance regression hotfix; no unrelated feature implementation or release is inferred. Browser validation and eventual checked release remain separate.",
  "subsections": [{
    "id": "P10-6",
    "acceptance": [
      "The HTML form may POST only to its own canonical origin or Google account authorization domain; successful OAuth 302 to Google's actual host is allowed by the page's form-action policy on the GET and response.",
      "Untrusted external form submissions, absent/wrong owner passphrase and lockout still fail before a Google transaction or account change.",
      "No other CSP, public sign-in mode, owner grant, Google scopes, client keys, refresh tokens or production permission is relaxed.",
      "Focused P10-6 tests and exact-head full repository checks pass; real Google OAuth browser roundtrip and two-user pilot remain pending until performed."
    ],
    "remainingEngineering": [
      "Fix exact CSP directive for OAuth redirect and regression assertions on tested response.",
      "Verify CI source evidence and record the true browser validation prerequisite."
    ],
    "remainingWork": [
      "After approved checked release and READY domain mapping, run Chrome browser sign-in via owner passphrase with each designated Google test account and record verified subjects privately.",
      "If navigation still fails, inspect actual browser console/navigation status and provider consent constraints without exposing secrets."
    ]
  }]
}
```
<!-- bundle-plan:end -->

This plan does not authorize an unrequested early release, Google provider write, new user, change to public sign-in mode or editing real OAuth secret values.
