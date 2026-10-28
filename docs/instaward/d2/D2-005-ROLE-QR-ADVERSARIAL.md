# D2-005 — Role + QR adversarial acceptance

Date: **2026-10-28**, America/Santiago. Classification: **OFFICIAL INSTAWARD SPRINT / FUNDED SPRINT**. Formal parent: `1410602c39b27002b7456df15bebab4131dfd95d`, branch `instaward/d2-web-mvp`.

Technical assessment: **D2.1 ACCEPT candidate / D2.2 ACCEPT candidate**. These are recommendations for Christian's review, **not OWNER ACCEPTED or additional PASS criteria**. Official internal counts remain **D1 12/12; D2 1/6 (D2.4 only); D3 0/5; total 13/23**. No organizer acceptance/payment is asserted.

## Scope

The exact [D2.1/D2.2 criteria](../source/Byetery-Instawards-SOW-V3.1.md) require four role interfaces, allowed/prohibited actions enforced by server/contract, correct record lookup, and a QR that grants no authority. Testing uses actual Next routes/components, Chromium, a real local HTTP API, existing migrations in ephemeral PGlite, and the existing MockStellarService. No production Auth account, membership, wallet, remote SQL or Stellar state is modified.

**RATE LIMIT: NOT REQUIRED BY D2.1/D2.2.** A repository documentation search found no explicit additional requirement. The pre-existing API's 600/minute guard is unchanged; frontend HTTP-429 presentation is not a reason to add infrastructure.

## Production changes

One minimal correction in `backend/src/application/coordinator.ts`: valid operator membership is still checked as before; then collection/recycling must have the expected physical state, the exact current request ID, and the existing HELD/CONSUMED association before writing evidence or logical work.

The pre-fix regression reproduced two HTTP-409 rejections that nevertheless created immutable evidence/audited rejected work and invoked mock preparation: repeated collection and recycling before collection. The new guard retains HTTP 409 but rejects before those effects. Valid operations, existing idempotent replays and all original invariants remain intact. No authority map, locking, revocation, signer, contract, WASM, schema/RLS, dependencies or frontend production code changed. The fix and acceptance evidence are committed separately.

The existing permission matrix also had malformed UTF-8 punctuation in its previous checkpoint. That encoding is repaired without changing its historical evaluations; its technical conclusion remains **IMPLEMENTED / GAP 1+2 CLOSED**, now linking completion of this evidence task.

## D2.1 role matrix

Roles below are controlled fixture memberships. Operator principals normally have the USER base role; explicit role-only controls disable USER without granting additional privileged roles.

### Allowed

| Principal | Action | Expected | Actual | Enforcement |
| --- | --- | --- | --- | --- |
| USER | Protected battery lookup | 200, exact record | 200 | SQL session, ACTIVE principal, enabled USER, deployment, ID validation |
| USER | Own wallet and request access | 200, own data only | 200; other wallets/requests absent | `/api/me` user/deployment filters and battery `ownRequest` scope |
| USER | Open eligible return with own verified wallet | 201 | 201 | Current USER, REGISTERED state, verified wallet ownership, CSPRNG claim |
| USER | Cancel own eligible return | 200 | 200 | Current USER + request ownership + existing domain constraints |
| USER | Own eligible reward | 200 | 200, SENT / MOCK | Owner USER gate and existing reward lifecycle; simulated payment only |
| ADMIN | Register battery | 201 | 201 | Enabled ADMIN; same success when USER sibling disabled |
| ADMIN | Eligible non-owner reward override | 200 | 200 | Explicit ADMIN override; no implicit collector/recycler privilege |
| COLLECTOR + USER | Inspect eligible battery with supplied matching request ID | 200 | 200 in browser/API | Protected read plus independent collection authorization |
| COLLECTOR | Submit collection evidence | 200 | 200 | COLLECTOR membership supplies exact server actor; state/current claim checked |
| RECYCLER + USER | Inspect collected battery with supplied matching request ID | 200 | 200 in browser/API | Protected read plus independent recycling authorization |
| RECYCLER | Submit recycling evidence | 200 | 200 | RECYCLER membership supplies exact server actor; state/current claim checked |
| COLLECTOR / RECYCLER without USER | Their own eligible privileged mutation | 200 | 200 | Required role, not an accidental USER prerequisite or sibling privilege |

The operator supplies the consumer's request ID through the existing workflow. This is not a new public request-enumeration API.

### Forbidden

