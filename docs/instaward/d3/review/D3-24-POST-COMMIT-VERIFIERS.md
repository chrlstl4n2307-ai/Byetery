# D3-24 — post-commit verifier candidate, offline only

SECURITY_STATUS=HOLD. EXTERNAL_MANIFEST_APPROVED=NO.
CUSTODY_DESIGN=OPTION_A_PROVISIONAL. CUSTODY_RISK_ACCEPTED_FOR_LIVE=NO.
PRE_LIVE_AUTHORITY=NO. LIVE_AUTHORITY=NO. No commit or push in this task.

## Exact review target

Composition `a329c8d7c13530fefd0a4cdc821855f69759c0d9`.
Parent `21f5e3e7a27759d02a0477c374b7e37f35f96909`.
Tree `cbc5181010663e2e36ae8e86d38f9fcef8908cf9`.
Independent operator `d85e54e00e98c8d8bc6294c883708a701ce55440`.
PlanHash `0435d8436d13881ebbdf31e729cf36a80e538bc149300219353f68817b37d72d`.
The original clean composition worktree is preserved. The patch is an uncommitted
isolated tool candidate based on that composition, not a new operational target.

## Root cause and exact failed tests

Line numbers below refer to the immutable test at a329, not this new candidate.

1. `tools/d3-24-composition/composition.test.mjs:21`,
   **candidate joins exact sibling capture and server bytes without inventing a future commit**.
   It expects `reviewCompositionCandidate` to return an UNCOMMITTED review, base
   server21f5e3e and null future SHA/tree. `review.mjs:21` explicitly requires
   HEAD21f5e3e and then an empty index. After materialization HEAD is a329, so the
   observed `D324_CANDIDATE_BASE_REJECTED` follows that contract. This is a
   pre-materialization phase verifier, not a general verifier of the latest HEAD.
   It does not pin a materialized tree. A separate exact post-commit profile is
   required; replacing its base constant would destroy the old phase contract.

2. `tools/d3-24-composition/composition.test.mjs:51`,
   **V3 field inspection is explicitly review-only and cannot materialize or approve a manifest**.
   Line54 passes only `{manifestBytes}` and expects
   `D324_COMPOSITION_NOT_MATERIALIZED`. The supplied manifest has a synthetic
   target SHA of forty `a` characters and tree of forty `b` characters, with
   parent21f5e3e; it is not an approved target. More importantly, the input lacks
   mandatory `taskId` and `manifestApproval`. In the dirty precommit checkout,
   `manifest-v3.mjs:46` rejects before checking these missing fields. On clean
   a329, it reaches `profile.mjs:106` and rejects with
   `D324_CAPTURE_IDENTITY_REJECTED`. This is an incomplete negative test coupled
   to gate ordering, not a historical hash incompatibility. Both paths reject;
   no unauthorized capture or business operation was reproduced.

POST_COMMIT_FAILURE_ROOT_CAUSE=PRECOMMIT_HEAD_PRECONDITION_AND_NEGATIVE_INPUT_GATE_ORDER.
No functional authorization regression was demonstrated. There was a real
read-only tooling compatibility gap: no exact materialized-composition reviewer.

## Candidate adaptation

The original `review.mjs`, `manifest-v3.mjs`, `pins.mjs`, capture profile,
legacy F1 verifier and operational entries are byte-identical to a329.

New `postcommit-review.mjs` fixes SHA/parent/tree, operator, plan, ledger and capture
profile to the already existing a329 composition. It checks a physical checkout,
clean Git state, index flags, Git replacements, exact object ancestry and all790
tracked raw file blobs. HEAD is compared to an existing literal pin; it is never
used to select or approve a new pin. No caller-supplied profile/key/target option
is accepted. Dirty patches and other commits reject.

`reviewMaterializedComposition` returns REVIEW_ONLY metadata with manifest,
custody, admission and LIVE approvals false. Its output is not a capture proof.
`inspectPinnedMaterializedV3Fields` checks an exact target after the existing
strict V3 parser, but is not signature approval. The pinned capture adapter still
delegates to the existing fixed-owner Ed25519 verifier and physical capture
checks. A valid synthetic-owner test proof grants CAPTURE_READ_ONLY, never LIVE.
Production without the test loader rejects that synthetic owner signature.

