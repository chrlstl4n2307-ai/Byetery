# D3 tooling — local candidate, not live-run authority

This tooling is off-chain. It does not load `.env`, use Secure Store, instantiate a real signer, connect to RPC/Supabase or start the application server. Existing D1/D2 runtime and frozen contract stay unchanged. The example plan allocates no IDs or wallets; all recipients are unresolved. Do not relabel a historical recipient as USER2.

From the repository root, with existing dependencies:

```powershell
node --experimental-strip-types backend/src/d3/cli.ts plan docs/instaward/d3/D3-RUN-PLAN.example.json --output-dir .tools/d3-plan-owner-review
```

`plan` validates the exact network/contract/WASM/asset/amount, three unique IDs, all six negatives and at least two distinct recipients once resolved. Null recipients produce explicit owner-decision blockers. Output includes the deterministic plan hash and `EXPECTED_SUCCESS_TX = 15` (12 lifecycle +3 reward; negative broadcasts0; setup/TTL0 authorized). The existing accepted SHA in the example is a reference: replace it with the exact reviewed D3 execution SHA only after a separately authorized freeze.

```powershell
node --experimental-strip-types backend/src/d3/cli.ts simulate .tools/your-public-offline-plan.json --output-dir .tools/d3-offline-rehearsal
```

`simulate` is deliberately **offline MockStellarService**, not unsigned live RPC simulation and not Soroban execution. Its plan must contain valid public recipient strings and at least two distinct recipients; choosing fixture addresses grants no wallet ownership, Auth link or owner selection. It exercises the three mocked lifecycles and exactly six local negative/recovery controls; writes three `BYETERY_D3_RUN_V1` manifests plus `simulate.json`. All Testnet hashes/ledgers/timestamps are explicitly null. Mock proofs are not signatures. The simulated request IDs are deterministic fixture hashes, not future server-generated request IDs. New real requests must use the original server CSPRNG.

`execute` is **not enabled**. The CLI refuses it before reading files; no argument or JSON decision can activate a signer. The library exposes a strict preflight validator, but even complete review metadata ends in `LiveExecutionBindingNotEnabled`. This build intentionally ships no binding to live dispatch. A future owner-approved rehearsal/integration must supply the existing authenticated API/TestnetStellarService/local Secure Store architecture after current SQL/source/wallet/custody checks. Do not create an alternate signer or use boolean review fields as signing authority. This limitation is explicit; local BUILD readiness does not claim executable live runs.

## Export and evidence boundary

`exportManifest(plan, runId, rawEvidence)` in `backend/src/d3/manifest.ts` accepts a closed raw-evidence DTO. It preserves hashes exactly, requires confirmed references for declared Testnet success/failure and separates lifecycle, operation result and reward. It recomputes exact-byte payload hashes and the existing Evidence V1 context-bound XDR commitment using the original verifier. Registration uses its existing canonical-byte SHA-256. Collection requires both configured authorizers.

For payment, require one success, exact 100000000 base units, the planned recipient/exact asset, RECYCLED/PENDING before separate SERVICE payment, RECYCLED/SENT after, recipient delta+100000000 and payer delta−100000000. Balance observations must surround the payment ledger. Unresolved or interfering activity blocks a successful export. Wrong amount/recipient, duplicate success, missing receipt/transfer evidence and Sent without payment are rejected.

Export validation is **OFFLINE_CONSISTENCY_ONLY**. Declared receipt/transfer flags are not independent RPC verification. Future live evidence must come from the original D1 receipt/SAC-event verifier and authoritative before/after reads. Only the owner can accept D3; neither export completion nor a MOCK result marks any criterion PASS. States/commitments do not independently prove physical recycling.

The exporter produces canonical JSON without generation time or random IDs. Its integrity SHA excludes only its own digest field. Exact disclosed synthetic bytes are retained as base64 and scanned before output; unknown fields, credential patterns, private seeds and signing/session payloads are rejected without echoing input. Do not place real credentials in any input. `writeManifest` uses atomic exclusive creation (`wx`): it never overwrites any existing run file, even identical regeneration. Use a new empty output directory; a later file failure can leave already-created run files, which must be preserved/reviewed rather than replaced.

## Six controls and D1 reuse

Definitions in `negatives.ts` specify setup, attempted operation, expected result, evidence fields, simulation support and successful-lifecycle prerequisites. Offline controls exercise unauthorized recycler, invalid transition, early reward and duplicate reward through the existing mock. Altered disclosed bytes fail the unchanged existing verifier. Uncertain mock payment settles/polls the same submission through `reconcileOriginal` without preparing a replacement. Mock correlation hashes are explicitly local and not Testnet references.

The recovery wrapper has no prepare/sign/submit capability. The D3 recovery test binds it to the unchanged **D1 LocalTransactionWorker/TransportStore** using an ephemeral PGlite fixture and existing FakeTransport. Lost response, NOT_FOUND, outage, restart and repeated reconciliation preserve the original envelope/hash, one projection and one fixture submission. Existing fixture-only ephemeral signing in that test is not Secure Store access or an operational Testnet signature. No account or wallet is created on any network.

No extra failed network transactions are proposed for negatives. Owner acceptance of API/unsigned-simulation/offline/recovery evidence remains deferred. No RPC simulation capability is shipped in this build, avoiding accidental business preparation during a supposedly offline rehearsal.

## Reuse map

| Existing component | Decision | Use |
| --- | --- | --- |
| MockStellarService/domain commands | REUSE_AS_IS | Offline transitions/guards; no new state machine |
| evidenceCommitment / verifyEvidenceV1 | REUSE_AS_IS | Exact bytes, XDR integrity and altered record |
| D1 Durable/LocalTransactionWorker + TransportStore | WRAP | Original-operation reconciliation; runtime unchanged |
| D1/D2 fixtures and negative tests | WRAP | Deterministic offline controls and real durable recovery test |
| D1 hard-coded operational journals | EXISTING reference | Do not rerun/modify frozen D1 IDs/branch/users |
| TestnetStellarService / local signer / auth policy | REUSE_AS_IS, future binding deferred | No import/instantiation in runner/CLI |
| D3 plan, manifest DTO/export, CLI and consolidated output | NEW | Tooling only |

## Gates still outstanding

Local custody/authorization (including ADMIN registrations); final A/B recipients; USER2 release/control/application binding; negative-evidence policy; TTL retention/maintenance policy; exact 15-transaction budget; local/API versus hosted evidence surface; new reviewed SHA and any future live binding. No new credential, wallet, role, trustline, TTL extension, server startup, deployment, commit or push follows from running these tools.
