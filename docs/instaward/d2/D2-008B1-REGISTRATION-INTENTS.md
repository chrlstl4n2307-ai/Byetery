# D2-008B1 — Registration intents and owner adoption foundation

Date: **2026-10-29 America/Santiago**. OFFICIAL INSTAWARD SPRINT / FUNDED SPRINT.

Starting checkpoint: `ee1005dbeb2f8b39d19ccd83258da2c563135656`, branch `instaward/d2-web-mvp`.

**D2-008B1 = LOCAL FOUNDATION READY. D2.6 remains NOT OWNER ACCEPTED.**

Implementation checkpoint: `b5a6ab11d76798c0d619933495cf5d40e0e04576`. Tests/evidence are published in the subsequent bounded checkpoint; final branch HEAD is verified independently after push.

## Scope

Local implementation of **separate review intent → explicit owner adoption → ordinary Stellar operation**. No hosted adapter, HTTP/Auth integration, cloud apply, deployment, real chain precheck, operational signing or broadcast. All new execution uses disposable, guarded loopback PostgreSQL databases and fake chain-precheck dependencies.

Internal acceptance remains **D1 12/12; D2 5/6 (D2.1–D2.5); D3 0/5; TOTAL 17/23**. D2.6 is not accepted. This report does not claim organizer/SDF/Stellar acceptance or payment.

## Council decisions implemented

**Candidate B — SEPARATE REVIEW INTENT** supersedes the earlier D2-008A proposal to use QUEUED/no-work as the waiting representation. The historical preflight remains unchanged. WAITING is now exclusively in `review_private.registration_intents`; no Foundation state was added. The existing Coordinator, GAP2, signer and transport state machines were not redesigned.

Only a server-generated synthetic registration can be requested. Existing ACTIVE application ADMIN **and** a separate enabled `CREATE_D2_REGISTRATION_INTENT` permission are required. Creation/status never call a processor. Adoption commits Foundation records, then returns; the existing local reconciler may discover that ordinary QUEUED operation later.

## WAITING architecture

```text
Trusted server function caller (future Auth adapter not implemented)
  → existing ADMIN + narrow review permission
  → review_private.registration_intents: WAITING
      no battery / evidence / Stellar operation / work / envelope / lease

Explicit local owner tool, UUID only
  → immutable snapshot integrity check
  → injected read-only chain absence precheck (fake only in B1)
  → one READ COMMITTED SQL transaction
  → intent lock → current authority locks → frozen-material checks
  → Foundation inserts with reserved UUID → intent ADOPTED → COMMIT

Later: unchanged local Coordinator.reconcile() → ordinary QUEUED operation
  → existing persisted authority / GAP2 / durable transport
```

No cancellation, deletion, automatic expiry or general review queue was added. No browser route can adopt an intent. No hosted server package was created.

## Registration intent schema

Exact SQL artifact: [`database/review/d2-008b1-registration-intents.sql`](../../../database/review/d2-008b1-registration-intents.sql).

It is deliberately **outside `database/migrations`** and Supabase's normal migration sequence. No repository CI configuration applying remote migrations was found; the standalone artifact also prevents the existing automatic Foundation/PGlite migration harness from silently installing cluster roles or enabling this feature. Tests explicitly apply it only to new local databases. It is an exact SQL apply artifact, **not remote apply authorization**. No historical migration was edited.

