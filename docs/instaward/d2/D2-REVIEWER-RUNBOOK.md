# D2 reviewer runbook — future Hosted Preview

Prepared locally 2026-10-31. **NOT EXECUTED ON A HOSTED PREVIEW.** D2.6 remains
NOT PROVEN — HOSTED PREVIEW REQUIRED. This document grants no deployment,
credential, permission, revocation or transaction authority.

## Preconditions and stop rules

1. Owner separately approves a specific reviewed SHA, Preview-only deployment,
   exact HTTPS origin and four-role read-only test window. Verify branch, environment,
   deployment and current operational restrictions before opening it. Never use Production.
2. An operator supplies each existing review credential through a private channel,
   never Git, chat, screenshots or this document. Never deliver private Stellar keys,
   admin signing secrets or service_role to a reviewer. Keep credentials distinct.
3. Confirm DIRECT_REVIEW, exact Testnet deployment
   `5c0cad2f-5f25-4216-8068-6cb9d2d26325`, contract
   `CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON` and allowlisted
   historical battery `BYE-W1-002-64257020134D4A0F`. No MOCK data substitution.
4. Current historical scope is four enabled review accesses, one historical battery,
   zero intent permissions, zero intents; all `canCreateIntent=false`. These are
   historical baselines to recheck under future authorization, not current remote reads.
5. Stop on unexpected role, scope, network mismatch, private data exposure or new
   business/chain mutation. Record only sanitized status, route, time and public references.

## Per-role route and action matrix

| Role / login alias | Expected role page | Common allowed pages / reads | Visible data | Not visible | Allowed actions | Denied actions |
| --- | --- | --- | --- | --- | --- | --- |
| USER / REVIEW-USER | `/dashboard` | `/`, `/login`, `/dashboard`, `/battery/<approved-id>`, `/review/evidence`; GET `/api/me`, battery and history | Single allowlisted battery; bounded USER ownRequest if its existing association is in scope; independent state lanes, history, evidence integrity | Other users' requests, private IDs, raw records, commands, XDR, signing/transport material | Login, read, QR lookup, local integrity view, logout | Other role pages; registering/returning/collecting/recycling/paying; intent creation |
| ADMIN / REVIEW-ADMIN | `/admin` | Same common read pages/routes | ADMIN review profile; allowlisted historical battery/history; ownRequest NULL | USER request relationship; private transport/Auth/SQL records | Same read/login/logout actions | Collector/recycler pages; current intent creation (permission disabled); adoption, signing, sending, role changes |
| COLLECTOR / REVIEW-COLLECTOR | `/collector` | Same common read pages/routes | COLLECTOR review profile; relevant allowlisted history; ownRequest NULL | Other USER request relationship and private operational records | Same read/login/logout actions | Admin/recycler pages; collection mutation, service authority, evidence mutation, intents |
| RECYCLER / REVIEW-RECYCLER | `/recycler` | Same common read pages/routes | RECYCLER review profile; relevant allowlisted history; ownRequest NULL | Other USER request relationship and private operational records | Same read/login/logout actions | Admin/collector pages; recycling/reward mutation, intents |

Role pages render a denial message for mismatched roles; do not require a particular
page HTTP status where the current implementation uses a bounded HTML denial.
The API/SQL authority checks remain independent of page navigation.

## Execute the following for EACH role, in separate clean browser contexts

1. Open `/login`, enter its existing credentials manually and submit. The POST is
   `/auth/login` with exact Origin and `Sec-Fetch-Site: same-origin`. Login/logout
   are HTTP handlers, not Next Server Actions.
2. Check `/api/me` through the authenticated UI/read tool: only the expected role,
   source TESTNET, pinned deployment, approved battery list, `canCreateIntent=false`.
   Do not screenshot credentials, cookies, tokens, email or Auth UUIDs.
3. Open the role page and historical battery. Check three independent lanes:
   persisted lifecycle/attestation, operation/transaction status, reward. RECYCLED
   never by itself implies reward SENT. No pending operation never means success.
4. Open history. Preserve confirmed database references but independently label
   present receipt/state verification. UNVERIFIED, RETENTION_UNAVAILABLE,
   STATE_EXPIRED and NETWORK_RESET are not successful fresh verifications. A
   missing instance alone without reset evidence follows existing STATE_EXPIRED
   semantics. A contradicted context is MISMATCH and stops review.
5. Use QR as an ID lookup only. It grants no role, reward ownership or authority.
   Use only an owner-approved synthetic/known out-of-scope ID for the negative
   lookup; an unknown and a known inaccessible ID must both return the same 404
   NotFound body without confirming existence. Do not enumerate unrelated batteries.
6. Open the integrity view. Intact disclosed fixture should verify; one-byte
   alteration should not. RECYCLED is an authorized actor attestation, not physical
   proof. Byte integrity is not environmental certification or proof of truth.
7. Refresh profile/battery/history. The same scope/roles must remain; refresh
   must not start an operation or infer transaction success.
8. Logout using the UI POST `/auth/logout`. Verify local session/cookies cleared
   and protected UI redirects to login; missing token API read returns 401.
9. Re-login with the same role if needed; scope must remain identical. Logout
   again before the next role. Do not assume a logout immediately invalidates all
   already-issued JWTs; B2A CASE 1 is historical session-behavior evidence only.
10. Record PASS/FAIL per login, profile, page scope, battery, history, negative
    scope, refresh, logout and re-login. A network failure is not a business failure.

## Expected API outcomes and bounded negative checks

| Response | Expected meaning / procedure |
| --- | --- |
| 401 | Missing/invalid authoritative Auth session; no SQL/chain success inferred. |
| 403 | Disabled review access/membership/role or rejected Origin; no authority gained from client fields or QR. Current four roles cannot create intents. |
| 404 | NotFound for unknown or inaccessible battery/intent with indistinguishable response; no existence oracle. Unallowlisted routes may also be NotFound. |
| 409 | Existing bounded intent conflict/idempotency conflict. **Local test scenario only under current scope**: reviewers have no create permission; do not enable it to force 409. |
| 503 | ConfigurationUnavailable, unavailable bounded data/auth or chain mismatch; preserve previous confirmed state and show unavailable/uncertain status. Never expose raw diagnostic errors. |
| 503 OutcomeUnknown | A permitted intent write lost acknowledgement; do not claim failed or blindly issue a new identity. Keep the original idempotency key and inspect the existing intent under separately authorized scope. Current read-only reviewers must not exercise a write. |

Intent routes exist in the package (POST `/api/review/registration-intents`, GET
`/api/review/registration-intents/<operationId>`). Their availability is not a grant.
An enabled, separately approved ADMIN capability would create WAITING only; no
adoption, Foundation write, signature or broadcast follows from this HTTP request.
No capability change is part of this runbook execution.

## REVIEW REVOCATION

Description only; **do not execute as PREP**. Under a separate owner-approved
maintenance action, disable each existing `review_access.enabled`, revoke/disable
the four reviewer credentials through supported administrative mechanisms and
terminate authorized sessions as required. Do not rotate unrelated credentials or
change actor/wallet bindings. Password change alone is not proof of immediate
access-token invalidation.

Then verify old sessions no longer have useful application access: authoritative
Auth failure should be 401; a still-valid JWT must nevertheless fail the current
review-access gate with 403. Check every profile/battery/history/intent read and
role page, local logout, refresh and attempted re-login. Ensure no protected data
or action remains available, even if a cryptographic JWT has not yet expired.
Record sanitized results and scope. Do not claim revocation until independently
verified, and do not execute remote revocation in this offline task.
