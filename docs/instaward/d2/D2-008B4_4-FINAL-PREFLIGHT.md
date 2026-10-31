# D2-008B4.4-FINAL-PREFLIGHT — 2026-10-31

**BLOCKED — mandatory STOP at phase 6.** No stage, commit, push, deployment,
protection change, bypass token or shareable link. D2.6 is not accepted.
This is LOCAL EVIDENCE — SHA PENDING with fresh read-only Vercel observations.
[Sanitized JSON](D2-008B4_4-FINAL-PREFLIGHT.json).

## Sources and working tree

Branch and HEAD verified locally: `instaward/d2-web-mvp` /
`d406dad4d9edd7b9b46a0c8a8090d333554dbeb1`. Not on codex/visual-polish.
Status/stat, diff --check, last five commits and empty index checked. The known
fixture helper, prior approved B1/B2 SQL patches, tests/scripts and reports remain
the only pending work; no unexpected production-code change. No merge or tag work.

The owner now confirms from the dashboard: Production Branch codex/visual-polish;
Preview handles all unassigned branches; D2 is Preview; Root Directory frontend;
no Deploy Hooks; Production domain byetery.vercel.app. These are accepted as
**OWNER MANUAL CONFIRMATION**, not re-labelled as independent API fields. Historical
reports that recorded those settings UNKNOWN remain intact.

Authenticated MCP GETs were scoped to project prj_gVe1Sz73FRZ4bAQPubimaqOXQylH,
team_EuRw1k4ZykOoSP1fBTcumdnO. Normalized get_project still omits Root Directory,
outside-root inclusion and Production tracking. No unsupported write was used to
obtain those fields. Report assembled as of 2026-10-31 17:59:26 UTC; provider reads
precede this closure timestamp.

## Deployment Protection and D14

| Protection | Preview | Production | Status / source |
| --- | --- | --- | --- |
| Vercel Authentication | Enabled; Vercel login barrier | URL-scope dependent, not blanket OFF | MCP enabled=true, deploymentType=all_except_custom_domains |
| Password Protection | Disabled | Disabled | MCP enabled=false |
| Trusted IPs | Disabled | Disabled | MCP enabled=false; no IP addresses published |
| Other mechanisms / firewall | Not fully established | Not fully established | Active-firewall GET returned INVALID_ARGUMENT; no state inferred from this error |

