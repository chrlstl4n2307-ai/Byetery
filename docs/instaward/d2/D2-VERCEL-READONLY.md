# D2-VERCEL-001 — Read-only Preview architecture gate

> ARCHIVED RESEARCH — DEFERRED TO D2.6 INFRASTRUCTURE by owner priority change on 2026-10-22. The original preflight below is preserved; its local/uncommitted statements describe that earlier execution. Archival does not authorize a reader role, grants/RLS, Auth experiment, credentials or deployment.

2026-10-22 · OFFICIAL INSTAWARD SPRINT / FUNDED SPRINT.

**D2 PREVIEW READ-ONLY: BLOCKED — database least-privilege review required.**

**D2-001 PREVIEW INTEGRATION: PARTIAL, not live verified.** No read-only API was implemented or deployed after this gate was identified. No credentials were uploaded. This report does not claim D2 acceptance.

## Checkpoint preserved and published

- Branch: `instaward/d2-web-mvp`.
- D2 starting checkpoint: `3c7d373ec893a2e66101c4bcfbee354b3a53e434`.
- Local and remote HEAD at the preflight: `f9d9fc23488cb9f327959b1bc096db49473e10e6`.
- Existing commits published: `6e5ee6a`, `41fbd44`, `f9d9fc2`.
- Push used an explicit single-branch refspec, without force. The remote branch did not exist, so Git created it without replacing any existing history. No main, D1 branch or tags were pushed.
- Unauthenticated public downloads of the evidence index, readiness report and web configuration at that commit matched the committed bytes.
- `tools/sync_obsidian.py` remains untracked and unchanged: SHA-256 `48404b9431a9d955fc4af0b2eeaf9a59bb2fb0e9457eed73b4f2f66132a5e2da`.
- `docs/security/KEY-CUSTODY-AUDIT.md` remains untracked and unchanged: SHA-256 `c50cac16e8168514c506a21bf950cdd2b77d743006f4e78c8db0f90c2cbf69c7`.

