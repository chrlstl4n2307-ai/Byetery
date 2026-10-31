# D2-008B4.1 — Restricted credential and real session verification

## STATUS

**D2-008B4.1 = B4.1 RESTRICTED CONNECTION PASS.**

Date: 2026-10-30 (America/Santiago). Supabase DEV project `aemxuqnnwfclzrwwiqfd`, deployment `5c0cad2f-5f25-4216-8068-6cb9d2d26325`. Real database role: `byetery_d2_review_app`. This gate proves database authority/connectivity only; D2.6 remains pending.

## PRE-PROVISION STRUCTURE

Explicit READ ONLY administrative verification at `2026-10-30T23:42:20.846105+00:00` matched the B4 final matrix: exact role flags/owners/ACLs/function bodies/search_path, five effective entrypoints, no hosted membership, no raw table/column authority and no owner SET/CREATE bridge. No password verifier/hash field was queried.

Extended before/after comparison also covers CONNECTION LIMIT, VALID UNTIL, role config, review schema ownership/ACL, policies and constraints. The four review tables were empty and remain empty. Preflight and password-provision phases were separate, with a fresh structural read immediately before the interactive password command.

## PASSWORD PROVISIONING

**SUCCESS.**

## POST-PROVISION STRUCTURE

Immediate administrative READ ONLY check after the password command passed. A further administrative check after the restricted session, at `2026-10-30T23:44:00.527608+00:00`, remained identical to the pre-provision normalized snapshot. Attributes, memberships, schema privileges, function ACL/definitions/owners, RLS/policies, connection limit, VALID UNTIL, role config and constraints did not change.

permissions=0, registration_intents=0, review_access=0, review_batteries=0. No binding or business operation was performed.

## RESTRICTED CONNECTION

**One actual restricted login, successful on the first attempt**, with native `psql -X -W`, using the existing approved shared-pooler host from local trusted configuration, transaction mode port **6543**, database **postgres**. Pooler username shape: `byetery_d2_review_app.aemxuqnnwfclzrwwiqfd`.

The owner typed the new secret into the native no-echo prompt. No password-bearing URL was created; no new password was passed in arguments, environment or files. PostgreSQL role identity was positively checked before any permission probe. The session exited successfully after its complete PASS marker.

## TLS

Sanitized client evidence: `SSL connection (protocol: TLSv1.3, cipher: TLS_AES_256_GCM_SHA384, compression: off, ALPN: none)`.

`sslmode=verify-full` and the existing verified CA handling remained enabled. The native client would reject a certificate/hostname verification failure. Only the public TLS metadata line was retained from the client connection output. The previously documented pooler/backend `ssl=false` was not treated as a client TLS failure, and no enforcement/configuration change was made.

## CURRENT_USER / SESSION_USER

Both are exactly **`byetery_d2_review_app`** in the real restricted session. The first identity/catalogue checks ran in an explicit READ ONLY transaction.

## ROLE ATTRIBUTES

LOGIN=true; INHERIT=false; SUPERUSER=false; BYPASSRLS=false; CREATEDB=false; CREATEROLE=false; REPLICATION=false. All match B4 and the pre-provision snapshot. Other role options, including CONNECTION LIMIT and VALID UNTIL, remained unchanged. No password verifier was inspected to prove the credential: successful real login is the proof.

## MEMBERSHIP / SET DENIALS

Membership count **0**. Effective SET paths to intent_owner and read_owner are false. Both active SET ROLE probes returned **42501**, with RESET ROLE immediately afterward. Each probe also checked that current_user remained the restricted base role before continuing.

## SCHEMA CREATE DENIAL

`has_schema_privilege(current_user,'review_private','CREATE') = false`. The schema stays postgres-owned; no schema privilege or ownership was changed.

## EXACT FIVE EXECUTES

Exactly these effective EXECUTEs were observed from the real restricted session:

1. `review_private.battery(uuid,text)`
2. `review_private.create_review_registration_intent(uuid,text,jsonb)`
3. `review_private.history_rows(uuid,text)`
4. `review_private.profile(uuid)`
5. `review_private.review_registration_intent_status(uuid,uuid)`

All eight other reviewed functions remain denied:

- `review_private.adopt_registration_intent(uuid)`.
- `review_private.create_registration_intent(uuid,text,jsonb)`.
- `review_private.immutable_intent()`.
- `review_private.operation_dto(uuid)`.
- `review_private.registration_intent_status(uuid,uuid)`.
- `review_private.require_authority(uuid)`.
- `review_private.resolve_review(uuid)`.
- `review_private.visible_battery(uuid,text,text)`.

No allowed or denied business/review function was invoked. These results use pg_catalog and has_function_privilege only.

## RAW TABLE/COLUMN DENIALS

Catalogue checks cover **24** review/business tables: table SELECT/INSERT/UPDATE/DELETE and column-level SELECT/INSERT/UPDATE/REFERENCES are all false. Active SELECT probes used WHERE false and were required to fail with 42501, rather than succeed with zero rows.

Representative INSERT/UPDATE/DELETE probes used **EXPLAIN (ANALYZE FALSE, COSTS FALSE)** only. They ran after the READ ONLY catalogue transaction committed, so a read-only transaction could not mask permission failure. No actual DML ran, even if a privilege unexpectedly succeeded. Any SQLSTATE other than 42501 would have stopped the script.

