# User authority and parallel Google sign-in — implementation contract

Status: DESIGN READY / NOT IMPLEMENTED. Owner requested this plan on October16,2026 Denver.
Baseline: main/live `6b87ebbde9e43cebf5a7a951b2271bc35a39c3b0`.
Authority: docs/END-USER-AUTHORITY.md and TASKS.md P9/P10; this document supplies the concrete implementation details. Concurrent owner-policy commit d70e474 is integrated; its product/developer distinction controls.
Routine implementer: Sol 5.6, medium effort for authorization/SQL/credentials; light only for mechanical documentation. No model must invent product policy or weaken an existing guard to make a test pass.

## 1. Owner decisions and exact scope

The owner's development-agent restrictions (no unapproved spending, approved fixtures only, temporary read-only TEST grants, hosting limits) govern IMPLEMENTATION AND ACCEPTANCE. They are not permanent prohibitions on an end user's authorized operations.

Product rule: expose supported Google capabilities within the authenticated user's actual Google permissions and selected connection scope. Explain charge/security/destructive consequences, request meaningful approval, then support execution. No hardcoded developer spending ceiling, privileged-owner-only tool access, or blanket TEST-only product restriction. User-selected read-only/area limits remain real authorization; asking a tool to exceed them does not upgrade a token. Offer an explicit reconnect/change-permissions flow instead. Google API/edition/admin-role limits remain provider requirements, not defects to bypass. Money transfer and a billable API operation are distinct; audit RTC money semantics before changing flags.

Deliver two related outcomes, in order: P9 corrects policy/operation dead ends for the working single-owner product; P10 adds independent users alongside that product. Keep `/api/mcp`, existing owner sign-in, encrypted Google grants, existing connector tokens and existing scoped Hub grant usable throughout. Do not rebuild provider tools or introduce subscriptions, billing, organization teams, a new provider, or blanket service-account impersonation.

This planning PR authorizes no real Google mutation, paid test, new scope, public enrollment, credential change, release or legacy-login retirement. Implementation follows the listed cards when requested. Source work and synthetic tests need no repeated general design approval. Runtime activation and provider operations keep their actual user/owner gates.

## 2. Verified current seams (read once before editing)

| Seam | Current observation | Required disposition |
| --- | --- | --- |
| `src/tools/guards-admin.js`, licensing guards | Individual assignment/SKU changes warn about possible billing and accept confirmation | Reuse the guarded child, readback and audit; no duplicate raw Google handler |
| `src/tools/bulk.js`, `denial()` | Assign/change always return `independent_spending_approval_required`; there is no approval argument | Replace unreachable approval with warning + exact-request cost acknowledgment, not removal of all confirmation |
| `src/rtc/pass-options.js` | `forHub && allowWrites` always refuses; every issuance is TEST/account-allowlisted | Preserve existing TEST grant behavior; add separately authorized normal-use connections |
| `api/rtc-gateway.js`, `src/rtc/openapi.js` | Manifest/schema/envelopes advertise only `test` | Normal-use mode must be genuinely enforced end-to-end and announced truthfully |
| `api/oauth/authorize.js` | One ADMIN_PASSPHRASE; global mailbox list before authentication | Keep owner access, but require owner authentication before showing owner mailboxes; public users see only their own accounts |
| `api/google/authorize.js`, callback, `google-setup-state.js` | Owner-protected Google enrollment; setup state signed with encryption key | Leave legacy callback usable; new public transactions use separate state/nonce/key domain and callback |
| `src/db.js`, `google_accounts` | Global email primary key/default account and token functions | V2 scoped account store; public requests never fall back to global email/default |
| `accounts.js`, `guards.js`, `guards-admin.js`, `business-resources.js` | Direct imports of global account/connection/resource functions | Refactor all caller and guard before/after paths to scoped repositories before public dispatch is enabled |
| `src/auth/google-auth-hosted.js`, `service-account.js`, `delegated.js` | Server-wide delegated service-account settings | Owner-only legacy credentials; never attach them to another user's clients |
| `src/developer/*`, `src/tools/dev-*`, RTC results and change log | Connection ownership exists but not an independent public principal | Principal + connection ownership in every lookup, refresh, result, audit and fixture operation |

## 3. P9 execution contracts

### P9-1 — classify policy and correct the authority boundary