| Principal | Action | Expected | Actual | Enforcement |
| --- | --- | --- | --- | --- |
| USER | Register, collect, recycle | 403 each | 403 each | Required ADMIN/COLLECTOR/RECYCLER membership |
| ADMIN without operator memberships | Collect, recycle | 403 each | 403 each | ADMIN does not imply either operator role |
| COLLECTOR without ADMIN/RECYCLER | Register, recycle | 403 each | 403 each | Separate privileged memberships |
| RECYCLER without ADMIN/COLLECTOR | Register, collect | 403 each | 403 each | Separate privileged memberships |
| Other USER | Cancel another user's request | 403 | 403 | Request owner check |
| USER | Select another user's wallet | 409 | 409 | Verified wallet query bound to authenticated principal |
| Non-owner USER | Reward someone else's claim | 403 | 403 | ADMIN required for non-owner override |
| Any of four roles | Public `set_role`/role-management routes | 404 | 404 for each route/role | No such HTTP route; no browser role editor added |
| COLLECTOR / RECYCLER | Inject actor_address in body | 400 | 400 | Strict body whitelist; actor comes from membership |
| COLLECTOR / RECYCLER | Evidence for another battery | 422 | 422 | Exact battery/request/evidence binding |
| COLLECTOR / RECYCLER | Unknown request | 404 | 404 | Deployment-scoped request query |
| COLLECTOR / RECYCLER | Existing request from a foreign deployment | 404 | 404 | Exact deployment scope; existing foreign fixture cannot be used |
| USER | Supply user_id/role in return body | 400 | 400 | Strict whitelist; authenticated session determines principal |
| COLLECTOR | Repeat already-collected request | 409, no work | 409, no work | New early state/current-request guard |
| RECYCLER | Skip physical collection | 409, no work | 409, no work | New early state/current-request guard |
| COLLECTOR / RECYCLER | Old cancelled claim against a later current request | 409 each | 409 each | Exact current request and association, not just battery ID |
| Disabled USER | Protected battery read | 403 | 403 | Enabled USER gate |
| Revoked ADMIN/COLLECTOR/RECYCLER | Their otherwise valid mutation | 403 each | 403 each | Current enabled membership |

The machine-readable [sanitized trace](D2-005-ROLE-QR-RESULTS.json) records individual HTTP cases, actual status/error, and zero-business-effect assertions. A valid role with bad lifecycle/request is distinguished from a cross-role authority failure; cross-role cases use otherwise valid claims and return 403.

## UI evidence

The browser test starts the actual Next server and existing Chromium headless, renders production pages, clicks real controls, and forwards browser API requests to the actual isolated HTTP/SQL/MOCK fixture. Only `/auth/session` and credential delivery are replaced by the test-only Auth bridge; no production login bypass, cookie or token is created. `/api/me` and mutations are real local backend responses.

| Interface | Actual route and behavior | Screenshot |
| --- | --- | --- |
| USER | `/dashboard` → normalized search → `/battery/BYE-D2-005-QR`; exact SQL-backed record/QR; direct registration POST rejected 403 | [USER + QR](evidence/d2-005/user-qr.png) |
| ADMIN | `/admin`; valid registration succeeds through HTTP; `/collector` remains restricted | [ADMIN](evidence/d2-005/admin.png) |
| COLLECTOR | `/collector`; eligible lookup/evidence succeeds; `/recycler` remains restricted | [COLLECTOR](evidence/d2-005/collector.png) |
| RECYCLER | `/recycler`; eligible lookup/evidence succeeds; `/collector` remains restricted | [RECYCLER](evidence/d2-005/recycler.png) |

The React suite additionally renders all three privileged route components against each of the four role profiles (12 combinations), the real USER dashboard, SessionProvider/Gate, actual BatteryQR and invalid dynamic route segments. The screenshots use fake accounts and fixture claim IDs only; no password, Auth UUID, token, signing material or real account credential appears.

**UI visibility receives zero authorization credit.** Security evidence comes from the independent HTTP/SQL rejection assertions and relevant frozen contract tests, including a direct forbidden fetch from a page whose control is hidden. The unchanged TESTNET web configuration remains read-only; these mutating interface tests use explicitly labeled DEV/MOCK fixtures, not a Testnet frontend mutation bypass.

## API/server evidence

`backend/tests/d2-role-qr-adversarial.test.ts` exercises the actual `api`, Coordinator, Repository queries, session/ACTIVE checks, domain processing and MockStellarService. Its test-only Auth adapter maps controlled aliases to already seeded local session/principal rows. Wallet verification records are explicitly seeded fixtures, not evidence of a newly performed SEP53 verification.