| Field / constraint | Behavior |
| --- | --- |
| `operation_id uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Server-generated, unique, non-null; also the reserved future Foundation UUID |
| deployment / principal / key / input_hash | Exact frozen Testnet deployment, FK to existing principal, bounded idempotency key, canonical bounded request SHA-256 |
| battery_id | Server-generated `BYE-REVIEW-` plus 20 uppercase hex characters; existing battery-ID domain, 31 characters total |
| manifest_bytes / registration_hash | Exact immutable canonical UTF-8 bytes and SHA-256; hash CHECK, bounded byte length |
| status / timestamps / adopted_operation_id | WAITING has null adoption fields; ADOPTED requires timestamp and non-null operation ID equal to reserved UUID, FK to same-deployment operation |
| `UNIQUE(deployment_id,principal,idempotency_key)` | Same input returns same UUID/current status, changed input conflicts |
| `UNIQUE(deployment_id,battery_id)` | Stronger than one active WAITING/ADOPTED intent per battery |
| Partial unique WAITING index | At most one WAITING intent per principal/deployment |
| Immutability trigger | Identity/material/creation timestamp cannot change; no DELETE; only WAITING → ADOPTED, no terminal reversal |

The companion permissions table pins the same deployment and the single allowed capability. Its identity is immutable; an operator can revoke the existing capability by disabling it. No permission grants a Stellar command, adoption or signing authority.

## Synthetic manifest generation

The bounded SQL creation function accepts a trusted principal, idempotency key and **only** `{ "templateVersion": 1 }`. It accepts no battery ID, UUID, metadata, manifest, wallet, actor, role, command, XDR or hash. The database generates both identifiers and the fixed synthetic bytes:

```json
{"batteryId":"<server-generated ID>","metadata":{"batch":"D2-REVIEW-V1","purpose":"D2.6 SYNTHETIC REVIEW","type":"SYNTHETIC AA"},"version":1}
```

The fixed template uses the exact key order and encoding of the existing `application/validation.ts` canonical encoder; tests compare its generated bytes against that encoder. There is no second generic JSON canonicalizer or contract machine. Template version 2 is a controlled unsupported test variant: a changed replay conflicts; a new request for version 2 is rejected, never emitted as a new template. No PII is included in the manifest or public DTO.

## Hash freeze/reverification

Creation freezes `SHA256(manifest_bytes)` once. The local adoption snapshot independently hashes the exact stored bytes; the SQL adoption function independently hashes them again **after acquiring the intent lock**. Both require equality with the frozen hash. Parsed JSON is inspected only for fixed-template context and used to obtain metadata; it is not reserialized for integrity verification. Foundation evidence copies the exact original bytea and hash.

The ordinary operation's `parameters_hash` uses the existing canonical command representation with batteryId/kind/registrationHash. The existing `PersistedContextGuard` validates the adopted operation and its REGISTRATION evidence unchanged. This is a registration payload SHA-256, **not a new Evidence V1 commitment**. Evidence V1, ABI and contract are untouched.

## Review permission model

The bounded functions independently read current SQL state: principal ACTIVE, actual enabled ADMIN membership, and enabled review capability. A client role field cannot replace any check. USER/COLLECTOR/RECYCLER with the review capability are denied; ADMIN without it, disabled ADMIN, disabled permission and inactive principal are denied.

B1 implements a trusted-server **function interface**, not authentication. Its principal argument must eventually originate from validated Supabase Auth/session handling in B2; it is not permission to trust a browser `user_id`. A compromised dedicated SQL caller could impersonate a permitted principal within the bounded interface. It still cannot select material/commands, create a Foundation operation or adopt. No hosted session oracle or raw Auth grant was created.

## No-Foundation-before-adoption proof

The core adversarial test creates a WAITING intent, then invokes repeated/startup-equivalent `Coordinator.reconcile()`, Testnet service `process`, `prepare`, `submit`, store `queue`/`claim`, and actual worker `run` with the reserved UUID. There is no logical operation to process. Paths return OperationNotFound, DurableLogicalOperationRequired or TransportWorkMissing as appropriate.

The test checks zero matching rows in **battery_records, evidence_versions, stellar_operations, testnet_work, testnet_envelopes, testnet_source_leases and testnet_observations**, with the intent still WAITING and RPC/signer tripwires at zero. No pre-adoption source/worker lease, simulation, envelope or transaction hash exists. The creation function touches only the separate intent object, not Foundation/idempotency/transport records.

## Owner adoption transaction

Local owner entrypoints: `backend/src/review/registration-intents.ts` (`OwnerRegistrationAdoption`) and `backend/src/review/adopt-owner.ts` (`adoptReviewRegistration`). The tool runner accepts exactly one UUID and rejects overrides/extra arguments. It has no processor/signing dependency. B1 supplies no executable live bootstrap or default chain-absence result; tests invoke this runner with the fake precheck. Live local CLI/precheck wiring remains a later authorized step.

The local operator capability uses existing trusted local DB access, separate from the restricted review role. After completing a read-only immutable snapshot transaction and the external absence precheck, it opens a fresh normal **READ COMMITTED** transaction and calls the owner-only SQL adoption function:

1. Lock exact intent `FOR UPDATE`; require WAITING.
2. Lock current ACTIVE user `FOR SHARE`.
3. Lock current enabled ADMIN membership `FOR SHARE`.
4. Lock enabled review permission `FOR SHARE`.
5. Check pinned deployment/network/contract/WASM, exact stored-byte hash and input context, absence of Foundation battery/UUID collision.
6. Insert battery record and revision-1 REGISTRATION evidence with original bytes/hash.
7. Insert register_battery operation with **the reserved UUID** and immutable original principal/key/material; **no ON CONFLICT DO NOTHING** for Foundation insertion.
8. Insert its normal API idempotency link, mark intent ADOPTED with equal adopted_operation_id and timestamp, COMMIT.

Any failure rolls back **all** inserts and transition. The local tool does not call process after commit. A DB connection/commit uncertainty is not permission to recreate an intent/operation: inspect the original UUID/status; no automatic retry or alternate identity is introduced. Trusted local administrator SQL can bypass application sequencing, as with the existing backend; the chain precheck is enforced by the local tool path, not claimed as an on-chain proof inside SQL.

## Same-UUID proof

Tests assert identity equality across WAITING DTO, adopted DTO, intent adopted_operation_id, Foundation operation PK, idempotency association, transport context and the existing reconciler's observed operation. Duplicate adoption fails closed, retaining one record/evidence revision/operation. A reserved-UUID collision with another existing operation does not get silently accepted; all new effects roll back.

## Concurrency

Real local **PostgreSQL 17.11** on an explicit loopback high port, using the existing portable installation. Tests verify the actual data-directory identity under ignored `.tools/d2-gap2b/pgdata` before creating a disposable database. They never parse root `.env`, accept a remote URL or fall back to Supabase.

- Same-key simultaneous creations converge on the same UUID; changed input conflicts and the one-WAITING limit prevents flooding.
- Two adopters use READ COMMITTED plus the intent's row lock. The second session is observed in `pg_stat_activity` with **wait_event_type = Lock**, then sees ADOPTED after the first commits. Exactly one winner and one set of Foundation effects.
- Revocation committed while adoption waits for the intent lock is read by the subsequent authority check; no Foundation effect.
- An adoption holding current-authority shares through commit makes the existing membership revoker wait. The test observes that real wait and completes without an inverted lock cycle.
- The ordinary Coordinator rejects the entire server-reserved `BYE-REVIEW-` namespace. This is deliberately stricter than checking an active reservation after a race-prone SELECT: ordinary clients cannot claim a generated ID even before the corresponding intent commits. It adds only a reservation rejection, no intent lookup/processing to generic code. A concurrent ordinary attempt and adoption produce one adopted operation, with the ordinary request returning ReviewBatteryReserved.

No SERIALIZABLE or new advisory lock is used for adoption. Existing generic database/reconciler behavior and GAP2 lock order remain unchanged. All test databases are dropped by the fixture cleanup; no immutable business constraint is weakened outside deliberately corrupted disposable test fixtures.

Re-running the new mandatory PostgreSQL cases requires the existing portable installation running on its validated loopback port and the ignored `.tools/d2-gap2b/postgres-test.json` configuration (the existing `.last-run.json` is the local setup reference). The fixture verifies host, high port, operator and real data directory, then applies migrations/artifact only to a new disposable database. It deliberately does not silently skip or fall back to a remote connection. After this execution, zero B1/GAP2B temporary databases remained; the task-started server was stopped and task-created active config removed. Existing portable binaries/data and local test roles remain ignored, without any global installation change.

## Chain-precheck abstraction

`ReviewChainPrecheck.getBattery({deploymentId,contractAddress,batteryId})` yields ABSENT/PRESENT/UNVERIFIED. Only ABSENT permits adoption. PRESENT and UNVERIFIED tests prove no Foundation writes. The dependency is injected by trusted local code, never selected by evaluator body or command arguments. No live adapter/network call is implemented or executed in B1. A future live adapter must distinguish authoritative None from RPC failure/archival/unverified data and perform the fixed deployment's actual get_battery read; do not default errors to absence.

The precheck and SQL commit cannot atomically lock external chain state. Future transport preflight/source/authority/identity checks remain necessary; the precheck is not a replacement for them.

## Post-adoption handoff

The operation is ordinary **QUEUED**. No new Foundation enum, pending-signature state or D2-specific post-adoption authorization policy exists. The existing local reconciler's query sees it only after commit. Creation, status and adoption themselves never call processor, simulation, signing or dispatch. Existing testnet_work uniqueness, source lease, durable identity and original-hash reconciliation are reused as-is.

## ADMIN revocation / GAP2 regression

Revoked/inactive authority while WAITING leaves the intent WAITING with no Foundation writes. Current authority is checked after the intent lock and held through commit. After adoption, the unchanged PersistedContextGuard/assertPersistedAuthority reject a revoked ADMIN before preparation. Another adopted-registration regression exercises actual `TransportStore.dispatchIntent()` with a **clearly synthetic opaque SQL identity fixture**: revoked ADMIN produces the existing durable READY hold, zero dispatch attempts and identical original identity, not a replacement.

That SQL identity fixture is not XDR and is not signed or broadcastable; it tests the first-dispatch SQL boundary only. Existing GAP2B's cryptographically signed ephemeral-key fixtures independently cover the real worker identity path. Neither is a new operational Testnet signature. No Secure Store process is invoked.

GAP1, GAP2A, GAP2B and both **real PostgreSQL GAP2B lock winners** are rerun. Post-DISPATCH_INTENT same-hash resolution is unchanged. Existing authority, revocation, store, worker, service, signer and actor/ABI files are byte-identical to the starting checkpoint.

## Restricted SQL role

The artifact creates `byetery_d2_intent_owner` (NOLOGIN/NOINHERIT/NOBYPASSRLS/NOSUPERUSER/no privileged memberships; owns functions, **not business tables**) and `byetery_d2_review_app` (LOGIN/NOINHERIT/NOBYPASSRLS/NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOREPLICATION). No password/credential is embedded or provisioned. Existing unsafe roles cause apply to fail rather than silently adjust their privileges.

The restricted LOGIN receives only schema USAGE plus EXECUTE on **create_registration_intent** and **registration_intent_status**. No raw table read/write, authority helper or adoption execute. PUBLIC/anon/authenticated are denied schema/function access, default PUBLIC function execution is revoked for the function owner, and all new-table RLS is forced. Existing browser_deny/forced-RLS policies remain intact. No Data API exposure/configuration was introduced.

Definer functions have empty fixed search_path, fully qualified application relations, parameterized bounded inputs, no dynamic SQL and fixed deployment/purpose policies. The function owner receives narrowly listed underlying privileges. PostgreSQL `FOR SHARE` requires UPDATE privilege and matching RLS visibility; therefore only the current-authority lock columns receive scoped UPDATE privileges/policies, requiring already ACTIVE/enabled values and preserving those values. No callable function updates authority and the hosted role cannot use these grants directly. No `USING (true)` blanket policy exists.

Actual restricted-role connections prove raw users/memberships/battery/operations/work/Auth sessions/envelopes/intents reads and direct business writes denied, along with adoption/helper execution, schema/table/role creation. Owner role has no raw Auth sessions access and owns no underlying tables. No auth.sessions oracle exists.

## Worker/reconcile isolation

The current local generic backend historically uses a privileged postgres connection. **This task does not make that SQL credential incapable of reading review_private or calling local administrator functions.** Changing the worker credential is out of scope.

The proven boundary is structural: WAITING produces no operation, reconcile selects only operations, worker/store demand a real operation, and no generic application/transport source queries registration_intents. Static tests inspect those source files; dynamic tripwires prove zero preparation/signing/dispatch before adoption. The only generic production edit is the three-line ordinary-registration namespace reservation. Review function/module code is not imported by the worker, generic HTTP server or frontend.

## Remote mutations

**NONE.** No remote Supabase read/mutation for fixtures, role/grant/RLS/Auth change, Vercel resource/deployment/env change or live Stellar call. Documentation lookups are not a project mutation. New Testnet transactions **0**; operational signatures **0**; broadcasts **0**; real RPC mutation calls **0**; USER2 **NO**. Contract/WASM/ABI/Rust signer/LocalSecureStoreSigner and frozen actor addresses unchanged.

## Test results

Focused B1 suite: **31/31 PASS, 0 skips**. GAP1/role/state-lane focused regressions: **64/64 PASS, 0 skips**. Both existing real-PostgreSQL GAP2B concurrency cases pass; the first broader focused run exposed an invalid-source test input in the new no-operation test (a domain rejection, no unsafe effect); it was corrected to use the approved public source. Initial SQL development also exposed the need for scoped UPDATE visibility for FOR SHARE; positive and negative RLS tests then passed. These were local implementation/test corrections, not changes to accepted GAP2 logic.

Full root `npm run verify`: **PASS**. Complete backend **343/343 PASS, zero skips**, including the original Foundation suite, GAP1/GAP2A/GAP2B, both real PostgreSQL GAP2B races, D2 role/state regressions and all 31 new B1 cases. Backend TypeScript PASS. Rust native **21/21**, with wasm-tests **22/22** (includes overlapping native tests), release wasm32v1-none, rustfmt and Clippy `-D warnings` PASS. Python **4/4**, existing MOCK demo PASS. Recompiled WASM SHA-256 remains exactly `c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6`.

The [sanitized results JSON](D2-008B1-REGISTRATION-INTENTS-RESULTS.json) records counts and the ignored local full-log hash. Frontend code/dependencies and shared frontend sources were not modified; its complete suite/build are not rerun under this task's conditional requirement. No hosted readiness or live signature result is inferred from local tests. Frozen/protected/accepted files are checked byte-for-byte against the starting snapshot; final secret audit and whitespace/path checks precede commit/publication.

Documentation section/link/JSON/path sanity and `git diff --check`: **PASS**. Secret audit before staging: **517 files, 635 historical blobs, zero findings**; repeated over the explicit staged publication set. The two protected untracked files remain unchanged and excluded. Other branches/tags are compared to the saved remote baseline before publication and verified afterward.

## Remaining D2.6 blockers

- D2-008B2 DIRECT_REVIEW hosted package, forbidden-import checks and final bundle audit.
- Actual Supabase getUser/session-revocation behavior and reviewed hosted Auth/session boundary; four actual hosted logins.
- Separately approved remote SQL apply/restricted credential, with real platform compatibility review; no blanket grant or admin secret fallback.
- Trusted live chain-precheck/local command bootstrap; no fake absence default for operational use.
- Preview-only Vercel project/configuration/environment/deployment and evaluator access.
- Fresh read-only historical Testnet verification and accepted D2.1–D2.5 review flow.
- Explicit owner authorization for one bounded assisted registration, source/sequence/fee/TTL gates, original durable identity and final chain confirmation.
- Sanitized public hosted/A2 evidence and explicit owner acceptance. D2.6 stays pending; D3 not started.

**STOP after B1 publication. Do not start B2, apply remotely, deploy, sign or broadcast.**