Inventory runtime denials, environment switches, metadata, agent-facing messages, profiles, pass issuance, bulk/licensing and relevant docs. Produce `docs/plan/evidence/user-authority-classification.json`: path/symbol, trigger, developer restriction vs user preference vs provider requirement vs security boundary, desired behavior, card, test seam. Include every confirmed hit and bounded search commands; do not claim an all-repository audit. This repo does not own GitHub/Vercel/Stripe MCP policy.

Development budget stays in developer instructions/acceptance runners. Audit `defineWrite`/guard confirmation decisions too: product confirmation follows actual provider requirements and user-selected per-action versus standing delegation policy. Existing development/CI consent remains separate; do not impose a redundant per-action prompt where a user has explicitly granted applicable standing authority. Product limits must have an identifiable owner: provider, connection user, or server operating protection (timeouts/rate limits/response size). Do not erase technical bounds or account isolation as if they were spending policy. Correct runtime text that says a developer grant is the universal production policy. Explain Full vs Everyday vs Read only and allow users to explicitly authorize broader supported access; never silently promote an existing connection.

Acceptance: every actual hard denial classified and mapped; individual licensing previews still warn; read-only and area restrictions still deny; Full native MCP continues to reach guarded supported admin tools; no paid real call needed. Keep original P0–P8 proof as historical acceptance of the original scope.

### P9-2 — usable cost approval for bulk licensing

Files: `src/tools/bulk.js`, assembled registry schemas/descriptions, bulk unit/DB callers and generated catalog. Reuse `licensing_assign_license` / `licensing_update_assignment` guarded child handlers; do not change existing individual behavior merely for symmetry.

Add optional top-level `confirmCost: boolean` and `approvedCostDigest: string` to bulk input normalization/schema. For assign/change, a preview returns a cost notice: may incur charges, exact target count/product/SKUs, estimate status `unknown` unless an authoritative exact-account quote actually exists, and a `requestDigest`. Compute SHA256 over deterministic canonical JSON `{operation,sortedNormalizedTargets,parameters}` including default product and newSkuId; exclude confirmation flags. The same request always yields the same digest. Unknown price must never be represented as zero/free or a fabricated estimate.

For users who choose per-action approval, a real paid-capable bulk operation requires existing `confirm:true`, `confirmCost:true` and exact digest equality. Missing acknowledgment returns `needsCostConfirmation` and a fresh notice/digest with zero writes. Wrong/stale digest returns a neutral refusal and zero writes. A preview remains available without payment acknowledgment; remove unconditional spending refusal before preview. Nonspending operations do not require cost fields; reject cost acknowledgment fields for those operations to catch accidental reuse. Existing target/area/domain/child guards, exact readback, audit, 20-target bound, partial outcomes and no blind replay remain.

Standing delegation is also supported: a server-stored user policy may authorize the exact account/operation/areas and charge exposure without another per-action question. Full profile alone is not standing cost authorization. Build an immutable server-side ActionAuthorization from the actual connection policy; never accept a caller-supplied policy/approval-context object. The shared write guard and child dispatcher may honor that trusted delegation, while explicit per-action policy continues to require the flags/digest. Disclose unknown/unbounded exposure when that delegation is granted; unknown cost is not a blanket product ban. An optional user cap that cannot be verified with available pricing must be respected with a precise request for changed user authorization, not silently bypassed. Preserve the selected approval policy on refresh. Test approved standing delegation, per-action approval, user-denied spending, revoked delegation, unknown-price acceptance and an unverifiable user cap separately.

This is the same agent-mediated user-consent model as existing `confirm`; a digest binds arguments, it does NOT cryptographically prove a human approved. Tool text instructs the agent to obtain the user's actual approval before supplying it. Do not invent an independent secret approval portal or purchase a licence to prove development behavior. If a connection has an explicit user-chosen spend policy, its enforcement is separate and may not be bypassed by acknowledgment.

Tests: dry-run notice/no write; missing confirm; missing/false cost acknowledgment; digest altered by one mailbox/product/SKU; two approved targets call the original child exactly once each; mixed failure/readback/audit failure is truthful; permission/domain/read-only refusal remains; uncertain mutation is not retried. Use captured real API request shapes and original guarded registry fixtures.

### P9-3 — normal-use RTC grants; retain TEST grants

