# D1 acceptance review matrix — current BYE-W1-006

OFFICIAL INSTAWARD SPRINT / FUNDED SPRINT. **12 READY FOR VALIDATION /0 SUPPORTED /0 NOT YET SATISFIED /0 BLOCKED. Official D1 PASS0/12; D20/6; D30/5.**

[BYE-W1-006 report](BYE-W1-006-REPORT.md), [results](BYE-W1-006-results.json), [live idempotency trace](D1-IDEMPOTENCY-TRACE.json). Tested implementation `aa4f0af382d1b4da6a88403149efd76f791594b2`. One fresh synthetic registration, never D3/physical/environmental evidence. Original lifecycle and retired principal untouched. Source criterion wording remains unchanged below.

| Criterion | Current status | Current evidence | Owner decision |
| --- | --- | --- | --- |
| D1.1 | READY FOR VALIDATION | Existing004/005 evidence preserved below. | PENDING; no official PASS |
| D1.2 | READY FOR VALIDATION | Existing004/005 evidence preserved below. | PENDING; no official PASS |
| D1.3 | READY FOR VALIDATION | Existing004/005 evidence preserved below. | PENDING; no official PASS |
| D1.4 | READY FOR VALIDATION | Existing004/005 evidence preserved below. | PENDING; no official PASS |
| D1.5 | READY FOR VALIDATION | Live authenticated API A registration SUCCESS c1e2db75ed536307c02a84315c343c2615984283adb155709cee98045ee0352b, ledger5322924; B same key/body returns same operation/hash with0 additions; C only metadata.caseLabel changed gives409 with0 additions. SQL + independent chain snapshots, one identity/dispatch/effect. Fixture BYE-D1-IDEMP-F6C52ED496D5C6F41B, NOT D3. | PENDING; no official PASS |
| D1.6 | READY FOR VALIDATION | Existing004/005 evidence preserved below. | PENDING; no official PASS |
| D1.7 | READY FOR VALIDATION | 005 controlled on-disk before-submit integration retained; not live Soroban or OS-process-kill evidence. No relabeling. | PENDING; no official PASS |
| D1.8 | READY FOR VALIDATION | Existing004/005 evidence preserved below. | PENDING; no official PASS |
| D1.9 | READY FOR VALIDATION | Existing004/005 evidence preserved below. | PENDING; no official PASS |
| D1.10 | READY FOR VALIDATION | Existing004/005 evidence preserved below. | PENDING; no official PASS |
| D1.11 | READY FOR VALIDATION | Existing004/005 evidence preserved below. | PENDING; no official PASS |
| D1.12 | READY FOR VALIDATION | Existing004/005 evidence preserved below. | PENDING; no official PASS |

Technical readiness is not owner acceptance. D1 OWNER ACCEPTANCE REVIEW is a proposal only; STOP, no D2/D3.

## Historical BYE-W1-005 assessment — preserved

The following11 READY/1 BLOCKED assessment was correct at005;006 closes the gap using a separately approved fresh fixture, without rewriting005 as success.

# D1 acceptance review matrix — current BYE-W1-005

OFFICIAL INSTAWARD SPRINT / FUNDED SPRINT · 2026-10-21. **11 READY FOR VALIDATION / 0 SUPPORTED / 0 NOT YET SATISFIED / 1 BLOCKED. Official D1 PASS remains0/12; D2 0/6; D3 0/5. D1 technical state INCOMPLETE.**

Source acceptance wording is unchanged. [BYE-W1-005 report](BYE-W1-005-REPORT.md), [machine results](BYE-W1-005-results.json) and [controlled trace](D1-GAP-CLOSURE-TRACE.json). Tested implementation `59ed3540fcf7672507f48215b1bd916a8bc083c3`; unchanged production at starting91e00286669fd504946db521a86fc78352c60967. No new live transaction.

