# D2-008B2A — Supabase Auth Session Gate

## Scope

Primary scope: the B2A Supabase Auth semantics gate, NOT D2.6 acceptance. LIVE_COMPLETE. The owner separately authorized a preceding permanent password-only recovery for existing USER1 and one verification login; it did not change the B2A harness. No SQL, project configuration, Vercel or Stellar work.

## Starting checkpoint

Branch: instaward/d2-web-mvp. Starting SHA: `10a62d77158f1b200d2459b1a9dbb122576c350c`. SDK: @supabase/supabase-js 2.116.0.

## Harness design

Three independent clients with persistSession=false, autoRefreshToken=false, separate memory/key namespaces; a fourth fresh A instance restores only retained in-memory material via official setSession. Validator V calls the original B2 authenticate() with AuthoritativeAuth backed by official getUser(exact retained token). Only server-only is replaced by an exact-parent no-op loader; errors.ts receives extension resolution without content replacement. Both original source hashes are pinned.

Harness SHA-256: `83c3844357e13c4cfe6b80749258a812e1b63b69b053bacdc42a4689c21a684a`. Real B2 calls: 6. SQL/Vercel/Stellar paths: none. Fixed project-only Auth fetch allowlist; no arbitrary URL, admin client, retry loop or credential fallback.

## Secret handling

Password comes only from raw-mode no-echo interactive terminal, never CLI/env/file/chat. The unchanged B2A harness selects existing USER1 from a local inventory and does not create/reset users; its identifiers are compared only in memory. A separate, directly owner-authorized password-only recovery preceded this successful run (see below). The B2A harness uses only the existing public project URL/publishable key. The separate maintenance process used the existing administrative key only for the expressly authorized USER1 password recovery. Tokens, claims, refresh material and session IDs remain in memory. No token hashes. SDK console diagnostics disabled. The sole filesystem sink accepts sanitized results/markdown, not SDK objects. No private identifiers are published.

## Dry-run cases

PASS; real B2 exercised: true; external calls: 0; cases: CASE 1 PASS (1 variant(s)); CASE 2 PASS (1 variant(s)); CASE 3 PASS (1 variant(s)); CASE 4 PASS (3 variant(s)). Secret stdout/stderr/result and sink checks PASS; frozen module/role guard checked. Mock JWT/session material is offline-only and never published.

## Session A

ACCEPTED; HTTP 200; code not available. Rounded minutes remaining: 59.

## Session B

ACCEPTED; HTTP 200; code not available. Rounded minutes remaining: 59. Independent logins: 2; distinct session IDs (in-memory comparison only): true.

## Negative control

ACCEPTED; HTTP 200; code not available. Logout requests caused by local disposal: 0.

## Local logout HTTP proof

POST /auth/v1/logout HTTP 204; SDK error present: false. Query strings/headers/bodies are not recorded. SDK error=null alone never establishes revocation; exact observed 204 is mandatory.

## B2 adapter validation

A after logout: REJECTED; HTTP 403; code session_not_found. B after A logout: ACCEPTED; HTTP 200; code not available. Natural expiry gate >=10 minutes is checked before primary retained-token validations. These results concern the exact B2 authoritative getUser path, not offline JWT signature validation or every downstream API.

## Refresh result

REJECTED; safe Auth code: refresh_token_not_found. Official refreshSession only. Natural expiry test: NOT_RUN; no waiting, forged expired token or JWT setting change.

## Global cleanup

PASS; HTTP 204; B: REJECTED; HTTP 403; code session_not_found. Optional cleanup runs only after primary CASE 1 evidence is safely saved, never overwrites that primary decision. Non-CASE-1 stops before cleanup.

## Decision

CASE 1 — **AUTH_USER_ONLY SUFFICIENT**. Stop reason: none. AUTH_USER_ONLY VERIFIED FOR CURRENT SUPABASE BEHAVIOR; scoped to this project/runtime/library version, not an eternal protocol guarantee.

## Remote side effects

