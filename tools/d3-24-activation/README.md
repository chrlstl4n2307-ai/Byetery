# D3-24 activation ratification review

The ratification draft starts at `da230383715e615b6c45f814c75fa88eb7d63147`, child of `ae50b48399aefdc68339ac55d3f214adc77349a4`. The operator remains separate at `c50e4eb1f7f538a231c5ecfc31d19283998dc234`. Both LIVE entry points still stop with `D324_OPERATIONAL_RATIFICATION_REQUIRED`. Neither the review manifest nor the synthetic rehearsal grants execution authority.

## External manifest for the next review

After the candidate is committed under separate authorization, read the exact SHA, parent and tree from the clean authorized checkout. Resolve the pinned operator from its clean linked checkout in the same Git common directory. Materialize a detached UTF-8 JSON manifest, canonical sorted keys with final LF and without BOM. The manifest remains outside both worktrees. The owner must separately approve the digest of the exact bytes, and that digest must be supplied from the independently approved control record. The manifest's own file, CLI or environment cannot establish that pin.

`BYETERY_D324_ACTIVATION_REVIEW_V1` has the following closed fields.

| Field | Binding |
| --- | --- |
| `target` | `sha`, `parent`, `tree` of the clean direct child of the operational base. |
| `operator` | SHA, parent and tree of the independent corrected operator. |
| `identity` | Exact task, run, operator SHA, plan hash, battery and recipient from the reviewed profile. |
| `networkId`, `deploymentId`, `ledgerSha256` | Pinned Testnet, deployment and sealed external ledger. |
| `budget` | `historicalConfirmed=5`, `limitWithoutContingency=19`, `remaining=14`, `runCap=5`, `tx20Authorized=false`. |
| `artifacts` | SHA-256 of `wrapper`, `entry`, read-only `captureChild` and `exportQuery`, checked against clean Git blobs and worktree bytes. |
| `k5Sha256`, `sessionControlSha256` | SHA-256 of the exact external K5 and session-control bytes. Session-control pins the physical PowerShell, Node, wrapper and entry paths, hashes and versions. |

Build K5 and session-control after the reviewed target SHA exists. Their contents and the detached manifest can bind that SHA without a commit containing its own SHA. A later change to the execution entry or its code requires fresh pins and owner review for that exact target. A final authority store and its trust root require review with that activation patch.

## Ratification order

1. Revalidate the clean target and operator checkouts, Git lineage, pins and files. Re-hash K5 and session-control immediately before use. Compare PowerShell and Node against the physical runtime identities. The rehearsal wrapper invokes a fixed offline probe and tests real process and binary pins.
2. During a separately approved future window, verify the owner Ed25519 grant under the pinned public key. Bind exact task, plan, operator, target, battery, recipient and a fresh nonce. Require 900000 ms lifetime and a verified 5400 JWT observation younger than 600000 ms. Auth remains 3600 during preparation. LIVE approval is a separate owner decision.
3. Revalidate coordinated read-only SQL and independent Testnet facts before any admission. Keep the exclusive marker in the common Git directory of the ratified operator and composition. Use create-only semantics. The marker stays after any outcome, including process death. Journal, budget and battery tombstone remain specific to D3-24. A prior marker, unexpected historical consumption, foreign lock, pending work or uncertainty stops progress.
4. Each step must preserve its original operation ID and hash in the durable journal and match projected SQL and Testnet receipts. The prepared read-only port runs receipt capture in a bounded child with an empty environment, proxies only the fixed SQL receipt query and verifies the sealed inventory. It independently corroborates against Testnet data and binds the five observations to the pinned read-only owner export. The synthetic child has separate readers and cannot produce chain-verified evidence.
5. Verify all five operations and reconcile the external ledger through the final snapshot. Stop on discrepancy or uncertainty and preserve evidence for review. RUN1 is capped at five and slot 20 remains locked.

Connecting a real wrapper and operator factory to admission requires separate ratification of the exact code and owner authority. Neither current entry point calls the read-only ports or factory. No migration, Auth change, signing, grant issuance, real admission or live calls belong to this review phase.

## Local rehearsal

From this draft worktree with existing dependencies and no real credentials:

```powershell
$env:BYETERY_D324_TEST_PWSH = (Get-Command pwsh).Source
node --test tools/d3-24-activation/activation.test.mjs
```

The harness creates fixture directories only in ignored `.tools`. It uses ephemeral fixture keys, locally encoded synthetic XDR, durable sandbox controls and PGlite. The live owner key never signs. PostgreSQL coordination uses the existing `tools/d3-24-operational/postgres.test.mjs` against a stopped-after-use loopback fixture. Keep the prior integrated verification as evidence for unchanged bytes.