Add `mode:'live'` for ordinary authorized use alongside existing `test`; this is user intent, not a fake Google sandbox. Preserve old pass identities/scopes/mode exactly, including existing Hub TEST read-only grant. Existing TEST issuance/fixture allowlists and revocation behavior remain intact. New live issuance requires authenticated account ownership, explicit selected profile/areas/expiry, and write permission only when the user selects it. The existing `forHub` flag indicates recipient, never an unconditional product read-only ceiling. No user may mint another user's grant or silently convert an old one.

Trace `pass-options.js -> SQL issuance/get/failure -> gateway -> clients -> allowedTool -> wrapped dispatcher -> write receipt/results -> OpenAPI/manifest` together. Also inventory native api/mcp.js and src/oauth/connection-settings.js: native policy currently persists profile/listing/areas without an explicit mode. Preserve existing legacy native behavior; absence of mode is not evidence of TEST enrollment or authority to mint live write credentials. Persist explicit mode for newly selected normal-use/developer grants and copy it unchanged through code/access/refresh paths; an explicit legacy adapter preserves old issued policy without upgrading scope. Remove hardcoded TEST assumptions ONLY on normal-operation branches. Developer fixture tools refuse live before touching Google; ordinary Gmail/Calendar/admin tools work under actual live user authority. Keep short expiry, hashed pass storage, counters, revocation, narrowed permissions, response bounds and guarded writes. Publish an owner authorization form for normal-use passes; no raw token in chat/logs/URLs. Define mode as enum test/live in all applicable schemas and actual identity envelopes.

Cross-repo dependency: Hub independently owns its TEST-only dispatch/consent/SDK support. Workspace can implement and directly test its own live door without Hub; do not require Workspace to discover Hub. Before claiming live Hub writes, have the Hub agent implement and prove equivalent explicit user consent, pass narrowing and write forwarding under its own cards/contract. Include a copy-ready handoff in this plan's P9-3 receipt, citing exact Workspace schema/source; never edit Hub source in a Workspace PR. Do not count the prior read-only D-4 proof as new live-write acceptance. Existing RTC1 permits service-declared live/test modes; incompatible changes require the contract's versioning process rather than silently altering it.

Tests: legacy TEST identity/refresh/revocation unchanged; live Full permitted guarded write; live Read only denied; live fixtures denied; live area denial; new live Hub-scoped grant can hold only user-selected permissions; missing mode/owner malformed refused; OpenAPI/catalog/wire parity. Real tests use harmless existing metadata first; no paid/destructive provider fixtures without separate exact approval.

### P9-4 — capability discovery and operator instructions

Keep catalog independent of developer test grants. Search/describe/dispatch must agree with selected mode/profile/areas. A connection can report that a capability exists but needs reconnect/configuration/provider entitlement, rather than declaring it unsupported. Never advertise an operation as callable then silently reject it under hidden developer-only policy. Cost notices must survive native MCP, RTC aliases, `workspace_call`, batch and bulk summaries. Keep existing budget/field-projection/result-handle behavior. Add an end-user guide and a developer-only testing guide; mark the authority distinction in AGENTS, README, IMPLEMENTER and relevant acceptance cards. Do not change unrelated server source or global provider settings.

Acceptance: table-driven parity for every paid-capable/risky operation found in P9-1; actual assembled schemas and dispatcher; no approval or warning lost in aliases/batching; documented route-specific Hub dependency. P9 remains unfinished until its full native/direct product paths work, even if partial source merges are green.

## 4. P10 target architecture and database contract

V1 is individual users, each with one private principal and any separately proved owned Google mailboxes. No shared team membership or email-domain-based automatic tenancy. Same Google subject signs back into the same principal. Extra mailbox linking requires both the existing principal session and fresh Google proof; never move another principal's mailbox just by knowing an email.

Choose additive V2 tables, not a destructive rewrite of global `google_accounts`:

| Table | Required keys/data and invariants |
| --- | --- |
| `principals` | UUID id, kind legacy_owner/user, status active/deleting/revoked, timestamps; exactly one legacy owner provisioned explicitly, never first public visitor |
| `principal_google_identities` | issuer + Google sub unique, principal FK, verified email display metadata; stable identity is issuer/sub, not email or hd |
| `principal_google_accounts` | UUID account_id, principal FK, verified issuer/sub, email/label/scopes, encrypted grant, token version, refresh/backfill evidence; unique issuer/sub ownership; account selection is by owned opaque account_id |
| `principal_defaults` | principal PK, owned default_account_id with composite FK, never one global default |
| `user_sessions` | hashed random session token, principal FK, expiry, revoked_at; Secure HttpOnly SameSite=Lax cookie, CSRF binding for changes |
| `user_oauth_transactions` | hashed random state, purpose login/link/mcp_authorize, nonce hash, browser-cookie binding, principal when linking, exact registered client/redirect/MCP PKCE reference, provider PKCE verifier encrypted, expiry, consumed_at; single-use SQL consume |
| `principal_oauth_codes` | hashed code, principal/account/client/resource/redirect/profile/areas/mode, S256 challenge, expiry, consumed_at; exact one-time exchange |
| `principal_connections` | UUID, principal/account/client/resource binding, immutable selected policy, hashed access/refresh secrets, family/version, expiry/revocation; atomic refresh rotation and family replay refusal |
| `principal_delegations` | principal + verified Workspace customer, encrypted independently supplied credential reference, explicit scopes/subject rules, enabled/revoked state; no global credential fallback |

For `rtc_passes`, `rtc_results`, change-log rows, business resources, dev-run/object/step ledgers and rate counters, add principal/account/connection bindings and composite foreign keys or introduce scoped V2 equivalents where legacy uniqueness would collide. Each migration lists actual preexisting keys, null backfill and index order before SQL. Never add a public-request default to the legacy owner. Historical NULL ownership is accessible ONLY through the explicit legacy-owner adapter until audited backfill completes. All old rows are this installation owner's; still verify counts and no unknown rows before backfill. Never infer ownership from `business`, email suffix, a supplied actor/account ID, or a caller-selected principal.

`AuthContext` built only from verified server-side credentials:
`{principalId, principalKind, accountId, connectionId, mode, profile, areas, listing, resource}`.
Freeze it; tool arguments cannot replace it. `ScopedStore(authContext)` is the only V2 storage API: every query predicates principal and relevant account/connection; no optional owner field or fallback. An explicit legacy adapter preserves old exports for owner credentials. Route new users only to the scoped store. No implicit global/default Google account in public code paths. Export a finite interface and inject it into clients so guard before/after, account tools and helpers cannot bypass it by importing global db functions.

Encrypt grants under existing TOKEN_ENCRYPTION_KEY without changing that key. Bind V2 encrypted envelopes to principal/account via authenticated additional data (add a versioned crypto helper; do not reinterpret old ciphertext). Existing encrypted-only mode remains active; zero plaintext fallback/new plaintext persistence. Refresh writes use account token-version CAS and preserve refresh tokens on access-token-only responses. SQL and HTTP tests exercise two separate server instances.

## 5. P10 login, compatibility and ownership flows

### P10-1 — scoped storage and owner compatibility adapter

Implement schema/stores/context above with new sign-in disabled. Backfill an explicit legacy-owner principal id; map current owner token/account rows, preserve current stored bearer bytes and legacy token refresh semantics. A server-side exact legacy-row lookup grants legacy-owner context; an unrecognized token or absence of principal never does. Public tokens use a distinct recognizable format and cannot be interpreted as legacy. Keep existing owner connection settings and existing Hub TEST grant exactly as issued. No re-encryption/key rotation or owner logout required. Inventory every DB import/caller from section2, including indirect guarded before/after callbacks and owner tools.

Tests: old database upgrade twice, counts and encrypted bytes preserved, old bearer/read/refresh/deny paths work; forged V2/unknown token cannot select legacy; principal+account foreign references fail; concurrent refresh CAS; malformed ownership fails closed without damaging old rows. No P10 public request dispatch until P10-4 proof passes.

### P10-2 — Google identity and separate provider grant linking

Reuse the installed Google OAuth SDK (`google.auth.OAuth2`) and its verified ID-token API, not hand-decoded JWTs. Keep legacy GOOGLE_OAUTH_CLIENT_ID/SECRET and its Google project/consent screen unchanged. New public auth uses a separate factory and PUBLIC_GOOGLE_OAUTH_CLIENT_ID/SECRET from a separate Google Cloud project/consent screen, plus a distinct callback; never fall back to legacy client credentials when public configuration is missing. Public verification/testing-mode changes must not disturb the owner app. New public credentials/project creation are separately configured deployment prerequisites, not actions performed by this plan. New routes `/api/auth/google/start`, `/api/auth/google/callback`, `/api/auth/session`, `/api/auth/logout`; existing `/api/google/authorize` and callback remain owner-compatible. Register the new exact callback independently; don't replace the old one.