The reported scope must not be summarized as all Production URLs unprotected.
Vercel distinguishes production domains from generated deployment URLs; with zero
deployments, there was no live URL-level access test. See the official
[Deployment Protection scopes](https://vercel.com/docs/deployment-protection).

D14 path B requires the Preview to open without a Vercel account, while Byetery
Auth remains required for protected application data. Current Vercel Authentication
blocks that goal. Removing its requirement for Preview is therefore a necessary
future change; no change is authorized or executed here. A project-level disable
can also affect protected Production deployment URLs, so the exact scope and impact
must be reviewed before owner authorization. Do not promise a Preview-only toggle
or silently weaken protection of other URLs. No bypass/password/share link is used
as a substitute. [Official Vercel Authentication behavior](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication).

## Environment inventory — decrypt=false

Only key/target/branch/type and comment-presence metadata were retained. No value
or substring is present in this report/JSON. No env pull or per-variable decrypted
GET. Returned project inventory:

| Key | Target | Branch | Classification | Type | Comment |
| --- | --- | --- | --- | --- | --- |
| BYETERY_REVIEW_ADAPTER | Preview | instaward/d2-web-mvp | Allowed review adapter; branch-specific | plain | Present; content omitted to avoid value disclosure |

General Preview: 0 returned. Other-branch variables: 0 returned. Production: 0
returned, hiddenProductionEnvCount=0. Development: 0 returned. Provider-managed or
unreturned inherited configuration is not silently treated as audited.

Sensitive names found: **NO** in the returned inventory. Value scan: **NO MATCH**.
The scan ran in memory only over current effective D2 Preview plaintext values
already returned with decrypt=false. No decryption was requested. There were no
seed-pattern candidates requiring checksum validation. No opaque/encrypted value
was interpreted as plaintext or counted as scanned. Future variable additions
invalidate this limited inventory/scan and require a new preflight.

Clean names do not imply functional completeness. Comparing the returned inventory
with unchanged config.ts / runtime.ts / database.ts identifies nine required custom
names not returned: BYETERY_WEB_ENV, BYETERY_SOURCE, BYETERY_DEPLOYMENT_ID,
BYETERY_WEB_ORIGIN, BYETERY_ALLOWED_WEB_ORIGINS, SUPABASE_URL,
SUPABASE_PUBLISHABLE_KEY, BYETERY_REVIEW_DATABASE_URL and DATABASE_SSL_CA.
Platform-injected VERCEL_* names are distinct. No real local .env was read as a
substitute for deployed configuration. On these project variables alone, review
runtime fails closed; this is not yet a configured functional Hosted Preview.
No value, restricted credential, origin or certificate was provisioned here.

## Root Directory isolation — BLOCKING

Root Directory: **frontend — OWNER MANUAL CONFIRMED**.
Include files outside Root Directory: **UNKNOWN**.
sourceFilesOutsideRootDirectory: **NOT RETURNED** by the connected MCP projection.
No local Next configuration or successful build proves the remote inclusion flag.

Browser fallback initialization failed before any UI action:
`failed to write kernel assets: ... (os error 3)`.
Both browser-control and native-reader initialization returned the same Windows
failure. No helper installation, system change, login automation, setting edit,
credential inspection or UI input was attempted to compensate.

The owner explicitly requires CONFIRMED_OFF. UNKNOWN triggers **STOP at phase 6**.
Do not infer a default, claim READY, or advance to publication/deployment planning.

## Routing and deployment baseline already gathered read-only

Production codex/visual-polish and D2 Preview routing are **confirmed by owner**;
the API did not independently expose tracking. No contradictory value returned.
Formal later-step routing execution was not resumed after the isolation STOP.

An earlier scoped list_deployments GET in this read-only preflight returned an
exhaustive count of **0** with no next page: total 0, Preview 0, Production 0.
get_project latestDeployment is null. No deployment was created or queried through
a live application URL. These are baseline observations, not a Preview PASS.

## Local checkpoint and integrity

Prior full CLOSEOUT run: backend **343/343**, frontend **321/321**, zero fail/skip,
TypeScript and isolated dummy Next build PASS. Security categories and all four
Stellar offline cases passed there. No full suite or build was rerun in this
configuration-only task. Instead, every retained raw-evidence SHA-256 and every
previous candidate source hash was revalidated; all **554** current input files
are unchanged. This includes the previous 552-file baseline plus its two reports.

WASM: `c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6` — MATCH.
Frontend lock: `633c0f5f1ae347d34aa0a2e45d43224b29e24ff8ffe1252d086b28cc2cdb8679` — MATCH.
SQL, existing tests, runtime source, protected files and all Git refs unchanged.
Local before-report working-diff SHA-256:
`44018d947e19ebde3e22cd214cf7456f7d5efac162e783eb73200f04665fb629`.
This covers tracked diff only and is **not** a final candidate-tree fingerprint.
The ignored input hash manifest is retained under .tools/d2-b44-final-preflight/.

## Candidate / later checklists deferred

The preceding CLOSEOUT inventory has 54 candidate paths and seven exclusions:
protected KEY-CUSTODY-AUDIT.md / sync_obsidian.py, plus five historical B3 helpers.
These two new STOP reports would bring a provisional documentation-inclusive count
to **56**. No final candidate was frozen or staged. Exclude .tools, .next, env files,
databases, raw logs/dumps, dependencies, credentials and build outputs.

Phases 7–12 are not advanced after mandatory phase-6 STOP. Final candidate list,
candidate-tree fingerprint, exact future protection-change scope, publication
sequence and post-push checklists remain **DEFERRED**, not PASS. The owner's listed
abort conditions remain requirements for a later separately authorized step. No
git.deploymentEnabled rule, vercel.json or deployment command was introduced.

## Final gate / STOP

**BLOCKED.** Required next evidence is the actual outside-root setting confirmed
OFF. D14's current Vercel-login barrier also needs an explicitly authorized scoped
resolution, and the required review runtime configuration must be prepared and
rescanned before a single useful Hosted Preview can be authorized.

No Supabase access/mutation, Stellar access/signature/transaction/broadcast,
Vercel mutation, Protection change, deployment, stage, commit, push, merge, main or
tag change. Only these two new sanitized local reports. Final diff/secret audit
results are in the JSON companion. No Notion update.

D1 **12/12**; D2 **5/6**; D3 **0/5**; total **17/23**.
B4.4 **NO PASS**; D2.6 **BLOCKED/PENDING**. STOP.