| Probe | SQLSTATE | Result |
| --- | --- | --- |
| `set_intent_owner` | `42501` | PASS |
| `set_read_owner` | `42501` | PASS |
| `select_review_table` | `42501` | PASS |
| `select_business_column` | `42501` | PASS |
| `insert_review_explain` | `42501` | PASS |
| `update_review_explain` | `42501` | PASS |
| `delete_review_explain` | `42501` | PASS |
| `insert_business_explain` | `42501` | PASS |
| `update_business_explain` | `42501` | PASS |
| `delete_business_explain` | `42501` | PASS |

All ten actual denials returned **42501**, not a generic failure or read-only SQLSTATE. The final native-session marker records zero business-function invocations and zero executing DML.

## ADOPTION DENIAL

Effective EXECUTE on `review_private.adopt_registration_intent(uuid)` is **false**. Verified exclusively through catalogue privilege checks. Adoption was not invoked.

## SUPAVISOR CACHE OBSERVATION

First restricted connection succeeded. Authentication retries **0**; automatic password resets **0**; circuit-breaker/connection-block observation **none**. No direct-connect fallback or network change was needed. This is an observation of this attempt, not a general claim that the pooler never caches credentials.

## SECRET AUDIT

The owner was instructed to generate a strong random secret in their password manager and retain it locally. Only native interactive psql handled the new password: the owner entered it twice into the official `\password byetery_d2_review_app` prompts, then once into restricted `-W`. The helper/model never read the new password or stored verifier, intercepted keystrokes, or received it through chat.

There was no interactive transcript recording. Provisioning stdio stayed on the owner's local console. Restricted stdin/stderr stayed on that console; the stdout filter retained only public client TLS metadata, and query output files contain only explicitly selected nonsecret role/catalogue fields and SQLSTATEs. Password prompts/input are not query output. The restricted child's environment explicitly excludes PGPASSWORD. The existing trusted administrative connection was reused; no new secret was written into .env, a connection URL, CLI arguments, JSON, Markdown or repository files.

No exact-value scan of the new password was performed: learning that value would itself violate the owner boundary. Exposure assurance therefore combines native no-echo input, code/procedural review, explicit output allowlisting, unchanged-file checks and repository secret-pattern scanning. Strength/entropy was owner-managed and not measured by reading the secret. Sanitized evidence contains no password/verifier, Auth identifiers/tokens, Supabase secret/service-role value or signing material.

The companion JSON records the final secret-pattern audit and Git/file closure checks. The report and execution evidence remain local; no publication occurred.

Final repository secret-pattern audit: **PASS — 582 files, 700 historical blobs, 0 staged files, 0 findings**. This does not claim an exact-value scan of the owner-held password. Procedural/static checks confirm six nonexecuting EXPLAIN DML probes, no business-function invocation in the SQL, and no pg_authid/rolpassword query.

## REMOTE MUTATIONS

- Password verifier changed for existing role **`byetery_d2_review_app`**.

## FILES CHANGED

New local files:

- `docs/instaward/d2/D2-008B4_1-RESTRICTED-CREDENTIAL.md`
- `docs/instaward/d2/D2-008B4_1-RESTRICTED-CREDENTIAL-RESULTS.json`

Ignored local orchestration/probes and sanitized evidence remain under `.tools/d2-008b4_1`. No existing SQL/application/config/acceptance document was edited. B1/B2 artifacts retain their reviewed bytes. Protected KEY-CUSTODY-AUDIT.md and tools/sync_obsidian.py remain untouched and untracked. No commit/push, merge or tag change.

All **512 preexisting baseline files remain byte-identical**; Git refs unchanged. `git diff --check` and new-report whitespace checks PASS. The two B4.1 reports are the only new non-ignored files from this task. Existing earlier modified/untracked work remains intact, so the working tree is intentionally not clean.

No Auth, Vercel, Stellar/RPC/Horizon, signatures/broadcasts, USER2, D3, review bindings, intent, adoption or Foundation/business rows were created or invoked in this gate. No role hardening/ACL/schema/function change accompanied the password command.

## PROJECT STATUS

D1 **12/12 PASS**; D2 **5/6 PASS**; D3 **0/5**; TOTAL **17/23**. **D2.6 pending**. No owner acceptance of D2.6, nor acceptance/approval/payment by Stellar/SDF/Instawards, is claimed.

## NEXT OWNER AUTHORIZATION

**Draft only — D2-008B4.2: review principal/battery bindings. NOT EXECUTED.**

> Authorize a bounded read-only inventory of existing project principals, enabled deployment memberships and already-approved historical battery scopes for this exact DEV/Testnet deployment. Present the exact proposed review_access/review_batteries rows to the owner before inserting anything. Do not invent principal IDs, battery IDs, actor bindings or permissions, and do not create/change Auth accounts, principals or memberships.
>
> Only after the owner approves that explicit row allowlist, insert those approved review bindings for deployment 5c0cad2f-5f25-4216-8068-6cb9d2d26325. Default can_create_intent=false and leave permissions unchanged; any intent capability requires its own explicit approval. Do not enable generic cross-deployment, cross-user or unrestricted battery visibility. Keep private identity mappings local and expose only safe aliases in public evidence.
>
> Preserve all B4/B4.1 role/ACL/RLS/function boundaries and the owner-held restricted credential. No credential publication, Vercel configuration/deployment, Auth/session experiment, business lifecycle, intent/adoption, Stellar/signing/broadcast, USER2 or D3. Stop on ambiguity, drift or any need to broaden privileges. No commit/push automatically; report the exact authorized bindings and verification performed.

This draft is a future proposal, not permission to perform bindings now. **STOP.**
