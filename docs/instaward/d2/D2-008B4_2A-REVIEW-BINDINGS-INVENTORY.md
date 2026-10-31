# D2-008B4.2A — Current completed binding proposal

## STATUS

**B4.2A BINDING PROPOSAL READY — NOT INSERTED.**

Owner-directed continuation on 2026-10-30 (America/Santiago). Project `aemxuqnnwfclzrwwiqfd`, deployment `5c0cad2f-5f25-4216-8068-6cb9d2d26325`.

The previous inventory correctly stopped at five eligible USER memberships. The owner supplied a deterministic rule using the existing USER1 wallet linkage. That rule resolves exactly one USER principal. No creation date, UUID order, email, display name or USER actor_address was used. The earlier stopped report/JSON were preserved in ignored private historical snapshots before this current update; that stop was not retroactively treated as readiness.

## REVIEW-USER RESOLUTION

- Matched USER1 wallet: **YES**.
- Unique match: **YES**.
- Selected alias: **REVIEW-USER**.

## FOUR REVIEW PRINCIPALS

| Alias | App / membership | Auth metadata | Actual login |
| --- | --- | --- | --- |
| REVIEW-USER | ACTIVE / enabled | YES / not deleted / not banned | LOGIN READINESS UNKNOWN |
| REVIEW-ADMIN | ACTIVE / enabled | YES / not deleted / not banned | LOGIN READINESS UNKNOWN |
| REVIEW-COLLECTOR | ACTIVE / enabled | YES / not deleted / not banned | LOGIN READINESS UNKNOWN |
| REVIEW-RECYCLER | ACTIVE / enabled | YES / not deleted / not banned | LOGIN READINESS UNKNOWN |

There are four distinct internal principals, so the review_access primary key can represent exactly one role for each without a collision. ADMIN, COLLECTOR and RECYCLER each have one eligible ACTIVE/enabled principal. All selected identities and exact candidate rows stay in ignored owner-private evidence; no email, Auth UID, personal name or private principal crosswalk is included here.

Auth metadata was read only as booleans: account linkage/record exists, app ACTIVE, selected role membership enabled, deleted_at is null and banned_until is absent/expired. No password, token, email or Auth UID value was selected. This establishes plausible account eligibility, **not successful login or knowledge of credentials**. No login was attempted; actual LOGIN READINESS remains UNKNOWN.

## HISTORICAL BATTERY VALIDATION

Single existing fixture: **`BYE-W1-002-64257020134D4A0F`**. Exact target deployment; persisted lifecycle **RECYCLED**, reward **SENT**, confirmed projection ledger **5315915**. The selected USER has the existing confirmed return relation. Existing COLLECTOR and RECYCLER membership actor addresses match the confirmed battery's respective actors.

Five existing operations match the accepted D2.4 history records in order, method/kind, operation reference, transaction hash, ledger, network, contract and CONFIRMED/PROJECTED state:

| Event | Persisted operation / transport | Ledger | Historical transaction reference |
| --- | --- | --- | --- |
| REGISTERED | CONFIRMED / PROJECTED | 5281390 | `ec0f231a61f2c0fa8b1092adae475f6da0f649a2085ee4783fe825ff65b01a27` |
| RETURNED | CONFIRMED / PROJECTED | 5299532 | `4d7aa3b0e656692d0c8467ff08cc5e2edf6d8563290171bc06e2c39e9c0452e2` |
| COLLECTED | CONFIRMED / PROJECTED | 5314096 | `e105a8dc4072bc601c65d53cf694ca834aa5ff7e4b6457ecb9cb4c980b0f6d22` |
| RECYCLED | CONFIRMED / PROJECTED | 5315874 | `9b1042a5b8f31509149f0b0d1effc7329132f1bfea4a3e7a8505df589ad024fb` |
| REWARD | CONFIRMED / PROJECTED | 5315915 | `d38548ec53c292224b65e4fd85e2f69cb5d2013b51c2f7f0b7e81f4697f63e02` |

