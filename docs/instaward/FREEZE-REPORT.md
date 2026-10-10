# Pre-Sprint Baseline Freeze Report

Date: 2026-10-09. Official sprint start: **UNCONFIRMED**.

## Canonical references

- **HISTORICAL BASELINE:** `252fff88d4c4abbb6986460c12f1766b1ddfb574`.
- **FROZEN PRE-SPRINT BASELINE:** annotated tag `pre-instaward-baseline-v1`.
- Branch: `codex/testnet-app-integration`.
- Commit message: `chore(instaward): freeze pre-sprint baseline`.
- Tag message: `Byetery frozen pre-sprint baseline before Instaward execution`.

Resolve the exact frozen commit from the annotated tag. The commit deliberately does not embed its own SHA, avoiding a circular content/hash dependency. The final receipt and user-facing report record the resolved SHA after creation. No follow-up metadata commit is required.

## Included content

Historical tracked baseline, pre-existing helper/adaptor/test/build-script WIP, its independent Cargo.lock, Instaward documentation and curated Notion exports, the reviewed SOW V3.1 Markdown, and an archival snapshot of wallet/QR WIP. Full per-file classification is in FREEZE-CLASSIFICATION.md/json.

Wallet/QR snapshot: base `0a572af29b6d4df6c16feb0329ecc225948824f6`, 21 tracked modifications preserved in a binary Git patch and 17 untracked files preserved verbatim. Hashes are in its manifest. It is not merged into active code; the original worktree remains untouched.

Incomplete work is **PARTIAL / RESEARCH-SPIKE / NOT VALIDATED**. The freeze does not implement D1/D2/D3 or declare any new acceptance criterion PASS. Helper native executable/signature validation and TestnetStellarService remain incomplete. Product development remains paused.

## Excluded content

`.env`/local credentials, `.tools`, toolchain/dependency caches, node_modules, `.next`, target/native/WASM builds, temporary databases and raw signing material. The generated WASM remains excluded while its expected hash is preserved: `c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6`.

## Validation scope

Markdown source/export sanity: PASS. Snapshot hash/patch parsing: PASS. Notion ZIP integrity: PASS. Principal audit: CLEAN, zero findings; supplemental token/env/archive scan: CLEAN, zero findings. Staged diff and staged-content audit are required again immediately before commit. Audit counts are in the final local receipt; credential values are never printed.

No product suite, contract call, signing test or transaction is executed for this freeze. Historical suite outcomes remain the dated baseline results (Rust 20 native + repeated native/one constructor WASM, Foundation 50, HTTP 43, frontend 33, Python 4, SQL 82). Nine local adapter tests and compile-only spike checks are partial pre-sprint observations, not complete helper/application validation.

## Public verification procedure

After push, anonymously check repository, exact frozen commit, annotated tag and the three baseline documents below. A failed anonymous check must be reported as FAIL; publishing a tag does not automatically prove availability.

- https://github.com/chrlstl4n2307-ai/Byetery
- https://github.com/chrlstl4n2307-ai/Byetery/tree/pre-instaward-baseline-v1
- https://github.com/chrlstl4n2307-ai/Byetery/blob/pre-instaward-baseline-v1/docs/instaward/PRE-SPRINT-BASELINE.md
- https://github.com/chrlstl4n2307-ai/Byetery/blob/pre-instaward-baseline-v1/docs/instaward/EVIDENCE-INDEX.md
- https://github.com/chrlstl4n2307-ai/Byetery/blob/pre-instaward-baseline-v1/docs/instaward/NOTION-DAY-0-REPORT.md

Notion export uses the canonical tag and contains no private credentials/signing payloads. Notion page creation is not part of this Git freeze; callable Notion tools remain unavailable as recorded.

Main merged: **NO**. No contract/deployment/asset/identity changes. No product development after freezing until separately instructed.
