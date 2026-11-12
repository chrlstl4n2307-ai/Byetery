# D3-24 capture profile — local candidate, read only

Status: **REVIEW CANDIDATE / NO OPERATIONAL AUTHORITY**.

This module resolves the historical capture-tree incompatibility with a separate
D3-24 verifier. It does not alter `f1-checkout.mjs`, either frozen capture tree,
key custody, grants, admission, a launcher or the blockchain adapter.

## Fixed policy

| Item | Literal identity |
|---|---|
| Task / run | `D3-24-RUN1` / `RUN1` |
| Composition ancestry floor | `725d25202c9085882ef80904a669bd39f0f1b39d` |
| Receipt tree | `366c0da0ae557749e6fae10f96115888667237c4` |
| D3-24 evidence tree | `0d67dddb9bca5d09bceb286115c67f43d4eddb92` |
| Legacy evidence tree, unchanged in F1 | `cccda6b882bba85f848064ef70d086588c65608b` |
| Historical delta introducing the D3-24 tree | `ae50b48399aefdc68339ac55d3f214adc77349a4` |
| Active external ledger SHA-256 | `eaffd7521b905b995dba26150190c44592822e6e052509b3d65815adde25404d` |

`D324_CAPTURE_PROFILE_SHA256` hashes canonical UTF-8/LF bytes of the immutable
profile literal. It is a capture-profile digest, **not a new planHash**.

Current candidate profile SHA-256:
`8b4d53d22e0ea725550a1c43cd7a82bd2e8cb7f6b28dee06b1ec55f4fc4dd34d`.
This value is unapproved until the separate owner ratification.

## Approval and byte checks

`verifyD324CaptureProfile(root, input)` accepts exactly `taskId`, `manifestBytes`
and `manifestApproval`. There is no caller-selected key, tree or expected digest.
It authenticates the canonical V3 manifest with the existing fixed owner public
key and `BYETERY-D324-MANIFEST-APPROVAL-V3` domain. The proposed future manifest
must include `artifacts.captureProfileSha256` in addition to its existing wrapper,
entry, captureChild and exportQuery SHA-256 bindings. No real manifest or approval
was generated in this task. Older manifests lacking that field fail closed.

The approved target contains exact SHA, single parent and tree. It must descend
from the audited baseline. HEAD is observed solely to check equality with that
signed SHA, never to discover an acceptable pin. Replacement refs, Git environment
overrides, dirty/untracked files, skip-worktree and assume-unchanged flags reject.

Both subtree IDs must equal the literals above. Every file within both subtrees
must be a regular file at its exact physical path and match its committed Git
blob **byte for byte**, including line endings. The four manifest-bound artifacts
and unchanged external ledger are also checked. Revalidate before each read-only
capture via `assertD324CaptureContinuity(root, proof)`.

The returned immutable proof is backed by a module-private WeakMap. A clone or
serialized lookalike is not valid. It carries `CAPTURE_READ_ONLY` and
`liveAuthority: false`. It cannot replace any manifest/plan/operator/runtime/grant,
session, LIVE, admission, budget or worker gate. The verifier checks capture-data
integrity, not the semantic validity of the entire execution plan. Future trusted
bootstrap must also bind this verifier's own source through the approved
composition. Production integration and owner approval remain separate work.

## Regression tests

Run from the isolated candidate `C:/Users/Christián/Documents/Codex/B24capture`:

```powershell
$env:NODE_DISABLE_COMPILE_CACHE='1'
node --test --test-concurrency=1 tools/d3-24-capture-profile/profile.test.mjs
```

The current fixture locations are the clean existing `B24secure` at `725d252`
and an isolated clean `B24capture-legacy` at `864dd0c`. The latter contains the
legitimate original F1 composition. Dependencies are linked from an existing
installation only. No package installation or historical worktree cleanup occurs.

The tests use synthetic owner keys through a **test-local module loader**, not
an exported production key override or environment flag. A separate process with
the actual production pin rejects those same signatures. No owner private key is
read, and no approval is created for real operational use. The signed test data
uses existing historical plan/operator identifiers only to exercise the capture
verifier; it does not approve their reuse for business execution.

