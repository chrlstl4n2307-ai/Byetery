# BYE-W1-002 — Private transport migration review

Classification: OFFICIAL INSTAWARD SPRINT / FUNDED SPRINT. Date: 2026-10-19.

## Scope reviewed before remote application

Reuse the unchanged existing migration
`database/migrations/20261011000100_vol003_private_transport.sql`.
No new schema design or relaxation of Foundation is necessary. The four tables
are `api_private.testnet_work`, `testnet_source_leases`, `testnet_envelopes`, and
`testnet_observations`. Remote DEV inspection found the work/envelope tables
absent; no existing TESTNET deployment was returned by that inspection.

The existing migration is additive: CREATE tables, indexes, invoker functions,
triggers and restrictive policies. It does not drop data, alter Foundation
business rules, enable a public transport endpoint or use SECURITY DEFINER.
Its transaction is atomic: a failure rolls back all its DDL.

## Protection and behavior

- All four private tables ENABLE and FORCE RLS and have restrictive browser-deny
  policies. PUBLIC, anon and authenticated table grants are revoked.
- Browser function/sequence privileges in api_private are revoked. No browser
  route returns envelopes, signer output or auth signatures.
- Identity/context and signed envelopes are immutable. Observations are append
  only. Source leases are fenced by network/source/generation, across deployments.
- The reward operation's unique private slot persists even after failure or
  expiry. No second reward identity is automatically authorized.
- A sequence-check hold is recorded as a private STATE_READ observation whose
  classification is REVIEWED_RESOLUTION_REQUIRED. It does not invent an expiry
  or overwrite an identity. API responses expose that reviewed state; subsequent
  processing only reconciles the original hash. No additional schema is needed.
- SQL callbacks never perform RPC/signing/submission. The database must commit
  the exact identity before dispatch intent, final sequence check and send.

## Local evidence before application

The unchanged local migration suite, including forced-RLS, accidental-grant/
permissive-policy denial, immutable identity/history, lease fencing, duplicate
reward and restart tests, passed in the root verification (101 tests at that
point; additional API/reward tests are tracked separately).

The new local HTTP path additionally proves that an authenticated logical
TESTNET operation survives RPC outage without a signed identity, send or MOCK
fallback. The persisted request test rejects recipient substitution and logical
operation tampering. Those tests use ephemeral PGlite, not remote data.

Official Supabase RLS guidance was consulted through Supabase MCP before remote
application: https://supabase.com/docs/guides/database/postgres/row-level-security.
Examples in that guide do not override Byetery's stricter prohibition on SECURITY
DEFINER shortcuts or browser business-table writes.

## Rollback and operational expectations

Before COMMIT: normal transactional rollback, with no partially created tables.
After COMMIT: disable TESTNET dispatch/configuration and preserve identities,
observations, leases and unresolved operations for reviewed reconciliation.
Do not drop transport history, delete Foundation records or weaken immutable
triggers to undo a live transaction. Database rollback cannot undo Stellar.

Remote application and post-application RLS/grant checks are separate gates;
this review is not evidence they have already occurred. No remote business
transaction is authorized merely by applying this migration. The live task
remains limited to one fresh API-initiated register after every gate passes,
followed only by an unsigned open_return simulation.

## Post-application observation — 2026-10-19

Supabase DEV migration `vol003_private_transport_bye_w1_002` succeeded. All four
tables were read back with RLS enabled/forced, one restrictive policy each and
anon/authenticated grants false. The live gate also verified zero SECURITY
DEFINER functions in api_private. The complete existing remote HTTP suite passed
43/43 after asserting the exact nine-table inventory, with all prior grant checks
retained. No source migration was rewritten.

The single fresh API registration was confirmed; immutable private evidence is
retained. Postchecks found one operation/envelope/dispatch and zero real return
requests or reward attempts. The fixture Auth link and enabled memberships are
zero after cleanup. See BYE-W1-002-REPORT.md and BYE-W1-002-results.json.