All three evidence kinds have immutable revision 1 / format_version 1 and valid stored-byte payload hashes. Their registration/collection/recycling hash or commitment matches the confirmed SQL projection. Request identity and the finalized_at<=operation.created_at selection predicate match the existing B2 history semantics.

D2.5 recycling payload hash, commitment, 398-byte length and existing UI disclosure match the accepted evidence fixture exactly; local SHA-256 of the already-disclosed bytes matches. The D2.3 historical state control agrees with the terminal reward transaction/ledger. Sources: [D2.4 timeline](D2-003-TIMELINE.json), [D2.5 evidence](D2-006-EVIDENCE-V1-RESULTS.json), [D2.3 state lanes](D2-007-STATE-LANES-RESULTS.json).

Classification: **fresh read-only SQL consistency + existing accepted historical provenance**. No RPC/Horizon/Stellar call occurred, so no fresh independent chain confirmation or liveness is claimed. Historical synthetic attestations do not certify physical recycling, custody or environmental outcomes.

Privacy review: B2's bounded DTO excludes Auth/principal identity and raw command/parameters/manifest material. UI-visible metadata is exactly the already-public synthetic registration-fixture projection; no new PII field is exposed by the proposed allowlist. The fixed evidence disclosure is the previously published synthetic one. This is a data/DTO review, not a new browser-login validation.

## ROLE VISIBILITY CHECK

All predicates were checked through direct read-only relation/metadata queries and the existing SQL definition, **without invoking any review/business function**:

- **REVIEW-USER:** approved user_principal_id resolves to the selected USER1 principal; an existing ownership/request relation satisfies the B2 USER branch, including a confirmed return association.
- **REVIEW-ADMIN:** enabled ADMIN membership; the proposed row is explicitly HISTORICAL and in the single-battery allowlist. No generic battery access is proposed.
- **REVIEW-COLLECTOR:** enabled membership, collector_relevant=true justified by its actor_address matching the confirmed collector.
- **REVIEW-RECYCLER:** enabled membership, recycler_relevant=true justified by its actor_address matching the confirmed recycler.

The minimum existing battery scope is **one**. No fallback fixture, altered history or extra lifecycle is needed. With only that review_batteries row proposed, role-specific queries remain fenced by that allowlist and their existing predicates. Runtime wrapper/UI access is deferred until separately authorized after binding.

## PROPOSED REVIEW_ACCESS ROWS

Exactly **four** candidate rows, not inserted. Every row uses deployment `5c0cad2f-5f25-4216-8068-6cb9d2d26325`, enabled=true and **can_create_intent=false**:

| Principal reference (alias only) | review_role | enabled | can_create_intent |
| --- | --- | --- | --- |
| REVIEW-USER | USER | true | false |
| REVIEW-ADMIN | ADMIN | true | false |
| REVIEW-COLLECTOR | COLLECTOR | true | false |
| REVIEW-RECYCLER | RECYCLER | true | false |

These are public-safe symbolic references, not literal principal_id values. **Exact private rows** with every UUID are enumerated in `.tools/d2-008b4_2a-continue/OWNER-REVIEW-PRIVATE.md` and the canonical `.tools/d2-008b4_2a-continue/APPROVAL-ROWS-PRIVATE.json`. Both are ignored by Git and must not be published. They contain no Auth UID/email/password/token.

Canonical exact five-row packet SHA-256: `2d07cc641acc53ca54d3009b48b591328928c3a922e944936df8297fd9475dfd`. This hashes the precise candidate row packet, not a credential. Owner review/approval is still required.

## PROPOSED REVIEW_BATTERIES ROWS

Exactly **one** historical row, not inserted:

| Field | Proposed value |
| --- | --- |
| deployment_id | `5c0cad2f-5f25-4216-8068-6cb9d2d26325` |
| battery_id | `BYE-W1-002-64257020134D4A0F` |
| enabled | true |
| purpose | HISTORICAL |
| user_principal_id | REVIEW-USER (exact UUID only in private packet) |
| collector_relevant | true — existing actor relation verified |
| recycler_relevant | true — existing actor relation verified |
| intent_operation_id | NULL |

