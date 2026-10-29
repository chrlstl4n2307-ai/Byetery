# D2-008A — Review access final preflight

**DESIGN / READ-ONLY INFRASTRUCTURE INSPECTION — NOT DEPLOYED.**

Classification: OFFICIAL INSTAWARD SPRINT / FUNDED SPRINT. Owner-authorized planning for D2.6 only. Starting branch `instaward/d2-web-mvp`, checkpoint `462eff63e0480e3b9d1083cd3274b41af553ada5`. Infrastructure snapshots were taken on **2026-10-28 America/Santiago**, including **2026-10-29 UTC** timestamps below; documentation was completed **2026-10-29 America/Santiago**. Proposed names, functions, routes and commands in this report do not exist merely because they are specified here.

**RECOMMENDED D2.6 ARCHITECTURE = B — Next/Vercel server-side review adapter.** Add bounded registration-intent creation to authenticated reads; keep all signing and transaction submission local and explicitly owner-assisted. **D2.6 remains HOLD / NOT OWNER ACCEPTED.**

Current internal owner checkpoint is unchanged: **D1 12/12 PASS; D2 5/6 PASS (D2.1–D2.5); D3 0/5; TOTAL 17/23**. This is Byetery internal acceptance, not Stellar/SDF/Instawards approval, certification or payment. [Authoritative acceptance](D2-OWNER-ACCEPTANCE.md), [JSON](D2-OWNER-ACCEPTANCE.json).

## Current infrastructure inventory

### Inspection method and boundaries

Read existing source/configuration names, repository state and historical reports; used connected Vercel/Supabase MCP **list/get and SELECT-only catalog/application metadata** operations. No credentials, emails, Auth UUIDs, password hashes or session/token contents were output. Local configuration was parsed only for variable names and the database role category. No login/password test, environment upload, provisioning, mutation, deployment, chain call, signing or broadcast occurred.

| Surface | Current observation | Scope / limitation |
| --- | --- | --- |
| Git | Expected branch and starting HEAD; only the two protected untracked files | No implementation change for this task |
| Vercel connected team | `chrlstl4n2307-ai's projects`, ID `team_EuRw1k4ZykOoSP1fBTcumdnO`, slug `chrlstl4n2307-ais-projects` | The visible connected scope, not every possible inaccessible account |
| Byetery project | No match in visible project inventory, explicit `byetery` name search, or exact GitHub repository filter | Two unrelated visible projects were excluded; no Byetery project found in this scope |
| Repository linkage / branch / Preview configuration | No Byetery project to inspect | NOT CONFIGURED/NOT OBSERVED, not a claim that a working Preview exists |
| Deployments | No deployment returned by Byetery app-name filter in this team | No deployment ID or hosted review URL available |
| Vercel environment variable names | No target Byetery project, so none inspectable | No decryption/get-secret request made |
| Local Vercel linkage | Neither root nor frontend `.vercel/project.json` exists | No CLI link or environment pull performed |
| Supabase | `Byetery Dev`, project `aemxuqnnwfclzrwwiqfd`, region `us-east-1`, `ACTIVE_HEALTHY` | Authoritative project metadata; no new project |
| Dedicated Byetery DB role | No role with a Byetery name; no reviewed read-role/function boundary found | Existing private schemas inspected; not a scan for unrelated credentials |
| Existing safe service | No Byetery Vercel deployment, no Supabase Edge Functions, no review/read-session functions found in inspected private schemas | Option C is not established by current evidence; no speculative endpoint probing |
| Local configured DB connection | Role category `postgres` | URL/password never printed; this credential must remain local |
| Historical fixture in SQL | `BYE-W1-002-64257020134D4A0F`: `RECYCLED`, reward `SENT`, confirmed ledger `5315915`, five persisted operations | Projection read only; not a fresh independent chain confirmation |

Supabase catalog snapshot: **2026-10-29T02:43:57.448140Z**. Effective grants/deployment/account aggregate snapshot: **2026-10-29T02:51:13.433697Z**. Public network/contract metadata from that SELECT:

- Deployment: `5c0cad2f-5f25-4216-8068-6cb9d2d26325`, mode `TESTNET`.
- Contract: `CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON`.
- Network ID: `cee0302d59844d32bdca915c8203dd44b33fbb7edc19051ea37abedf28ecd472`.
- Reward amount configuration: `100000000` base units. No reward action is proposed for D2.6.

### Database roles, effective grants and RLS

Inspected `pg_roles` capabilities, role membership edges, schema USAGE, effective table/column privileges and policies. No password catalog was queried. The 15 standard named roles observed are summarized below; no dedicated Byetery role exists.

| Roles | Capability relevant to this decision |
| --- | --- |
| `anon`, `authenticated` | NOLOGIN, no BYPASSRLS; private schema USAGE and all inspected private-table SELECT/INSERT/UPDATE/DELETE denied; no column-level SELECT alternative |
| `authenticator`, `cli_login_postgres` | LOGIN, NOINHERIT, no BYPASSRLS/create-role/create-DB; not an approved application reader |
| `postgres` | LOGIN, BYPASSRLS, CREATEROLE, CREATEDB; effective SELECT/INSERT/UPDATE/DELETE on all 20 inspected private tables and `auth.sessions` |
| `dashboard_user` | NOLOGIN; CREATEROLE/CREATEDB; not an application credential |
| `service_role` | NOLOGIN, BYPASSRLS; no effective private-table DML/SELECT in this inspection, notwithstanding its managed Auth/API authority; prohibited hosted credential |
| `supabase_admin` | LOGIN, SUPERUSER, BYPASSRLS, CREATEROLE/CREATEDB; prohibited |
| `supabase_auth_admin`, `supabase_storage_admin` | Managed LOGIN roles with CREATEROLE; no BYPASSRLS observed; not application reader credentials |
| `supabase_etl_admin` | LOGIN, BYPASSRLS; not application reader |
| `supabase_read_only_user` | LOGIN, BYPASSRLS, member of `pg_read_all_data` and `pg_monitor`; effective SELECT including all private transport and Auth session tables; too broad despite its name |
| `supabase_privileged_role`, `supabase_realtime_admin` | NOLOGIN, no BYPASSRLS observed; not a reviewed application boundary |
| `supabase_replication_admin` | LOGIN, no BYPASSRLS observed; not application reader |

