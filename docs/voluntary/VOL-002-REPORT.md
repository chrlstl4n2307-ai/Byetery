# VOL-002 — Secure Store signer local/offline validation

Date: 2026-10-11, America/Santiago.
Classification: VOLUNTARY PRE-SPRINT DEVELOPMENT, not funded Instaward work.
Branch: `pre-sprint/voluntary-d1`; frozen parent/tag unchanged.
Result: PASS for the authorized local/offline scope, NOT application Testnet E2E.

## Actual final results

| Check | Result |
| --- | --- |
| Installed four public identity mappings | PASS — ADMIN/SERVICE/COLLECTOR/RECYCLER |
| Helper build | PASS |
| Native validation tests | 18/18 PASS; zero lib/bin/doc cases are not added to this count |
| Real offline suite | 9/9 PASS |
| Single-auth envelope signing | 5 methods PASS: register, open return, cancel, recycling, reward |
| SERVICE + COLLECTOR | PASS — V1 and V2, both distinct authorization entries verified cryptographically offline |
| Secure Store real signing | PASS — existing identities, no key export |
| fmt --check | PASS |
| Clippy all-targets / -D warnings | PASS |
| Helper no RPC/submit call sites | PASS — existing explicit test and source inspection |
| Private keys exported | NO |
| Signed envelopes/signatures published or logged | NO — in-memory process output only |
| Stellar transactions submitted | 0 |

Final tested executable SHA-256:
`99ef0be4a0a78c97a71facb4fa2bddbe4d9681a67b2d6c76a1cf3acf0fe88729`.
Metadata-only source hashes and counts are in VOL-002-public-results.json.
Tests ran on the included working-tree changes before their checkpoint; the
later commit identifies the same source snapshot, not an earlier frozen test run.

## Minimal local corrections, no rule changes

Initial link failure came from Rust GNU/MSVCRT startup/import selection mixed
with the installed LLVM/UCRT C++ libraries: __sys_nerr, _strftime_l, btowc,
wctob and related imports were unresolved. A inherited rustc wrapper also
overrode a targeted LLVM attempt. The helper verifier now removes that wrapper
and uses a RUSTC_WORKSPACE_WRAPPER for this standalone workspace only. It
selects the existing clang/UCRT driver/import libraries, with installed Rust
GCC unwind/builtin runtime libraries as a secondary search path. Environment
changes remain in the spawned shell. No shim, tool installation, dependency
patch, global CLI/configuration or Windows protection change was made.

PE inspection of the working binary shows Windows/API-set UCRT imports, not
MSVCRT. Native tests then exposed six negative-fixture mutations using unsupported
VecM mutable indexing. Those fixtures now use iter_mut, retaining all cases and
expected rejections. rustfmt changed formatting only in build.rs. Helper
production lib/main, Cargo.lock, all allowlists, cap=50000000, key mappings and
contract sources remain functionally unchanged.

## What the tests mean

Native cases reject malformed XDR, wrong network/contract/method/source/actor,
missing either collection authorization, wrong signer, changed/nested invocation,
excessive fee/auth expiry, unbounded time, multiple operations and identity input.
All six allowed methods preserve the fixed signer mapping.

The real offline suite uses the existing non-broadcastable fixtures: sequence=1,
auth expiration=100, local ledger context=1. Every envelope signature and the
COLLECTOR V1/V2 signature preimage is verified with the expected public keys.
This proves local signing, not current chain authorization or independent human
custody. The backend still must enforce authorized recipient_snapshot and obtain
trusted RPC ledger/context. The four identities share one OS Secure Store.

No signed material is written as an artifact. Ignored logs contain test names,
counts and compiler diagnostics only; public report contains metadata, no seeds,
private keys, credentials or signed XDR.

## Reproduce only the authorized offline scope

```powershell
pwsh -NoProfile -File scripts/verify-secure-store-signer.ps1 -Action test
pwsh -NoProfile -File scripts/verify-secure-store-signer.ps1 -Action build
pwsh -NoProfile -File scripts/verify-secure-store-signer.ps1 -Action fmt
pwsh -NoProfile -File scripts/verify-secure-store-signer.ps1 -Action clippy
node --experimental-strip-types --test backend/signing-tests/offline.test.ts
```

The installed toolchain/runtime and existing Secure Store entries are required;
missing tools/entries do not trigger installation, secret export or fallback.
This is a local development/Testnet component, not production custody assurance.

## Remaining limits / stop

Current real Byetery simulation fees exceed the unchanged cap; deployment state
is archived. No restore, extension, cap increase or broadcast was executed.
No TestnetStellarService or backend refactor was implemented. VOL-003 is a plan
for review. Instaward start UNCONFIRMED / NOT STARTED; acceptance stays 0/23.
STOP after this package before any broadcast.