The existing13 test names and assertions are retained. Test1 now separately checks
the original reconstructed draft contract and the exact materialized profile.
Test4 retains the exact dirty-checkout rejection, tests the different clean-input
error, and adds complete-input/missing-approval/invalid-signature checks. It does
not widen a regex to accept any failure. The other11 cases are unchanged.

HISTORICAL_PROFILE_STATUS=PRECOMMIT_AND_LEGACY_CONTRACTS_PRESERVED.
D324_PROFILE_STATUS=EXACT_A329_READ_ONLY_CANDIDATE_TESTED_NOT_RATIFIED.
COMPOSITION_BINDING_VERIFIED=SHA_PARENT_TREE_AND790_PHYSICAL_BLOBS.

## Tests and compatibility matrix

| Code/profile | Checkout/context | Result |
| --- | --- | --- |
| Original two failing cases | Reconstructed precommit HEAD21f plus exact23 a329 blobs | 2/2 PASS |
| Original full13 cases | Same reconstructed precommit context | 13/13 PASS |
| Original two cases | Immutable clean a329 | Both original failures reproduced; not acceptance PASS |
| Candidate full13 cases | Candidate tool reviewing original draft and clean a329 separately | 13/13 PASS, zero omitted |
| Additional pinned materialized tests | Clean a329 and disposable alteration fixtures | 20/20 PASS |
| Existing D3-24 capture profile | Its existing exact legacy/synthetic fixtures | 29/29 PASS |
| Historical owner export including A24 | Exact84f1bdd checkout | 33/33 PASS |
| Historical F1 capture/evidence case | Exact864dd0c checkout | 1/1 PASS |

The reconstructed precommit checkout is explicitly a fixture: Git HEAD21f5e3e,
empty index and the exact23 blobs from a329 overlaid without a new commit. It is
not claimed to be a pristine historical commit or new historical evidence.

Additional20 cases cover wrong SHA/parent/tree, operator and plan, wrong capture
profile, V2 downgrade, missing manifest/approval, forbidden caller pins, wrong
signature domain, signed artifact mismatch, physical capture alteration, drift
after a clean Git observation, assume-unchanged/skip-worktree flags, fixed
production owner pin, no authority from inspection and no private proof cloning.
Physical mutations and index changes occur only in a disposable fixture and are
restored. No historical worktree is altered. Synthetic signatures stay in test
memory; no real owner or Secure Store key is accessed.

No backend, helper or contract behavior changes. Their full suites are not rerun
or represented as fresh verification for this narrow verifier-only patch.

## Running the review

From the verifier candidate, with existing dependencies only:

```powershell
node --experimental-strip-types tools/d3-24-composition/postcommit-review.mjs --review-materialized 'C:\Users\Christián\Documents\Codex\B24composition-21f5'
node --experimental-strip-types --test --test-concurrency=1 tools/d3-24-composition/composition.test.mjs tools/d3-24-composition/postcommit.test.mjs
```

Test paths may be supplied through D324_TEST_DRAFT_ROOT,
D324_TEST_MATERIALIZED_ROOT and D324_TEST_MUTATION_ROOT. They select fixture paths
only; production verifier pins are not configurable and are always independently
checked. Defaults refer to the local isolated worktrees documented in the review.
No environment flag enables a verifier, key substitution or operational gate.

## Publication graph and future V3 binding

Expected remote integration HEAD864dd0c537fa6f0c6ff0eb9733323cc049278e20 was not
queried here. No fetch, push or remote change was performed.

Existing local integration ancestry, oldest to newest:

```text
864dd0c -> ae50b48 -> da23038 -> 436061d -> a6205c4
        -> 725d252 -> 21f5e3e -> a329c8d
```

There are7 local commits above the expected remote. A future authorized publication
must re-read remote HEAD, review all7 and fast-forward only if ancestry permits.
Do not silently rebase or merge if it has advanced. No main merge or tag move.

