# Windows 11: ordinary browser session check

This is local operator tooling for the remaining P10-VERIFY-GOOGLE check. It needs no application deployment. Use your regular Chrome or Edge browser and sign in yourself. Google sign-in is never driven by Playwright, BrowserStack, remote debugging or a copied browser profile.

## Setup

Download the repository ZIP for the **reviewed exact commit** supplied in the handoff, then extract it. Open ordinary Windows PowerShell (not administrator) in that extracted repository folder and run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-native-browser-check.ps1
```

`Bypass` applies only to that PowerShell process so it can run the reviewed local script; no persistent execution-policy setting changes. If organizational policy prevents the script, report the error instead of changing that policy.

The script downloads the official portable Node v24.22.0 executable into `%LOCALAPPDATA%\RobinsonWorkspaceCheck`, verifies its pinned SHA256, and runs the local launcher. It supports x64 and ARM64. No administrator access, Git, IDE, npm install, PATH change or BrowserStack credentials are needed. Source for the pinned hashes: [Node official release checksums](https://nodejs.org/download/release/v24.22.0/SHASUMS256.txt).

Keep the PowerShell window open until both pilots are finished. It serves four fixed attacker forms on a random `127.0.0.1` port and writes `native-browser-check-output/native-browser-snippet.js`. That file contains static reviewed code, the local form origin and expected live SHA; it contains no credentials. The script copies it to the Windows clipboard. If clipboard copying fails, open that file in Notepad and copy its contents.

## Run once per approved identity

1. Open a fresh Chrome Incognito or Edge InPrivate window. Other private windows in the same browser share a private session: close **all** of them between identities.
2. Open the [canonical account page](https://google-workspace-mcp-chris-projects-de6cd1bf.vercel.app/api/account). Sign in normally with the approved Primary account `chris.tcr.2012@gmail.com`. Do not authorize new provider scopes for this check.
3. On the returned canonical account page, press **F12**. In DevTools, press **Ctrl+Shift+P**, type **Show Snippets**, and select it. Click **New snippet**, name it `Workspace check`, paste the generated code, then press **Ctrl+Enter**. [Chrome's snippet instructions](https://developer.chrome.com/docs/devtools/javascript/snippets). Review only this source-pinned code; do not disable browser security or paste unknown code to get around a warning. Report any browser restriction that blocks execution.
4. In the displayed panel, select the expected identity and click **Check refused requests**. It verifies live source `fbac5349fa66fed52502730441b4a84d05d6fb7c` before sending any POST. A mismatch stops the checks; obtain an independently verified source pin rather than guessing a replacement.
5. Click each of the four **cross-site** buttons in turn. In its opened tab, press **Submit invalid CSRF test**. Return to the panel after the JSON response appears; wait for the panel to confirm that refusal before proceeding.
6. Click **Log out and finish**, then **Copy sanitized report**. Preserve the report in a local text file and return it in this conversation. The button also performs safe logout if the checks are incomplete, without claiming a pass. If it cannot confirm cleanup, reload the real account page and use its **Log out of this browser (agents remain)** button; preserve that failure for operator review.
7. Close **all private windows**, reopen a fresh private window, and repeat with RAR `ops@robinsonappliancerentals.com`, selecting RAR in the panel. Reuse the same snippet while this launcher remains open. DevTools may require creating the snippet again in the new private window.
8. Save both sanitized reports, then press **Ctrl+C** in PowerShell to stop the local form server. Closing the server alone does not log out the browser.

No browser minute meter or controller sign-in deadline applies to this route. Individual network requests time out after 15 seconds; each manually submitted cross-site check allows 10 minutes and can be interrupted by closing its popup. Partial check receipts remain visible in the panel and in same-tab session storage. Copy before closing the private window; no server receives those receipts automatically.

## What the report proves

The browser submits authenticated same-origin missing/wrong-CSRF requests to nondeleting `/api/account` preview and `/api/auth/logout`; requires HTTP403 and the exact error; checks own session and preview counts afterward. Cross-site forms are actual top-level HTML POSTs from loopback to those same two endpoints, with missing/wrong CSRF. The parent must observe a real HTTP403 navigation status and exact response body after the popup returns to its own origin. A hidden/unavailable status is **unverified**, never inferred from page text. Cross-site refusal covers SameSite cookies and CSRF protection together; it does not isolate which control refused the request.

Valid logout must return HTTP200 with agent connections retained, then `/api/auth/session` must return HTTP401. No account deletion, provider write, Google grant revocation or useful agent disconnection is performed. Raw CSRF and principal identifiers stay in browser memory; the launcher never reads a profile, cookie, token or browser storage. The clipboard receives only the static snippet or the explicitly copied sanitized report.

This sequential route does **not** claim a live crossed-active-session token check or two simultaneous authenticated contexts. Those fields remain NOT_PERFORMED. Existing real PostgreSQL crossed-session evidence and earlier genuine pilot/client isolation receipts retain their separate provenance. Both reports still require independent operator review, SQL cleanup/inventory and standing connector readbacks before the original acceptance row can change. A helper fixture/Windows setup pass is not a Google live security pass. Current queue: **36 PASSED / 4 PENDING; v1 NOT READY** until actual remaining criteria are verified.

## Maintainer verification

`test/unit/native-browser-check.test.js` checks denied identity/anonymous, accepted forgery, mutation detection, request shape, private-data omission and unavailable navigation status. `scripts/test-native-browser-ui.mjs` drives the actual generated panel in Chromium against explicitly intercepted app-origin fixture responses and a real loopback form server. It verifies cross-site navigation observation plus complete/incomplete logout. **All app-origin requests in that CI test are locally fulfilled fixtures, never real service evidence.** The separate Windows job runs Windows PowerShell 5.1 and the actual official portable-runtime download/checksum/launcher with `-PrepareOnly`; it starts no Google login or application request.