Initial sign-in requests openid/email/profile only. Store durable transaction/state/nonce/browser binding before redirect, use S256 provider PKCE; validate issuer, audience, expiry, nonce and email_verified from verified Google ID token. `sub` is identity; an hd claim or typed email does not grant an organization. Session creation follows one successful transactional consume. Invalid/replayed/expired/mismatched browser/client/nonce/issuer callbacks cause no grant write or tenant reassignment. No tokens in URLs/HTML/storage/logs; codes only in protocol redirects and never logged.

Provider access is a separate authenticated Link Google account operation using incremental, capability-relevant scope groups. Save only after the actual returned account identity and transaction principal match. Consent refusal preserves existing grants/settings. Same subject already owned by another principal is not transferred. Reserve existing legacy mailboxes from public auto-enrollment; reveal no owner mailbox list. Their migration uses P10-7 with owner proof. Do not call Gmail merely to identify a user who granted only basic login scopes; use the verified OIDC identity. Refresh only grants actually issued, preserve omitted refresh tokens, and keep Google and MCP credentials distinct.

Flags: `PUBLIC_SIGNIN_MODE=off|pilot|public` default off; pilot admits only server-configured verified subjects after Google proof, not an untrusted email hint; `LEGACY_OWNER_SIGNIN_ENABLED=true` stays default. Off stops new public enrollment, not arbitrary deletion or revocation of existing user tokens. Emergency revoke is an explicit separate operator action, scoped and audited.

Tests: realistic two-user OIDC/token responses and JWKS-verification adapter; missing/incorrect audience/issuer/nonce/sub/verified email; replay and login CSRF; duplicate callback race; incremental consent failure; refresh-token omission; no owner/global account lookup. Provider keys/Google SDK behavior are verified against current official docs before fixture construction.

### P10-3 — MCP authorization and account/session management

`/api/oauth/authorize` becomes a neutral choice/resume page: existing owner login or Google sign-in. The legacy owner must authenticate before selecting/listing owner mailboxes; preserve registered MCP client/redirect/state/challenge throughout both flows. V2 authorization shows only the signed-in principal's accounts, requested permissions, client identity and consequences. Exact registered redirects, S256 PKCE, intended MCP resource/audience and one-time code consume are mandatory. No Google access token is returned to ChatGPT/Claude, and no MCP bearer is sent to Google.

`/api/oauth/token` recognizes legacy vs V2 codes/refresh records through separate storage adapters. New refresh tokens rotate atomically; preserve policy and principal/account on every refresh; replay cannot issue a new token. Existing issued legacy tokens/refresh remain usable until selected migration/revocation/expiry. Continue to serve original discovery and `/api/mcp`; explicitly test actual supported MCP protocol-version/auth discovery behavior before claiming a specific client's compatibility. Do not assume an untested authorization-draft revision.

Add `/api/account` user portal: own Google links, actual granted scopes/capability status, current agent connections, disconnect/revoke, logout and deletion preview/confirmation. No global account list or prefix-only global revoke. Disconnecting an account revokes only this principal/account's agent connections before disabling its provider grant; no other tenant affected. Account deletion is a recoverable pending state until irreversible removal is separately confirmed; exact deletion/audit retention disclosures must be documented before public launch. Don't promise a provider revocation that was not confirmed or revoke a shared OAuth app grant unintentionally.

Tests: two real HTTP MCP clients in fixtures, exact redirect/resource/PKCE tampering, same code used twice across processes, foreign account selector, forged principal field, refresh reuse/revoked principal, logout vs agent-revoke distinction, existing owner bearer still works concurrently.

### P10-4 — whole-tool and persistence isolation

Before enabling pilot execution, finish all section2 imports and storage-bearing tools. Trace native MCP, RTC, search/describe/meta dispatch, `workspace_call`, batch, bulk, undo, result handles, account/default management, connection list/revoke, business resources, change history, dev fixture ledgers and every guard before/apply/after callback. New user clients must never load global GOOGLE_SERVICE_ACCOUNT_JSON, global default account, owner business-resource configuration or owner grant. Use explicit scoped clients/dependency injection, not mutable process globals or a caller-provided tenant id.