`postgres` also belongs to managed roles including `service_role` and `pg_read_all_data`; NOINHERIT/NOBYPASSRLS must not be defeated by granting these memberships to a proposed role. All **20 private business/transport tables** have RLS enabled **and forced**, with the restrictive `browser_deny` policy (`USING false`, `WITH CHECK false`) for `anon/authenticated`. `auth.sessions` has RLS enabled, not forced, and no policy was returned by this inspection. Browser roles can use the Auth schema but cannot SELECT its sessions. Grants alone do not make a non-bypass reader work under forced RLS.

Four-role aggregate, without exposing account identities: one ACTIVE/enabled ADMIN, one COLLECTOR, one RECYCLER, each with an existing Auth mapping and base USER membership. Five ACTIVE/enabled USER principals have Auth mappings; exactly one has the existing active USER1 wallet link. Collector/recycler application actor bindings match the frozen ABI actors. **`chain_private.actor_roles` has zero rows for this deployment**, so matching application bindings do not prove fresh on-chain actor authorization. No projection was backfilled and no role changed. This is not evidence that an on-chain role was revoked; future positive actions must independently verify chain authority.

## Historical blockers still valid / resolved

Preserved verbatim: [D2-VERCEL-READINESS](D2-VERCEL-READINESS.md) and [D2-VERCEL-READONLY](D2-VERCEL-READONLY.md). Their contemporaneous conclusions/counts remain historical.

| Historical issue | Current conclusion |
| --- | --- |
| Generic backend is unsuitable for direct Vercel wrapping | STILL VALID. `server.ts` initializes transport/Secure Store and startup/interval reconciliation; do not deploy or tunnel it |
| Configured SQL credential is privileged | STILL VALID, freshly verified; a read-only SQL transaction does not remove that credential's capabilities |
| Publishable/browser roles cannot read private projections | STILL VALID, freshly verified effective grants plus forced RLS |
| Dedicated safe hosted read service missing | STILL VALID within inspected scope |
| Current BFF expects distinct external API origin | STILL VALID. Direct review mode requires an explicit code path, not a self-proxy/fake URL |
| TESTNET business POSTs blocked in Preview | STILL VALID. Only the future bounded registration-intent exception should be opened |
| Accepted UI/history/evidence work | ADVANCED since original research: D2.1–D2.5 are owner accepted; reuse them, do not treat old candidate counts as current |
| Four application accounts | MAPPINGS FOUND; hosted password/session usability remains untested, not resolved |
| A2 owner waiting gate | NEWLY CONFIRMED IMPLEMENTATION GAP. `Coordinator.reconcile()` sweeps QUEUED/AWAITING_AUTH/READY/SUBMITTED/UNKNOWN; `TestnetStellarService.processReviewed()` prepares missing work then runs the worker. A plain QUEUED intent would be auto-dispatchable |

Existing `resumeUnsigned()` is a reviewed recovery path requiring original transport work. It is **not** an existing safe owner-waiting queue for a new registration with no preparation. Do not misrepresent it as closing A2.

## Recommended architecture

| Option | Assessment |
| --- | --- |
| A — separate HTTPS read/review API | Technically possible but adds a service, external origin, credentials and deployment without a current need |
| **B — Next/Vercel review adapter** | **Selected**: reuses same-origin BFF/SSR/Auth and UI in one hosted project; bounded DB functions supply reads and one intent write |
| C — existing safe service | No qualifying deployed service found in inspected scope; cannot select an unverified service |

Proposed runtime flow:

```text
Evaluator browser → HTTPS Next UI / same-origin Node routes
  → Supabase Auth: validate exact access token
  → restricted DB role: curated read functions / one registration-intent function
  → existing confirmed projection + independent read-only history verification

Registration intent: hosted operation UUID → waits without transport work
Christian's explicit local adoption of that UUID
  → current authority checks → fresh preparation → local Secure Store
  → existing durable dispatch / reconciliation → same hosted UUID confirmed
```

The hosted import graph must exclude `application/server.ts`, mutable `Repository` initialization, `Coordinator`, `TestnetStellarService`, worker, simulation/preparation/send transport, process spawning and signer modules/binary. Pure domain/hash/DTO/verification helpers and bounded public read-only RPC/Horizon access are allowed. The existing history reader imports a constant from `testnet/rpc.ts`; audit/split that constant dependency before claiming the build excludes transaction transport. Never initialize a transport just to obtain a URL.

Reuse/extract accepted SELECT/DTO semantics from `frontend-reads.ts`, `Repository.view()` and `history/read.ts`; do not call their mutable principal-provisioning path. Keep current LOCAL proxy/MOCK behavior. Add explicit `DIRECT_REVIEW` adapter selection within the existing D2_PREVIEW policy; it has no external API origin requirement. No localhost tunnel, background interval, hosted signing or hosted reconciliation worker. Read-only observation can display locally reconciled durable results; it must not advance transaction state.

## Database least-privilege boundary

**Proposed, not applied.** Choose an EXECUTE-only hosted boundary rather than exposing raw transport tables. The dedicated connection role `byetery_d2_review_app` is LOGIN, NOINHERIT, NOBYPASSRLS, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION; no privileged role membership, schema ownership, CREATE, ALTER, DROP, raw table INSERT/UPDATE/DELETE or raw table SELECT. No default grant to future objects. Normal CONNECT and non-creating USAGE only where needed.

Its application grants are USAGE on a proposed non-Data-API-exposed `review_private` schema and EXECUTE on exactly five fixed functions:

| Proposed function | Allowed effect / output |
| --- | --- |
| `profile(auth_uid, session_id)` | Existing ACTIVE principal, enabled roles, own verified wallet addresses and bounded own requests; no email/Auth UUID/session data in response |
| `battery(auth_uid, session_id, battery_id)` | Confirmed lifecycle/reward, unresolved operation, separate latest terminal/failure provenance, last reward attempt, curated metadata and own request |
| `history_rows(auth_uid, session_id, battery_id)` | Existing chronological operation/event DTOs, original tx hash/network/contract/confirmation-ledger fields; never raw command parameters/XDR |
| `registration_status(auth_uid, session_id, operation_id)` | Original ADMIN's own registration intent, battery/hash/status and final public receipt; no arbitrary operation/principal selector |
| `create_registration_intent(auth_uid, session_id, idempotency_key, battery_id, registration_bytes)` | One atomic, fixed-deployment ADMIN-only registration intent; no preparation/transport/projection write |

