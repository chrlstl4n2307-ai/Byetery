# D3-24 operational adapter

Review checkpoint: `ae50b48399aefdc68339ac55d3f214adc77349a4`. The operator is a separate clean Git worktree at `c50e4eb1f7f538a231c5ecfc31d19283998dc234`. The existing D3-24 plan and append-only external ledger remain authoritative for the candidate. D3-23's registration uses one historical slot and its incomplete run does not count.

## Review entry points

- `reviewD324Checkout` verifies the parent composition, manifest, independent operator checkout, plan, ledger, SQL export query and absence of D3-24 controls. It accepts the draft on the review checkpoint and the clean direct child with the ten allowed changed paths. This check performs local reads.
- `bindD324Readiness` binds the candidate journal, coordinated read-only SQL, the existing Testnet read client and the four approved signer identities. The shared source-freshness guard and the frozen operator's preflight validate observations. Completion additionally checks the exact reward and balance changes.
- `evidenceBindings` binds the existing D3-24 receipt inventory, independent transaction corroboration and owner SQL export verifiers. Synthetic captures cannot become verified chain evidence.
- `verifyD324SessionPins` checks the D3-24 session control, physical paths and hashes for the wrapper, entry, PowerShell parent and Node executable. `verifyD324OwnerEnvelope` re-hashes the active K5 bytes, checks the exact signed scope, and verifies Ed25519 against the pinned owner public key.
- Both `live.mjs` and `launch.ps1` terminate before opening operational ports. The final operational commit pin is intentionally unset.

## Future ratification

Review and freeze this patch first. The later activation must bind the real commit, K5 template and external session-control hashes, enforce canonical custody and operator/API checkout paths, and revalidate both checkouts and state at use time. Bind the D3-24 controls to the same Git common directory as its isolated operator and verify retired controls in their existing repository. Preserve the legacy one-shot entry order: verify session and grant, take fresh read-only observations, recheck the pins and authority, create the exclusive task marker, and only then resolve credentials and load the operator. Keep receipt capture bounded by the existing supervised-child timeout and require corroboration of the same operation identity before advancement. These entry-point connections require separate review.

Normal Auth is 3600 seconds. An authorized future PRE-LIVE must observe 5400 independently and use a new grant with lifetime 900000 ms. Launch strictly before the earlier of grant expiration and the 600000 ms Auth observation deadline, with explicit separate LIVE approval. A failed or uncertain launch stops for review. Budget remains 5 historical, 14 remaining through slot 19, maximum 5 for RUN1. Slot 20 remains locked.