The byte-change tests alter only an in-memory read observer, including after an
initial clean Git observation. They do not edit the historical checkout. The
historical F1 case also passes directly from `B24capture-legacy`:

```powershell
node --test --test-name-pattern 'capture and evidence subtrees' tools/d3-run1-launcher/f1.test.mjs
```

F1 correctly continues rejecting a D3-24 composition under its historical
profile. This patch deliberately does not turn that rejection into a generic
PASS or switch the operational wrapper to the new profile.

Local results for this candidate: **29/29 profile tests PASS** and the named
historical F1 case **1/1 PASS** in `864dd0c`. A broader evidence regression run
returned 36/37 PASS in the D3-24 checkout. Its A24 legacy CLI test deliberately
requires the original 24-file `c6ba2e837` business fingerprint: `725d252` differs
in seven files, and `864dd0c` in two. A24 was separately run in a clean
`84f1bdd` fixture whose 24 files match exactly, and passed **1/1** there. The
fingerprint was not changed. This is context-qualified evidence, not a claim
that the legacy CLI accepts the later business implementation.

The full root `npm run verify` was not rerun for this isolated capture-only
change. Available disk was approximately 0.94 GB during verification. Before
any future Git checkpoint, satisfy the repository's full-verification requirement
with adequate local fixtures/resources; these focused results do not waive it.

## Remaining decision

Review these new bytes and the proposed V3 artifact-field addition. Later, under
separate authority, create the appropriate immutable composition, bind its actual
SHA/parent/tree and verifier source, and obtain independent owner approval. Only
then may a separately reviewed D3-24 capture caller use the profile. Do not
modify the historical F1 constants or manufacture an approval to test readiness.

## Validation closure — 2026-11-12

The earlier disk limitation above is historical. For this review, 1,654,353,726
bytes of verified ignored compiler intermediates were removed; link archives,
WASM, dependencies, historical evidence and source candidates were preserved.
An uncommitted validation-only checkout (`B24validation`) combines the exact
16 server, 2 operator and 4 capture/doc candidate files. It is not an approved
composition, new business SHA, plan, or operational checkout.

Fresh results: capture profile 29/29; root `npm run verify` exit 0 (backend
701/701, TypeScript, Rust/WASM/Clippy, Python 4/4, MOCK demo); helper Rust 30/30,
fmt and Clippy; four-session cross-process loopback fixture 17/17. Real local
PostgreSQL covered H1/H2/M1 and advisory-lock coordination; its ephemeral cluster
was stopped. Historical launcher 144/144, historical export 33/33 (including A24), composition
15/15, activation fixtures 10/10 and historical operational identity 1/1 passed
in their contract-correct contexts. The helper used existing local LLVM/UCRT
linking and stripped debug information for disk capacity; this does not approve
the executable for real custody use.

A broad 188-case diagnostic run on the uncommitted combined checkout returned
175 PASS / 13 FAIL: eight activation cases lacked the required PowerShell fixture
path, one F1 case required its historical tree, one operational identity case
required its clean review checkout, and three composition cases required the
original uncommitted 21-file composition fixture. These were rerun without code
or pin changes: activation 10/10 with the installed PowerShell 7.6.9, F1 within
the 144/144 historical suite, operational identity 1/1 in `B24run`, composition
15/15 in an isolated reconstruction from the exact historical Git blobs. The
old positive tests do not attest the new uncommitted checkout as ratified.

OPTION_A is selected provisionally for controlled Testnet planning only.
Residual custody risk is not accepted for LIVE. Actual four-session Auth and
real-custody integration remain unproved; the 17-case result is synthetic.
See `docs/instaward/d3/review/D3-24-SECURITY-GATES.md` for the software temporal
contract, A24 compatibility matrix and outstanding approval requirements.
No commit, push, real signing, admission, remote mutation or Stellar transaction
was performed. SECURITY_STATUS remains HOLD.
