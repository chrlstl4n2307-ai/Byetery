# BYE-W1-003A — Compatibility review before implementation

2026-10-20, America/Santiago. OFFICIAL INSTAWARD SPRINT / FUNDED SPRINT.
Starting product HEAD: a4ff5951ad1e4ba0934269c197c802605965618c.

## Exact approved source

Archive: `docs/instaward/baseline-snapshots/wallet-qr/` introduced by frozen
commit450c21b151a0973064986327f09d55e4f36c43e0. Original worktree branch:
codex/wallet-qr, base0a572af29b6d4df6c16feb0329ecc225948824f6. This is preserved
source, not previously validated active API/Testnet integration. Historical
classification remains PARTIAL / RESEARCH-SPIKE.

Relevant tracked changes reconstructed into ignored inspection files from that
base plus the exact zero-context archive patch, then checked against MANIFEST:

- backend/src/application/wallet.ts:
  e4293cd3d56688249090ee5c52402edfbb11c6bd50ddeaa9c95dde519f39c1a6.
- backend/src/wallet-verifier.ts:
  632be136ab04b86a1ffee931d28c52e772558885211716a616279d8e2eb2d3b4.
- fixture/HTTP test signing adaptations also reconstructed and hash-verified.

Relevant `untracked-files/` sources verified against the archive manifest:
backend/src/wallet-message.ts; backend/tests/wallet-protocol.test.ts and
wallet-storage.test.ts; database/migrations/20260914124739_wallet_sep53.sql and
20260914130553_wallet_guard_search_path.sql. Wallet/Freighter browser adapter and
its tests are also preserved there; only wallet-linking support may be ported.
No bulk patch application or snapshot frontend/QR/lifecycle merge is intended.

## Behavior comparison and proposed minimum port

Active wallet.ts currently serializes JSON/version1 and verifies raw Ed25519.
Approved code issues only explicit version2/signingScheme SEP53_V2; wire text is
exactly 14 ordered LF-separated UTF-8 lines, no BOM/trailing LF. Fields include
Byetery domain/purpose, deployment, challenge, application user, Testnet/network
ID, address, nonce and expiry. `walletMessage` rejects injected field separators.
The readable message is passed once to the SDK `verifyMessage`; the SDK supplies
the SEP-53 prefix/hash. Freighter signs that same readable text via signMessage.
No arbitrary JSON, double prefix/hash or client-selected verification algorithm.

Stored signing_scheme selects SDK verifyMessage for SEP53_V2 and raw verify only
for historical RAW_ED25519_V1. Unknown/missing schemes fail closed. Old rows are
not reinterpreted as v2. Existing snapshot migration labels pre-existing rows
legacy, makes future defaults SEP53_V2, forbids new legacy inserts and makes the
scheme immutable. Legacy still needs the existing unexpired/unconsumed guards.

Nonce remains CSPRNG32bytes, expiry10minutes, maximum5 verification attempts.
User/deployment-scoped SELECT FOR UPDATE and the surrounding Repository SQL
transaction serialize verification; successful consumption and link insertion
commit atomically. Replay is rejected; active wallet uniqueness is unchanged.
Supabase validates session independently, Repository verifies a live auth.sessions
row and creates/checks its application principal and deployment-scoped USER
membership. Wallet proof never replaces that session or grants chain roles.

The remote DEV catalog already has signing_scheme defaultSEP53_V2, the insertion
guard and immutable-scheme trigger from the snapshot. Therefore port the exact
historical migration files to the local migration set for parity; do not apply
duplicate DDL remotely. No remote schema/RLS/grant change is needed if subsequent
catalog checks continue to match. All prior business rules remain intact.

One necessary integration adaptation: wallet challenge/verification response
`source` must use Repository.mode instead of the snapshot's hardcoded MOCK so
TESTNET application results are accurately identified. This does not alter the
signed message, algorithm or wire format. Tests/DEV fixture signMessage calls
replace raw signing only for newly issued v2 challenges; retain legacy tests.

## Verification and owner boundary

Port the approved protocol vectors, legacy/downgrade/replay/storage tests; add
deployment/user/address/modified-payload/malformed/expiry and real concurrent
consume coverage. Run focused tests before the complete affected suites.
Existing official public verification vectors are test fixtures, never USER-1
signatures. Owner challenge, session and signature material must not enter logs,
Git, Notion, Obsidian or public results.

Owner signs only with USER-1 wallet
GDXAWG56PVUHWGB5VSJRN6OUZTEL7M3SLKL46CDKKXQ42CU2XCS3PXCS.
No server impersonation/private-key export, no Secure Store signer and zero
Soroban/reward/maintenance submissions. Stop at interactive owner approval when
required. Do not resume BYE-W1-003 automatically or relabel its blocked history.

Raven stellarDocs consulted first: message signing proves key control, not account
or application authorization. Official source:
https://developers.stellar.org/docs/tools/cli/agent-cli/guides/sign-messages
The project SDK already exposes signMessage/verifyMessage; approved snapshot
vectors explicitly test the SEP-53 prefix/hash against those SDK functions.
