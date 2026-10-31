# D2 publication unblock preflight — 2026-10-31

## Result: STOP — new local fixture compatibility blocker; Vercel classification C

Branch: `instaward/d2-web-mvp`. Starting and final local/remote HEAD: `d406dad4d9edd7b9b46a0c8a8090d333554dbeb1`. No commit or push. No B4.4 continuation, hosted Preview, infrastructure change or acceptance change.

Current internal owner acceptance remains **D1 12/12 PASS; D2 5/6 PASS; D3 0/5; TOTAL 17/23**. B4.4 **STOPPED / NOT PASS**; D2.6 **BLOCKED / PENDING**. No organizer approval/payment is asserted.

## Phase A — original ENOENT explained and removed during validation

The expected `.tools/d2-gap2b/postgres-test.json` is deliberately generated local configuration, not a missing versioned source. The entire .tools directory is ignored. The archived `postgres-test.last-run.json` already exists and contains exactly host, port, user and database; no password/key/token fields. Its values identify only the disposable loopback fixture: 127.0.0.1:49197, operator byetery_gap2b, database postgres. No production or Supabase credential is used.

The established procedure is documented in [D2-004](D2-004-PERMISSION-MATRIX.md) (also present in commit 1410602) and [B1](D2-008B1-REGISTRATION-INTENTS.md): start the existing portable PostgreSQL cluster, copy its last-run configuration to the active filename, run the tests, then stop/clean the fixture. There is no package.json bootstrap command. The already-existing ignored launcher `.tools/d2-008b2/start-postgres.mjs` performs exactly that procedure, including a directory guard. It was inspected and used without edits; no JSON was invented manually, no dependency downloaded, no Windows service/global configuration changed.

The launcher completed **LOCAL_POSTGRES_STARTED**. All original ENOENT failures disappeared. Complete backend verify (TypeScript and all tests) finished with:

| Result | Count |
| --- | --- |
| Tests | 343 |
| PASS | 312 |
| FAIL | 31 |
| SKIP | 0 |
| ENOENT occurrences | 0 |
| P0001 / ReviewRequiresNonSuperuserPostgresEmptySelfGrant failures | 31 |

The two real PostgreSQL serialization cases now pass rather than skip. Tests used their existing local disposable databases and in-memory/mock transports; no remote suite, live Stellar transport or operational signer ran.

## New blocker — fixture/SQL execution-profile mismatch

Every remaining B1 failure occurs at reviewFixture's application of the current B1 SQL. The first DO block explicitly requires current_user=session_user=postgres, NOSUPERUSER and empty createrole_self_grant. Failure raises **P0001: ReviewRequiresNonSuperuserPostgresEmptySelfGrant**.

A bounded SELECT against only the restored local fixture independently established current_user=session_user=**byetery_gap2b**, rolsuper=**true**, createrole_self_grant empty, PostgreSQL **17.11**. The existing legacy test fixture therefore cannot satisfy the newer approved SQL guard. This is a demonstrated setup/SQL compatibility failure before B1 business assertions, not evidence that recycling/rewards regressed. It is no longer an ENOENT diagnosis.

The B1/B2 SQL changes predate this task and remain byte-identical to its starting baseline. Neither their guard nor the tests, assertions, roles or privileges were altered to obtain green results. Existing [B3.2 evidence](D2-008B3_2-ADOPTION-ACL-EXCEPTION.md), local 17.6 bootstrap and test-only connection adapter were identified as the previously validated non-superuser execution profile; **they were not rerun or substituted after the new failure**. A reviewed alignment of the ordinary suite with that profile remains a separate resolution, not an implicit waiver of the guard.

In accordance with the owner's STOP condition, no further corrective setup or implementation was attempted. The existing `.tools/d2-008b2/close-postgres.mjs` verified **0 remaining fixture databases**, stopped only the task-started cluster and removed the active generated config. The archived last-run configuration is retained. Removing a stopped fixture's active config is the documented cleanup, not a reversal or concealment of the successful restoration test. Both configuration files remain ignored and outside Git.

## Phase B — exact observed Vercel boundary

