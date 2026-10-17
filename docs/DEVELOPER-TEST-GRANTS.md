# Developer-only testing and acceptance controls

These controls bind **implementing coding agents and test runners**, not every real customer's Workspace MCP connection. Follow `AGENTS.md`, `docs/SESSION-START.md` and the current roadmap. No unapproved spending, production activation, third-party mutation, release bypass or general public enrollment is granted by implementing P9.

Developer operations use the explicit **TEST** mode, enrolled `RTC_TEST_ACCOUNT_EMAILS`, isolated resources, approved fixture IDs, low-impact reads and documented cleanup. TEST Hub grants remain read-only with their existing identities; TEST writes need exact mailbox confirmation, explicit areas and short lifetimes, and Hub TEST writing remains disallowed. Never test paid license changes or Google admin mutations against real users merely to establish source behavior. Use fake Google APIs with real SDK request shape and registered guarded handlers. Developer fixture writes must be refused on `mode:live` before Google is called.

Runtime user authority is separate: after owner authentication, an end user may explicitly grant a real connected account a normal live profile/areas and billing policy. Its actions remain constrained by actual Google permissions, scopes, user-selected restrictions, audit and technical abuse guards, not the implementer's $0 development spending rule.

Hub integration remains outward Hub→Workspace. This repository can test its own live RTC door but **cannot attest** Hub live-write relay, Sandbox or other Hub-owned consent until Hub independently implements and proves that boundary. No reverse Workspace discovery.
