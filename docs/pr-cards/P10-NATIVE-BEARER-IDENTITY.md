# P10 native MCP/RTC bearer identity correction

Owner universal identity directive, 2026-10-21. Existing P10-3/P10-4 native transport correction;
zero new whole subsections or bundle credit; preserve current v1 gate and Windows/browser work.

Frozen outcome: native MCP and RTC gateway must accept case-insensitive HTTP Bearer scheme names
and horizontal whitespace while preserving exact credential bytes and principal markers. Apply
one pure parser to both actual routes. Missing/malformed headers fail closed; p10-prefixed tokens
never reach legacy owner lookup. No developer credential or global account fallback.

Proof: grammar/case/byte-preservation tests and actual route principal/owner denial matrix,
with existing P10 OAuth/provider/credential tests and complete required source CI. Do not mistake
these fake-route tests for new live multi-user/client/provider acceptance. Existing 36/4 ledger
and explicit pilot dispatch, owner migration, production/provider and release gates remain.

Explicit organizational roles are developer/operator, independently scoped product administrator,
and ordinary production user including Robinson's own business. Email/domain membership alone
never grants administration or a development-only product profile. Existing P10/P11-2/3/5 retain
complete tenant/role/credential and account switching acceptance beyond this protocol correction.
