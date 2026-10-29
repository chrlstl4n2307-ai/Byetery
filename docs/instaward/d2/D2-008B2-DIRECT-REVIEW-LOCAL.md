# D2-008B2 — DIRECT_REVIEW local hosted package

Classification: OFFICIAL INSTAWARD SPRINT / FUNDED SPRINT. Date: 2026-10-29.

**DIRECT_REVIEW HOSTED PACKAGE LOCALLY READY.** This is local implementation evidence, not a deployment or D2.6 owner acceptance. Starting checkpoint: `48b6a723ab78973f8a3314499c0351fb6155d172`, branch `instaward/d2-web-mvp`.

Implementation/tests/SQL checkpoint: `38b7285ccd691ba26750f138e91f140d10aec3ed`. A separate documentation commit records this report/results/index. Publication is fast-forward to the same branch only; no merge or tags.

## Scope

Local frontend/server code, a separate local SQL audit/apply artifact and disposable PostgreSQL tests. No remote SQL apply, cloud credential, Auth session experiment, Vercel project/configuration/deployment, live chain query, signing, broadcast, USER2 or D3. Git publication of this bounded package is separately authorized in the task.

## Council decisions

C2 keeps `frontend/` as the future application root without workspaces. Frozen B1 remains `WAITING intent -> explicit local owner adoption -> ordinary QUEUED operation`. The hosted package can create only a bounded synthetic WAITING intent; it cannot adopt, prepare, sign, reconcile or send. Read functions use a separate non-login, non-bypass owner. Strategy A is authoritative `getUser` without a session-table oracle. Verification is fresh, read-only and nonpersistent.

## Package boundary

Server implementation: `frontend/src/server/direct-review/`, every module marked `server-only`. Pure DTOs/constants: `frontend/src/shared/review/`. The two former backend type dependencies now use neutral frontend declarations; no backend runtime/domain implementation is copied. The existing browser integration harnesses moved to `scripts/browser-tests/` so their legitimate fixture imports reside outside the frontend package.

ESLint restrictions and an AST/module-resolution audit cover value, type, export, dynamic and alias imports. Frontend source resolves only inside its physical root or to normal packages. There are no executable changes under `backend/` or `contracts/`, and no signer change.

Future Vercel settings, **not applied**: Root Directory `frontend`; Include files outside the Root Directory in the Build Step **OFF**.

## Auth boundary

The server obtains the cookie access token via Supabase SSR transport and calls authoritative `getUser` with that exact token. Only a valid UUID with role `authenticated` reaches SQL. SQL maps this Auth UID to the existing ACTIVE application principal. Client IDs, role headers and query parameters never select that principal. Session transport alone grants no authority.

Auth outage = 503; invalid/missing session = 401; unavailable DB = 503; disabled review access = 403; unknown/out-of-scope object = 404. Unexpected faults disclose only a generated correlation ID. No credential, cookie, token or Auth UUID enters the review DTO/UI.

## Session strategy abstraction

Current strategy: `AUTH_USER_ONLY`. No JWT `session_id` requirement, Auth.sessions query or new oracle. Future `AUTH_USER_PLUS_SESSION_LIVENESS` requires an explicitly injected `SessionLiveness`; selecting it without the dependency fails closed. The real login/signOut/liveness experiment remains **B2A, not executed here**. This package does not claim immediate session revocation beyond authoritative Auth behavior.

## Review access allowlist

One `review_access` row per exact deployment/principal selects one review role. Effective access intersects ACTIVE principal, enabled matching current membership and enabled review access. ADMIN intent creation additionally requires `can_create_intent` and B1's separate permission. A review row cannot manufacture ADMIN membership. Creation holds the current review-access row lock while calling B1.

## Review battery scope

`review_batteries` approves individual IDs in the frozen Testnet deployment. USER needs its explicitly assigned and own historical context. ADMIN sees approved historical batteries or its adopted synthetic intent context. COLLECTOR/RECYCLER need relevant approved history and an actor address matching the existing projection. Other users, unapproved IDs and unknown IDs have indistinguishable 404 behavior. A WAITING intent is shown through intent status, not presented as a Foundation battery.

## SQL read functions

Artifact: `database/review/d2-008b2-direct-review.sql`, applied only after unchanged B1 in disposable loopback databases. It is intentionally outside automatic migrations and has **not** been applied remotely.

Hosted application role has EXECUTE on exactly:

