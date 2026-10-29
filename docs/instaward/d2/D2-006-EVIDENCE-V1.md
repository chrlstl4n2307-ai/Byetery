# D2-006 — Evidence V1 integrity verifier

Date: 2026-10-28 (America/Santiago). Classification: OFFICIAL INSTAWARD SPRINT / FUNDED SPRINT.
Starting checkpoint: `795108b011a5c1abea06c33707c73ea3de8b9d0c`, branch `instaward/d2-web-mvp`.
Status: IMPLEMENTED / TESTED / EVIDENCE READY. Technical recommendation only; no new owner acceptance.
Implementation commit: `e6e5167e7b1ac4753d39897c8114d134ced3e8e3`.

## Scope

D2.5 only: reproduce a disclosed historical Evidence V1 commitment and reject modified bytes against the same commitment. New pure verifier, offline CLI, separate read-only provenance harness, tests and sanitized evidence. No endpoint, business transition, authority/revocation, schema/RLS, signer, role, contract/ABI, frontend, Vercel or D1 acceptance change.

## Frozen Evidence V1 specification

Phase 0 inspected `backend/src/evidence.ts`, application evidence ingestion, frozen Rust `src/lib.rs::evidence_hash`, `src/types.rs::Evidence`, existing architecture, frozen vector and historical D1 results. **SPEC MATCH: YES.**

```text
payload_hash = SHA256(exact_manifest_bytes)
Evidence = ScMap(
  symbol("battery_id")   -> ScString(battery_id),
  symbol("kind")         -> ScVec([ScSymbol("Collection" | "Recycling")]),
  symbol("payload_hash") -> ScBytes(payload_hash[32]),
  symbol("request_id")   -> ScBytes(request_id[32]),
  symbol("version")      -> ScU32(1)
)
commitment = SHA256(XDR(ScVal::Vec([
  ScString("BYETERY_EVIDENCE_V1"),
  ScBytes(network_id[32]),
  ScAddress(contract_address),
  Evidence
])))
```

Map keys are in the existing lexicographic order. The original manifest is not an extra tuple member: its SHA-256 is the `payload_hash` field. The existing encoder is reused without changing runtime serialization; only its configuration parameter type now accepts the two fields it actually reads, retaining compatibility with complete Deployment objects.