| Item | Evidence / uncertainty |
| --- | --- |
| Project | byetery / prj_gVe1Sz73FRZ4bAQPubimaqOXQylH |
| Team | team_EuRw1k4ZykOoSP1fBTcumdnO |
| Git integration | Authenticated MCP context explicitly reports github, org chrlstl4n2307-ai, repo Byetery |
| Project presence | Exact scoped project GET and project search confirm the same project |
| Production branch | **UNKNOWN** — not exposed by normalized MCP reads |
| Ignored build command | **UNKNOWN** — not exposed by normalized MCP reads |
| Effective per-branch deployment rules | **UNKNOWN** remotely; no local/versioned vercel.json/vercel.ts found |
| Deployment hooks | **UNKNOWN** — no authoritative hook inventory available; no hook URL requested, printed or invoked |
| Repository automation | No tracked .github workflow or Vercel config; root package.json has no workspace definition. This is not proof of disabled provider-side deployment |
| Current deployment count | **0**, independently reread after investigation |
| Latest deployment / live | null / false |
| Protection | Vercel Authentication enabled, all_except_custom_domains, same project updatedAt as before |

The MCP's normalized project response omits the decision-critical fields. Browser initialization failed with Windows os error 3 (failed to write kernel assets), before any UI action. The existing CLI's explicitly scoped, noninteractive project-read attempt timed out; raw output was withheld and no authentication flow/token was created. Historical B4.4 evidence says its earlier CLI credential was invalid; this task does not relabel a timeout as a fresh token-validity determination. CLI help also encountered a registry metadata DNS failure; no installation/update was attempted.

**Classification C — insufficient certainty to determine this branch's effective deployment behavior.** The Git link is proven. A disabled rule, Production branch, ignored-build behavior and relevant hooks are not. Default behavior in official docs cannot establish this project's overrides. No test push or deployment was made to fill the gap.

## Phase C — official mechanisms reviewed, not applied

[Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration) documents per-branch git.deploymentEnabled=false and defaults unspecified branches to true. This is a possible future scoped suppression only after the effective root/configuration and Production branch are read and owner approval is obtained. No config file or project setting was created/changed here; no claim that Production would be unaffected can be made while its tracked branch is unknown.

[Ignored Build Step documentation](https://vercel.com/docs/project-configuration/project-settings#ignored-build-step) says a skipped build can leave a **CANCELED deployment**. It therefore does not establish the required **0 deployments** invariant and is not adopted as a safe workaround. Automatic unaffected-project skipping and commit-message markers were not assumed to suppress creation. Temporary Git disconnection/reconnection was not attempted or assumed to preserve all behavior without further verification.

Classification C requires STOP. No infrastructure-change approval request is made for an incompletely characterized project. First obtain an authoritative read of Production tracking, ignore/branch settings and hook metadata; any later change needs an exact scope, rollback plan, cross-branch/Production impact and the owner's explicit consent.

## Documentation, Notion and final safety

The new guard/profile mismatch is a material technical blocker, so the owner's Notion exception applies. Append a factual follow-up to the existing changelog and D2.6 page; retain all prior history and Status BLOCKED. No duplicate task or acceptance decision.

All **530 pre-existing tracked/untracked files** matched the task-start hash baseline before reporting, including both SQL files and protected custody/sync files. This task adds only this report/JSON and an evidence-index pointer. Root verification was not rerun after backend failure; earlier Rust/WASM/fmt/Clippy, Python/demo results remain explicitly earlier evidence, not new full-suite PASS. No commit is allowed while the required suite is red; no push is allowed under classification C. The Git index remains empty, main/tags and remote D2 HEAD unchanged.

Final secret-pattern audit **PASS: 600 files / 700 historical blobs / 0 staged / 0 findings**. Final git diff --check and JSON/link/privacy/whitespace checks PASS. Notion read-back confirms exactly one new blocker section per existing page, preserved historical body/properties and D2.6 BLOCKED. No credentials are printed or committed. **Supabase reads/mutations 0; Stellar operations/operational signatures/broadcasts 0; Vercel mutations/deployments 0; Production changes 0; functional remote records 0; main merge NO; tag changes NO.** Vercel metadata reads and local disposable test fixtures are distinguished from those prohibited actions. STOP.