No synthetic row or intent permission is proposed. The exact literal row is enumerated alongside the four access rows in the owner-private draft.

## PERMISSIONS / INTENTS

Final explicit READ ONLY reconfirmation at `2026-10-31T00:09:21.308764+00:00`: **permissions=0; registration_intents=0; review_access=0; review_batteries=0**. Required selected app memberships remain ACTIVE/enabled; USER1 remains the unique matching wallet-linked principal and the three other role candidates remain unique. No permission, intent, adoption, binding or business row was changed.

## B4/B4.1 BOUNDARY RECHECK

**PASS.** Exact five effective review_app functions unchanged; membership count=0; schema CREATE=false; raw table/column authority violations=0. No restricted login or repeated denial suite was needed, and no password/verifier was accessed or changed.

The six remote transactions in this continuation were READ ONLY: initial baseline; candidate/wallet resolution; limited Auth-column availability; four-account readiness booleans; preferred historical battery/operation/evidence reads; final baseline reconfirmation. All client SQL used the existing verified TLS administrative connection. No new credentials/configuration or principal/membership/role/ACL change.

## REMOTE MUTATIONS

**NONE.**

No review/business function invocation, Auth login/reset/mutation, wallet-link change, Vercel operation, Stellar call/signature/broadcast, new lifecycle or USER2/D3 operation. Existing private data was read only where necessary to apply the owner's USER1 resolution and role-scope rules.

## FILES CHANGED

Updated only the two current B4.2A report files: this Markdown and `D2-008B4_2A-REVIEW-BINDINGS-INVENTORY-RESULTS.json`. Earlier report snapshots, exact private row packet, candidate mapping, helpers and bounded raw query evidence remain ignored under `.tools/d2-008b4_2a-continue`. No private mapping is in the sanitized reports.

Existing SQL/application/contract/signer/config/acceptance files and protected KEY-CUSTODY-AUDIT.md / tools/sync_obsidian.py remain intact. No commit/push, merge or tags. Privacy/secret/Git closure evidence is included in the JSON companion.

Closure: only the two allowed current inventory reports were updated; **514 other baseline files remain byte-identical**, and Git refs are unchanged. `git diff --check`, report whitespace and private-ID/public-wallet privacy scans PASS. All exact-row/mapping files are ignored. Secret-pattern audit: **584 files / 700 historical blobs / 0 staged files / 0 findings**. No extra remote operation was needed for closure.

## PROJECT STATUS

D1 **12/12 PASS**; D2 **5/6 PASS**; D3 **0/5**; TOTAL **17/23**. **D2.6 pending**. Proposal readiness is not criterion acceptance or external approval/payment.

## NEXT OWNER AUTHORIZATION

**DRAFT — D2-008B4.2B: insert exact approved bindings. NOT EXECUTED.**

The owner-private draft enumerates **every row exactly**: four review_access and one review_batteries, in the canonical packet SHA-256 `2d07cc641acc53ca54d3009b48b591328928c3a922e944936df8297fd9475dfd`. The sanitized summary intentionally substitutes aliases for UUIDs; authorization must reference/review the private literal rows.

Proposed bounded authorization: target only the stated DEV project/deployment and that hash-pinned exact row set. Recheck all empty-table/security/identity/evidence predicates, then one transaction for those five INSERTs only; no UPSERT/UPDATE or added scope. All can_create_intent=false, permissions/intents remain empty. STOP/rollback on drift or collision; no automatic repair/replay. Only read-only post-insert row/catalogue verification, without invoking review/business functions. No Auth, credential, role/ACL/schema/function, Vercel or Stellar change, USER2/D3, commit/push, merge or tags. Keep the mapping private; report and stop.

This is a draft for owner approval, not execution authority. **STOP.**