Names/signatures are a concrete implementation contract to review, not migration SQL. Identity arguments originate only from server-validated Auth, never client input. The hosted credential is a trusted service boundary; its compromise would permit attempts to impersonate identity arguments within these bounded functions. Do not claim transaction-local identity settings or RLS cryptographically authenticate a compromised server. Narrow outputs/actions, no raw grants, account restrictions and revocable credentials limit this trust.

### Function owners and underlying permissions

Use separate **NOLOGIN/NOBYPASSRLS** read-function and intent-function owner roles; hosted role has no membership/SET ROLE into either. Functions use fixed, fully qualified SQL, fixed deployment, empty search_path, ownership checks, bounded input/results and timeouts. Revoke EXECUTE from PUBLIC, anon/authenticated and all unintended direct grantees, including default privileges for the dedicated function owner. Create/revoke/grant within one reviewed migration transaction so no transient public function exists. Forced RLS stays enabled; add narrowly scoped policies for the new owner roles, leaving all browser-deny policies intact. No broad postgres-owned business-data definer function.

| Source | Underlying read-owner column access / scope (not direct hosted grants) |
| --- | --- |
| `chain_private.deployments` | id/mode/network_id/contract_address/wasm_hash/schema_version/reward_amount and public expected actor/token configuration, exact deployment only |
| `app_private.users` | id/auth_user_id/status; map only validated identity to existing ACTIVE principal; IDs stay internal where not required by existing DTO |
| `api_private.memberships` | deployment_id/user_id/role/actor_address/enabled; current principal only |
| `app_private.wallet_links` | id/deployment_id/user_id/address/verified_at/revoked_at; own rows, never proof/challenge content |
| `app_private.battery_records` | deployment_id/battery_id/metadata/created_at/created_by; authenticated base-USER access; emit only bounded type/manufacturer/batch, not whole JSON |
| `app_private.return_requests` | deployment_id/request_id/battery_id/user_id/reservation_state/created_at; own associations only; no another user's recipient/wallet link |
| `chain_private.batteries` | deployment_id/battery_id/state/reward_state/request_id/confirmed_ledger and public registration/evidence commitments needed by accepted views |
| `chain_private.return_requests` | deployment_id/request_id/battery_id/state/confirmed_ledger; join only scoped/authorized requests; no general recipient enumeration |
| `app_private.stellar_operations` | id/deployment_id/battery_id/request_id/principal/command/state/error_code/created_at; enum-derived lifecycle labels, no parameters for generic read/history |
| `app_private.reward_attempts` | deployment_id/battery_id/request_id/operation_id/state/attempt_number/error_code/created_at; existing read semantics, bounded |
| `api_private.testnet_work` | deployment_id/operation_id/state/confirmation: function emits only presence of real failure confirmation and confirmationLedger; raw confirmation never leaves function |
| `api_private.testnet_envelopes` | deployment_id/operation_id/transaction_hash/network_id/contract_address only; no signed_envelope, signatures, sequence, auth material or raw envelope |
| `app_private.evidence_versions` | Intent owner only: own REGISTRATION bytes/payload_hash and immutable version context to verify/replay own intent; general reader gets only already disclosed D2.5 fixture and public commitments |

The data-function policies use a validated current identity within each call and exact deployment. Each bounded call sets transaction-local `request.jwt.claims` from the server-verified identity arguments, checks `auth.uid()` against that identity and the session oracle, and loads current memberships; the SQL caller cannot supply SQL/role expressions. This is trusted-server context, not JWT signature verification inside PostgreSQL. Pool context is transaction-local and reset, never session-persistent. Own-data restrictions are checked inside each function as well as RLS. Cross-deployment/MOCK reads, missing USER, disabled membership and another principal's registration-status requests fail closed. `chain_private.actor_roles` is not needed for these review reads and is not granted just to make a missing mirror appear valid.

One narrow **live-session oracle** is required because `auth.sessions` is protected: proposed `review_private.active_session(auth_uid,session_id) → boolean`, SELECT-only, exact id/user/not_after, called only by the function-owner roles. It returns no rows/tokens. Its separately reviewed SECURITY DEFINER owner must be able to read those managed Auth columns (existing administrative ownership may be needed); fixed search_path, full qualification and no dynamic SQL. Do not grant hosted raw Auth SELECT or expose the oracle through Data API. **This narrowly privileged exception requires explicit owner review**; if unsupported by the managed platform, STOP and revise the boundary, never disable Auth RLS or copy an admin credential to Vercel.

The intent owner has column-bounded INSERT only on `battery_records`, REGISTRATION `evidence_versions`, `stellar_operations`, and `api_private.idempotency`; UPDATE only `idempotency.operation_id` if needed to link an atomically inserted operation. No Auth/membership/wallet/return/reward/chain/transport mutation authority. It reads only the identity, config and own idempotency/context required to validate registration. RLS WITH CHECK pins creator/principal, deployment, register_battery, QUEUED, null request, immutable hashes, version/kind and null waiting response. Ordinary data reads run in READ ONLY transactions. The single intent call is an explicitly bounded write transaction; do not call this architecture a purely read-only credential.

Use existing registration canonicalization/validation and the same immutable manifest bytes/hash/command hash/idempotency definitions. The function derives the command/hash from its bounded inputs, checks bytes/hash/manifest context/metadata size, and cannot accept arbitrary command/role/state/recipient. Keep existing unique constraints, duplicate and pending-operation checks; serialize same-principal idempotency and same-battery contention, use atomic rollback on conflict. Same key + same input → same UUID/status; changed input → 409. Do not cache a waiting 202 as an immutable terminal result. No generic query, SQL, URL or mutation endpoint. Local PostgreSQL migration/grant/RLS/negative tests must prove these boundaries before any cloud apply.