Build a machine-readable caller matrix for every storage/client constructor and prove coverage; a grep alone is not proof. Seed owner plus userA/userB with overlapping resource names and adversarial foreign ids/prefixes. Positive actions/readbacks remain within A; B/owner lookups return the same not-found/permission shape as nonexistent objects; provider client construction and writes remain zero for refused requests. Cached client/result/rate keys include principal/account and credential version. Test parallel requests on warmed instances to detect cross-request leakage. Scope undo to originating principal/account and recorded exact change, not global change id.

Required real disposable-Postgres tests: cross-principal SQL denial, refresh races, result pagination ownership, account/default/list/revoke, change/undo visibility, dev-run ownership and rate counters on two processes. Schema and unit tests alone do not satisfy this card. Existing owner request matrix must stay green. Rollout cannot bypass this gate by labeling it external acceptance.

### P10-5 — per-customer privileged capabilities and truthful availability

Public Gmail users use only their Google OAuth rights. Workspace admin operations require that user's real admin rights, scopes and edition. Preserve existing provider tools rather than deleting them for ordinary Gmail accounts. Delegation must be configured independently by an authorized customer administrator and tied to the authenticated principal/verified Workspace customer; public users never inherit the installation owner's delegated service account. Explicit scope/subject and encrypted credential lifecycle, disconnect and revocation are required. Use a protected credential-entry flow; never ask for JSON private keys in chat or put them in command arguments/logs.

Keep current owner's delegation running through legacy-owner adapter. Supply tenant-specific delegated client builders and update Alert Center, delegated Gmail/Calendar/Drive and dev-readiness callers. No domain ownership inference from email/hd alone; independently validate applicable Workspace administrator/customer authorization. Missing configuration returns precise capability remediation and permits other OAuth-based tools to work. An optional capability lacking provider entitlement is not a global login blocker.

Tests: owner delegated client still works in fixtures; A's customer/key never used by B; missing/revoked credential/subject/scope/customer refused before provider use; exact SDK request shapes/readback retained; no global-secret fallback in any public dispatch. Real organization delegation/public key provisioning is an external activation gate; synthetic/source proof must not be called a real admin approval.

### P10-6 — pilot acceptance and public publication readiness

Run off -> pilot -> public. First deploy with public off and unchanged owner login. Verify old owner/native/Hub metadata reads before and after each relevant release; no recreate/delete of historical fixtures or reactivation of retired TEST relay. Then use two separately owner-authorized disposable Google identities (ordinary Gmail and Workspace admin when available), with owned exact resources and cleanup. Confirm actual client login, authorized reads and one reversible approved write, revocation, wrong-account denial and owner continuity. Missing Google permission/paid entitlement blocks only its named test; finish all developer-contract/isolation work independently.

Prepare public application identity, verified domains, privacy/support/delete-account information, incremental scope inventory and Google's applicable sensitive/restricted-scope verification. Record what Google actually requires for this deployment, exception eligibility and any assessed paid review; do not buy subscriptions, pay an assessor or submit binding agreements under this design. Testing/pilot state and external Google approval are not arbitrary internal permanent product prohibitions. Public flag remains off until real publication requirements and isolated auth acceptance are met. Preserve a normal end-user cost-approval path; developer test budget stays separate.

Required receipt matrix: source SHA, deployment, client, old/new login, user A/B/owner, selected profile/mode/scopes, original test, observed result, revocation, cleanup and actual provider/configuration limits. Seed release-acceptance rows only when their implementing source exists, pinned to that source; never use this planning SHA as evidence of implemented auth. Retain original29 passed tasks unchanged, add separate new-scope acceptance. A database fixture or standard external connector is not proof of this custom MCP.

### P10-7 — owner migration; optional legacy-login retirement

First deliver migration tooling and dual-login recovery; retirement is a separately chosen runtime action, not a scheduled date or automatic consequence of Google sign-in. While authenticated through existing owner passphrase, start a fresh Google proof transaction to link selected verified issuer/sub to the explicit legacy-owner principal. Never claim existing account ownership by email alone, first login, or administrator hostname. Display exact affected connections/accounts, preserve existing encrypted grants and permissions, and verify old AND new auth before enabling the new owner login.

Existing bearer connections remain mapped to owner without reissue; explicit user-selected reconnect/revoke only. Keep legacy callback/refresh compatibility until all active owner connections are accounted for. Snapshot encrypted data and reversible migration mapping; dry-run counts and independent post-readback required. Changing flags never restores plaintext or old insecure schema. Turn off legacy NEW sign-in only after the owner explicitly chooses retirement and both login/recovery paths are demonstrated. Existing old connector tokens are not silently revoked. Keep rollback as dual-login forward-compatible code, not a plaintext-only historical deployment. Public launch does not depend on retiring owner login.