1. `review_private.profile(uuid)`
2. `review_private.battery(uuid,text)`
3. `review_private.history_rows(uuid,text)`
4. `review_private.create_review_registration_intent(uuid,text,jsonb)`
5. `review_private.review_registration_intent_status(uuid,uuid)`

Old principal-taking B1 entry functions are revoked from the hosted role by the new artifact, closing the allowlist bypass without editing B1. Adoption remains unavailable. Browser roles have no direct grants. The read owner is NOLOGIN/NOINHERIT/NOBYPASSRLS, owns no underlying table, has no privileged-role membership and receives only required columns plus fixed-deployment/purpose RLS. Private helpers are not callable by the hosted role. Fixed empty search paths and transaction-local context avoid session-pool assumptions.

The wrapper reuses B1 generation/idempotency; it does not recreate canonical bytes or UUID logic. Intent creation plus its exact synthetic approval row is atomic. Before adoption there are zero Foundation battery/evidence/operation and zero work/envelope/lease records.

## DTO disclosure boundary

Operation DTO: operationId, kind, status, transactionHash, ledger, createdAt, updatedAt, errorCode. The existing table has no update timestamp; `updatedAt` is honestly null. No command parameters, signed XDR, envelope, idempotency key, signer/worker/lease internals or private principal fields are returned. Internal history identity/request fields exist only to verify the receipt and are removed from JSON responses. Metadata is restricted to three bounded strings. `ownRequest` belongs only to the authenticated principal.

## History verification

Each history GET loads at most 30 persisted rows and independently checks relevant receipts, with concurrency at most three and four-second requests. No verification result is written to SQL or treated as a durable cache. Receipt checks compare hash, success, ledger, source, recomputed Testnet transaction hash, single invoke-host-function operation, exact contract/method/battery and request context where present. Chronology uses verified receipt timestamp where available, otherwise persisted creation time, with deterministic ID ties.

The server uses only permitted `@stellar/stellar-base` for decoding/hash/address work. Own code has no Keypair, TransactionBuilder, transaction signing, send/submit, signer bridge or child_process. Fetch hosts and read methods are fixed in code; redirects are rejected and request input cannot select an endpoint. The RPC call is only `getLedgerEntries`, never simulation.