Raven was consulted before implementation. Its official [Stellar custom-type documentation](https://developers.stellar.org/docs/learn/fundamentals/contract-development/types/custom-types#structs-with-named-fields) confirms named structs encode as ScVal/ScMap. The frozen Rust source and existing cross-language vector determine Byetery's exact field/domain encoding; external examples do not redefine it.

## Exact canonicalization / byte rule

No JSON parsing, sorting, normalization, newline insertion, UTF-8 replacement or reserialization occurs inside `verifyEvidenceV1`. It hashes the supplied Uint8Array exactly. This historical manifest is the UTF-8 encoding of the **already disclosed original string**, not JSON.stringify of a parsed manifest. Its original recorded payload hash independently confirms recovery of those exact bytes.

The JSON disclosure container carries canonical base64; decoding recovers the original bytes. The local disclosure surface has the existing application limit of 16,384 bytes, not a new on-chain format rule. Hashes are exactly 64 lowercase hex characters; addresses must be valid contract StrKeys; version must be 1. A structurally valid other domain returns NOT_VERIFIED without defining an alternate V1 encoder. Wrong valid network/contract contexts recompute to different commitments. Malformed context returns INVALID_INPUT.

Expected/computed commitments are compared as two fixed 32-byte buffers with `timingSafeEqual`. The pure function does not establish chain provenance.

## Selected historical Testnet record

[Disclosed fixture](evidence/d2-006/historical-recycling.json), recovered from [BYE-W1-004 results](../week1/BYE-W1-004-results.json), `evidence.manifestUtf8`. Existing revision 1, synthetic RECYCLING evidence, **398 bytes**. No new lifecycle or USER2 was used.

## Chain provenance

| Field | Value |
|---|---|
| Network | TESTNET; observed passphrase `Test SDF Network ; September 2015` |
| Network ID | `cee0302d59844d32bdca915c8203dd44b33fbb7edc19051ea37abedf28ecd472` |
| Deployment | `5c0cad2f-5f25-4216-8068-6cb9d2d26325` |
| Contract | `CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON` |
| Method | `confirm_recycling` |
| Battery ID | `BYE-W1-002-64257020134D4A0F` |
| Request ID | `5d48643a8915413ed889dd6aa3f8304d10a8c251e384f528ab5461d6e4c8d78c` |
| Transaction | [9b1042a5b8f31509149f0b0d1effc7329132f1bfea4a3e7a8505df589ad024fb](https://stellar.expert/explorer/testnet/tx/9b1042a5b8f31509149f0b0d1effc7329132f1bfea4a3e7a8505df589ad024fb) |
| Ledger | 5315874 |
| Confirmed timestamp | 2026-10-21T17:15:57Z |
| Chain result | SUCCESS, independently decoded result XDR `txSuccess` |
| Commitment | `b7622dcdbeb6598fe95f7c15f153b315a4b9329bc99c3829ceabd1bd10b75451` |
| Independent read | 2026-10-29T00:50:49.833Z = 2026-10-28 local |

The official Testnet RPC returned NOT_FOUND with retained range 5321217–5442176 (historical ledger 5315874 is older): this is **not** interpreted as failure. The official Horizon Testnet root and transaction GETs independently supplied the correct network and successful historical receipt. The new adapter is restricted to those fixed Testnet read paths, bounded responses, timeout and no redirects.

The harness reuses D2.4 `verifyHistoryRow`: reconstructs the network-bound transaction hash from the returned envelope, checks single invocation, contract/method/battery, successful result XDR, ledger and timestamp against the historical persisted CONFIRMED reference. It additionally checks all four exact argument XDR values, request, existing recycler actor and all Evidence fields. Recomputing V1 from the Evidence argument of this successful frozen-contract invocation gives the expected commitment. This is an **invocation-based commitment proof**, not a fresh event read; Horizon did not provide transaction metadata/events here.

The persisted reference is the unchanged [D2-003 SQL/history snapshot](D2-003-TIMELINE.json). No fresh SQL read or remote Supabase connection occurred in this task. A local CONFIRMED flag alone is insufficient: an unavailable/mismatched/failed provider receipt returns UNVERIFIED. Raw envelope, signatures and auth material are transient inputs and are excluded from public results/fixtures.

## Disclosed evidence

The fixture publishes the exact original bytes as base64, original payload hash, commitment and public attestation context. Payload SHA-256:

`50250c13774ca250b35bd4f6dbdf315a2963c17591f28471bea334f95cc13e6c`

The original manifest explicitly labels itself a synthetic Testnet demonstration and disclaims proof of physical recycling, custody, environmental benefit, compliance or material recovery.

## Intact verification

**VERIFIED.** Recomputed commitment equals the original historical commitment exactly:

`b7622dcdbeb6598fe95f7c15f153b315a4b9329bc99c3829ceabd1bd10b75451`

## Tamper test

Copy the 398 bytes; mutate only `bytes[0] ^= 0x01`: **0x7b (123) → 0x7a (122)**. Length and expected commitment remain unchanged; exactly one byte differs. No manifest reparsing is attempted.

**NOT_VERIFIED.** Tampered payload SHA-256: `107c836054116e3f60ab1b8a285ec469b71f92a9c3b16faf3ba8aa25aa5cde5c`.

Tampered computed commitment: `851c47034a6b4e541365cf208372fe6040080164442a09b435bee14a70d503b4`.

## Additional adversarial cases

NOT_VERIFIED: remove one byte; append a byte; add whitespace; reorder equivalent JSON properties; use another valid contract, network, domain, battery, request or evidence kind.

INVALID_INPUT: malformed/short/long/uppercase expected hash; malformed/short network ID; malformed contract or account address instead of contract; empty/oversize disclosure; unsupported version; invalid/missing context; malformed/noncanonical base64. Repeated same-input verification is identical and leaves input unchanged.

Separate provenance tests reject wrong payload/request/actor/method/contract/argument count; wrong network/deployment; missing/unavailable/failed transaction; inconsistent success flag/result XDR; hash/ledger mismatch; unconfirmed SQL reference and wrong commitment. Offline unsigned fixtures prove these branches, **not live blockchain success**. The real historical read is recorded separately.

## Cross-language/vector consistency

The unchanged [frozen Rust/WASM vector](../../../backend/tests/contract-evidence-vector.json) still produces `1e985a8468f016db7434d228ccfe80e614a68d81ef70f7a5e87c63c2c3938bb4` with the reused encoder. That vector supplies a payload hash; its unknown manifest preimage is not fabricated. The wrapper's exact-byte stage is separately proven against the disclosed historical manifest. Rust's original XDR commitment test also runs in full verification.

## Privacy audit

Decoded manifest inspected, not merely its base64 container. Only the original synthetic version/task/fixture/battery/request/kind/attestation/nonce fields occur. No email, Auth UUID, wallet address, session, token, password, private key or database credential. The nonce is an already public synthetic evidence field, not an authentication challenge or credential. Public contract/deployment/request identifiers are attestation context. Local provider envelopes and scratch logs stay under ignored `.tools/d2-006/`.

Protected custody/sync files remain byte-identical, untracked and excluded from staging. Repository/staged/history credential audit and whitespace checks are required before publication.

## Claim limitations

**VERIFIED means the disclosed evidence bytes match the commitment associated with this authorized Byetery Testnet attestation** when accompanied by the separate CONFIRMED provenance result. The offline function alone proves byte/context equality against its supplied expected commitment.

It does not prove that the real-world physical event occurred or that the submitted evidence is truthful. It provides no physical/environmental certification, compliance opinion or independent audit of recycling. NOT_VERIFIED means the supplied bytes/context do not match the recorded commitment; INVALID_INPUT means malformed input. No Stellar/SDF/Instawards acceptance or payment is asserted.

## Test results

| Check | Result |
|---|---|
| Focused D2-006 | 51/51 PASS, zero skips |
| Complete backend / existing Foundation and evidence suites | 289 total: 287 PASS, 0 FAIL, 2 optional GAP2B PostgreSQL concurrency skips |
| Backend TypeScript | PASS |
| Rust native | 20 unit + 1 wrong-actor integration PASS |
| Rust wasm-tests feature | 20 unit + 1 wrong-actor + 1 WASM constructor integration PASS |
| Release wasm32v1-none | PASS; exact original SHA-256 |
| rustfmt / Clippy -D warnings | PASS / PASS |
| Python tools | 4/4 PASS |
| Existing offline MOCK demo | PASS; full lifecycle, SENT, 10 GREEN-TEST simulated |
| Offline CLI intact / one-byte tamper | VERIFIED / NOT_VERIFIED; exits 0 / 1 |
| Independent historical provenance harness | CONFIRMED / SUCCESS; ledger 5315874 |
| Decoded-fixture privacy audit | PASS, no PII/secrets |
| Credential audit / git diff --check | PASS / PASS |

The two optional PostgreSQL row-lock races were not rerun: no authorization/revocation code changed, as expressly allowed by this task. Their prior real PostgreSQL evidence remains intact. No backend test failed. Frontend tests were not rerun because no frontend code or code shared with frontend changed; backend-only encoder typing was broadened without changing serialization. No installation/dependency change was needed.

Rebuilt WASM SHA-256: `c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6` (MATCH).

## Reproduction

From the repository root, with existing Node 24 dependencies:

```powershell
# Offline, no credentials or network; exit 0 VERIFIED / 1 NOT_VERIFIED / 2 INVALID_INPUT
npm run verify:evidence -- docs/instaward/d2/evidence/d2-006/historical-recycling.json

# Offline intact, deterministic one-byte negative, hardening, CLI and provenance-fixture tests
node --experimental-strip-types --test backend/tests/d2-evidence-v1.test.ts

# Separate independent historical provenance: two official Testnet GETs only; no secrets
npm run verify:evidence:chain

# Existing complete local verification including frozen Rust/WASM, backend, Python and MOCK demo
npm run verify
```

The historical network command can later return UNVERIFIED if the provider/history becomes unavailable. It never creates a replacement transaction, signs or broadcasts. The offline cryptographic result remains reproducible.

## D2.5 assessment

**D2.5 ACCEPTANCE CANDIDATE: ACCEPT**: exact disclosed historical bytes; exact intact commitment; independent successful Testnet invocation provenance; one-byte failure against unchanged commitment; sanitized disclosure; explicit integrity-only limits.

This is a technical recommendation, **not OWNER ACCEPTED**. Official project counts remain **D1 12/12; D2 1/6 (D2.4 only); D3 0/5; total 13/23**. D2.1 and D2.2 remain acceptance candidates. D2.3 and D2.6 remain pending. New Testnet transactions, operational signatures, broadcasts, remote Supabase mutations and USER2 use: **0**. No main merge or tag change. STOP after D2-006.
