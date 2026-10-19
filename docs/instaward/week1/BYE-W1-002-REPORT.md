# BYETERY BYE-W1-002 REAL TESTNET SERVICE REPORT

Classification: OFFICIAL INSTAWARD SPRINT / FUNDED SPRINT.
Date: 2026-10-19, America/Santiago.
Result: IMPLEMENTED; the authorized first registration and unsigned return
simulation passed. A complete real lifecycle or owner acceptance is not claimed.

## Git and immutable boundaries

Starting HEAD: `869a43bda795a7c708ea8bc8b5991b217938906d`.
Implementation used for the live operation:
`339fec02e500ac765b8ce68bb8a019cd4bcf4ae4`.
Branch: `instaward/d1-testnet-integration`.
Ending evidence HEAD: the commit containing this report; the final handoff gives
its resolved hash after commit/publication, avoiding a self-referential hash.

The historical baseline remains `450c21b151a0973064986327f09d55e4f36c43e0`.
Sprint-start tag remains `349ee3fd78104f3c249b3052b1cca402c9d99ff3`.
No squash, tag move, main merge, contract modification or redeployment.
Protected untracked `tools/sync_obsidian.py` remains unchanged and uncommitted:
SHA-256 `48404b9431a9d955fc4af0b2eeaf9a59bb2fb0e9457eed73b4f2f66132a5e2da`.

## Implementation assessment

| Item | Result / scope |
| --- | --- |
| TestnetStellarService | IMPLEMENTED behind existing StellarService and server processor boundary |
| MOCK preserved | YES; existing demo and all original Foundation cases pass |
| Contract modified | NO |
| WASM unchanged | YES; SHA below |
| RPC adapter | PASS; deterministic boundaries and actual Testnet registration |
| Signer integration | PASS; owner-approved v2 phases, original v1 retained |
| Private key exported | NO |
| Durable persist-before-broadcast | PASS; SQL COMMIT precedes durable intent/send |
| Source single-flight | PASS; local cross-deployment tests and durable real source lease |
| Final sequence recheck | PASS; observed exact prepared sequence before send |
| Recipient binding | PASS in persisted SQL guard tests; live return remains simulation-only |
| Fee cap | PASS; 50,000,000 stroops unchanged; all fees checked before signing |
| Reconciliation | PASS; original-hash uncertainty → confirmed projection; one send |
| Operation-specific resolution | PARTIAL validation: conservative predicates implemented/tested; full live lifecycle/expiry resolution not executed |
| Reward no longer static-only | PASS implementation/tests; receipt + contract state + actual SAC transfer required; no live payment executed |

WASM SHA-256:
`c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6`.

The owner approved the minimal two-phase helper after the initial diagnostic
stop. See [signer review](BYE-W1-002-SIGNER-REVIEW.md). No key, source identity,
contract/method allowlist or cap was broadened. The helper still has no RPC/send.
Two cached transitive libraries became pinned direct helper dependencies; the
contract lockfile and dependency versions were preserved.

## Final verification

| Suite | Result |
| --- | --- |
| Root npm run verify | PASS |
| Rust native | 20/20 |
| Same native cases with wasm-tests feature | 20/20 repeated |
| WASM integration | 1/1 |
| Release wasm32v1-none rebuild, rustfmt, Clippy -D warnings | PASS; identical SHA |
| Backend TypeScript/default suite | PASS; 106/106, including original Foundation 50 |
| New deterministic backend cases | 19/19 |
| Existing Supabase DEV HTTP suite | 43/43 after exact nine-table inventory update |
| Frontend TypeScript/lint/tests/build | PASS; 33/33; no frontend source edits |
| Local PostgreSQL parity | 82/82; rollback, zero remaining parity fixtures |
| Native helper validation | 22/22 |
| Secure Store opt-in offline signing | 18/18, including separate phases and Address/AddressV2 |
| Helper build/rustfmt/Clippy | PASS |
| Python | 4/4 |
| Existing MOCK demo | PASS; REGISTERED → RETURNED → COLLECTED → RECYCLED → SENT |

See [test matrix](BYE-W1-002-TEST-MATRIX.md). The remote test's old table count
expected five, but VOL-003 adds four tables. The fix asserts all nine exact names
and retains all grant/RLS checks; no case was skipped or business rule weakened.
An initial frontend sandbox cache-access failure passed unchanged outside the
sandbox. Early read-only RPC timeouts never caused signing/submission or fallback.

## FIRST LIVE REGISTER

