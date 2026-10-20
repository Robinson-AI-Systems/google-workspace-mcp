# Provider API coverage standard — no silent gaps

**Approved staged release policy (October 19, 2026):** [v1 early production](plan/V1-RELEASE-GATE.md) can be accepted and released for its explicitly advertised and independently verified capabilities without finishing every Google API method first. Exhaustive current public API coverage remains an active, REQUIRED product roadmap objective **after v1**, not silently excluded, replaced with console guidance or marked PASSED. Missing methods must remain tracked and implemented/tested in continuing coverage releases. Do not advertise unimplemented or unverified capability in v1. All security, consent, provider authority, client compatibility, billing and independently checked production requirements for v1 still apply.


Owner decision (2026-10-19): Every custom Robinson AI Systems MCP server aims at **complete coverage of its connected provider's publicly supported operations**. A convenience subset is not completion. APIs may differ in authorization models, paid entitlements and providers: these are distinct **implementation boundaries**, not exemptions from recording outstanding coverage. Do not claim **full method-parity coverage completion** until the canonical API inventory is reconciled and real, appropriately authorized acceptance is recorded for each operation or an independently documented non-API provider restriction. This is distinct from **v1 early-release readiness**. Keep developer-agent release/spending policies distinct from legitimate end-user privileges and approvals.

## Required ongoing inventory method

For **every Google Workspace API supported by this service**, inventory Google's current discovery/REST reference by version/resource/method, map each supported method to a real native MCP tool or a reviewed semantically equivalent complete operation, and label any missing method with a real roadmap task. Include all read/list/create/update/patch/delete variants, pagination, async status, search, export and bulk operations; do not confuse an internal helper or an Admin Console link with a remotely callable tool. Re-evaluate when Google releases API changes. Distinguish code+tests, shipped READY exact revision, Google scope, customer license/role/DWD, and real positive/negative provider testing. “Unavailable to this one test account” is not “impossible for the product.” No end-user feature is disabled just because the coding agent cannot afford or is unauthorized to test it.

## Google Tasks API v1 — current source coverage (release/provider pending)

