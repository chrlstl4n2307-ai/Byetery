<!-- BYETERY-INSTAWARD-DOCUMENTATION -->
# Acceptance criteria — SOW V3.1

PRE-SPRINT BASELINE · Fuente: SOW V3.1 preparado el 2026-10-06, revisado el 2026-10-09. SHA-256 fuente: `137944876890082754477089f312d8633995135377326eb199db0d6baa18f945`.

Estas son transcripciones de las matrices del SOW, no resultados ejecutados ni nuevos requisitos inventados. Presupuesto propuesto: D1 USD 2,000; D2 USD 1,600; D3 USD 1,300; total USD 4,900. El borrador no acredita aprobación/pago. Gates planeados: Day 14 / Day 21 / Day 30 desde el inicio acordado.

| Criterion | Description | Test | Expected result | Required evidence |
| --- | --- | --- | --- | --- |
| D1.1 | Five API operations | Execute all five named methods with fresh IDs. | Each succeeds with its authorized actor and confirmed Testnet result. | API transcript; five operation/result links. |
| D1.2 | Authorization | Attempt each restricted operation with an incorrect actor; test collection missing either required authorization. | All unauthorized attempts rejected; SERVICE + COLLECTOR succeeds. | Negative-test report; positive collection hash and auth detail. |
| D1.3 | Confirmation | Delay, lose or fail the RPC response before observing success. | Application remains unconfirmed until SUCCESS is verified; a failed transaction never appears confirmed. | State assertions; RPC/result capture. |
| D1.4 | Traceability | Inspect every submitted operation. | Operation ID, network, contract and transaction hash correlate; confirmed records include ledger/result. | Persisted operation export with sanitized fields. |
| D1.5 | Idempotency | Repeat an identical request; reuse its idempotency key with changed parameters. | Identical request returns the same logical operation; changed parameters rejected. One valid effect per intended transition. | API/database assertions and chain-state reads. |
| D1.6 | Reward guard and reproducibility | Request a second reward; rerun tests at the recorded commit. | No second successful payment or additional reward balance change. Exact commit and commands reproduce expected results. | Reward result/balances; test manifest. |
| D1.7 | A - Before submit | Interrupt after transaction identity is durable but before broadcast. Restart and resume by logical operation ID. | No pre-submit chain effect; recovery retains one logical operation and at most one valid intended effect. | Before/after durable record; submit trace; chain read. |
| D1.8 | B - Lost response | Broadcast, then suppress the submit response. | Mark unresolved; look up the persisted hash. Confirm if SUCCESS is found; no blind replacement transaction. | Lost-response fixture; original hash/result; state transition log. |
| D1.9 | C - RPC outage | Make RPC temporarily unavailable, then restore it. | Preserve operation and uncertainty; fail visibly without false confirmation. Resume reconciliation when reachable. | Outage/recovery assertions; sanitized errors. |
| D1.10 | D - Restart | Restart with durable SUBMITTED or UNKNOWN operation. | Recover the same operation and hash; reconcile without losing or duplicating its effect. | Restart test and record comparison. |
| D1.11 | E - Unresolved lookup | Return NOT_FOUND/unknown after an uncertain submission. | Remain unresolved; no automatic replacement envelope. Any permitted rebroadcast uses the same signed transaction identity and is recorded. | Reconciliation trace; envelope/hash identity; state read. |
| D1.12 | F - Revoked role | Disable an existing collector/recycler role in an isolated authorized test fixture, then attempt its restricted operation. | Revoked actor rejected; no lifecycle advancement or reward. Restore test configuration where applicable. | Role-state fixture; rejection and unchanged-state assertions. |
| D2.1 | Roles | Exercise four interfaces and prohibited actions. | Allowed actions succeed; forbidden actions rejected by server/contract, not merely hidden. | Permission matrix; UI/API test report. |
| D2.2 | QR lookup | Open known ID/QR as permitted user; attempt a privileged action with QR only. | Correct record retrieved; QR grants no authority. | QR fixture; lookup/rejection trace. |
| D2.3 | State display | Observe pending, uncertain, confirmed and failed operations. | Attested state, transaction and reward remain distinct; no false successful status. | State fixtures; screenshots and video. |
| D2.4 | History | Inspect each confirmed operation. | Timeline exposes the correct Testnet transaction reference and result. | UI-to-manifest mapping. |
| D2.5 | Integrity | Verify a disclosed record, then alter its bytes. | Intact passes; altered fails against the same commitment. | Versioned fixtures; verifier steps/output. |
| D2.6 | Review access | Follow the supplied review instructions. | Evaluator can access all four test roles and run the documented checks without receiving signing keys. | Access instructions; working demo; access test. |
| D3.1 | Three complete runs | Three distinct IDs complete all five operations; at least two recipient wallets. Each has UI/API evidence and confirmed Testnet references. | Three distinct IDs complete all five operations; at least two recipient wallets. Each has UI/API evidence and confirmed Testnet references. | Three distinct IDs complete all five operations; at least two recipient wallets. Each has UI/API evidence and confirmed Testnet references. |
| D3.2 | Conditional reward | Exactly one successful payment of 10 GREEN-TEST per eligible lifecycle. Recycling sets Pending; SERVICE separately requests payment; only successful payment yields Sent. | Exactly one successful payment of 10 GREEN-TEST per eligible lifecycle. Recycling sets Pending; SERVICE separately requests payment; only successful payment yields Sent. | Exactly one successful payment of 10 GREEN-TEST per eligible lifecycle. Recycling sets Pending; SERVICE separately requests payment; only successful payment yields Sent. |
| D3.3 | Six negative cases | Unauthorized recycler, altered record, early reward, duplicate reward, invalid transition and uncertain-response reconciliation all produce the specified rejection or unresolved/recovered result. | Unauthorized recycler, altered record, early reward, duplicate reward, invalid transition and uncertain-response reconciliation all produce the specified rejection or unresolved/recovered result. | Unauthorized recycler, altered record, early reward, duplicate reward, invalid transition and uncertain-response reconciliation all produce the specified rejection or unresolved/recovered result. |
| D3.4 | Manifests and integrity | Complete per-operation manifests for each lifecycle; disclosed records recompute to the commitment. Reward before/after balances correlate with the payment result. | Complete per-operation manifests for each lifecycle; disclosed records recompute to the commitment. Reward before/after balances correlate with the payment result. | Complete per-operation manifests for each lifecycle; disclosed records recompute to the commitment. Reward before/after balances correlate with the payment result. |
| D3.5 | Final handoff | Exact final commit, passing acceptance results, reviewer instructions and final demo video covering successful and negative flows. Clearly labeled new sprint evidence. | Exact final commit, passing acceptance results, reviewer instructions and final demo video covering successful and negative flows. Clearly labeled new sprint evidence. | Exact final commit, passing acceptance results, reviewer instructions and final demo video covering successful and negative flows. Clearly labeled new sprint evidence. |

D3 exige tres lifecycles nuevos y al menos dos wallets receptoras. D1.12 requiere un fixture de revocación autorizado; esta tarea documental no cambia roles. La clasificación y evidencia de cumplimiento se registran en DELIVERABLE-STATUS.md.

## Formal freeze reference

**HISTORICAL BASELINE:** `252fff88d4c4abbb6986460c12f1766b1ddfb574` — prior direct-contract/Testnet validation.

**FROZEN PRE-SPRINT BASELINE:** annotated tag `pre-instaward-baseline-v1`, created by this freeze procedure. Its commit SHA is resolved from the tag after creation, not guessed or embedded circularly.

Canonical source/index: https://github.com/chrlstl4n2307-ai/Byetery/tree/pre-instaward-baseline-v1

Incomplete helper work is PARTIAL / RESEARCH-SPIKE / NOT VALIDATED. Wallet/QR WIP is archived separately with its base, patch and hashes and is not merged. See FREEZE-CLASSIFICATION.md and BASELINE-MANIFEST.json. This snapshot preserves pre-sprint work; no D1/D2/D3 implementation or new product validation occurred in this freeze. Official sprint start: UNCONFIRMED.
