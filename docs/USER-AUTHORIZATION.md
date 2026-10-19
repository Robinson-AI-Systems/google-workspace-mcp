# Authorize an agent for Google Workspace operations

This independent Workspace MCP allows a **connected user's** authorized agent to use supported Google APIs, not merely development TEST fixtures. Approval and Google entitlement are distinct: a full permission profile is not a guarantee of a Google admin role, OAuth scope, Workspace edition or unrestricted spending consent.

## Existing owner login and native MCP

Connect through the existing native MCP OAuth door. The owner chooses the already-connected mailbox, **Read only**, **Everyday** or **Full**, and optional allowed tool areas. The ordinary owner sign-in and existing saved connectors continue to work; an old token with no explicit mode remains a legacy owner connection and is never upgraded silently. New native connections select live mode; OAuth refresh copies the stored profile, areas, mode, and billing policy, not a new default.

To discover supported capabilities outside your current grant without invoking them, set `includeUnavailable:true` on `workspace_search_tools` or `workspace_describe_tool`, or `showUnavailable=true` on the authenticated RTC catalog/description GET. Such entries are marked `available:false` and `needsReconnect:true`; they are never executable until the user selects a broader grant. The catalog cannot promise that Google's provider edition or OAuth scopes support the operation.

Read only permits supported reads; Everyday permits routine writes in enabled areas while withholding high-impact admin areas; Full adds guarded high-impact operations in selected areas. Neither a profile nor a supplied argument grants a Google role, new OAuth scope or extra domain permission. Reconnect/reauthorize deliberately if broader permissions are needed. A tool denied by the existing account/area grant is not secretly unsupported.

## Independently issued HTTPS RTC pass

The owner can open `/api/rtc/passes` at the canonical service URL and authenticate with **this Workspace service's** `ADMIN_PASSPHRASE`, not the Hub's credentials. The default **TEST** selection is restricted to approved development accounts, including the existing useful Hub TEST read-only pass. To use real connected Google accounts, explicitly select **live**, the desired profile, actual areas and expiry; check the write-authorization box and repeat the exact account when choosing Everyday or Full. Store the one-time bearer only in protected agent connection settings. Never paste it into a chat, URL, issue or log. Revocation/expiry remains available.

The `for_hub` setting describes who receives the pass; it does **not** mean the live user is forever read-only. However, Hub must independently support consent/policy forwarding for live writes; successful direct Workspace live support alone does not prove that Hub live writes work. Workspace does not discover Hub.

## Licenses and billing approval

Assigning licenses or changing SKUs may incur Google charges that the Licensing API **cannot quote reliably** for an individual contract. Price status is `unknown`, not free. Individual licensing changes still use their existing guarded per-tool confirmations; bulk licensing supports these options:

- **Per action (default)**: call `workspace_bulk_operation` with `dryRun:true`. Review exact target mailboxes, product/SKUs, a cost notice and `requestDigest`. Ask the user to approve potential unknown charges. Then call the exact same arguments with `confirm:true`, `confirmCost:true` and `approvedCostDigest` equal to the preview digest. Changed targets/SKUs invalidate this consent.
- **Deny billing-risk bulk operations**: explicitly choose that policy at login/grant time. The agent must request a new user authorization instead of silently overriding it.
- **Standing delegation**: on a new **Full** connection with the **admin** area, the user may specifically select assignments, SKU changes or both and acknowledge the unknown/unbounded charge exposure. This is stored server-side against the authenticated Google account. It does not enable unrelated operations. Revoking the connection revokes its delegation.

A per-action digest binds arguments; it is not cryptographic proof the human granted approval. Agents should ask the actual user rather than inferring it. Unknown prices do not block an informed approval, but a user-selected finite cap **cannot** be enforced without a verified account-specific price and therefore must fail closed. The agent cannot override the cap or authorization through a tool argument.

## After execution

Inspect every target's result, exact Google readback, confirmation status and audit receipt. If a provider request has an uncertain outcome, reconcile first; do not retry a potentially applied operation automatically. Read-only/area/domain/Google API refusals are real security or provider boundaries. A green HTTP status by itself does not prove a requested Google change completed.

## Encrypted read-only runner issuance

The reviewed encrypted issuance path `/api/developer/test-pass-issue` also supports an explicit `mode: live` request. Its historical path/export names are retained for compatibility. TEST remains the default, with its original 24-hour/enrollment rules. LIVE is one hour, read-only, exact selected mailbox/areas, 120 calls/minute, no Hub, no writes and billing denied. These fixed bounds describe this disposable runner helper; the ordinary owner pass form still supports the product's complete live profiles and chosen policies.

Use `scripts/issue-encrypted-test-pass.mjs start|poll` in a private directory, with protected `RTC_ORIGIN`, `RTC_EXPECTED_REVISION`, `RTC_EXPECTED_ACCOUNT`, `RTC_APPROVED_AREAS`, `RTC_HANDOFF_FILE`, `RTC_PASS_OUTPUT_FILE`, and explicit `RTC_PASS_MODE=live`. The owner sees the immutable LIVE scope and one-hour expiry before submitting this service's owner passphrase. Only the registered RSA/poll-secret-owning runner retrieves ciphertext; no plaintext pass appears in the browser or chat. The runner verifies exact source/account/mode/profile/areas/write refusal before a new mode0600 output file. Failed/duplicate approval cannot mint an orphan or second pass. No provider operation runs automatically. Verify actual read/denial/revocation independently; source tests are not live acceptance. Release and individual live-pass approval remain required before production use.
