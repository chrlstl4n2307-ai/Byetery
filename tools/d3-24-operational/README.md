# D3-24 activation review

## Current V3 bootstrap candidate

`launch.ps1 -V3Review` verifies the pinned PowerShell, Node and bootstrap before observing the published review baseline `3ee1e4e5b5d047ccac6782459aa405a37ead983b`. The isolated supervisor requires that result before starting the synthetic server and client. The supervisor connects the existing `OFFLINE_SYNTHETIC` controller over inherited IPC. The server validates four sessions and revalidates them before the existing `D324Authority.admit` transaction. Neither this mode nor the package verifier opens an operational port.

`launch.ps1 -V3VerifyPackage` is the review-only external package verifier. It requires the fixed owner's Ed25519 approval in the V3 domain and a clean, direct child of the published review baseline. The manifest carries the exact Git SHA/parent/tree, independent operator SHA/parent/tree, plan, task, deployment, network, battery, recipient, artifact hashes, ledger, budget, binaries, K5 and session-control. The bootstrap hashes the entry modules against the target Git objects. The owner package then rechecks the existing capture profile, operator checkout, binaries, physical PowerShell parent, K5 and session-control. The session-control file retains its existing schema 2. That schema binds executable paths and versions and is separate from the activation manifest schema.

The owner package uses the existing physical custody directory. `activation-manifest.json` is canonical UTF-8 JSON with final LF. `manifest-approval.sig` signs `BYETERY-D324-MANIFEST-APPROVAL-V3\n<manifest-sha256>\n`. `execution-approval.json` contains exactly `grant`, `grantSignature`, `execution`, `executionSignature`, `live`, `liveSignature`. The execution document binds all four session identities, the server instance/challenge and runner key. LIVE signs the manifest, grant and execution hashes in the V3 LIVE domain. The durable server independently requires the runner's PoP and SQL session/expiry, budget and quiescence checks. Ratification must follow commit review so the target SHA/tree and custody documents stay external.

Default launch, direct Node LIVE, and the old executor all return `D324_OPERATIONAL_RATIFICATION_REQUIRED`. The historical files and their pins remain in their exact commits. The real server/worker binding, four real sessions, effective database privileges, migration/readback, and signer/custody approval require separate work. This candidate creates no approved manifest, grant or LIVE permit.

## Historical V2 design

The following section records the earlier activation design and is retained for its historical checkout. Its custody files and fixture command apply to that checkout.

This candidate starts from `436061d6381fccb52e94ae57123c31803ede30e2`. The previous review manifest remains a historical V1 format. The candidate keeps the exact D3-24 plan, battery and recipient and loads the factory from the independent clean operator at `c50e4eb1f7f538a231c5ecfc31d19283998dc234`. Preparation confers no PRE-LIVE or LIVE authority.

## Actual entry path

`launch.ps1` hashes PowerShell 7.6.9, Node and the bootstrap before executing the pinned `node.exe`. The dependency-free bootstrap verifies the detached manifest approval, the clean Git SHA/parent/tree and the hashes of both entry files before importing the operational entry. Node verifies the same manifest, exact operator checkout and its file hash, canonical K5 and session-control, actual parent process and executable, and both runtime approvals. The application port stays closed without all approvals. Direct Node invocation and legacy launchers reject D3-24. There is no environment or flag that confers execution authority.

The same wrapper's `-OfflineFixture` mode can only load a disposable fixture from the checkout's ignored `.tools/d324-wrapper-fixture-*` directory. It verifies the real binary pins and loads the pinned operator module for identity checking. It returns before opening database, credential, admission or Stellar ports. The five-operation and crash rehearsals use isolated fixtures and the existing verified operator tests.

## Detached approvals for a later owner-authorized phase

The candidate SHA, parent and tree can only be known once the candidate is committed. Create the canonical manifest and its approval outside Git at that time. Use the physical Windows custody directory `%LOCALAPPDATA%/OwnerKeyCustody/Byetery-D3-RUN1/live/D3-24-RUN1`. The current task creates none of these operational files.