The browser test in `frontend/browser-tests/d2-role-qr.test.mjs` uses the same fixture helper and real API, instead of fabricated success responses. Browser external origins are blocked and counted; the history/RPC ports are tripwires. No dependencies or browser binaries were installed. A Chromium executable already present in the local Playwright cache was used and its actual version is recorded in the JSON evidence.

## Contract defense-in-depth

No Rust source, contract test or WASM was changed. The freshly rerun frozen suite independently exercises:

- `registration_requires_admin_and_rejects_duplicate_without_mutation`: ADMIN/config authorization.
- `roles_require_admin_and_can_be_revoked`: role grants require admin; roles can be revoked; admin is not implicitly Collector.
- `collection_requires_both_authorizations_early_spike`: collector + service required; either missing authorization rejects.
- `revoked_collector_is_rejected_even_with_both_signatures`: valid signatures do not substitute for Collector role.
- `recycling_requires_recycler_signature_and_correct_evidence`: required Recycler signature, evidence binding and revoked Recycler rejection.
- `recycling_cannot_skip_collection_or_repeat`, `cancelled_claim_cannot_be_collected_and_wrong_claim_cannot_be_substituted`: lifecycle/request constraints.
- `user_actions_require_service_and_auth_is_bound_to_arguments` and the existing wrong-actor integration test: service trust boundary and argument-bound authorization.

