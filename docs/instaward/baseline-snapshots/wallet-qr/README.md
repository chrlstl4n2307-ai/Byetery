# Wallet/QR pre-sprint source snapshot

**PARTIAL / RESEARCH-SPIKE / NOT VALIDATED AS APPLICATION TESTNET.** This is an archival snapshot, not a merge and not active application code. The original worktree is untouched.

Base: `0a572af29b6d4df6c16feb0329ecc225948824f6`. Branch: codex/wallet-qr. Tracked differences are preserved as tracked-changes.patch; 17 untracked source/doc/test files are preserved under untracked-files/. MANIFEST.json contains the original per-file SHA-256.

To reconstruct for inspection, create an isolated checkout at the base commit, apply the patch there with git apply --unidiff-zero and copy untracked-files onto that checkout. Verify each source hash against the manifest. Do not apply this patch to the frozen baseline's active code or run tests/signers automatically.

No env files, builds, caches, dependencies, secrets or signing payloads were copied. Existing wallet test reports are historical and do not validate the new application Testnet path. No new functional validation was run for this freeze.

The zero-context patch avoids context-only trailing whitespace in its archival representation. Original source bytes are verified by reconstruction and manifest hashes; code is not reformatted.