## Auth/session design

1. Preserve current same-origin SSR login/logout with the existing Supabase project/publishable key. Secure, HttpOnly, SameSite=Strict, path `/` cookies in HTTPS Preview. Do not replace login with fake sessions, role selectors or fixture aliases.
2. Server validates the **exact access token** with Supabase Auth (`getUser(token)` / existing `/auth/v1/user` semantics), checks returned identity, expiry/authenticated claim and matching UUID `session_id`. `getSession()` alone is transport, not authorization.
3. Within every protected read/intent function, verify that the corresponding live session exists for the verified Auth identity and is not past `not_after`; then map to existing ACTIVE principal and current enabled deployment memberships. Do not relax the current post-logout check just because the JWT is not expired.
4. `Repository.principal()` is prohibited here because it inserts users/default USER memberships. No request-time provisioning. Missing principal/required membership → fail closed; preserve the accepted no-protected-data profile behavior where applicable.
5. ADMIN intent requires current USER + ADMIN. Collector/recycler interfaces require their actual current memberships; browser role, user_metadata, query fields and client IDs never establish authority. Revalidate every request, not only login.
6. Bounded queries/pool (initial cap two connections per warm instance, validate total concurrency against project limits), statement/query timeouts, verified TLS/CA, parameterized SQL and no-store responses. Use a tested Supabase transaction pooler connection compatible with custom role and Node pg; no named prepared statements or session-level identity state. Connection/auth outage → controlled unavailable response, never fallback to MOCK or fabricated success.
7. Exact POST Origin/CSRF checks for Auth and the sole intent action; response source/deployment/contract/network fixed by trusted server configuration. No cookies, Authorization, DB URLs or form bodies in logs/error telemetry/screenshots.

Official Auth docs confirm server `getUser` validation and that a live `auth.sessions` lookup is needed for immediate sign-out rejection; see Sources. No Auth settings or session controls were changed in this task.

## Four-role account plan

| Sanitized alias | Reuse candidate now | Future documented checks | Stellar key to evaluator |
| --- | --- | --- | --- |
| EVAL_USER | Existing ACTIVE USER1 principal/Auth mapping with verified wallet; five USER candidates total, choose the existing USER1 locally | Actual login, own profile, QR lookup, accepted three lanes/history/evidence; forbidden ADMIN/collector/recycler actions rejected | NONE |
| EVAL_ADMIN | One existing ACTIVE ADMIN + USER Auth mapping | Actual login, ADMIN interface, create bounded intent, wait, same UUID confirmed after owner assistance | NONE |
| EVAL_COLLECTOR | One existing ACTIVE COLLECTOR + USER mapping; binding matches frozen collector | Actual login, collector interface; USER/role separation and disallowed writes; inspect accepted collection evidence | NONE |
| EVAL_RECYCLER | One existing ACTIVE RECYCLER + USER mapping; binding matches frozen recycler | Actual login, recycler interface; USER/role separation and disallowed writes; inspect accepted recycling evidence | NONE |

Do not create duplicate users or expose Auth UUIDs/emails in public evidence. Intentionally select existing principals before review and confirm distinct application accounts, exact memberships/actor bindings and USER1 wallet unchanged. Aggregate inspection proves mapping existence, **not** knowledge of passwords or successful hosted logins. It does not establish that every existing USER is an approved evaluator.

If credentials are not usable, obtain separate authorization for official Supabase Auth Admin `auth.admin.updateUserById(existingId, { password })` with local masked input/private delivery; use an admin credential only from Christian's local tool. Never read/recover password hashes or SQL-update encrypted_password. No reset/create performed now. Any new principal or membership would require explicit additional scope, not automatic provisioning. Share application credentials privately, outside Git/logs/evidence, for a declared window; reset/revoke review access afterward without deleting historical IDs, wallet links or bindings.

**Minimum defensible D2.6 scope:** four real role logins and usable role-specific review interfaces, negative authorization checks, accepted D2.1–D2.5 evidence, plus one positive owner-assisted ADMIN registration. Positive collection/recycling/return/reward execution is **not** required for this access criterion and would add a lifecycle/signers unnecessarily. Label those action controls as unavailable in this review mode rather than imply that a disabled action was positively exercised. If the owner/evaluator requires positive collector/recycler mutations, STOP for a separately reviewed scope; do not claim them from interface visibility.

## A2 ADMIN architecture

### Hosted creation and waiting state

Retain `POST /api/batteries` body shape (`batteryId`, bounded metadata) and Idempotency-Key, but in DIRECT_REVIEW it invokes only the bounded intent function. Response includes source TESTNET, deployment, operation UUID, battery ID, registration hash, server timestamp, `AWAITING_ADMIN_SIGNATURE`, null transaction hash and **unconfirmed** lifecycle. Principal is the server-derived existing ADMIN, stored internally, never selected by browser. Add authenticated own-operation `GET /api/operations/:operationId` for polling/status; original battery detail also shows accepted independent state lanes.

Reuse **the same** `stellar_operations` row/idempotency/immutable REGISTRATION evidence. No second registration table, shadow state machine or contract change. Proposed waiting display is a strict subtype: TESTNET + `register_battery` + operation QUEUED + **no `testnet_work` and no envelope**. It is not on-chain REGISTERED or CONFIRMED, and must not be overloaded onto UNKNOWN or an error field. Do not hold a source/worker lease, auth-entry nonce, expiration or time bounds while Christian is unavailable.

**Mandatory first-dispatch guard:** change the future local service entry boundary so automatic process/prepare/submit/reconciliation cannot create the first transport work for any unadopted Testnet registration. A hosted QUEUED row alone is unsafe today. Add a separate local-only adoption entrypoint that serializes this one UUID and creates its **existing** testnet_work through the existing queue logic only after Christian explicitly takes it. Subsequent work uses the existing transport state machine; do not alter GAP2 continuous authority/first-dispatch locking. Direct prepare/submit and worker callers must fail closed if adoption has not occurred; excluding the hosted worker alone is insufficient while Christian's local generic server may run.