Stellar Raven `stellarDocs` was consulted first; the [official contract-code retrieval guide](https://developers.stellar.org/docs/build/guides/rpc/retrieve-contract-code-js) supports deriving the instance and WASM ledger keys. Its SDK example does not override this task's explicit stellar-base-only package boundary. Historical transaction fields/hash behavior are additionally exercised against the actual previously recorded receipt.

## State/TTL/reset semantics

Current state derives the exact contract-instance, frozen-WASM-code and battery storage keys. Returned key/contract/code hashes, code bytes, lifecycle and reward are checked against the frozen context. Durable SQL remains separate from current network availability.

| Result | Meaning |
| --- | --- |
| VERIFIED | Official receipt/current storage facts match all supported expected facts. |
| UNVERIFIED | Timeout, unavailable endpoint, unsupported or incomplete response; no success inferred. |
| RETENTION_UNAVAILABLE | Official endpoint does not retain that transaction; no success/failure inferred. |
| MISMATCH | Contradictory facts; JSON returns 503 and SSR stops the review. |
| STATE_EXPIRED | Historical confirmation exists but a required entry is missing or past live TTL; never “not registered”. |
| NETWORK_RESET | Current ledger is below the strongest durable confirmation anchor; passphrase alone is insufficient. |

SSR and JSON share the same snapshot guard, including reset propagation over historical receipt labels. A reset whose ledger has already advanced beyond the historical anchor cannot be proven by this simple anchor alone; missing evidence stays uncertainty/expiration, not an invented reset. No restore is attempted.

## Evidence V1 review page

`/review/evidence` is authenticated server-rendered output with no API, parameters, file selector, URL selector or upload. It reuses the previously disclosed fixed 398-byte historical manifest and frozen XDR commitment. Intact bytes verify; a fixed one-byte modification does not. Provenance is a separate historical reference, explicitly not a current chain read. The page states integrity/recorded attestation does **not** certify physical recycling or truthfulness.

## Four-role UI

All roles see an explicit review banner, approved scope, independent lifecycle/transaction/reward lanes and history/evidence references. USER ownRequest stays private. COLLECTOR/RECYCLER show historical role context without operational controls. Only effective ADMIN can create a synthetic registration intent and query its status. A timeout preserves the same in-page idempotency key; there is no automatic replacement intent. Closing the page loses that UI key; durable B1 uniqueness still applies. UI visibility receives no authority credit.

## Route allowlist

`REVIEW_ROUTES` is the method/path source of truth:

| Method | Route |
| --- | --- |
| GET | `/api/me` |
| GET | `/api/batteries/:batteryId` |
| GET | `/api/batteries/:batteryId/history` |
| GET | `/api/review/registration-intents/:operationId` |
| POST | `/api/review/registration-intents` |
| POST | `/auth/login` |
| POST | `/auth/logout` |

Disjoint `*.review.ts(x)` page extensions remove legacy routes, signup, wallet and the generic backend catch-all from the actual DIRECT_REVIEW artifact. LOCAL retains its normal route convention. Build audit compares generated app paths exactly against eight review pages and seven route entries, ignoring only framework error pages. Unknown route = 404; known wrong method = 405 with Allow; non-JSON = 415; over 4096 bytes = 413. Bounded guards precede Auth/SQL. Suspicious observable path escapes, backslashes, doubleslashes and traversal are rejected.

Raw-path caveat: browsers/WHATWG URL and Next may canonicalize dot segments before a Request reaches application code. Raw-policy tests exercise the original string; handler tests exercise the observable Request. A canonicalized valid route remains fully Auth/SQL-authorized and cannot expose an excluded mutation route. This is not a claim to recover pre-normalization ingress bytes; hosted canonicalization must be checked at the later Preview gate.

## Server actions

No `use server` mutation surface. Actual generated server-action manifest must contain zero node/edge actions. Login/logout and the bounded intent are explicit route handlers, not hidden action IDs.

## CSRF/origin

Every review POST requires present Origin, exact equality with actual request origin, membership in the exact configured origins and `Sec-Fetch-Site: same-origin`. Missing headers fail closed. Both immutable and branch Preview origins can be explicitly allowed, but cannot submit across origins. Exact JSON only; body is stream-counted to 4 KB; bounded template input only; intent requires valid Idempotency-Key. Cookies are HttpOnly/Secure/SameSite=Lax. No CORS authority or arbitrary upstream proxy exists.

## Config fail-closed matrix

Required: DIRECT_REVIEW, D2_PREVIEW, TESTNET, exact deployment, `VERCEL_ENV=preview`, branch `instaward/d2-web-mvp`, exact approved HTTPS origins matched to platform immutable/branch host metadata, pinned Supabase URL and publishable/anon-safe key. Optional expected full Git SHA must match platform SHA. Wrong/missing configuration fails 503. Forbidden variable **presence**, even empty, fails at build/runtime.

Forbidden: BYETERY_API_URL, BYETERY_ALLOWED_API_ORIGINS, upstream/demo mutation/MOCK/signing variables, privileged DATABASE_URL, service-role/secret keys and signer paths. The normal ignored legacy `.env.local` is temporarily held, byte-preserved and restored for the isolated local DIRECT_REVIEW build; no real credential is copied into that artifact.

Future server-only DB variables: `BYETERY_REVIEW_DATABASE_URL` with only the restricted review role on Supavisor transaction port 6543; `DATABASE_SSL_CA` containing verified PEM. No admin fallback. Pool max 1, idle 10 seconds, connect 5 seconds, bounded query timeout; unnamed parameterized queries, verified TLS and no session-level SET assumption. Configuration examples contain no passwords or actual DB URLs.

Future remote role policy must additionally set approximately five-second statement and idle-in-transaction timeouts plus a reviewed connection limit. Those remote settings are not provisioned by this task.

## Bundle/secret audit

Audit source plus actual `.next/server` and `.next/static`. Candidate `S[A-Z2-7]{55}` matches receive Stellar StrKey checksum validation; invalid random XDR substrings are not reported as secrets. Browser JS must contain zero Stellar/XDR/signing-library code. Server dependency internals may contain unused primitives; own-code audit separately forbids their use. See machine-readable results for exact final counts.

Pinned new packages: stellar-base 15.0.0, pg 8.23.0, @types/pg 8.23.1. No frontend stellar-sdk. **Existing production audit advisories remain: one critical (Next), two high (sharp/source-map-js); before/after affected-package set unchanged.** Stellar-base is deprecated upstream in favor of SDK, but this task explicitly forbids SDK; compatibility with the frozen receipt/XDR is tested. No opportunistic dependency upgrade or security-policy change was performed. Revisit these limitations before a hosted Preview, without bypassing owner package constraints.

## Local PostgreSQL privilege tests

Real portable PostgreSQL, loopback/high port and guarded data directory, disposable namespaced databases, no cloud credentials. Tests apply existing migrations, unchanged B1 and the B2 artifact locally; validate all four roles, no raw SELECT/DML/adoption, exactly five functions, forced RLS/read-owner attributes, allowlist/active membership intersections, same 404 for unknown/hidden/cross-user, private ownRequest, bounded DTOs, B1 idempotency and WAITING zero effects. Auth UID differs from principal to catch identity confusion. Additional test principals are random local fixtures, not reserved USER2. No new B2 Auth.sessions table/oracle.

## B1/backend immutability

Baseline SHA-256 comparison covers all tracked backend/contract/signer files, B1 SQL and protected files. Acceptance MD/JSON is unchanged. Full root verification includes all 343 backend tests, including B1's 31 tests and existing real PostgreSQL race/authority tests. The native, WASM, release, fmt and Clippy checks preserve the frozen WASM hash.

## Test results

See [machine-readable results](D2-008B2-DIRECT-REVIEW-LOCAL-RESULTS.json) for final counts. Commands: root `npm run verify`; frontend `npm run verify`; isolated DIRECT_REVIEW `npm run build` then `npm run audit:review`; moved browser-harness syntax checks; root credential audit and `git diff --check`.

| Verification | Final result |
| --- | --- |
| Rust native | 21 passed; zero failures |
| WASM-feature suite | 22 passed; zero failures |
| Release WASM / fmt / Clippy `-D warnings` | PASS; original SHA-256 unchanged |
| Backend | 343 passed, zero failures/skips, including all 31 B1 tests |
| Frontend | 274 passed across 17 files; 110 B2 tests and 164 retained tests |
| Frontend typecheck / lint / LOCAL and DIRECT_REVIEW builds | PASS |
| Real local PostgreSQL B2 | 11 passed; zero fixture databases left; local server stopped |
| Python / MOCK demo | 4 passed / complete SENT flow |
| DIRECT_REVIEW build audit | 15 review routes, zero actions, 14 browser chunks, zero Stellar code |
| Source/build seed audit | 355 files; 12 candidates checksum-checked; zero valid secrets |
| Repository/history credential audit | Zero findings |

The Horizon fixture is an earlier recorded public recycling receipt with outer signatures removed; its transaction hash still recomputes exactly. The RPC fixture is explicitly **synthetic offline data**, using the public frozen WASM and correctly encoded storage keys. It proves parsing/guard behavior, not today's chain liveness. No fixture result in this report is presented as a new live verification.

An initial parallel Vitest run passed its executed assertions but hit worker-startup timeouts. The final frontend configuration uses one worker and no file parallelism for reproducible Windows execution; PostgreSQL race tests retain real independent sessions. No backend/contract behavior was altered to accommodate tests. Local build required normal elevated filesystem access for package junction creation; no Windows protection was changed.

One delayed local launcher resumed after PostgreSQL cleanup and its duplicate run reported `ECONNREFUSED` before SQL assertions. The launcher was allowed to finish and the final isolated run used a detached/awaited local pg_ctl invocation with ignored inherited streams and a distinct log. This orchestration error is separate from application correctness; only the complete final run is counted. No B1/backend regression failed.

## Remote mutations: NONE

Supabase project mutation 0; real Auth session experiment 0; Vercel mutation 0; live Testnet queries in CI 0; Stellar transaction 0; operational signature 0; broadcast 0; USER2 NO. Git branch publication only; no main merge or tag change.

## Remaining D2.6 blockers

1. Separate B2A authorization and real Auth/session experiment; finalize strategy/revocation semantics from evidence.
2. Reviewed remote application of B1/B2 SQL, exact deployment allowlists and least-privilege credential provisioning; none done here.
3. Resolve/review existing dependency advisories and permitted stellar-base deprecation constraints before exposure.
4. Confirm actual Vercel plan supports the chosen Protection; **enable Protection before any deployment**. Do not assume a public Preview default is safe.
5. Configure future exact origins, branch/SHA, restricted DB/TLS and root isolation; hosted route/canonicalization/secret readback, real four-role review and live read-only verification remain unexecuted.
6. Any assisted registration/adoption and operational transaction requires its own bounded approval; this package cannot do it.
7. Owner acceptance of D2.6 remains pending.

## Project status

**D1 12/12 PASS; D2 5/6 PASS; D3 0/5; TOTAL 17/23.** Internal owner acceptance only, not Stellar/SDF/Instawards approval, certification or payment. No acceptance count changes. STOP after local evidence publication; do not start B2A.
