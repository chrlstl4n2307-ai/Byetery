# TTL-001: PASS — TESTNET MAINTENANCE

**TESTNET MAINTENANCE — OUTSIDE D2/D3.** Owner-authorized three-key TTL preservation only; not a new lifecycle, business action or acceptance criterion. Executed 2026-10-22. D1 remains 12/12 OWNER PASS; D2 0/6, D3 0/5. No Notion/acceptance mutation.

## Transaction and bounded footprint

- Transaction: [a381e2a112500024892aaefa4b535b37b1b5e73a6d354e0986b1c106386f8bc0](https://stellar.expert/explorer/testnet/tx/a381e2a112500024892aaefa4b535b37b1b5e73a6d354e0986b1c106386f8bc0).
- Result: **SUCCESS**, ledger **5331231**; timestamp **2026-10-22T14:35:42Z**.
- Source/payer: `GAYLTPD7QCN5BZMK4K3BRAIVKHZX3UQYYKADRFOMJNXOUW3VQ3ZHAE6D`.
- Exactly **1 ExtendFootprintTTL**, **3 read-only LedgerKeys**, **0 read-write**, **0 Soroban auth**, **0 restore**, **0 InvokeHostFunction**, no operation source override or extra operation.
- **1 maintenance signature, 1 maintenance broadcast, 0 replacements/retries**. Receipt resolved by the original persisted hash. Friendbot funding was a separate explicitly authorized one-time funding request, not another TTL-001 execution.

| Approved entry | PRE liveUntilLedgerSeq | POST liveUntilLedgerSeq | LedgerEntryData value |
| --- | --- | --- | --- |
| Battery("BYE-W1-002-64257020134D4A0F") | 5402349 | 5843285 | SHA-256 unchanged |
| Request(5d48643a8915413ed889dd6aa3f8304d10a8c251e384f528ab5461d6e4c8d78c) | 5420491 | 5843285 | SHA-256 unchanged |
| Battery("BYE-D1-IDEMP-F6C52ED496D5C6F41B") | 5443883 | 5843285 | SHA-256 unchanged |

All three entries exceed the absolute minimum **5843282**. ContractInstance, ContractCode, COLLECTOR Role and RECYCLER Role were **excluded from the maintenance footprint**, and remain at **6703017** with unchanged value hashes. Correct versioned recycler: `GBIAVN4O4HJSPZJKFPPQZPLPXBELLBGYAJLTEGOGLJG2FRW2C5P35TF2`; the invalid suffixed variant was not used.

## PASO 0, provenance and value hashing

[PASO 0](TTL-001-PASO-0.json), observed ledger **5331061**, independently reproduced the three owner pre-check TTLs and recorded exact LedgerKey XDR and LedgerEntryData XDR. The same key bytes were checked again before simulation, independently by the local signer, before send and after confirmation.

ContractCode key provenance is the **wasm_hash read from the on-chain ContractInstance executable**: `c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6`. Matching the local frozen WASM is additional corroboration, not the origin of the ContractCode LedgerKey.

Each PRE/POST value hash is **SHA-256 over the binary LedgerEntryData XDR**, i.e. base64-decoded RPC entry `xdr` bytes. No liveUntilLedgerSeq, lastModifiedLedgerSeq, base64 text or full RPC response is included in that hash. Exact PRE/POST XDR and hashes are in [results](TTL-001-results.json).

| Entry | PRE SHA-256 = POST SHA-256 |
| --- | --- |
| historical_battery | `bde8164ea9338989c85d4636961e1c2ad0e080768a9fba197fa2518e005c5bc9` |
| historical_request | `85e7404caf8acf86f47278ca37595051142c32ba0000752d5890f3a2fab9092a` |
| idempotency_battery | `d817017328188fe545c93e59193ae241031a7679bc4b6a313917ef6dab930421` |

## Dedicated payer and sequence safety

The newly generated `BYETERY-TTL-MAINTENANCE-PAYER` identity is custodied locally by the official Stellar CLI in Windows Secure Store. No seed/private key was exported or logged. Public funding evidence contains only public key, FUNDED_VERIFIED status and timestamp. Account funding/existence and sufficient Testnet balance were verified. The source is distinct from actual on-chain ADMIN/SERVICE and the versioned collector/recycler; no application principal/membership or on-chain role was created. It is dedicated to TTL maintenance and is not assigned for D2/D3 or other workflows.

Funding account observation: sequence **22896904446672896**, balance **100000000000 stroops** (10000 Testnet XLM), ledger **5331101**. Final RPC source read immediately before broadcast: sequence **22896904446672896**, balance **100000000000**, observed ledger **5331230**. Prepared/signed sequence **22896904446672897** matched current+1; any drift would stop without reprepare. Final account sequence **22896904446672897**, balance **99995703393 stroops**; exact decrease **4296607 stroops** equals the charged fee. A local application lease is not assumed to protect against outside submissions.

**Capture correction, original retained:** TransactionBuilder increments its supplied Account object in memory. One late-serialized field labeled sourceBefore in the raw local result therefore contains the incremented sequence 22896904446672897. The authoritative PRE value is 22896904446672896, independently recorded by the signer/final pre-send account check and corroborated by the funding observation. Public results label this correction and retain the raw artifact digest; the original local capture was not rewritten. No transaction was changed or repeated to correct the record.

## Fresh calculation, simulation and independent signing gate

Fresh construction ledger **5331228** after funding:

`extendTo = 5843282 - 5331228 = 512054`.

Stellar's operation is relative to the application ledger, not an absolute expiry. Applied in ledger **5331231**, the resulting floor is `5331231 + 512054 = 5843285`. The pre-sign decoder also required a recent build context, exact target formula and finite time bounds; no stale plan value was reused at construction.

Final simulation with the real payer: **minResourceFee 4945484 stroops** (0.4945484 XLM). Signed total fee allowance **4946484 stroops** (0.4946484 XLM), below **1 XLM**. The resource estimate is **194981 stroops (~4.1044%)** over the owner's approximate 4750503 reference; this was disclosed before execution and remained below the conservative local 10% material-change STOP gate. No cap was raised. Actual confirmed fee **4296607 stroops = 0.4296607 XLM**, corroborated by account-balance delta.

The separate local signer decoded the actual received envelope by itself, reconstructed the three approved keys from pinned identifiers, compared their bytes with PASO 0 and checked source against the public key obtained independently from the new identity. It verified one ExtendFootprintTTL, empty RW/auth/restore, fee/resource limits, sequence and target. It printed/persisted the decoded public proof **before** invoking offline CLI signing. The signing hash is bound to the fixed Testnet passphrase; network is not a field encoded in the envelope itself. Only that new identity signed, and its single signature/body hash were verified locally and independently from the confirmed chain envelope. The signer cannot broadcast.

The signed identity/envelope was fsynced and read back before the exclusive dispatch intent. The final source read passed before the sole send. A timeout/UNKNOWN would stop and allow only lookup of the original hash; no automatic replacement path exists.

## Diagnostics and verification boundary

An earlier unsigned simulation was rejected with **“cannot set authMode with non-InvokeHostFunction operations”**: the reused application client supplies authMode=record for business invocations. No auth entries, restore data, signature or broadcast resulted from that rejection. A maintenance-only local transport adapter omitted that unsupported parameter after decoding ExtendFootprintTTL; the backend and contract were not modified. The subsequent correct plan and fresh final simulation both passed. This diagnostic is preserved in results, not relabeled as success.

Local independent decoder guards: **15/15 PASS**, covering valid exact footprint, wrong/privileged source, fee cap, material resource increase, wrong/absolute target, fourth/missing/duplicate key, read-write, restore, InvokeHostFunction, extra operation and stale context. These tests create no signature or transaction on a network. No unrelated signing/business suite was run.

Fresh [independent read-only verification](TTL-001-independent-verification.json), ledger **5331250**, used only RPC reads and Horizon, without signer/custody/runner imports. It independently checked SUCCESS/hash/ledger/source/signature/actual chain envelope, exact three-key footprint, target/TTL and all seven value hashes. A separate read-only ContractInstance config check at ledger **5331264** corroborates ADMIN/SERVICE addresses and payer separation. No extra submission occurred.

Stellar Raven was consulted first. Official [persistent-entry TTL semantics](https://developers.stellar.org/docs/build/guides/archival/extend-persistent-entry-js#the-extension-process) establish the relative floor; the pinned SDK 17.0.1 operation and transaction-builder sources were also inspected. This task did not copy an absolute-ledger example into extendTo.

## Preservation and handoff

Result: **3/3 entries preserved; 3/3 value hashes unchanged; 1 maintenance transaction SUCCESS; 0 business/lifecycle/role changes; 0 new D2/D3 PASS claims**. Four excluded entries remained unchanged. Production contract, frozen WASM, schema/RLS/Auth/principals, roles, frontend and backend are unchanged. Git HEAD remains `7a4ef7b45223df237aadab0643d1cbf382dee23b`; no main merge, tag movement, commit or push is performed by this task.

Protected `tools/sync_obsidian.py` remains intact, untracked and uncommitted. Only sanitized maintenance evidence was written under docs/maintenance. Payer metadata, key custody reference, signed envelope, exactly-once journal and local maintenance tooling remain ignored under .tools/ttl-001; never remove/reset those intents to rerun TTL-001. Public evidence excludes seed, private key and complete signed envelope. No Notion acceptance mutation or Obsidian synchronization.

**STOP. No D2-001, D2 or D3 started.**