Public checkpoint: [f9d9fc2](https://github.com/chrlstl4n2307-ai/Byetery/commit/f9d9fc23488cb9f327959b1bc096db49473e10e6). This new report is local and uncommitted pending architecture review; it is not part of that published checkpoint.

## Authoritative read-only inspection

Two short SQL inspections used the existing local DEV configuration, verified TLS with the existing CA and explicitly began `READ ONLY` transactions. Both finished with `ROLLBACK`. They queried deployment metadata, role attributes, table privileges and RLS/policy metadata only. No passwords, connection strings, service-role key, Auth user data or session tokens were printed.

The trusted existing deployment is exactly `5c0cad2f-5f25-4216-8068-6cb9d2d26325`, mode `TESTNET`, contract `CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON`. This is SQL configuration evidence, not a fresh Stellar RPC observation.

Findings:

| Check | Observed result |
| --- | --- |
| Existing DATABASE_URL database role | `postgres` |
| Role is superuser | false |
| Role bypasses RLS | true |
| Role can create roles / databases | true / true |
| Role can SELECT auth.sessions | true |
| Role can INSERT application users | true |
| Role can UPDATE battery records / application memberships | true / true |
| Dedicated read-only credential in the inspected project configuration | Not configured |
| Additional role named byetery% in inspected database roles | None |
| Private projection/principal tables needed for this API | RLS enabled and forced; SELECT denied to anon/authenticated |
| Private policies on those tables | Existing browser_deny for anon/authenticated; no dedicated read policy observed |
| auth.sessions | RLS enabled; SELECT denied to anon/authenticated |

The needed private tables are `api_private.memberships`; `app_private.users`, `wallet_links`, `battery_records`, `return_requests`, `stellar_operations`, `reward_attempts`; and `chain_private.deployments`, `batteries`, `return_requests`.

This is not an inventory of all possible credentials outside the inspected Byetery configuration. It establishes that the configured connection is privileged and that the publishable/browser roles cannot supply the necessary reads under the current grants/RLS.

## Why this gate stops deployment

The owner's instruction is explicit:

> If safely deploying requires a new privileged database credential or RLS change: STOP. Report architecture first.

Publishing the existing `postgres` connection in a read-only cloud function would retain its authority to write and bypass RLS. `BEGIN READ ONLY` is useful defense in depth but does not turn that credential into a least-privilege credential. Server-only storage protects against direct browser disclosure; it does not reduce the database privileges of a compromised function. I do not recommend extending this administrator credential to the Preview trust boundary.

The publishable key is not an alternative for these private tables or the live-session check. Reusing the generic API entry point is also not an alternative: it initializes the persistent coordinator, signer and reconciliation worker. Even its existing read handlers call `Repository.principal`, which performs automatic INSERTs for users/memberships.

A dedicated database reader would need reviewed grants and RLS access, or a reviewed narrow server abstraction that already supplies those checks. Neither exists in the inspected configuration. Creating roles, credentials, policies, views, SECURITY DEFINER functions or new infrastructure to bypass that absence was not performed. No existing service-role credential was tried as a workaround.

## Smallest proposed architecture — not implemented

After a separate review of database access, use a dedicated Next.js **Node runtime** read adapter inside the frontend deployment. It can remove the extra external HTTPS API hop; the existing same-origin `/api` routes become the authenticated HTTPS surface. This is a scoped proposal, not an implicit change to the current configuration.

1. Add an explicit direct-read-only Preview mode. The current D2 configuration requires a distinct external API origin; it must not be satisfied with an invented URL, self-proxy loop or fake upstream. Keep the existing LOCAL/MOCK external API configuration intact.
2. Reuse Supabase server Auth with the publishable key. Validate the exact access token using the Auth server, then check the corresponding live `auth.sessions` row. Do not authorize from getSession/user_metadata alone.
3. SELECT an existing ACTIVE application principal and enabled deployment membership. Missing principals/memberships fail closed; no automatic provisioning or default-role INSERT occurs.
4. Use a reviewed, dedicated server-only database access path. Prefer a non-bypass reader with narrowly reviewed SELECT grants/policies. Review the live-session lookup separately; no changes to the managed Auth schema are assumed authorized. Do not use the current postgres credential or copy service_role into the Preview.
5. Reuse/extract the SELECT-only semantics of `Repository.view` and current profile/battery projections. Do not instantiate/import the mutable Repository or coordinator into the deployed adapter. There is no need to recreate contract or reward rules.
6. Pin and verify the full deployment UUID and mode from trusted configuration. Every query is deployment-scoped, uses fixed parameterized SQL and preserves existing application authorization. Include source/network/deployment metadata so the BFF can verify provenance. Never accept a deployment selector or SQL from the client.
7. Enforce read-only transactions, bounded results, timeouts, verified database TLS and a small serverless pool. Reuse the current no-store responses, exact origin policy, HttpOnly/Secure/Strict cookies and controlled error responses. A database outage is not a confirmed lifecycle/reward result.
8. Keep a separate dependency boundary: no LocalSecureStoreSigner, Secure Store binary/material, Stellar SDK transaction transport, simulation, preparation, dispatch, coordinator, worker or timer import. Add dependency/bundle tests before deployment.

### Proposed allowed routes

| Route | Authority and result |
| --- | --- |
| GET /api/me | Validated Auth token + live session + existing ACTIVE principal/membership; own roles, wallet links and bounded own requests only |
| GET /api/batteries/:batteryId | Same authentication and application authorization as the existing read route; exact TESTNET deployment; confirmed battery/reward state, pending operation, last attempt, bounded metadata and own request only |

Every business POST remains denied server-side, including registration, wallet mutations, collector/recycler actions and rewards. ADMIN is not an exception. Existing login/logout are separate Auth session operations, not lifecycle authority. No administrative/debug/SQL endpoint or anonymous public verifier is proposed here.

The three UI lanes and uncertainty semantics remain unchanged. Projection state does not prove a fresh chain observation; the existing response has no latest terminal transaction receipt.

## Preview variables — names only, proposed classification

No Vercel environment variable was created or uploaded.

| Variable | Classification | Need |
| --- | --- | --- |
| SUPABASE_URL | PUBLIC | Existing Auth project URL |
| SUPABASE_PUBLISHABLE_KEY | PUBLIC / PUBLISHABLE | Auth SDK; not a private-table reader |
| BYETERY_DEPLOYMENT_ID | PUBLIC / non-secret identifier | Exact pinned deployment |
| BYETERY_SOURCE | PUBLIC / non-secret configuration | Expected TESTNET source |
| BYETERY_WEB_ENV | SERVER-ONLY / non-secret configuration | Explicit Preview policy |
| BYETERY_WEB_ORIGIN | SERVER-ONLY / non-secret configuration | Canonical HTTPS origin |
| BYETERY_ALLOWED_WEB_ORIGINS | SERVER-ONLY / non-secret configuration | Reviewed exact allowlist |
| BYETERY_API_URL, BYETERY_ALLOWED_API_ORIGINS | SERVER-ONLY / non-secret configuration | Existing external-proxy mode only; direct-read mode needs an explicit design change, not fabricated values |
| DATABASE_URL | SERVER-ONLY / SECRET | Only if a reviewed restricted reader is later provisioned; existing postgres value must not be uploaded |
| DATABASE_SSL_CA | SERVER-ONLY / SENSITIVE configuration | Verified TLS trust configuration; local filesystem path is not portable to Vercel |
| SUPABASE_SERVICE_ROLE_KEY | SECRET — NOT REQUIRED / DO NOT CONFIGURE | No proposed frontend use |
| VERCEL, VERCEL_ENV, VERCEL_URL, VERCEL_BRANCH_URL, VERCEL_GIT_COMMIT_REF | Platform-supplied / non-secret configuration | Verify Preview, branch and canonical origin |

No privileged NEXT_PUBLIC variable, Stellar key, signer binary or Secure Store material belongs in this deployment. Exact Preview values and secret transport would be reviewed only after the access boundary is approved.

## Verification and limits for this execution

| Check | Result |
| --- | --- |
| Branch / starting HEAD / expected two untracked files | PASS |
| Protected sync/custody hashes | PASS |
| Secret audit of the three commits before push | PASS — 28 changed paths, zero findings |
| git diff --check on checkpoint range | PASS |
| Single-branch push and remote HEAD | PASS — f9d9fc23488cb9f327959b1bc096db49473e10e6 |
| Public checkpoint artifacts match committed bytes | PASS — 3 artifacts |
| Existing SQL connection and deployment lookup | PASS — read-only inspection |
| Database least-privilege deployment gate | BLOCKED — configured postgres connection is not restricted to reads |
| New API security tests / implementation build | NOT RUN — no API implementation after the gate |
| Live authenticated Preview validation | NOT RUN — no deployment |
| Preview URL / deployment ID / remote build | NOT CREATED / NOT CREATED / NOT RUN |

Previously recorded frontend 102/102 and root backend 148/148, Rust/Python/MOCK results belong to the published checkpoint; they were not rerun as proof of a new read-only API. No application/dependency files changed in this task. This report and its index entry are local review artifacts, not a new tested implementation commit.

New Stellar transactions: 0. Operational signatures: 0. Broadcasts: 0. New lifecycle/reward: 0. SQL/Auth business mutations: 0. Schema/RLS/grant changes: 0. Cloud environment/deployment changes: 0. Contract/WASM changes: 0.

The minimum next decision is review/authorization of a narrowly scoped database read access boundary (credential plus exact grants/RLS/session mechanism), or identification of an existing safe authenticated read service. Neither has been created. Mutation/signing stays local and is not part of the proposed Preview.

Sources: [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres), [Postgres roles](https://supabase.com/docs/guides/database/postgres/roles), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [SSR session validation](https://supabase.com/docs/guides/auth/server-side/creating-a-client), existing pinned source code and the read-only database inspections above.

**Project acceptance remains D1 12/12 PASS (owner acceptance); D2 0/6; D3 0/5; total 12/23. No organizer approval/payment is asserted. STOP at architecture review. No D2-003, D2-007, A2 or D3.**