No long-lived adoption table is necessary if creation of the existing transport work is the atomic adoption boundary: only the local explicit entrypoint may first create it for registration, guarded by op-level serialization and no prior identity; normal/recovery paths cannot create it implicitly. Concurrent adoptions yield one original work identity. Prove this with startup reconciliation, direct-call and competing-adoption tests before applying the intent writer. If that boundary cannot be represented safely in existing durable work/constraints, STOP for a reviewed minimal schema design rather than invent a magic error/status or weaken leases.

### Local owner handoff (future command, not implemented)

Proposed `npm run review:adopt-registration -- <operation_id>` accepts **only a UUID**, never seed, supplied XDR, hash override, source override, method, alternate network or arbitrary payload. It uses Christian's existing local authenticated/trusted DB access, not a public tunnel or hosted signing endpoint. Privileged existing local access stays local; no evaluator/Preview access to it.

1. Load the immutable original operation and REGISTRATION bytes via trusted SQL; check exact deployment/network/contract, register_battery, expected battery/hash/command hash and input/idempotency association. Recompute hashes from persisted bytes using existing encoder. Inspect decoded intent locally without emitting PII or signing material.
2. Verify original principal ACTIVE and enabled USER + ADMIN now, not a replacement principal; then serialize adoption, confirm still waiting and no original transport/envelope/dispatch. Do not persist/replay evaluator access tokens or require their private wallet. Current authority remains subject to the existing GAP2 checks through the first durable broadcast boundary.
3. Identify exact existing ADMIN source `GBZ4HNGFYAA7FXRYECY4LBSIKSQPJPUFYJZALOWGTXUURNDR5OINUT2F`; record current sequence, ledger, balance and whether any other manual/Byetery workflow uses it. Coordinate a quiescent assisted window; an application lease does not protect transactions outside Byetery. No new source account is authorized here.
4. Fresh authoritative chain/config/registration-absence reads; fresh ledger, current source sequence, simulation, bounded time/auth expiry, authorized single invocation. Never prepare at initial evaluator submission. If state differs or registration already exists without reconciliation proof, STOP before signing.
5. Existing local signer independently decodes XDR: Testnet, exact contract, **register_battery**, exact battery ID/registration hash/source, one expected operation/invocation, no set_role/unexpected operation, bounded time/auth expiry, exact SDK hash, cap **50,000,000 stroops**. Keep the existing phased protocol as applicable; do not invent a separate signature phase when source-account authorization suffices. No Rust signer change is proposed or performed.
6. Persist the final original signed identity before send. Immediately reread source sequence before broadcast: mismatch with preparation input → **DO NOT BROADCAST; DO NOT automatically reprepare; reviewed resolution required**. Also preserve existing authority/lease/expiry gates. Submit only the persisted original envelope once through existing durable dispatch.
7. Reconcile original hash; timeout/SUBMITTED/UNKNOWN is uncertainty, not failure and not replacement permission. Local bounded reconciliation projects independently confirmed results using existing code; it does not require a hosted timer. The hosted status read refreshes the **same UUID** to CONFIRMED only after durable confirmation; historical verification independently checks receipt/contract/method/arguments/ledger. No second identity/reward/lifecycle is generated.

Christian must be available during a declared review window. Outside it, an unsigned intent can wait indefinitely without an envelope/lease; availability is not advertised as autonomous 24/7 signing. If preparation/signing later stalls, existing bounded recovery rules apply; a signed/UNKNOWN transaction must not be reset as a fresh intent.

## Operational signer decision

| Identity | Hosted requirement for D2.6 | Reason |
| --- | --- | --- |
| ADMIN | **NOT REQUIRED FOR D2.6** | Key remains exclusively local; the required positive registration is human assisted |
| SERVICE | **NOT REQUIRED FOR D2.6** | No new open/cancel return, collection or reward in minimal access review |
| COLLECTOR | **NOT REQUIRED FOR D2.6** | Real app login/interface/negative checks and accepted historical evidence; no new collection |
| RECYCLER | **NOT REQUIRED FOR D2.6** | Real app login/interface/negative checks and accepted historical evidence; no new recycling |

Issuer/wallet/TTL keys are also unnecessary. No signing key, Secure Store material or signer binary goes into hosted deployment, environment, browser or evaluator instructions. If the eventual review cannot satisfy its agreed checks without a hosted private key, STOP for separate owner review; prior availability is not authorization to upload one.

## Vercel Preview design

Create no resource now. Future target is the observed team, existing GitHub repository, exact branch `instaward/d2-web-mvp`, Next.js **Node** routes, project root `frontend`, Node 24 matching current engines. Use locked package installs and existing build scripts; configure necessary monorepo access to reviewed pure shared sources/dependencies without bundling the backend server. Verify dependency tracing/build artifacts rather than copying the whole repository or uploading `.tools`/environment files.

Add no Production deployment, domain promotion, main branch change, merge or tag. Vercel Git integration normally deploys branch pushes and production-branch changes, so **do not import a repository through an automatic first-production deployment flow**. Future provisioning should create an empty project without Git auto-deploy, configure Preview-only restrictions first, then explicitly submit the reviewed branch/commit as Preview. Keep automatic Git deployment disabled for the initial review (repository association/commit provenance recorded through the approved deployment mechanism). If the supported creation path cannot prevent an automatic Production deployment, STOP; do not deploy and hope to cancel it later.

Preview secrets are branch-scoped and separate from Production. Choose an exact canonical HTTPS branch alias/approved deployment origin after the project identity is known; validate it against platform-provided deployment/branch URLs and an explicit allowlist. No wildcard `.vercel.app`, localhost fallback or self-upstream. Bootstrap canonical-origin validation without opening a publicly usable app before configuration is complete. Record immutable deployment URL/ID and git SHA alongside any moving alias. Branch name alone is not proof of the deployed commit.

Vercel Deployment Protection must allow the intended evaluator through an approved platform access method or ordinary public Preview+app Auth, with no embedded protection bypass token. Resolve that access choice before inviting the evaluator. Authenticated application pages stay no-store; role/profile cookies and private responses must not be cached across users. Retain existing safe headers. D2 QR acceptance can use the real QR lookup URL; camera permission changes are not required for this criterion.