The B2A experiment performed normal Auth sessions/refresh/revocation/audit/last-sign-in effects only. Separately, the owner explicitly authorized one permanent USER1 password update and one successful verification login before B2A. These scopes are recorded separately in JSON. No account creation, email/Auth UID change, SQL, grants, RLS, membership/review_access, Auth project configuration, Vercel, Stellar call/signature/broadcast or USER2. No executable application change was performed.

## Files changed

Only scripts/instaward/b2a-auth-gate.ts and the two B2A report/results files. frontend, backend, contracts, database, B1/B2 SQL, signer and protected untracked files remain unchanged.

## Project status

D1 12/12 PASS; D2 5/6 PASS; D3 0/5; TOTAL 17/23. D2.6 pending. Internal owner acceptance only, not Stellar/SDF/Instawards approval or payment. STOP; no remote SQL apply.

References: [official signOut](https://supabase.com/docs/reference/javascript/auth-signout), [getUser](https://supabase.com/docs/reference/javascript/auth-getuser), and the installed 2.116.0 Auth SDK source. Documentation warns against treating access-token cryptographic lifetime as session liveness; this experiment measures the current authoritative B2 path.

## Separately authorized USER1 access recovery — 2026-10-30

The earlier real attempt stopped at CASE 4: one login returned HTTP 400 / invalid_credentials, with no successful session observed. Its sanitized result was retained locally. The owner then directly authorized a permanent password change for existing USER1 only; no other account/field/configuration change was authorized.

An ignored local maintenance helper pinned the existing USER1 identity, used the existing administrative key only in its own process, and restricted requests to that exact existing user's Auth Admin endpoint. Its only update body was `{ password }`, via official `auth.admin.updateUserById`. The helper made exactly one PUT (HTTP 200), checked Auth UID/email and stable Auth identity/metadata before and after (PASS), performed one ordinary login (HTTP 200), then one authoritative getUser check (HTTP 200). The first local input attempt was rejected before any remote request; it did not change a password. No retry of a remote password mutation occurred.

The new password was entered and confirmed only in a no-echo local terminal, then entered again for the original B2A harness. It was never supplied in chat/CLI arguments/environment variables, saved to a repository file, logged or committed. The privileged existing key was not copied to the B2A process. The maintenance helper/status/lock remain ignored and are not part of this publication.

No SQL or application-permission readback was performed because the owner prohibited it. Preservation of memberships, application roles, review_access and other accounts is supported by the restricted endpoint/field boundary and absence of such write requests, not a claim of independent SQL verification. Normal automatic Auth password/login timestamps/audit effects are distinguished from submitted attribute changes. The original B2A harness SHA-256 is unchanged from the earlier dry-run and failed attempt.

## Local verification and publication boundary

Four offline decision cases, six variants, 30 sensitive-output sink rejection probes, original B2 source hashes/role guard, no-echo canary, harness TypeScript and syntax checks: PASS. Maintenance offline tests cover one password-only update, one verification login, denied other-user/other-field requests and stop-on-failure behavior. No new dependency. Core frontend/backend/contract/database/signer, B1/B2 SQL and protected files remain byte-identical to the starting checkpoint. Full Rust/WASM/backend suites were not rerun, as B2A explicitly scopes verification to unchanged application code and the harness/evidence.

Only the harness and two sanitized B2A evidence files may enter the CASE-1 publication. Prior CASE 4 and local input rejection are historical, not the current decision. No D2.6 PASS, SQL apply, least-privilege credential provisioning or deployment begins here. No main merge or tag change.

Reproduce the offline test with the installed Node 24 runtime in a disposable checkout: the CLI refreshes the two local report paths, while this commit preserves the recorded live evidence:

```powershell
node --disable-warning=ExperimentalWarning --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-transform-types scripts/instaward/b2a-auth-gate.ts --dry-run
```

The same command with `--live` requires the existing local public project configuration, approved private USER1 inventory and a genuine interactive no-echo terminal. It never accepts a password in its arguments. Live repetition requires its own authorized scope; it is not a CI test. The observed result is limited to this project's current authoritative getUser behavior with Supabase-js 2.116.0; it does not establish immediate revocation for offline JWT checks or every data endpoint.

Password recovery reference: [official updateUserById](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid).
