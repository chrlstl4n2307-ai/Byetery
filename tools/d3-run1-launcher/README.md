# D3-17-RUN1 review launcher

This package isolates RUN1 orchestration from the frozen operator. Its only CLI mode is `--offline-replay`. The live entry point is sealed with `LIVE_EXECUTION_ENABLED = false` and rejects mismatched identities or absent future owner approval before binding any runtime ports. This revision contains no grant, actual operator factory, credential store implementation, login transport, or CLI live switch.

## C1 and C2

The same operator handle owns all five steps and the final counting decision. The synthetic admission marker is exclusive and persistent within its replay directory. It remains after a startup or step failure. A future deployment must retain the frozen operator's lock and exclusive journal and must bind the launcher admission to the exact RUN1 identity. A failed frozen step is terminal for this run even if later reads recover its transaction.

After a step confirms, the launcher persists the original identity before starting capture in a separate process. The replay child inherits an empty environment. A pending capture allows one read-only recapture of the same identity while the handle stays open. A terminal mismatch, integrity failure, or inconclusive recapture stops advancement. The parent re-hashes the inventory files. The live orchestration also requires a trusted independent API/SQL/chain verifier before advancement. No capture observation creates an operation or changes the frozen step.

The read-preflight port invokes its source for each request and verifies a fresh request binding and timestamps. It retains only source, timestamp and ledger metadata. It rejects cached responses and has no fallback on a read failure. A future runner must supply the approved source adapter that performs those reads. The credential port resolves each allowed role once at runtime through the secure-store interface. Only the frozen operator may consume the resulting credentials. Errors at the credential boundary use fixed messages.

## Session policy

The policy consumes the project-specific access-token validity and its observation time. Before startup it derives the deadline as `operatorStart + configuredValidity - 120 seconds`. The 120 seconds cover clock differences and last-step cleanup. The startup allowance is 180 seconds. Each remaining step budgets 600 seconds for frozen observation, 120 for other API/preflight reads, and 60 for the initial capture and one recapture. It checks again before each step and after capture. It also checks the four original sessions and rejects changes to the recorded session identities or expiry. The runtime has no refresh or replacement path.

The owner read **3,600 seconds** in Supabase DEV Authentication → Sessions. This produces a **3,480-second** deadline from startup, below the **4,080-second** initial workload budget. This policy intentionally denies startup at that configuration. The 5,400-second input in the replay is a synthetic positive case.

## Historical read boundary

The historical adapter pins the retired transaction, operation, battery, ledger, existing bundle and API admission record. The read-only adapter uses the ratified SQL receipt SELECT, a scoped projection and quiescence SELECT inside read-only transactions, and Horizon transaction/ledger GETs. The archived RPC receipt and snapshots retain their original observation provenance. The adapter reuses the unchanged ratified metadata comparator. Only `core_metrics / invoke_time_nsecs` is ignored under its existing strict shape guards.

The stored API HTTP 202 records admission. The separate sealed journal preserves the historical operator's confirmation and subsequent API state checks for that operation. These observations corroborate fresh SQL and Horizon reads. The archive-only replay remains partial because it has no fresh read. See [L1 and L2 evidence](L1-L2-REVIEW.md).

## Offline verification

From the repository root:

```powershell
node tools/d3-run1-launcher/replay.mjs --offline-replay
node --test tools/d3-run1-launcher/*.test.mjs
```

Synthetic output is written to fresh directories under ignored `.tools`. The historical verification function takes a trusted pool and paths at runtime. It has no command-line credentials or constructor for the frozen operator.