| File | Exact binding |
| --- | --- |
| `activation-manifest.json` | Canonical UTF-8 JSON with sorted keys and final LF, schema `BYETERY_D324_FINAL_ACTIVATION_V2`. Fields are `target`, `identity`, `networkId`, `deploymentId`, `operator`, `operatorRoot`, `ledgerSha256`, `budget`, `artifacts`, `binaries`, `k5Sha256` and `sessionControlSha256` in addition to `schema`. Target is the exact clean direct child of the baseline above. Operator SHA, parent, tree and physical root are independently checked. The artifact SHA-256 fields are `wrapper`, `entry`, `captureChild` and `exportQuery`. The binary fields are `nodeSha256` and `pwshSha256`. |
| `manifest-approval.sig` | Independently approved by the owner. A detached unpadded base64url Ed25519 signature over UTF-8 `BYETERY-D324-MANIFEST-APPROVAL-V2\n<manifest-sha256>\n`. File is the 86-character signature plus LF. |
| `session-control.json` | Existing canonical schema 2. Binds the final SHA and exact physical paths, SHA-256 hashes and versions. Re-hashed before use, with the actual PowerShell parent and Node process verified. |
| `K5-UNSIGNED-TEMPLATE.txt` | Exact canonical K5 bytes for D3-24 and the final SHA. Re-hashed against the manifest before the grant is accepted. |
| `owner-grant.json` | Existing exact `{grant,signature}` owner envelope for D3-24, signed by the pinned Ed25519 key. Future fresh nonce, lifetime 900000 ms, and verified Auth observation at 5400 less than 600000 ms old. Auth stays at 3600 during preparation. |
| `live-approval.json` | Separate exact `{approval,signature}` owner envelope. Approval fields are `schema=BYETERY_D324_ONE_LIVE_APPROVAL_V1`, `taskId`, `manifestSha256`, `grantSha256`, `api={origin,pid,startedAt}`, `issuedAt`, and `expiresAt`. Sign UTF-8 `BYETERY-D324-ONE-LIVE-APPROVAL-V1\n` followed by canonical sorted JSON with final LF. Grant hash covers its canonical bytes including nonce. The deadline is bounded by both the JWT observation and grant expiration. |

The manifest digest and both approvals use the fixed public owner key. Providing a manifest and its own hash, setting an environment variable or presenting the grant signature cannot approve LIVE. Because the manifest lives outside Git, the candidate never contains its own SHA.

The future API is a separately started instance with numeric `127.0.0.1` origin. The LIVE approval binds its PID and UTC creation time. The launcher checks the listening PID, pinned Node executable and the process command line `node.exe --experimental-strip-types <absolute-checkout-path-to-backend/src/application/server.ts>`. The file path binds the API to the approved checkout. Startup and access to the actual process have to be verified during a separate authorized phase.

## Execution and evidence boundaries

- Check the detached approvals and API continuity, probe the pinned owner export in a read-only SQL transaction, and check coordinated SQL/Testnet readiness again immediately before admission. An exclusive create-only D3-24 marker stays after every outcome. The operator repeats fresh readiness before credentials and each step.
- Reuse the frozen operator's journal, application idempotency and reconciliation of the original operation identity. Require five distinct ordered operations, capped by the pinned plan and external ledger. D3-24 has five historical transactions against an ordinary limit of 19, leaving 14. RUN1 can spend at most five. Slot 20 stays locked.
- Corroborate SQL, Testnet and the durable journal for each operation. The bounded child preserves raw capture and verified inventory before advancement. The export uses only the pinned SQL and five verified IDs, with read-only transaction, rollback and independent evidence checks. Verified export bytes and their digest are persisted create-only under the local ignored `.tools/d324-final-export` directory. Foreign locks, pending work, uncertainty and identity changes stop the run. The scheduler retains its periodic try-lock. Critical operations remain blocking.

## Reproducing offline from a fresh checkout

Start with the reviewed baseline and apply this diff. Supply a separate clean local checkout of the baseline with the verified dependencies already present. The helper creates only ignored local paths and links existing dependencies. It creates an empty local PostgreSQL fixture and copies reusable toolchain files for integrated tests. It does not import remote configuration, Cargo credentials, historic DB data or custody files. The pinned operator worktree needs its existing ignored `backend/node_modules` dependencies.

```powershell
& ./tools/d3-24-operational/prepare-offline.ps1 -VerifiedLocalReference ../B24rat -Integrated
$env:BYETERY_D324_TEST_PWSH = (Get-Command pwsh).Source
node --test tools/d3-24-operational/final-activation.test.mjs tools/d3-24-activation/activation.test.mjs tools/d3-run1-launcher/confirmed-journal.test.mjs
```

The local PostgreSQL fixture is bound to loopback. Run integrated verification through `scripts/instaward/local-postgres-fixture.py --root-verify` with its expected backend count set to 672 **in the invocation only** as shown below. This keeps the historic fixture script intact. It runs `npm run verify` with Cargo offline and restores the stopped fixture afterwards.

```powershell
@'
from pathlib import Path
p = Path("scripts/instaward/local-postgres-fixture.py").resolve()
src = p.read_text(encoding="utf-8")
old = "expected_tests = 48 if args == ['--source-fix-only'] else 547"
assert src.count(old) == 1
src = src.replace(old, "expected_tests = 48 if args == ['--source-fix-only'] else 672")
exec(compile(src, str(p), "exec"), {"__file__": str(p), "__name__": "__main__"})
'@ | python -u - --root-verify
```
