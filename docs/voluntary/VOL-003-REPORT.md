# VOL-003 — Local durable transaction identity implementation

Classification: **VOLUNTARY PRE-SPRINT DEVELOPMENT**, not funded Instaward work.
Date: 2026-10-11, America/Santiago. Branch: `pre-sprint/voluntary-d1`.
Starting HEAD: `6b5eb500126788da780664a045848544a27be894`.
Frozen comparison boundary: `450c21b151a0973064986327f09d55e4f36c43e0`.
Official sprint: NOT STARTED / UNCONFIRMED. Acceptance: **0/23**.

## Owner-approved slices 1–4

The existing StellarService/MockStellarService, HTTP coordinator and immutable
MOCK transport are unchanged. A separate server-only local worker implements
queue → claim → prepare/simulate → authorize → finalize SDK hash → source-sign
→ persist → dispatch intent → observe → project. Only injected LOCAL_FAKE ports
exist; no production Testnet adapter, RPC endpoint or server/HTTP wiring was added.
The prepared body hash uses the SDK Testnet signature base after Soroban auth is
attached and before envelope signing. Signing must leave the body/hash unchanged.
Source signature, contract/method/ordered argument XDR, network, source, sequence,
fee cap, validity and authorization expiry are checked before persistence.

## Local additive private schema

`20261011000100_vol003_private_transport.sql` adds four api_private tables:

- `testnet_work`: immutable logical context, internal status and dispatch count;
  links the existing deployment and Foundation operation. No new browser route.
- `testnet_source_leases`: one network/source slot across deployments, worker,
  generation, created_at and lease_until; fenced mutations reject stale workers.
- `testnet_envelopes`: immutable exact bytes, SDK hash, network/contract/source,
  sequence, context, time/auth bounds, prepared ledger and created_at. Duplicate
  operation/hash/source sequence and UPDATE/DELETE are rejected.
- `testnet_observations`: append-only dispatch intent, RPC/confirmation/state-read
  evidence and projection record. Observation, confirmation and later state-read
  ledgers are separate nullable fields; later state evidence never fabricates a
  transaction confirmation ledger.

All four tables have ENABLE/FORCE RLS, restrictive browser deny and revoked grants.
No SECURITY DEFINER. Tests verify deny even with accidental grants/permissive
policies. The two existing migrations, constraints and role restrictions remain
unchanged. Migration execution was confined to ephemeral local PGlite PostgreSQL;
**no migration or configuration change was applied to Supabase DEV**.

## Durability, concurrency and uncertainty

Every repository transition commits a short SQL transaction. RPC/fake transport,
simulation, signing, validity reads and observations run outside those transactions.
Immutable identity commit precedes durable dispatch intent, which precedes submit.
A failed persistence commit rolls back identity/status and prevents submission.
Restart always checks the original identity first. An on-disk PostgreSQL close/reopen
test confirms exact bytes/hash survive and no new preparation/sign/submit occurs.

One unresolved operation at a time per network/source is deliberately conservative:
an expired/released worker lease does not free unresolved work for another operation,
even across deployments. Generation checks fence persistence and dispatch. There is
no sequence allocator or general source pool.

SUCCESS retains actual confirmation fields supplied by the fixture port before an
atomic SQL-only projector updates Foundation state and the projection marker. A failed
projection rolls back SQL and resumes from retained SUCCESS without another submit.
FAILED is a confirmed chain failure, distinct from RPC outage or missing results.
Timeout/lost response/valid NOT_FOUND remains SUBMITTED_OR_UNKNOWN. After expiry,
authoritative state evidence supplied by the fixture inspector resolves APPLIED,
NOT_APPLIED or UNRESOLVED. Inconclusive expiry stays blocked. NOT_FOUND alone never
proves nonpayment. No replacement API or automatic replacement exists.

Only an explicit reviewed retry can rebroadcast the identical bytes/hash while valid;
it first reconciles and is bounded to one extra dispatch (two attempts total). The
decision identifier is retained privately. A reward identity permanently occupies its
private battery slot, including after confirmed failure/nonapplication; a future
reviewed replacement policy is intentionally not implemented. Foundation still
enforces one successful reward and immutable recipient/request associations.