References: [tasks list methods](https://developers.google.com/workspace/tasks/reference/rest/v1/tasks), [tasklists list methods](https://developers.google.com/workspace/tasks/reference/rest/v1/tasklists), and the official [move](https://developers.google.com/workspace/tasks/reference/rest/v1/tasks/move) contract. These are separate from Google Tasks user-owned OAuth scope grants or completed Stage 2 pilot identity acceptance.

| Google REST method | Native MCP method | Source state |
| --- | --- | --- |
| tasklists.delete | `tasks_delete_tasklist` | Existing guarded |
| tasklists.get | `tasks_get_tasklist` | Existing read |
| tasklists.insert | `tasks_create_tasklist` | Existing guarded |
| tasklists.list | `tasks_list_tasklists` | Source extension: bounds and cursor |
| tasklists.patch | `tasks_update_tasklist` | Existing guarded PATCH |
| tasklists.update (PUT) | `tasks_replace_tasklist` | Source addition; preview/confirm/readback |
| tasks.clear | `tasks_clear_completed` | Existing guarded |
| tasks.delete | `tasks_delete_task` | Existing guarded |
| tasks.get | `tasks_get_task` | Existing read |
| tasks.insert | `tasks_create_task` | Source extension: parent/previous |
| tasks.list | `tasks_list_tasks` | Source extension: bounded cursor and all Google v1 filters |
| tasks.move | `tasks_move_task` | Source addition: POST parent/previous/destination |
| tasks.patch | `tasks_update_task` | Existing guarded PATCH |
| tasks.update (PUT) | `tasks_replace_task` | Source addition; explicit replacement/confirm/readback |

**Status:** 14/14 current published REST method *source mappings* in merged PR #236, with required exact-head and merged-main CI successful; new methods are **not on the observed READY live revision** and no Google user write for newly added methods is claimed. Actual proof requires exact-head check/review, merge, checked READY source deployment and scoped provider acceptance. The former 11-tool server is still production until independently verified release. A complete page preserves the old flat-array response; a partial page or explicit page request returns `{items,nextPageToken,complete}`; callers must consume every cursor to claim a full list. New write verbs remain denied in read_only profile. No other Google Workspace API families were certified by this Tasks pass.

## Google Workspace Enterprise License Manager (licensing.googleapis.com) — v1

Reference: https://developers.google.com/workspace/admin/licensing/reference/rest

| Google v1 licenseAssignments method | Independent MCP tool | Release / provider proof |
| --- | --- | --- |
| `listForProduct` | `licensing_list_product_assignments` | Merged PR #233; standalone tool not yet deployed/read on LIVE |
| `listForProductAndSku` | `licensing_list_assignments` (backward compatible page opt-in) | Existing tool; cursor extension merged in #233 but not yet deployed |
| `get` | `licensing_get_assignment` | Existing; requires Google admin authority |
| `insert` | `licensing_assign_license` | Existing guarded write; paid mutation untested without exact independent approval |
| `patch` | `licensing_update_assignment` | Existing guarded write; paid mutation untested without exact independent approval |
| `update` (PUT) | `licensing_replace_assignment` | Merged PR #233; guarded billable PUT, not deployed or executed; live mutation needs separate approval |
| `delete` | `licensing_remove_license` | Existing guarded destructive write; LIVE revoke untested without exact approval |

**Note:** `workspace_plan_summary` already calls `listForProduct` internally to calculate product/SKU counts, but an internal helper is **not** complete user-facing API coverage. This inventory specifically corrects that missing native tool. Lists must preserve Google pagination and customer-wide read consent. All Workspace license assignment calls require Google's **Enterprise License Manager API** to be enabled at the actual user OAuth project, with the customer's own Google licensing/admin authority. An October 19 real owner-connected Google read verified the prior deployed `listForProduct` composite and `listForProductAndSku` native route succeed for the authorized customer's existing subscription, so the old assertion that this API is disabled is superseded. This is **not** a seven-method live acceptance: the two new standalone operations, paging extension, tenant negatives and paid PUT are not yet on the serving revision. See [sanitized provider receipt](plan/evidence/2026-10-19-live-enterprise-licensing-read.json).

## Google Cloud License Manager (licensemanager.googleapis.com) — separate provider, OPEN

Reference: https://docs.cloud.google.com/compute/docs/licensemanager/rest

Google Cloud License Manager manages **third-party Google Cloud VM licensing**, not Google Workspace user assignments. Its API is controlled by Google Cloud project/IAM/cloud-platform grants and potentially billable resource configurations. **Enabling this API does not authorize using a Google Workspace user's OAuth refresh token to act on a Cloud project**. This is independently scoped Google Cloud provider work: connect a customer-authorized Google Cloud principal, bind to exactly selected projects/locations, honor IAM, cost and resource mutation approval, record long-running operation state, and test only self-owned reversible fixtures. Do not route its calls through an owner-only static service account.

| Google Cloud v1 resource | Public methods requiring independent MCP implementation |
| --- | --- |
| `projects.locations` | `get`, `list` |
| `projects.locations.configurations` | `aggregateUsage`, `create`, `deactivate`, `delete`, `get`, `list`, `patch`, `queryLicenseUsage`, `reactivate` |
| `projects.locations.instances` | `get`, `list` |
| `projects.locations.operations` | `cancel`, `delete`, `get`, `list` |
| `projects.locations.products` | `get`, `list` |

**Coverage: 0/19 methods implemented for this Google Cloud API in this Google Workspace server. This remains a tracked OPEN integration responsibility, not a falsely certified Workspace Enterprise License Manager gap closure.** The owning Google Cloud integration must implement all 19 in one separate provider bundle with actual Cloud IAM/tenant/project ownership, pagination, async LROs and paid-action gates. This server must remain independently connectable for the Workspace APIs it owns. The Robinson AI Systems portfolio-wide coverage registry should track cross-service ownership and ensure this API cannot go unowned.

## Full API method-parity completion gate (continuing post-v1 work)

A nominal count of >380 tools does **not** establish that every supported Google Workspace API method exists. Full API coverage certification requires:

1. A current canonical per-provider REST/Discovery operation inventory with mapping/coverage state and owner product-scope decisions.
2. Source implementation and contract tests for every in-scope public operation, with existing operation identifiers preserved and explicit pagination/error behavior.
3. Real eligible independent user/client/provider acceptance, including negative access, refresh/revoke, readback/cleanup and customer-specific admin/config provider constraints.
4. A durable queue for operations that require a different user/license/Google review or integration credentials; blocked != passed.
5. A checked source, reviewed PR, main CI, compliant release and exact-source READY production match; never claim live success from un-deployed source.