| Criterion | Current status | Current evidence / gap | Owner decision |
| --- | --- | --- | --- |
| D1.1 | READY FOR VALIDATION | Existing004 evidence below, unchanged. | PENDING; no official PASS |
| D1.2 | READY FOR VALIDATION | Existing004 evidence below, unchanged. | PENDING; no official PASS |
| D1.3 | READY FOR VALIDATION | Existing004 evidence below, unchanged. | PENDING; no official PASS |
| D1.4 | READY FOR VALIDATION | Existing004 evidence below, unchanged. | PENDING; no official PASS |
| D1.5 | BLOCKED | Original context/hash recovered, but original principal retired: DISABLED, Auth NULL/deleted, memberships disabled. Real identical/conflict requests NOT RUN; IdentityImmutable prevents rebind. No substitute identity or new registration. | PENDING; no official PASS |
| D1.6 | READY FOR VALIDATION | Existing004 evidence below, unchanged. | PENDING; no official PASS |
| D1.7 | READY FOR VALIDATION | New controlled on-disk integration: identity COMMIT/readback, interruption before intent/send, authority effects0, both DBs close/reopen, same operation/identity/hash, explicit existing reviewed same-hash first dispatch1, final authority effects1 and SQL projection. Also lost-response variant. Not live Soroban or OS-process-kill evidence. | PENDING; no official PASS |
| D1.8 | READY FOR VALIDATION | Existing004 evidence below, unchanged. | PENDING; no official PASS |
| D1.9 | READY FOR VALIDATION | Existing004 evidence below, unchanged. | PENDING; no official PASS |
| D1.10 | READY FOR VALIDATION | Existing004 evidence below, unchanged. | PENDING; no official PASS |
| D1.11 | READY FOR VALIDATION | Existing004 evidence below, unchanged. | PENDING; no official PASS |
| D1.12 | READY FOR VALIDATION | Existing004 evidence below, unchanged. | PENDING; no official PASS |

D1.5 cannot advance solely because local cache tests pass. A new user would have a different user-scoped idempotency key namespace. No Auth/role/schema/trigger change was made. The controlled D1.7 authority is an explicit equivalent state read authorized by005, not a relabeling of an already successful live transaction.

## Historical BYE-W1-004 assessment — preserved

The following10 READY/2 SUPPORTED assessment was correct at004. It is superseded by current005 readiness above, not rewritten as a historical success.

### Original BYE-W1-004 review

OFFICIAL INSTAWARD SPRINT / FUNDED SPRINT · 2026-10-21. Readiness is not official acceptance. Source criteria remain unchanged in [ACCEPTANCE-CRITERIA.md](../ACCEPTANCE-CRITERIA.md).

**10 READY FOR VALIDATION / 2 SUPPORTED / 0 NOT YET SATISFIED / 0 BLOCKED. OFFICIAL PASS: 0/12. D2: 0/6; D3: 0/5. D1 technical state: INCOMPLETE pending D1.5/D1.7 gap review.**

All rows were reviewed against implementation commit `5e4766e0dc175e61ff78e4b951b4b2fa28864bd8`. “Ready” means the cited technical evidence is available for owner assessment, never that an evaluator accepted it. Supporting frozen contract tests were rerun; they do not substitute for the five real API transaction results.