Actor injection is rejected at HTTP; exact persisted membership/command mismatch remains covered by GAP2A regressions. Contract `require_role`/`require_auth` checks are a separate defense, not evidence that the mock executes Soroban. Raven stellarDocs was consulted; its [official authorization-testing reference](https://developers.stellar.org/docs/build/guides/auth/contract-authorization#test) supports inspecting actual required authorizations in contract tests. No architecture or protocol incompatibility was found.

Frozen/rebuilt WASM: `c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6`.

## Disabled/revoked authority

This task adds actual HTTP representative checks for disabled USER and revoked ADMIN/COLLECTOR/RECYCLER, all rejecting 403 with unchanged business state. Actor override and foreign-evidence attempts are also rejected before writes. The complete regression run preserves [GAP1/GAP2A/GAP2B evidence](D2-004-PERMISSION-MATRIX.md), including stored actor mismatch, signed-revoked holds, first-dispatch authority and same-hash recovery. No authorization locking/revocation code changed, so the two optional PostgreSQL concurrency cases were not rerun; their existing GAP2B real-session evidence is unchanged.

## D2.2 QR payload

Exact safe format: **`/battery/<encodeURIComponent(trim(UPPERCASE(batteryId)))>`**. For the deterministic fixture:

```text
/battery/BYE-D2-005-QR
```

The test inspects BatteryQR's actual QRCodeSVG element value and renders the real encoder, without mocking/replacing its implementation. It equals production `qrValue(batteryId)` and the visible link. The exact UI explanation remains: **Solo identifica la batería. No concede permisos.** The value contains no JWT, token, session, password, principal/Supabase UUID, wallet/secret, role, membership, request authority or idempotency key.

## Known QR lookup

```text
Production SearchBattery input: bye-d2-005-qr
→ actual normalized browser route: /battery/BYE-D2-005-QR
→ rendered production QR and visible link: /battery/BYE-D2-005-QR
→ GET /api/batteries/BYE-D2-005-QR
→ HTTP 200, batteryId = BYE-D2-005-QR, source = MOCK
```

Clicking the QR target retains the exact record. There is no substitution with another battery. MOCK is represented in UI and API; no new Testnet history or transaction is invented.

## QR-only attack

Without a session, knowing the Battery ID/QR does not authorize protected lookup, registration, return, collection, recycling or reward: each API attempt returns **401**, no new session is created, and browser navigation requires login.

Authenticated USER can view the correct QR record, then still gets **403** for registration/collection/recycling. ADMIN does not inherit operator authority. A collector/recycler must retain the right membership, matching server actor and eligible current request. Injecting an actor returns 400; foreign evidence returns 422; unknown/foreign-deployment requests return 404; ineligible/stale requests return 409. QR knowledge satisfies none of those conditions.

## Tampered QR cases

| Value/attempt | Actual result | Interpretation |
| --- | --- | --- |
| Lowercase/whitespace in producer input | Production search/qrValue normalizes to expected uppercase ID | Navigation convenience only |
| Lowercase sent directly to strict API/page | API 400 / page 404 | No ambiguous alias or authority |
| Unknown valid uppercase ID | API 404; UI shows not-found error | No other record substituted |
| Over-length ID (33 chars) or invalid underscore | API 400; actual Next page 404 | Existing input/route validation |
| Encoded slash/path traversal | API 400; actual Next page 404 | Remains in battery route; does not become `/admin` |
| Encoded query string in an identifier | 400/404 | Not interpreted as role/request parameters |
| Appended `?role=ADMIN&batteryId=OTHER` | Original record 200; USER still has no ADMIN panel/authority | Query does not select identity, role or battery |

The unknown-record page itself may render HTTP 200 because it performs a client API lookup; its **API** result is 404. Malformed route segments produce actual Next HTTP 404. No routing redesign or WAF was added.

## Side-effect assertions

Every forbidden HTTP check compares a full, deterministically ordered business-state digest and row counts before/after: battery records, stellar_operations, return_requests, reward_attempts, wallet_links, evidence_versions, wallet challenges, operation transport, mock runtime and chain projections. It also checks unchanged mock-preparation and external-call counters. No mock preparation, real signer, RPC preparation or broadcast is reached by those rejected cases.

Existing `api_private.idempotency` rejection-response audit rows may be retained by the application; these are not accepted work or battery/request/wallet/evidence mutations. They do not grant authority. The early eligibility fix removes the previously observed invalid evidence/work side effects. Positive fixtures create only explicitly local MOCK lifecycle state.

## Test results

| Verification | Final result |
| --- | --- |
| Focused D2-005 HTTP acceptance | 29/29 PASS; 54 forbidden HTTP checks assert zero business effects |
| Focused frontend role/QR | 22/22 PASS |
| Actual Next + Chromium + real local API | 6/6 PASS; four role screenshots visually inspected; external origins/RPC calls 0 |
| Root npm run verify / complete backend | PASS; 236 passed, 0 failed, 2 optional PostgreSQL race tests skipped (238 total) |
| Complete frontend | 145/145 PASS in 10 files |
| Backend/frontend TypeScript | PASS |
| Frontend lint / production build | PASS; no lint warnings |
| Rust native | 20 unit + 1 wrong-actor integration PASS |
| WASM-feature suite | 20 unit + 1 wrong-actor + 1 WASM constructor PASS |
| Release WASM / rustfmt / Clippy -D warnings | PASS; frozen SHA unchanged |
| Python | 4/4 PASS |
| Existing offline MOCK demo | REGISTERED → RETURNED → COLLECTED → RECYCLED → SENT; 10 simulated GREEN-TEST |
| Secrets / whitespace | Final scoped patch audited before publication; git diff --check PASS |

The two skipped tests are the existing PostgreSQL concurrency cases from GAP2B, not acceptance failures or skipped D2-005 checks. The owner explicitly did not require rerunning them when locking/revocation code is unchanged; their prior 2/2 real-session evidence is retained. Sanitized detailed results and screenshot hashes are in [D2-005-ROLE-QR-RESULTS.json](D2-005-ROLE-QR-RESULTS.json).

Reproduction from repository root (installed dependencies and an existing Chromium required; no automatic downloads):

```powershell
node --experimental-strip-types --test backend/tests/d2-role-qr-adversarial.test.ts
npm --prefix frontend test -- --maxWorkers=1 tests/d2-role-qr-acceptance.test.tsx
node --experimental-strip-types --test frontend/browser-tests/d2-role-qr.test.mjs
npm run verify
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend test -- --maxWorkers=1
npm --prefix frontend run build
```

Browser fixtures start/stop their own Next and local API processes; runtime/cache/logs stay ignored. Next-generated agent instructions are preserved in ignored local artifacts, and its generated type-reference file is restored if the test changed it. No project configuration is changed to suppress framework generation.

## Limitations

- **QR identifies a battery only. QR does NOT authenticate a person, prove possession, prove recycling, or grant role authority.**
- Supabase provider login/token validation is replaced by fixture Auth; production BFF credential handling, remote evaluator access and Vercel are not accepted by this evidence. The actual application/session SQL checks and roles are exercised locally.
- MOCK validates application behavior; it does not execute Soroban. Frozen Rust tests independently validate the contract. No new Testnet transactions, operational signatures, broadcasts, USER2, live lifecycle, contract/WASM change, signer change or remote Supabase mutation occurred.
- Screenshots are interface evidence, never authorization evidence on their own. Labels such as RECYCLED remain authorized attestations, not independent proof of a real-world physical/environmental event.
- The encoder input is inspected and the actual QR target is navigated; no physical camera/hardware scan is claimed. The current relative payload uses the Byetery origin context, as already designed.
- D2.1 and D2.2 are **ACCEPT recommendations only**. D2 remains **1/6 PASS** until explicit owner acceptance. D2.3 acceptance, D2-006, D2.6/Vercel and D3 were not started.
