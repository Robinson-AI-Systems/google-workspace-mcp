# October 19 provider capability coverage pre-audit — incomplete, source-pinned

## Objective and evidence boundary
Owner's **no avoidable provider gaps** directive requires every public operation of each
in-scope Google Workspace API (not only common tools) to be callable through independent
MCP or a reviewed fully equivalent operation. This card is a **pre-audit and acceptance
checkpoint**, not an implementation bundle, complete-method certification, or approval
to widen Google scopes, impersonate a customer, spend money or promote a release.

**Observed baseline:** `main=834b004b9fee5b86e5248b3ad618f45f94b4396b`, generated
README catalog **384** registered tools, merged licensing PR #233 (all seven
Enterprise License Manager resource methods), live and independently verified
Vercel READY `ab26461a0fe3179b9b085937e437d977b7d0134b`.
The current remote ChatGPT Workspace adapter exposes the **five prior licensing
tools**, confirming that main's two additional methods are not yet released.
A new authorized live Google read of Business Standard licensing through
`workspace_plan_summary` and `licensing_list_assignments` passed; its
sanitized evidence is `docs/plan/evidence/2026-10-19-live-enterprise-licensing-read.json`.
That does not certify the two not-yet-deployed methods, paging extension or paid PUT.

## Authoritative provider inventory input
Google's [Workspace API enablement list](https://developers.google.com/workspace/guides/enable-apis)
(updated September 3, 2026) lists many independent APIs, including Apps Script,
Classroom, Cloud Search, Drive Activity, Drive Labels, Keep, Meet and Workspace
add-ons, beyond the product's existing API areas. Google's
[developer product index](https://developers.google.com/workspace/products)
also lists Contact Delegation, Domain Shared Contacts, Email Audit, Reseller,
Groups Migration and Marketplace integration. Google's
[Discovery API](https://developers.google.com/discovery/v1/using)
describes root and nested resource methods; a tool count, module/file match,
single console menu, single operation summary or existing REST helper does
**not** establish exhaustive coverage.

## Initial service-family disposition (not method parity)

- **Visible native-tool families, exact method coverage not established:** Gmail,
  Drive, Calendar, Docs, Sheets, Slides, Forms, Tasks, Chat, People/Contacts,
  Admin Directory, Admin Reports, Alert Center, Chrome Policy, Cloud Identity,
  Data Transfer, Groups Settings, Vault, Postmaster, Site Verification and
  Enterprise License Manager. Cross-provider duplicates and combined workflows
  require method-by-method comparison.
- **No dedicated tool-family names in the complete 384-name registry; inspect
  SDK calls and equivalents before calling missing:** Apps Script, Classroom,
  Cloud Search, Google Keep, Google Meet REST, Workspace Events subscription
  management, Groups Migration, Reseller, Marketplace, Workspace add-ons,
  Contact Delegation, Domain Shared Contacts, Email Audit, Google Cloud
  License Manager. Absence of a name does not prove absence of an equivalent.
- **Superficial resemblance is not parity:** `reports_drive_activity` is a Reports
  API wrapper, not by itself a Drive Activity API method map;
  `drive_create_drive_label_assignment` is not proof of the Drive Labels API
  full resource contract; `calendar_create_video_meeting` is not Meet REST.
  Drive Activity and Drive Labels need separate inventory.
- **Different protocol/not silently REST:** CalDAV and Google Workspace
  Marketplace SDK publishing/configuration need reviewed explicit scope and
  feasibility/ownership decisions, not fabricated REST method counts.
  Google Cloud VM License Manager is a separate Cloud IAM/finance provider,
  19 operations at 0/19 in this Workspace server, tracked separately.
- **Not yet mapped:** all Workspace REST methods outside the verified seven-method
  Enterprise licensing family. Do not mark a family COMPLETE on the basis
  of one API call, one module, synthetic tests or a 384-tool total.

## Finite follow-on acceptance (must remain open until proved)
1. Freeze each Google's current Discovery document (API name/version/date/digest),
   flatten root and recursively nested resource methods, and verify total counts.
2. For each method record method ID, REST verb/path, Google scope and edition/IAM
   requirements, exact MCP tool/handler and effective argument/response coverage
   or an explicit linked **OPEN** method gap. Verify pagination/bulk/LRO/media variants.
3. Compare the **real wrapped runtime registry**, outbound client method and schema,
   not README keyword similarity or source-file names alone. Test success,
   forbidden foreign tenant, user-selected authority, expiry/revoke, payload shape,
   ambiguous writes/readback and rate/partial errors.
4. Split missing methods into connected provider code bundles in existing roadmap,
   grouping real complete user-facing capabilities and preserving original subsection
   IDs. A distinct Cloud integration may be a separate portfolio-owned project.
5. Apply checked source/review/CI, checked release, independently READY revision
   and fresh eligible provider acceptance. Keep pending Sonnet Phase 2 two-identity
   refresh/replay/isolation/owner continuity independent of the completed Haiku Phase 1.
   Actual Hub LIVE linking remains the **Hub's** responsibility.

**Disposition:** PARTIAL; complete provider coverage, Sonnet Phase 2 and latest
licensing source live proof are **PENDING**. No release, owner-credential changes,
Google writes, paid actions, public enrollment or Hub changes were performed.
