# BYETERY BYE-W1-003 LIVE RETURN + COLLECTION REPORT

Classification: OFFICIAL INSTAWARD SPRINT / FUNDED SPRINT.
Date: 2026-10-19, America/Santiago.
Overall BYE-W1-003: **BLOCKED — validated return user/wallet missing**.

## Git and scope

Starting HEAD: `a4ff5951ad1e4ba0934269c197c802605965618c`.
Branch: `instaward/d1-testnet-integration`.
At the stopping gate, HEAD remains the starting checkpoint. This report and its
JSON companion are new, uncommitted workspace evidence; no publication is claimed.
Only the known `tools/sync_obsidian.py` was untracked at entry. Its SHA-256 remains
`48404b9431a9d955fc4af0b2eeaf9a59bb2fb0e9457eed73b4f2f66132a5e2da`.

Sprint-start tag: `349ee3fd78104f3c249b3052b1cca402c9d99ff3`.
Historical baseline/tag: `450c21b151a0973064986327f09d55e4f36c43e0`.
Contract modified: NO. MOCK implementation modified: NO. No redeploy/Mainnet,
role changes, database writes, signer use, API lifecycle calls or broadcasts.

## Read-only state verification

Official Stellar documentation was consulted through Raven first. Source-account
credentials authorize through the source envelope signature; address credentials
require their separate authorization signatures. This is consistent with the
existing SERVICE-source + COLLECTOR-address model. No architectural change made.

Reference: https://developers.stellar.org/docs/build/guides/transactions/signing-soroban-invocations

The existing TestnetRpc/TestnetTransport read-only paths verified network,
deployment, configuration, live instance/code/SAC and the existing deadline/buffer
TTL guard. No signer was instantiated; the gate denied send access.

| Field | Read-only result |
| --- | --- |
| Network | TESTNET |
| Contract | CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON |
| SAC | CB2RBZCH2DKLB2KFTKKEIDJBK53WKT2FQBQRTAN2JKJVEBAMCDEY6D7G |
| Local/deployed WASM | expected SHA matched |
| TTL guard | PASS, existing deadline and buffer |
| Readiness ledger | 5284487 |
| Battery observation ledger | 5284490 |
| Battery | BYE-W1-002-64257020134D4A0F |
| Chain state | REGISTERED / NOT_ELIGIBLE |
| Registration hash | 8621077f0c87fdccf7bf798954fb1dab133fff790f43344a10ab33e7818b7665 |
| Request / collector / collection commitment | absent, as expected |
| SQL projection | REGISTERED / NOT_ELIGIBLE; same commitment; confirmed ledger5281390 |

WASM SHA-256:
`c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6`.

Prospective SERVICE source observation, **not transaction preparation**:
`GBOOUYTB4MUH3JQUMOQ6LUEALEPUQ5SREYYIJ5WGR26BI3NCVPNG7WIX`,
sequence `20970220772392963`, balance `99999783304` stroops, ledger5284490.
External/manual usage is UNCONFIRMED; treat as shared. Future signing/dispatch
must obtain fresh context and re-read sequence immediately before broadcast.
These observations are not reusable preparation or permission to submit.

## Blocking application prerequisite

Read-only Supabase DEV observation at `2026-10-19T21:39:22.282415Z` for TESTNET
deployment `5c0cad2f-5f25-4216-8068-6cb9d2d26325`:

| Predicate | Count |
| --- | --- |
| Wallet links for this deployment, including historical/revoked | 0 |
| Active non-revoked wallet links belonging to ACTIVE users with an Auth user | 0 |
| Consumed wallet challenges | 0 |
| Enabled memberships belonging to ACTIVE users with an Auth user | 0 |
| Application return requests | 0 |

The task explicitly says: **if no properly linked/validated recipient exists,
STOP and report the missing setup.** This gate failed before preparation or
signing. No recipient_snapshot or actual request ID was created. The prior
BYE-W1-002 simulation recipient is not proof of wallet ownership and was not used.
No MOCK wallet link was copied into TESTNET, no proof fabricated, no account
credentials changed and no user/service identity boundary bypassed.

Unblocking setup: an existing application user must authenticate against the
TESTNET deployment and complete its wallet challenge/verification workflow there.
The future authenticated return must select that deployment-scoped validated
wallet; the server must persist a fresh CSPRNG32-byte request ID and immutable
user/wallet/recipient snapshot before signing. A collector application principal
must also have the approved COLLECTOR association. This report does not grant it.
Do not send passwords, private keys or seed phrases to the assistant.

Additional observed setup compatibility issue: the active
`backend/src/application/wallet.ts` still issues JSON/version1 challenges and
verifies raw Ed25519 message bytes. The approved `SEP53_V2` implementation and
its tests exist in the frozen wallet/QR snapshot under
`docs/instaward/baseline-snapshots/wallet-qr/untracked-files/backend/`; that snapshot
is not the active API. No challenge was issued here. Before unblocking wallet
setup, review and bring the minimal already-approved versioned issuance/verifier
into the active backend, preserving deterministic UTF-8, nonce, expiration,
stored-version selection and atomic consumption. New legacy issuance must not
be used to work around this task's stop gate. No implementation made in this run.
Raven's official documentation identifies SEP-53 message signing as key-control
proof, not independent account authorization; this does not replace a validated
application session or confer lifecycle permissions:
https://developers.stellar.org/docs/tools/cli/agent-cli/guides/sign-messages

## Execution and tests

| Required evidence | This run |
| --- | --- |
| open_return API/preflight/sign/submit/confirmation | NOT EXECUTED |
| Recipient snapshot verified | NO — prerequisite absent |
| Request ID, fee, auth expiry, transaction hash, confirmation ledger | N/A; never prepared |
| confirm_collection API/preflight/two-auth/sign/submit | NOT EXECUTED |
| Collection evidence/commitment and post-state | N/A |
| Duplicate API tests | NOT RUN; no successful return/collection to replay |
| Missing SERVICE/COLLECTOR, wrong/no-role collector tests | NOT RUN in BYE-W1-003 |
| Invalid transaction broadcast | NO |
| Additional business identities / broadcasts | 0 / 0 |
| Root verification and integration regression | NOT RERUN; stopped before implementation/signing/integration execution |

BYE-W1-002's green suites remain historical evidence, not new BYE-W1-003 results.
Read-only readiness and prerequisite queries passed as observations; they do not
validate a live return or dual-authorized collection. No fee/cap inference from
the earlier simulation substitutes for a new application preflight.

## D1 assessment and stopping point

Only **1/5** real API operation kinds is confirmed so far: register_battery from
BYE-W1-002. This task adds no successful lifecycle operation.

| Criterion | Assessment after this blocked run |
| --- | --- |
| D1.1 | SUPPORTED by historical registration only; five operations NOT YET SATISFIED |
| D1.2 | NOT YET SATISFIED; live dual-auth and this task's negative evidence absent |
| D1.3 / D1.4 / D1.7 | SUPPORTED by BYE-W1-002; no new lifecycle confirmation here |
| D1.5 | SUPPORTED by existing deterministic evidence; requested live API duplicates NOT YET SATISFIED |

Official PASS criteria: NONE. Acceptance unchanged: D1 0/12, D2 0/6, D3 0/5.
BYE-W1-001 remains PARTIAL; no collection/recycling/reward preflight gap closed.

Notion/Obsidian synchronization is verified separately in the final handoff.
No new commit or push is claimed while this prerequisite gate is blocked.
Next action: complete real TESTNET application account/wallet setup, then resume
BYE-W1-003 with fresh authoritative checks. BYE-W1-004 is NOT STARTED.
