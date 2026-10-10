<!-- BYETERY-INSTAWARD-DOCUMENTATION -->
# Known limitations

PRE-SPRINT BASELINE · 2026-10-09

## Current MVP limitations

Application uses MOCK, not Soroban. TestnetStellarService is absent. Current UI has baseline role/QR/timeline behavior; real tx references, verifier UI and review access remain acceptance work. Uncommitted wallet/QR branch is not merged; no manual Freighter/camera E2E is claimed.

## Testnet limitations

Historical results are dated, not a guarantee of live availability. Testnet resets, archival/TTL, RPC outages, fee/reward balance and trustlines can affect future demos. Preserve public result JSON and fixture bytes. Do not silently redeploy/create assets to hide missing prerequisites. Readonly protocol-29 observation on 9 October is not another contract validation.

## Signing/custody limitations

Stock CLI 28 does not expose auth-sign-and-return without submit. Restricted library-based helper is implemented locally but native tests/actual signatures are not completed; build/runtime problems and memory constraints are recorded. Existing identities are builder-controlled; this does not prove independent organizations. Helper is development/Testnet infrastructure, not production/Mainnet custody.

## Physical-world verification limitations

Commitments establish integrity/context of disclosed bytes, and roles establish who attested. They do not certify actual receipt/recycling, chemical treatment, legal compliance or environmental benefit. Synthetic records must be labeled. Operator interest is not verified; no pilot volume or partner is invented.

## Production considerations

Future production would require a separate custody/access/threat/recovery design, monitoring, availability and operator validation. Those are not represented as completed. No secrets/test-role passwords/signed payloads belong in public artifacts.

## Out of scope

Mainnet, Vercel/production deployment in the current task, new contract/asset/actors, tokenomics, public token sale, multi-wallet, oracles, hardware/IoT, native mobile/marketplace, industrial logistics, physical audits/certification, production incentives and SLAs. SOW post-Instaward validation targets are hypotheses, not extra funded deliverables or existing results.

## Documentation limitations

Exact official sprint start is unconfirmed. Git commits prove committed changes/timestamps, not effort or every daily activity. WIP file hashes do not make an unpublished source checkpoint reproducible. Native helper build was explicitly paused; no failed criterion is inferred from incomplete execution. Notion plugin is installed but has no callable page/database tools in this session. Public index/export files are local until deliberately published.

## Formal freeze reference

**HISTORICAL BASELINE:** `252fff88d4c4abbb6986460c12f1766b1ddfb574` — prior direct-contract/Testnet validation.

**FROZEN PRE-SPRINT BASELINE:** annotated tag `pre-instaward-baseline-v1`, created by this freeze procedure. Its commit SHA is resolved from the tag after creation, not guessed or embedded circularly.

Canonical source/index: https://github.com/chrlstl4n2307-ai/Byetery/tree/pre-instaward-baseline-v1

Incomplete helper work is PARTIAL / RESEARCH-SPIKE / NOT VALIDATED. Wallet/QR WIP is archived separately with its base, patch and hashes and is not merged. See FREEZE-CLASSIFICATION.md and BASELINE-MANIFEST.json. This snapshot preserves pre-sprint work; no D1/D2/D3 implementation or new product validation occurred in this freeze. Official sprint start: UNCONFIRMED.
