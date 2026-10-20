# BYETERY BYE-W1-003A SEP53_V2 WALLET LINK REPORT

2026-10-20, America/Santiago. OFFICIAL INSTAWARD SPRINT / FUNDED SPRINT.
Current result: **PARTIAL — implementation verified; waiting for owner wallet
connection/signature**. This checkpoint does not prove USER-1 wallet control.

Starting HEAD: `a4ff5951ad1e4ba0934269c197c802605965618c`.
Ending evidence HEAD: resolved in final handoff after committing this file.
Branch: `instaward/d1-testnet-integration`.

## Implementation and provenance

Approved source located: YES. See [pre-port compatibility review](BYE-W1-003A-COMPATIBILITY.md).
The wallet/QR source frozen in450c21b was reconstructed from base0a572af and its
zero-context patch. Relevant source hashes matched the original MANIFEST exactly.
Source text, verifier dispatch, migrations and tests were ported from that archive,
not recreated from memory. Historical source classification remains unchanged.

New active issuance: **SEP53_V2 only**, explicit version2, exact14-line canonical
UTF-8 message. Legacy v1 is used only for previously stored, unexpired/unconsumed
legacy challenges. The client cannot choose a version or downgrade verification.
Unknown/missing schemes fail closed. Byetery domain/user/deployment/network/address,
CSPRNG32-byte nonce, finite expiry and atomic consume-on-success are preserved.

The SDK's signMessage/verifyMessage are used without manually prefixing twice.
The exact approved readable message is retained. The only response integration
adaptation uses Repository.mode rather than hardcoded sourceMOCK. Existing remote
schema already has the approved SEP53 default/guard; the exact historical migration
files were restored locally for parity, with **zero remote DDL/RLS/grant changes**.

## Authenticated principal and interactive handoff

Deployment: `5c0cad2f-5f25-4216-8068-6cb9d2d26325`, modeTESTNET.
Target wallet: `GDXAWG56PVUHWGB5VSJRN6OUZTEL7M3SLKL46CDKKXQ42CU2XCS3PXCS`.
Label: USER-1 / TESTNET RECIPIENT.

Read-only inspection found no eligible active Auth-backed principal in this
deployment. Exactly one clearly labeled `BYETERY-INSTAWARD-USER-1` test principal
was created with the existing DEV Auth provisioning pattern, then authenticated
through a real Supabase session. GET /api/me through the active API established
the application principal and deployment-scoped USER membership. It is not a bare
SQL wallet row, copied MOCK membership or an inferred personal email account.

Independent database readback at2026-10-20T17:26:35.174447Z found:

| Fact | Observed |
| --- | --- |
| Active labeled Auth-backed USER principals in target deployment | 1 |
| Target active wallet links | 0 |
| Target-deployment v2 challenges / consumed challenges | 0 / 0 |
| Return requests | 0 |
| Existing business operations / envelopes | 1 / 1, unchanged BYE-W1-002 registration |

The local wallet-only page was opened in Chrome and left for owner handoff. It
reuses the approved Freighter adapter/readable-message validator and the active
backend wallet endpoints, adapting the UI source marker toTESTNET. No dashboard,
QR or broader D2 scope was merged. Its Host/Origin/session/body/target allowlists
expose no lifecycle route. The browser SDK is pinned to the snapshot's6.0.1 and
installed as a local tool dependency; no system/global installation.

Owner action: select USER-1 and Testnet in Freighter, click **Conectar USER-1 y
solicitar desafío**, then review the exact message and personally approve
**Firmar mensaje y verificar con Freighter**. New challenges last10minutes. The
server cannot sign as USER-1. Do not send a seed, private key, password or signature
to the assistant. The task stops at this interactive point until the owner acts.

At this checkpoint, actual target challenge: **NOT ISSUED**, consumption: **NO**,
control proven: **NO**, wallet linked: **NO**. The companion JSON is a sanitized
progress projection; no HTTP200 alone is accepted as link success. After owner
approval, independent joined Auth/membership/wallet/challenge readback is required
before updating this report toPASS. Do not infer completion from tests or this page.

## Verification

| Suite | Result |
| --- | --- |
| Focused approved protocol/storage + new context boundaries | 23/23 |
| Full backend TypeScript/tests | 129/129, original Foundation50 retained |
| Supabase DEV HTTP integration | 45/45 |
| Concurrent real PostgreSQL HTTP proof | one200, one409; attempts1, consumedtrue, active links1 |
| Wrong wallet/user/deployment, altered payload, malformed/unknown version | PASS |
| Legacy compatibility, cross-algorithm rejection, expiry, replay | PASS |
| Transaction rollback of consumption and link; active link uniqueness | PASS |
| Local owner bridge isolation and TypeScript | 5/5 / PASS |
| Rust native / repeated with wasm-tests / WASM integration | 20/20 / same20/20 / 1/1 |
| WASM release rebuild, fmt and Clippy | PASS; expected hash unchanged |
| Frontend TypeScript/lint/tests/build, unchanged sources | PASS;33/33 |
| Local SQL parity | 82/82; rollback, zero fixtures |
| Python / existing MOCK demo | 4/4 / PASS, SENT10GREEN-TEST |
| Root npm run verify | PASS |

The first sandbox-only regression hit loopback EACCES and a Vitest temporary-file
ENOENT. Both suites passed unchanged outside that sandbox; no Windows protection
was changed. New test setup corrections were an existing UnexpectedField error
code, using the installed TypeScript6 API rather than native TypeScript7, and raw
HTTP for Host rebinding because fetch normalizes Host. Assertions were preserved.

No live proof from USER-1 is included in those deterministic counts. Official
public SEP-53 verification vectors remain source test fixtures; no owner signature
is recorded publicly. No Secure Store signing was performed or required here.

## Preserved boundaries and remaining work

Private key exported: NO. Credentials/session/payloads/signatures published: NO.
Test principal secrets remain only in the running local process, never Git/logs,
Notion or Obsidian; browser JavaScript receives no JWT. The loopback owner session
uses HttpOnly/SameSiteStrict. Its sanitized journal refuses duplicate provisioning
after a restart; an interrupted setup requires reviewed owner-login recovery.

Soroban business transactions: **0**. Reward transactions: **0**. Maintenance: **0**.
Contract/WASM/deployment/GREENTEST/Stellar roles unchanged. MOCK preserved.
WASM SHA: `c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6`.
Historical tags and `tools/sync_obsidian.py` remain unchanged.

BYE-W1-003 remains historically BLOCKED and is **STILL BLOCKED** until USER-1
verification is independently confirmed. Its original local blocked report/JSON
are preserved byte-for-byte; publication does not rewrite their historical result.
This task does not satisfy open_return, confirm_collection, D1.2 or the full D1
lifecycle. Official acceptance unchanged: D1 0/12,D2 0/6,D3 0/5.

Notion/Obsidian/Git publication status is verified after the evidence checkpoint
and reported in the handoff. After actual wallet success, the next separately
resumed task would use the SAME battery BYE-W1-002-64257020134D4A0F and the exact
deployment-scoped verified link. **Do not execute open_return automatically.**