| Field | Observed result |
| --- | --- |
| Executed | YES — exactly one business invocation |
| Application/API initiated | YES; authenticated POST /api/batteries through existing Coordinator |
| Battery ID | BYE-W1-002-64257020134D4A0F |
| Deployment ID | 5c0cad2f-5f25-4216-8068-6cb9d2d26325 |
| Logical operation | 6868cdd0-f4e5-483b-aa80-18e26026dd5a |
| Registration commitment | 8621077f0c87fdccf7bf798954fb1dab133fff790f43344a10ab33e7818b7665 |
| Actual application simulation ledger | 5281386 |
| Resource fee | 406952 stroops |
| Classic inclusion fee | 10000 stroops |
| Total simulated fee | 416952 stroops; below 50000000 |
| Actual feeCharged from confirmed transaction result | 350285 stroops; result code txSuccess |
| Authorization entries | 1 source-account ADMIN requirement |
| Source | GBZ4HNGFYAA7FXRYECY4LBSIKSQPJPUFYJZALOWGTXUURNDR5OINUT2F |
| Prepared source sequence | 20970216477425669 |
| Persisted envelope sequence | 20970216477425670 |
| Final sequence read | 20970216477425669, ledger 5281388; MATCH |
| Source balance at final read | 99953154529 stroops |
| Identity persisted | 2026-10-19T17:22:05.403Z |
| Durable dispatch intent | 2026-10-19T17:22:09.815Z |
| Send response | PENDING, latest ledger 5281388 |
| Transaction hash | ec0f231a61f2c0fa8b1092adae475f6da0f649a2085ee4783fe825ff65b01a27 |
| Actual confirmation ledger | 5281390 |
| Observation ledger retained privately | 5281392 |
| Confirmed SUCCESS | YES |
| Post-state | REGISTERED / NOT_ELIGIBLE; exact registration commitment matched |
| Dispatch attempts / identities | 1 / 1 |
| Signed envelope publicly exposed | NO |

The initial API response truthfully reported UNKNOWN/SUBMITTED_OR_UNKNOWN with
the original transaction hash. Recovery reconciled that identity and projected
the confirmed state; no re-prepare or replacement transaction occurred. The final
authenticated GET returned REGISTERED, NOT_ELIGIBLE, no pending operation and
source TESTNET. [Sanitized request, response and execution evidence](BYE-W1-002-results.json).

Private storage retains result XDR, result-meta XDR, one contract event, Soroban
return value, exact signed identity, actual confirmation and observation ledgers,
source, timestamps and logical correlation. Public evidence contains explicit
summaries only, without envelopes/auth signatures or any credentials.

The frozen ADMIN/signing mapping requires this existing source. External/manual
usage remains unconfirmed; it is treated as shared. Application leases do not
fence external transactions. The final exact sequence check is mandatory.

## OPEN_RETURN FOLLOW-UP SIMULATION

| Field | Result |
| --- | --- |
| Executed / simulation SUCCESS | YES / YES |
| Ledger | 5281397 |
| Fresh request probe | a9cbc044f514c00e246720b7380a375d0aa4a6e54ad55221a1e8704321261cc0 |
| Recipient | GCOEEZR6CA4TU2WK7ZNAS6AJGHQH7NGYWKO7HZ3HQIF7EJATGLBNKOUZ |
| Resource fee | 318479 stroops |
| Total fee, including classic 10000 | 328479 stroops |
| Authorization entries | 1 SERVICE source-account requirement |
| Below unchanged cap | YES |
| Signed / submitted / application return created | NO / NO / NO |

The probe is fresh server-generated CSPRNG data, not an emitted authenticated
return or wallet verification. The public recipient is simulation context only.
Future actual returns still require wallet control and the immutable persisted
recipient snapshot before either signing phase. No collection, recycling or
reward was submitted by this task.

## Database and cleanup

The reviewed existing VOL-003 migration was applied to Supabase DEV, additively.
See [migration review](BYE-W1-002-DATABASE-REVIEW.md). All four new tables have
forced RLS, restrictive denial and no anon/authenticated grants; the full remote
HTTP suite verifies all nine application-private tables. No SECURITY DEFINER,
destructive migration, weakened constraint or production connection.

Read-only postchecks for this new TESTNET deployment found one logical operation,
one envelope, one dispatch attempt, zero return requests and zero reward attempts.
The explicitly named Auth fixture was removed; its application user/access were
disabled and no live fixture Auth link remains. Immutable namespaced business
and transport evidence stays in place. Remote MOCK tests cleaned only their own
Auth/access fixtures and retained immutable Foundation history.

Supabase's advisor reports leaked-password protection disabled. This pre-existing
Auth setting is unchanged and separate from passing transport/RLS checks.
No credentials were copied to the worktree's empty .env; an explicit process-only
config-file selection reused the existing ignored DEV configuration with TLS
verification. [Auth setting reference](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Acceptance and remaining work

D1.1, D1.3, D1.4, D1.5 and D1.7: SUPPORTED by the scoped first-operation evidence,
READY FOR OWNER VALIDATION of that evidence; their full criteria are not declared
satisfied by one registration. Official PASS criteria: NONE.
Acceptance remains D1 0/12, D2 0/6, D3 0/5 — total 0/23.

BYE-W1-001 remains historical PARTIAL. The successful open_return simulation
resolves one missing preflight, but successful collection/recycling/reward fees,
dual-auth live execution and full cap assessment remain unestablished.

Further live lifecycle, expired-operation resolution and manual advanced-state
projection ordering still need their own reviewed validation. Insufficient or
archived evidence remains UNRESOLVED, never permission to reuse IDs or pay twice.
The reward proof implementation passed deterministic tests; it is not a claim
that a real reward was sent in this task. No frontend/Testnet connection or
Mainnet work was performed.

Notion/Obsidian synchronization and Git publication are checked after this
evidence commit and reported separately in the final handoff, not inferred from
the existence of this file.

Next proposed task: BYE-W1-003 — Continue real lifecycle and authorization validation.
NOT STARTED. Business execution stopped after the authorized register; only the
explicit unsigned return preflight and read-only verification followed.