Acceptance: old owner continues during two-user pilot, verified-sub owner linkage cannot be stolen, migration twice idempotent, foreign subject and stale proof denied, compatible rollback preserves both principals, retirement off/on behavior and retained old bearer policies proved; real owner retirement remains unexecuted without its specific approval.

## 6. Sequencing and delivery boundaries for Sol 5.6

| Outcome | Whole existing subsections | Dependency / complete deliverable |
| --- | --- | --- |
| A: user-authorized capabilities | P9-1..P9-4 | Classification plus working cost-approval/direct-normal-use/discovery parity. Hub live integration remains an exact companion dependency, not hidden as complete. |
| B: dual identity foundation | P10-1..P10-3 | Owner-compatible SQL/stores, real new identity transaction, complete MCP authorization/session flow, flags off. No pilot dispatch until C isolation passes. |
| C: isolated usable users | P10-4..P10-5 | Whole-tool/DB isolation and per-customer delegation with truthful capability availability. Retain old owner use. |
| D: prove, publish, migrate | P10-6..P10-7 | Two-user custom-MCP acceptance/public requirements, owner migration tooling and explicit optional retirement. |

These are useful grouping recommendations, not quotas or a reason to truncate work. One card is a predefined batch subsection; functions/routes/test helpers are tasks inside it. Keep original full criteria; build a coherent end-to-end outcome before broad CI. Use focused existing tests while editing; one assembled full check/unit/DB/RTC cycle before publication, then mandatory exact-head checks/review. No speculative tests that only mirror a helper; prioritize actual caller -> scoped store -> provider -> response and adversarial two-principal contracts. Don't claim source scaffolding, flags or counts as usable authentication.

Implementation entry: read AGENTS -> SESSION-START -> TASKS current P9/P10 rows -> this contract -> listed seams. Freeze the chosen whole-subsection scope with the existing session:bundle workflow before code. At end, record implemented vs live vs actually provider-accepted and exact remaining criteria. Do not request the same policy design decision again; investigate source/Google facts and isolate genuine new external permission/cost decisions only.

## 7. Reference contracts reviewed for this design

Primary references; implementer must recheck the applicable current versions at the actual SDK/protocol seam. No legal/compliance certification is implied.

- Google OIDC identity/ID-token validation and stable subject: https://developers.google.com/identity/openid-connect/openid-connect
- Google server OAuth, state, offline access and incremental authorization: https://developers.google.com/identity/protocols/oauth2/web-server
- Google OAuth application policies: https://developers.google.com/identity/protocols/oauth2/policies
- Restricted scope publication requirements/possible assessment: https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
- MCP authorization resource/audience/PKCE boundaries (versioned baseline, recheck client compatibility): https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
- Local original Hub RTC contract: `docs/CONTRACT.md` in Robinson-AI-Systems/robinsons-toolkit-hub. Workspace doesn't own unilateral Hub dispatch changes.

## 8. Companion Hub handoff (copy-ready after Workspace P9-3 has a checked schema)

Implement the Hub-owned part of end-user authority in Robinson-AI-Systems/robinsons-toolkit-hub. Read its AGENTS, docs/END-USER-AUTHORITY.md if present, original RTC contract and current owner decisions. Development TEST/read-only/$0 restrictions are developer operating policy, not a permanent product ban. Preserve the already working Workspace TEST grant and its acceptance receipts. Consume Workspace's exact P9-3 live/test schema and selected profile/area/write policy; require explicit user connection consent, never silently upgrade an existing read-only grant. Audit Hub's own dispatch/alias/tool metadata/CLI/relay/SDK guards for blanket TEST-only/refusal paths and implement supported authorized normal use, with full original provider confirmation, cost notices, narrowing, audit/results and revocation semantics. No Workspace->Hub discovery or provider credentials in Hub. Test both retained TEST/read-only denials and approved live guarded execution through original doors; provider writes/paid resources still need exact development-test approval. Do not report read-only D-4 as live-write acceptance. Publish exact source/contracts/route-specific proof and remaining original gates; don't rebuild the known-good connection or alter another server's source. Workspace agent supplies its actual implementing commit and schemas before this handoff is executed.