Before publishing, inspect server/browser bundles, function dependencies, sourcemaps, build/runtime logs and upload manifest for forbidden modules/credentials. Read-only public chain verification permits only fixed Testnet RPC/Horizon read methods and known hashes, never simulation/send/URL input from evaluator. RPC retention misses must retain accepted UNVERIFIED semantics or verified official Horizon fallback, never manufacture success. Rerun relevant local/auth/RLS/A2/build suites during future implementation; the historical successful build is not proof the future adapter works.

## Environment variable classification

**NAME ONLY. No values are included in this matrix.** Proposed names are not existing Vercel variables. PUBLIC means intrinsically public information, not permission to prefix every variable for client bundling.

| Variable name | Classification | Intended treatment |
| --- | --- | --- |
| BYETERY_WEB_ENV | SERVER-ONLY NON-SECRET | Existing explicit Preview policy |
| BYETERY_SOURCE | PUBLIC | Visible source marker, validated server-side |
| BYETERY_DEPLOYMENT_ID | PUBLIC | Pinned public deployment identifier |
| BYETERY_WEB_ORIGIN | SERVER-ONLY NON-SECRET | Exact canonical HTTPS origin |
| BYETERY_ALLOWED_WEB_ORIGINS | SERVER-ONLY NON-SECRET | Exact allowlist |
| BYETERY_REVIEW_ADAPTER | SERVER-ONLY NON-SECRET | Proposed explicit direct-review selection |
| BYETERY_API_URL | SERVER-ONLY NON-SECRET | Omit in DIRECT_REVIEW; retained only for existing distinct-upstream modes |
| BYETERY_ALLOWED_API_ORIGINS | SERVER-ONLY NON-SECRET | Omit in DIRECT_REVIEW; no fake/self origin |
| SUPABASE_URL | PUBLIC | Existing Auth project |
| SUPABASE_PUBLISHABLE_KEY | PUBLIC | Auth client only; no private data grants implied |
| SUPABASE_PROJECT_REF | PUBLIC | Optional metadata, not a credential |
| BYETERY_REVIEW_DATABASE_URL | SERVER-ONLY SECRET | Proposed dedicated restricted connection; never current admin URL |
| DATABASE_SSL_CA | SERVER-ONLY NON-SECRET | Integrity-sensitive TLS trust configuration; no local Windows path uploaded, no TLS disabling |
| VERCEL | SERVER-ONLY NON-SECRET | Platform metadata |
| VERCEL_ENV | SERVER-ONLY NON-SECRET | Platform metadata |
| VERCEL_URL | SERVER-ONLY NON-SECRET | Platform deployment metadata |
| VERCEL_BRANCH_URL | SERVER-ONLY NON-SECRET | Platform branch metadata |
| VERCEL_GIT_COMMIT_REF | SERVER-ONLY NON-SECRET | Branch guard |
| VERCEL_GIT_COMMIT_SHA | SERVER-ONLY NON-SECRET | Commit provenance |
| VERCEL_OIDC_TOKEN | SERVER-ONLY SECRET | If platform supplies it, not needed by app, never expose/log |
| DATABASE_URL | PROHIBITED | Existing privileged connection must not be uploaded or inherited |
| SUPABASE_SERVICE_ROLE_KEY | PROHIBITED | Not required in hosted app; any later exception needs separate authorization |
| SUPABASE_SECRET_KEY | PROHIBITED | Same hosted prohibition |
| BYETERY_SIGNER_BINARY | PROHIBITED | No hosted signer |
| BYETERY_LOCAL_TESTNET_MUTATIONS | PROHIBITED | Local demo switch must not enable hosted writes |
| STELLAR_ADMIN_SECRET_KEY | PROHIBITED | Includes any alternative seed/private-key variable name |
| STELLAR_SERVICE_SECRET_KEY | PROHIBITED | Same |
| STELLAR_COLLECTOR_SECRET_KEY | PROHIBITED | Same |
| STELLAR_RECYCLER_SECRET_KEY | PROHIBITED | Same |
| STELLAR_ISSUER_SECRET_KEY | PROHIBITED | Same |
| STELLAR_WALLET_SECRET_KEY | PROHIBITED | Same |
| NEXT_PUBLIC_DATABASE_URL | PROHIBITED | All privileged NEXT_PUBLIC variants forbidden |
| NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY | PROHIBITED | Same |

No seeds, recovery phrases, private keys, evaluator passwords or Secure Store contents belong in any environment variable regardless of name. No env upload/pull/change occurred.

## Review runbook

**Future assisted window; not executed by this preflight.** Privately share only application login details and the exact hosted HTTPS URL. Public instructions use aliases, no passwords/emails/Auth UUIDs.

1. Check approved Preview URL/deployment/commit, source TESTNET and exact deployment. Open review-window notice; Christian confirms availability.
2. Login EVAL_USER normally. View profile and known battery `BYE-W1-002-64257020134D4A0F` by its existing QR/lookup; QR grants no action authority. Show separate lifecycle, tx and reward lanes; confirmed recycling does not by itself mean reward sent.
3. Inspect chronological timeline and original public hashes/ledger/contract; verify current receipts against official Testnet read sources. An unavailable/unverifiable entry stays UNVERIFIED. Review accepted [D2.3](D2-007-STATE-LANES.md)/[D2.4](D2-003-TIMELINE.md) evidence, with local negative fixtures explicitly separate.
4. Inspect [Evidence V1](D2-006-EVIDENCE-V1.md), the exact disclosed historical file, expected commitment, intact verification and one-byte tamper rejection. Reuse the existing pure verifier via a minimal offline UI wrapper or documented existing CLI; no arbitrary remote file URL/private DB evidence exposure and no truth-of-physical-event claim.
5. Verify forbidden role/action attempts are rejected with no effects; logout. Login EVAL_ADMIN using the normal Auth path and verify current role.
6. Submit **the one pre-agreed synthetic review battery** once with the documented idempotency key/metadata. Observe operation UUID/hash and AWAITING_ADMIN_SIGNATURE, no tx hash/no confirmed lifecycle. Replay identical request references the same UUID; never creates another registration.
7. Christian explicitly adopts that UUID locally and performs the reviewed safety flow. Evaluator handles no wallet seed/XDR/signing step. Refresh same operation until independently confirmed or accurately uncertain; do not retry with a different identity after timeout.
8. Record SUCCESS/CONFIRMED, original hash, confirmation ledger, exact contract/method/battery/registration hash and ADMIN authorization/source evidence. Logout.
9. Login EVAL_COLLECTOR, verify collector interface/current role and documented rejection/access checks; inspect accepted collection history. No positive collection transaction. Logout.
10. Login EVAL_RECYCLER, verify recycler interface/current role and documented rejection/access checks; inspect accepted recycling/reward history. No new recycling/reward. Logout; end window and revoke/reset evaluator access only under the approved closure procedure.