| Criterion | Status | Evidence | Remaining gap / boundary | Owner decision |
| --- | --- | --- | --- | --- |
| D1.1 | READY FOR VALIDATION | Five real authenticated API operation kinds confirmed on one sprint lifecycle; each correlation is in BYE-W1-004-traceability.json. Registration002, return003B, collection003C, recycling/reward004. | Owner reviews five API/chain results; no automatic acceptance. | PENDING — no PASS assigned |
| D1.2 | READY FOR VALIDATION | Frozen Rust authorization tests; backend/HTTP negatives;003C dual SERVICE+COLLECTOR positive and missing-either/wrong-actor guards;004 recycler guards and unsigned no-role RPC RoleNotGranted#9; service-only reward positive. | Negative signatures are deterministic tests/unsigned simulation, not deliberately invalid live broadcasts. Review coverage per operation. | PENDING — no PASS assigned |
| D1.3 | READY FOR VALIDATION | testnet-worker.test.ts confirmed-failure/no-projection, hash mismatch and UNKNOWN cases; sprint-recycling-reward.test.ts combined lost-response/outage recovery; independent RPC and SQL004 post-state. | Faults are controlled adapter fixtures, not injected into the successful live payment. | PENDING — no PASS assigned |
| D1.4 | READY FOR VALIDATION | BYE-W1-004-traceability.json: five operation IDs, network, contract, source/sequence, persisted identity hash, dispatch timestamp, confirmation ledger and PROJECTED state. | Export intentionally omits signed envelopes/signatures; chain result is independently corroborated in each task report. | PENDING — no PASS assigned |
| D1.5 | SUPPORTED | Real API replay for return003B, collection003C, recycling/reward004: same operation and zero added identities/broadcasts. Registration identical/changed-parameter conflict covered by remote-tests/http.test.ts (Supabase DEV with MOCK). | No explicit real-Testnet registration cache-replay transcript in002. Owner must accept controlled coverage or authorize a separately bounded cache-only check. No registration invoked in004. | PENDING — no PASS assigned |
| D1.6 | READY FOR VALIDATION | Reward receipt, transfer/paid events, recipient0→100000000, contract900000000→800000000; same-key live replay adds0. Rust/mock/HTTP reject early/double reward and recipient/amount overrides. Reproduction commands and tested commit below. | Re-run deterministic tests, never repeat live reward. Technical asset only; no monetary/environmental claim. | PENDING — no PASS assigned |
| D1.7 | SUPPORTED | All five live identities persisted before dispatch. testnet-worker.test.ts restart-after-intent fixture retains exact identity and sends0; postgres-recovery.test.ts fences lost COMMIT acknowledgement/READY.003C separates unsigned interruption from durable identity. | Conservative recovery may stop for reviewed resolution before first dispatch. No end-to-end reviewed READY first-dispatch recovery transcript or live injected pre-submit crash/chain-read pair. Full criterion requires owner review of this gap; no new transaction authorized. | PENDING — no PASS assigned |
| D1.8 | READY FOR VALIDATION | sprint-recycling-reward.test.ts: send exactly once, lose response, retain original identity, later same-hash SUCCESS and one projection; existing worker tests reinforce UNKNOWN behavior. | Controlled transport fixture; no extra Testnet lifecycle. | PENDING — no PASS assigned |
| D1.9 | READY FOR VALIDATION | Combined004 fixture plus testnet-worker.test.ts RPC outage test: uncertainty retained, no second send, same-hash recovery projects once. PostgreSQL recovery tests separately cover database interruption. | RPC outage is simulated; PostgreSQL disconnect root cause in003B remains unproven. | PENDING — no PASS assigned |
| D1.10 | READY FOR VALIDATION | testnet-restart.test.ts closes actual on-disk PGlite, reopens it with a new store/worker and reconciles original envelope/hash; prepare/sign/send each remain1. Combined004 worker reconstruction also passes. | Database reopen/worker restart in one test process, not an OS process-kill or live Testnet fault injection. | PENDING — no PASS assigned |
| D1.11 | READY FOR VALIDATION | testnet-worker.test.ts lost response/NOT_FOUND/expiry state proofs; combined004 fixture retains original network-bound hash through NOT_FOUND and outage, no replacement, later SUCCESS. | Expired/unresolved can require reviewed resolution; no automatic replacement or invented success. | PENDING — no PASS assigned |
| D1.12 | READY FOR VALIDATION | Frozen contracts/byetery-contract/src/test.rs revoked_collector_is_rejected_even_with_both_signatures; deterministic role revoke fixture rejects with unchanged state;004 unsigned no-role recycler RPC probe returns exact error9. | Local contract fixture freshly rerun; no live sprint actor revoked and no set_role transaction in004. | PENDING — no PASS assigned |

## Transactions and reproducibility

All five exact operation/transaction/ledger correlations, sources, sequences and persistence/dispatch ordering: [sanitized trace](BYE-W1-004-traceability.json). Public hashes and simulation/receipt details: [results](BYE-W1-004-results.json) and [report](BYE-W1-004-REPORT.md). All rows use the tested implementation commit above; registration implementation339fec02e500ac765b8ce68bb8a019cd4bcf4ae4 and collection recoveryfbeb66d86e59429023a7e23d4edaec3797b7f134 remain historical references.

No extra live business transaction was used for D1.7–D1.12. Restart evidence explicitly means worker reconstruction/database close-and-reopen, not an actual OS process termination. A pre-dispatch interruption can safely remain unresolved awaiting reviewed resolution; this matrix does not imply an automatic first-send recovery path exists.

Next action is owner review of the two supported gaps and acceptance evidence, or a separately scoped authorized follow-up. **STOP: no D2/D3.**