Independent operator ancestry is c6ba2e837 -> c50e4eb1 -> 4735b83a -> d85e54e0.
Its local reference is `review/d3-24-operator-security-repair`. Publish that
dependency under a separately approved remote reference, preserving SHA and
keeping it out of the server's ancestry. Capture496f8914 remains a sibling of
server21f5e3e with exact copied bytes; publish its separate provenance reference
`review/d3-24-capture-profile` if authorized. Do not falsely present it as a parent
of a329. No dependency ref was published here.

This verifier patch needs a later separately authorized commit; its SHA is still
unknown. The exact target a329 and the future verifier-tooling commit are distinct
identities. Publication of a329 alone does not publish these uncommitted files.

MANIFEST_V3_DEPENDENCIES=NOT_GENERATED_NOT_APPROVED. A future signed V3 must bind
its exact target SHA/parent/tree, operator, plan, budget, capture profile, artifact
hashes, approved runtime/helper closure, K5 and session-control. The current closed
V3 schema has no separate verifier-tooling commit field. Binding this independent
tooling requires a separately reviewed external ratification record/approved
bootstrap closure or an explicitly versioned schema decision; no field is added
silently here. The tool's candidate SHA cannot ratify itself.

If the owner instead chooses to incorporate this patch into a NEW operational
composition, the literal a329 review profile intentionally rejects that new HEAD.
That requires a separate post-materialization profile/externally approved identity
decision, not replacing a329 with HEAD or embedding a commit's own future SHA.
The original V3 capture verifier's fixed-owner signature remains mandatory.

Original PowerShell/Node LIVE entries remain closed and do not import this new
review-only CLI. No operational controller, manifest, K5, grant, nonce, envelope,
admission, credentials or real sessions were created.

## Scope and decision

CHANGED_FILES=4: one modified test file and three new files, including this report.
PROPOSED_FIX=SEPARATE_PINNED_POSTCOMMIT_REVIEW_WITH_EXPLICIT_TEST_CONTEXTS.
OPERATOR_SHA_VERIFIED=d85e54e00e98c8d8bc6294c883708a701ce55440.
PLAN_HASH_VERIFIED=0435d8436d13881ebbdf31e729cf36a80e538bc149300219353f68817b37d72d.
HISTORICAL_CONFIRMED=5;ORDINARY_LIMIT=19;RUN1_MAX=5;TX20_AUTHORIZED=NO.
HIGH_BLOCKERS=0 demonstrated failures of the scoped read-only verifier candidate;
operational/external-ratification conditions remain closed and pending.
READY_FOR_VERIFIER_PATCH_COMMIT_REVIEW=YES_LOCAL_REVIEW_ONLY.
OWNER_ACTION_REQUIRED=Review the four-file diff and separate tooling/target graph;
authorize any future commit/publication or operational binding independently.

No new commit, push, remote SQL/Auth change, real key use, real approval, PRE-LIVE,
real admission, LIVE, Stellar transaction, RUN2/RUN3 or contingency permission.
STOP.

## Final materialization review — test fixture continuity

The owner subsequently authorized one local verifier commit, with no publication
or activation. Final review found that one of the additional20 tests depended on
the verifier tool itself remaining dirty at HEADa329. Committing the tool would
change its HEAD and cause an incorrect error-code assertion despite a valid
rejection. Only that test fixture was adjusted within the four-file scope: the
dirty condition is now created as one exclusive temporary untracked file in the
disposable target checkout, whose HEAD remains pinned to a329. The file is removed
in finally. Its exact D324_MATERIALIZED_CHECKOUT_REJECTED assertion is unchanged;
the draft still requires D324_MATERIALIZED_SHA_REJECTED. No test was removed,
no error regex widened and no production verifier/pin/gate changed.

This separates the already materialized composition from the later verifier-tool
commit and makes the same20 cases valid before and after that commit. The earlier
candidate review above remains historical; final results and the actual tool
commit SHA are recorded separately outside the immutable commit content.