Public future artifacts: `D2-008-REVIEW-ACCESS.md` and sanitized results JSON with hosted URL, Vercel ID/SHA, deployment/source, four login results, safe screenshots, accepted D2.1–D2.5 links, fixture, one A2 UUID/hash/ledger/contract/method, ADMIN source/authorization evidence, assisted timestamps, no-key handover declaration, bundle/log/secret audits and unresolved limitations. A successful UI submission is not a chain receipt.

## Exact cloud mutations needed next

**Every item below is PROPOSED and requires new explicit owner authorization. None was executed.** These are independently reviewable scopes; approval of planning is not approval of their execution.

| Step | Exact change / prerequisite | Risk | Rollback / containment | Secret handling |
| --- | --- | --- | --- | --- |
| 1 — local implementation | Implement DIRECT_REVIEW adapter, read-only principal lookup/DTOs, bounded intent/status, A2 first-work adoption guard and UUID-only local tool; reuse hashes/transport/authority. Add unit/integration/concurrency/bundle tests. Before any cloud resource changes | Automatic dispatch or altered accepted authorization if guard is incomplete | Do not activate intent writer until tests prove waiting/adoption; revert scoped code, retain D1/accepted evidence | No new secret; existing local credential remains ignored/local |
| 2 — reviewed SQL boundary | Draft/test migration locally; create dedicated LOGIN review role and NOLOGIN owners, private function schema, explicit column grants/functions/RLS described above; privileged session oracle separately reviewed. Then only with apply authorization apply exact audited migration to existing Supabase project | Grants/definer/RLS bug, managed Auth permission unsupported, pooler role incompatibility | Revoke review LOGIN/EXECUTE and bounded policies/grants; leave browser deny/forced RLS unchanged; retain immutable historical records; unsupported oracle → STOP | One new restricted DB credential, generated/delivered through private approved mechanism, never logs/Git; no reused admin secret |
| 3 — four-account access | Select existing USER1/ADMIN/COLLECTOR/RECYCLER mappings; verify bindings. If needed, separately authorize password reset through official Auth Admin, only existing IDs; otherwise no Auth mutation | Reset may terminate sessions/disrupt a demo; credential leakage | Private reset/revocation after window, preserve IDs/memberships/wallet/history; never SQL password patch | Temporary application passwords via private channel/local masked entry; admin credential stays local |
| 4 — empty Vercel project/config | Create project in observed team; root frontend/Node settings; no auto-deploy/Git production trigger; exact repo/branch/commit association and Preview-only access/origin policy. No deploy in this step | Automatic Production build or unintended public/protected access | Keep auto-deploy disabled; remove unused project/config if needed, no production promotion | No signing/admin credential; platform control-plane auth remains local/connector |
| 5 — Preview variables | Set name-only matrix's required config and restricted DB secret, **Preview/exact-branch scope only**; determine supported CA representation/pooler endpoint with TLS | Secret spill/wrong DB/origin scope | Revoke restricted role/credential; remove Preview vars; do not copy local `.env` wholesale | Only restricted DB credential is application server secret; existing Auth publishable key is public |
| 6 — one reviewed Preview | Deploy exact reviewed git SHA to Preview after tests/config/audit; inspect upload/bundles/logs; record immutable URL/ID/branch/SHA. No main/Production/tags | Wrong commit/environment, leaked build input | Disable/delete Preview and revoke DB login; no destructive database cleanup | Audit all outputs, no credentials in screenshots/logs; evaluator app passwords separately delivered |
| 7 — hosted review without signing | Run four actual logins, session revocation and role checks, existing history/evidence/state views and effect-free forbidden POST checks. No new intent/chain action yet | Login/session regression, unverified history displayed as success | Stop review, keep D2.6 HOLD, disable adapter if needed; no account creation workaround | Auth cookies stay in browser/server; no recorded tokens |
| 8 — assisted registration | Explicitly authorize one exact synthetic battery/manifest/hash, ADMIN UUID and review window. Hosted intent + local adoption + single registration submission described below, only after previous gates pass | Irreversible Testnet registration, account sequence race, uncertain receipt | Before signing: stop safely; after persisted signed identity: preserve/reconcile original only; no replacement, no deletion or second registration | ADMIN key remains local Secure Store; no upload/export |
| 9 — evidence/owner checkpoint | Publish sanitized hosted/role/A2 audit evidence; separately request owner acceptance once every condition passes | Overstating readiness or accepting without evidence | Correct report transparently, preserve historical counts; D2.6 HOLD until explicit acceptance | No secret in public package |

No unrelated DB schema changes, memberships, actor roles, wallet links or contract/WASM/signing implementation changes are included. If new membership, managed Auth schema changes or Rust signer changes are needed, stop and submit a minimal separate proposal. Tests for future implementation must include no work/envelope/lease while waiting, no auto-dispatch via startup/direct paths, concurrent adoption exactly once, current ADMIN revocation, idempotent replay, original-hash UNKNOWN behavior, actual restricted-role denied raw grants/cross-user/cross-deployment, four hosted sessions and accepted D2 read regressions.

## Exact Testnet action needed later

**This preflight: 0 new Testnet transactions, 0 operational signatures, 0 broadcasts, 0 chain calls. USER2 unused.**

Future separately authorized action is exactly **one `register_battery`** at the pinned contract/deployment, using the existing ADMIN source, one agreed new synthetic battery ID and the exact canonical registration hash held by the durable operation. No new lifecycle/return/reward, no USER2, no asset/trustline/role change, no maintenance/TTL transaction, no redeploy, no Mainnet. The specific new battery/hash/UUID/window are **not chosen or authorized by this report**.