## Validation

| Check | Result |
| --- | --- |
| Backend TypeScript and existing 59 tests + 28 new VOL-003 tests | 87/87 PASS |
| Original Backend Foundation subset | 50/50 preserved |
| SDK identity/body/network/signature checks | PASS |
| Local migration, immutability, lease/generation, forced RLS | PASS |
| Commit rollback before send; disk reopen/restart | PASS |
| Lost response, NOT_FOUND, outage, confirmed failure | PASS |
| Expiry: applied / not applied / unresolved; no new reward identity | PASS |
| Duplicate worker / same-source across deployments | PASS |
| Projection after SUCCESS / identical-hash bounded retry / reward guards | PASS |
| Existing contract native tests | 20/20 PASS |
| Native tests repeated with wasm-tests + WASM constructor | 20/20 + 1/1 PASS |
| Contract release WASM / fmt / Clippy | PASS |
| VOL-002 Rust signer native tests | 18/18 PASS |
| VOL-002 actual Secure Store OFFLINE signatures, including dual V1/V2 auth | 9/9 PASS |
| VOL-001 local read-only guard tests | 5/5 PASS |
| Existing local Foundation SQL parity suite | 82/82 PASS, rollback, 0 fixtures |
| Existing frontend TypeScript / lint / tests / production build | 33/33 PASS; build PASS |
| Python | 4/4 PASS |
| Existing MOCK demo | REGISTERED → RETURNED → COLLECTED → RECYCLED → SENT, 10 GREEN-TEST |

The 20 repeated contract cases are not 40 distinct cases. Fixture confirmations and
business effects do not prove live Soroban execution. No new live battery/request or
reward was created. Remote HTTP/Supabase DEV suite was not run in this local-only scope.

WASM SHA-256 remains:
`c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6`.
VOL-002 signer executable remains:
`99ef0be4a0a78c97a71facb4fa2bddbe4d9681a67b2d6c76a1cf3acf0fe88729`.
Signer Rust sources, lockfile, behavior and 50,000,000-stroop cap are unchanged.
The contract source diff against the frozen baseline is empty.

## Environment findings and limits

The sandbox denied canonicalizing the linked Rust toolchain and Secure Store process
access. The authorized local checks succeeded outside that sandbox; no Windows
protection or global configuration changed. Parallel PGlite processes plus Next.js
workers produced `Fatal process out of memory: Zone` and a build worker exit
3221226505. Backend test-file concurrency is now 1 in its npm command; suites ran
sequentially afterward. Assertions were not removed or relaxed.

Ignored `.tools/vol003-*` verification logs and synthetic on-disk PostgreSQL fixtures
are local only. No live envelopes, signatures, private keys or credentials are in
Git, Notion, logs or HTTP responses. Synthetic signed fixture envelopes exist only in
memory/the ignored local test database, with obsolete sequence/time bounds.

This is the local architectural seam, not a production adapter or complete Testnet
application cycle. The future real adapter must verify/decode authoritative chain
facts and bind the existing signer; this package leaves that adapter absent and does
not change the approved helper interface. No network restore, TTL extension, deploy,
Mainnet, fee-cap increase or funded criterion change occurred. STOP before VOL-004.

## Evidence and repository control

Updated owner decisions are in `VOL-003-IMPLEMENTATION-PLAN.md`. Code is under
`backend/src/testnet/`; deterministic tests are `backend/tests/testnet-*.test.ts`.
Results and source hashes are in `VOL-003-public-results.json` (no signing material).
Existing Notion Project Plan VOL-003 row, Development Log, Changelog, Tests & Evidence
and Decisions & Risks are the intended record locations; no top-level page is needed.
Git had no persistent author configuration. Commits reuse the existing
`Byetery Local Checkpoint <byetery@localhost>` identity via per-command options;
no repository/global identity configuration changed.
Small local commits preserve VOL-001/002 history; no squash, reset, merge or automatic
push. The frozen tag and its commit remain unchanged. Final commit/status and Notion
verification are reported in the task closure.
