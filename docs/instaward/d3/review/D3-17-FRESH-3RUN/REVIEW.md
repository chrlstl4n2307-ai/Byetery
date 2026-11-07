# D3-17-FRESH-3RUN review bundle

The candidate is PREPARED_NOT_RATIFIED. This bundle preserves the four original
plan and ledger files byte for byte. The supporting JSON files are public
projections of the prior read-only observations. All transaction, commit and
push authorizations for this preparation are false.

| Identity | Value |
| --- | --- |
| Task | `D3-17-FRESH-3RUN` |
| Business execution SHA | `c6ba2e837ed0f7b81373655b8106b58ecb86a8cd` |
| Business fingerprint | `e9a75a332489f80cdd748121c95c3fe66ce3425b48926e92d8d22a9fd2e78539` |
| Capture tooling SHA | `84f1bdd145269c306008f2ae4a1c3648864dd347` |
| Capture root tree | `c07edaa8231640c5f14777266e454a62c54e5aa3` |
| Capture auxiliary subtree | `366c0da0ae557749e6fae10f96115888667237c4` |
| Evidence tooling subtree | `cccda6b882bba85f848064ef70d086588c65608b` |
| Plan hash | `3788fd5b0ce1e07cb91720a7fb16cf8d9a81f1ee86e2eb29b289c56f4fc15c1e` |
| External ledger head | `27a286e968e83c3ed815ffc848df5f2160712cb990126fc4bad918feb8051f02` |

| Run | Battery ID | Recipient |
| --- | --- | --- |
| RUN1 | `BYE-D3-R1-20261107-5FB1AED9DA08` | Wallet A |
| RUN2 | `BYE-D3-R2-20261107-9A1AA193FFC7` | Wallet B |
| RUN3 | `BYE-D3-R3-20261107-E239CD5AC755` | Wallet A |

Wallet B is `GCE35NEN2O3EYK5A7SROTLFOCSAIGLN2BPVQBFS4UG52BY2P7K6VC6DB`.
The recorded Testnet observation confirms its authorized GREENTEST trustline
for the exact issuer, a balance of 0.0000000 and PASS for the wallet-link
readiness check. The plan has two distinct recipients and retains all six
negative cases.

## G1–G4

- **G1 · Old plan closure.** Ledger entry 4 marks plan
  `83c033f3d0e47c3adec980f51d8c0f4931292c64f5bfacd04c6010dcd7e3a0f3` as
  `CLOSED_RETIRED` with `reusable=false` and `future_tx_allowed=false`.
- **G2 · Sealed controls.** Entries 3 and 4 bind the retired battery, TX1 hash
  and operation ID, stopped bundle, budget hash and one recorded reservation,
  and original journal hash. The public seal repeats these identifiers.
- **G3 · Plan identity.** The new task and the three fresh batteries are bound
  to the same frozen business and operator. The hash is derived from the
  normalized plan content, including the fresh battery IDs. The schema has
  no cosmetic nonce field. The expected new internal budget remains zero.
- **G4 · Project accounting.** The external ledger is the project-wide source
  of truth for cap accounting. It carries forward four confirmed Testnet
  transactions. The aborted pre-dispatch attempt is listed separately with
  no transaction hash. Only the historical entries contain operation IDs and
  transaction hashes. The candidate entry describes runs and their expected
  steps. It contains no future operation IDs or transaction hashes.

```text
PROJECT_EXTERNAL_CAP = 20
PROJECT_CONFIRMED_CONSUMED = 4
FRESH_PLAN_ALLOCATION = 15
MAX_WITHOUT_MARGIN_UNLOCK = 19
TX20 = LOCKED
```

The allocation is planning policy. The current number of authorized
reservations is zero. Before a future transaction, the sum of confirmed
consumption and authorized outstanding reservations must stay at or below
19 unless the owner separately unlocks transaction 20. A future extension
must preserve the reviewed ledger prefix and bind to its ratified head.
The hash chain provides integrity against that independent anchor and
grants no execution authority.

## Residual collision risk

`HISTORICAL_TESTNET_EXHAUSTIVE_ABSENCE = NOT_PROVEN_NON_BLOCKING`

The Council classified the remaining archive limitation as non-blocking for
plan identity review. The preparation checks covered SQL, consumed markers,
local historical artifacts, previous plans and active Testnet state.
`getLedgerEntries` observes live state. An omitted key alone cannot prove
exhaustive archive absence. The frozen contract's persistent duplicate
registration guard fails closed with `BatteryAlreadyExists` for an existing
battery. [Stellar live ledger data](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getLedgerEntries)

## Reproduce the hashes

From this directory, run the following with Python 3 without optimization.
It checks the manifest's nine payload files, reconstructs the plan
canonicalization independently and recomputes every ledger link. Compare
the manifest SHA-256 with the digest from the review handoff. The manifest
covers the payload files and its own digest is recorded externally.

```python
import hashlib
import json
from pathlib import Path

def digest(data):
    return hashlib.sha256(data).hexdigest()

def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False,
                      separators=(",", ":")).encode("utf-8")

manifest_bytes = Path("review-manifest.json").read_bytes()
manifest = json.loads(manifest_bytes)
for row in manifest["files"]:
    payload = Path(row["path"]).read_bytes()
    assert len(payload) == row["bytes"] and digest(payload) == row["sha256"]

plan = json.loads(Path("new-plan.json").read_bytes())
plan["runs"].sort(key=lambda run: run["runId"])
for run in plan["runs"]:
    run["negativeCases"].sort()
plan_bytes = Path("new-plan.canonical.json").read_bytes()
assert canonical(plan) == plan_bytes
assert digest(plan_bytes) == manifest["planHash"]

ledger_bytes = Path("external-project-ledger.jsonl").read_bytes()
checkpoint = json.loads(Path("external-project-ledger.checkpoint.json").read_bytes())
assert digest(ledger_bytes) == checkpoint["ledgerFileSha256"]
assert checkpoint["planHash"] == checkpoint["canonicalInputSha256"] == manifest["planHash"]
lines = ledger_bytes.splitlines()
assert len(lines) == checkpoint["entries"] == 5
previous = None
for sequence, line in enumerate(lines, 1):
    entry = json.loads(line)
    assert canonical(entry) == line
    claimed = entry.pop("entryHash")
    assert entry["sequence"] == sequence and entry["previousEntryHash"] == previous
    assert digest(canonical(entry)) == claimed
    previous = claimed
assert previous == checkpoint["headSha256"] == manifest["ledgerHead"]
print("planHash", digest(plan_bytes))
print("ledgerHead", previous)
print("reviewManifest", digest(manifest_bytes))
```