Preflight that future action against fresh chain and SQL, including source account usage/sequence/ledger/balance, contract availability, exact ADMIN/config and absence of existing battery. Existing TTL evidence is historical, not a guarantee of future liveness. If restoration or any maintenance is needed, STOP for separate authorization. All signer checks and original-identity durable dispatch gates above apply. A sequence mismatch or uncertain result does not grant permission for a replacement.

Future D2.6 PASS requires **all 12 owner conditions**, checked individually in results: (1) accessible HTTPS; (2) exact Preview/branch/deployment/commit; (3) four actual roles; (4) no signing keys given to evaluator; (5) real Auth/session controls; (6) accepted D2.1–D2.5 reviewable; (7) assisted registration real SUCCESS/CONFIRMED; (8) same UUID from intent to confirmation; (9) public hash/ledger/contract/method; (10) ADMIN authorization/source evidence; (11) clean repo/build/browser/log/evidence secret audit; (12) no MOCK represented as Testnet. Any missing item → **HOLD**, never automatic PASS.

## Risks

- The adapter, DB boundary and A2 adoption guard are **not implemented**; historical local build/test success does not establish hosted readiness.
- A definer function is a privilege boundary, even without a hosted admin credential. The session oracle is intentionally narrow but privileged; owner review and actual denied-access tests are mandatory. Forced RLS and browser base-deny are preserved.
- Pooler authentication/custom-role/TLS support must be tested with the actual restricted role; no automatic fallback to postgres, service_role or disabled certificate verification.
- Four mappings are not four usable hosted logins. Current actor bindings match, but SQL actor-role projection is empty; it is not fresh chain authority evidence. No role/projection repair is authorized.
- Intent creation is a durable application write, not an attestation. An unused immutable battery record cannot be cleaned up by weakening Foundation constraints. Use clearly synthetic data and retain it if required.
- A2 requires human availability and shared-source coordination. Expiry/lease/sequence/UNKNOWN handling must not be replaced by re-sign/reprepare loops. No global application lease protects manual transactions.
- Read-only RPC/Horizon availability and retention can prevent fresh verification; preserve UNVERIFIED and separate chain facts from projection state. Archived contract data may require separately authorized restoration.
- Vercel automatic Production deployment, protection/login loops, moving aliases, serverless pool pressure, cross-user caching and bundling local tooling are deployment gates, not reasons to weaken policy.
- D2.6 access scope does not assert a new full four-role lifecycle was executed. Any demand for positive collector/recycler transactions changes the minimal plan and requires owner review.

## STOP conditions

Stop before implementation/cloud mutation/signing unless its numbered scope is explicitly authorized. Also stop on wrong repo/branch/commit/deployment/source; unexpected tracked/protected changes; proposed broad grants/managed Auth schema edits; unsupported safe session check; need for hosted signer/admin SQL key; failed Auth/missing principal/binding drift; waiting intent auto-dispatch; concurrent second identity; changed manifest/hash/source; sequence drift; missing chain data requiring maintenance; failed build/audit; Production/main/tag changes; or any UNKNOWN result requiring reviewed resolution.

**After this documentation commit/push: STOP for OWNER review. Do not deploy, implement the adapter, reset passwords, apply SQL, execute registration, start D3 or change D2.6 to PASS.**

## Verification for this documentation checkpoint

Documentation required sections/relative links, JSON/status consistency and doc-only path scope: **PASS**. `git diff --check`: **PASS**. Existing secret audit before staging: **510 files, 632 historical blobs, zero findings**; audit is repeated over the explicit staged publication set before commit. Protected-file, historical-report and owner-acceptance byte hashes and original refs/tags: **unchanged** against the pre-edit snapshot. Full Rust/backend/frontend suites are intentionally not rerun: the owner's D2-008A instruction permits targeted documentation verification when implementation is untouched. No new test PASS is claimed for proposed infrastructure. Publication receipts and final remote HEAD are reported after commit/push rather than self-referencing a not-yet-created commit in this file.

## Sources and implementation evidence

- Existing code: `frontend/src/lib/web-config.ts`, `frontend/src/app/api/[...path]/route.ts`, `frontend/src/lib/server.ts`, `backend/src/application/{auth,repository,coordinator,frontend-reads,server}.ts`, `backend/src/history/{read,verify}.ts`, `backend/src/testnet/{service,abi}.ts`, existing migrations, `tools/stellar-secure-store-signer/src/lib.rs`. Read only, not modified.
- Connected Supabase MCP project/catalog/grants/deployment and sanitized account aggregates, timestamps above; connected Vercel MCP team/project/name/repository/deployment inventory. [Sanitized plan JSON](D2-008A-REVIEW-ACCESS-PREFLIGHT.json). These observations do not claim public hosted availability or current chain state.
- [Supabase getUser](https://supabase.com/docs/reference/javascript/auth-getuser) and [session/sign-out validation](https://supabase.com/docs/guides/auth/sessions#how-to-ensure-an-access-token-jwt-cannot-be-used-after-a-user-signs-out): consulted through official documentation/MCP.
- [Supabase database function security](https://supabase.com/docs/guides/database/functions#secure-a-database-function): definer privilege, ownership checks, explicit execution grants and fixed search_path; consulted for the proposed boundary, no function created.
- [Vercel monorepo root directory](https://vercel.com/docs/monorepos), [Git deployment behavior](https://vercel.com/docs/git), [branch-scoped environment variables](https://vercel.com/docs/environment-variables/manage-across-environments): official docs consulted; no Vercel change performed.
- **Stellar Raven consulted first** for protocol timing: `stellarDocs.search_docs` exact `signature_expiration_ledger`, observed **2026-10-29T02:50:47.464Z**, returned official [Soroban auth-entry structure](https://developers.stellar.org/docs/build/guides/transactions/signing-soroban-invocations#auth-entry-structure). Authorization expiry is ledger-bounded; this supports late preparation under A2, not an architecture change or deployment authorization. Earlier broader queries were adjacent and were not used as evidence. Existing signing invariants, fee cap and source safety remain authoritative for Byetery.
