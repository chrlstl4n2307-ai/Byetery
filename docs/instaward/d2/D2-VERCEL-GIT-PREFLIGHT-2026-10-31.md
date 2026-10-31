# D2 Vercel Git preflight — 2026-10-31

## Recommendation

**BLOCKED_INSUFFICIENT_EVIDENCE. AUTO-DEPLOY CLASSIFICATION D.** Production tracking and effective Root Directory remain UNKNOWN in the authenticated evidence available to this task. No push is safe to authorize under a strict zero-deployment condition from these observations alone. No rule/configuration file was created. No commit, push, deployment or Vercel mutation.

The earlier report's three-way classification C meant insufficient evidence. This task uses the owner's new four-way taxonomy: **D means insufficient evidence; C means the push can generate Production.** The changed letter is not new infrastructure evidence.

## Project — confirmed

| Field | Observation / source |
| --- | --- |
| Name | byetery |
| Project ID | prj_gVe1Sz73FRZ4bAQPubimaqOXQylH |
| Team/org | team_EuRw1k4ZykOoSP1fBTcumdnO / chrlstl4n2307-ais-projects |
| Git link | github / chrlstl4n2307-ai / Byetery, authenticated get_git_deployment_context |
| Exact local branch | instaward/d2-web-mvp |
| Local/last verified remote checkpoint | d406dad4d9edd7b9b46a0c8a8090d333554dbeb1 |
| Framework / Node | nextjs / 24.x, authenticated exact-project GET |
| Live / latestDeployment | false / null |
| Deployments | 0, exact-project list without state/environment filtering |
| Protection | Vercel Authentication enabled, all_except_custom_domains; project updatedAt unchanged |

## Local preflight — no application or Git changes

Executed git status, branch --show-current, remote -v, log -3 and diff --check. Remote is the expected Byetery GitHub repository. Existing dirty SQL, fixture-helper, documentation and untracked reports/helpers remain preserved; none was staged, reverted or committed. Protected custody/sync files remain untouched/untracked.

There is no root/frontend .vercel/project.json or .vercel/repo.json. Therefore **no local CLI projectId/orgId link** is claimed; the IDs above come from authenticated MCP, not a fabricated link file. No vercel.json, vercel.ts or now.json was found, including under frontend. There is no tracked GitHub Actions workflow.

The monorepo contains backend, contracts, database, docs, frontend, scripts and tools. Root package.json delegates frontend tasks and has no build/workspaces definition. frontend/package.json defines Next.js and next build. frontend/next.config.ts configures the app's routes/build behavior but does not prove its remote Vercel Root Directory or Production branch. **frontend is an inferred local application directory only.** No .env or CLI credential file was manually inspected, no token extracted, and no deployment-hook URL requested or invoked. The official CLI retains responsibility for its normal internal authentication reads.

## Production — UNKNOWN

**Production branch: UNKNOWN. Is instaward/d2-web-mvp Production? UNKNOWN. Confidence: insufficient evidence.**

The normalized authenticated get_project response does not include Git productionBranch. Git context proves the repository link but also omits tracking. Additional read schemas were examined: project trace requires an existing trace/request identifier and is not a general configuration GET; custom-environment listing exposes no Production tracking. No unsupported parameter or write action was used to manufacture a fuller response.

git ls-remote --symref origin HEAD independently reports repository default **codex/visual-polish**, at **0a572af29b6d4df6c16feb0329ecc225948824f6**. This is confirmed Git metadata, **not Vercel's configured Production branch**: project tracking can be customized. Likewise, the prior manually initiated wrong-target Production deployment is not evidence that this branch is configured as Production.

One exact authenticated CLI API GET was attempted after verifying the installed CLI path and supported process-only update-check option. Node's compilation cache was disabled for that process to avoid repeating the previous short startup timeouts. The request was bounded to 180 seconds and used an explicit project/team, GET, noninteractive mode and no token argument. It still ended **TIMEOUT_BEFORE_VERIFIABLE_RESULT**. Raw stdout/stderr was held in memory, not published or persisted; this is not a fresh credential-validity determination. No login, new credential or global configuration change was attempted.

The owner was asked to read only Production Branch Tracking and Root Directory from the existing dashboard without changing them. No owner-provided values were available when this report was prepared; any later reply requires a separately identified evidence update, not an invented current value.

## Root Directory — UNKNOWN effective / INFERRED local

- Effective remote value: **UNKNOWN**; confidence **UNKNOWN**.
- Local candidate: **frontend**; confidence **INFERRED**, from the existing standalone Next app.
- Historical bootstrap requested frontend, but the current normalized project GET does not independently expose it.
- Build command, install command and output-directory overrides: **UNKNOWN**. Local next build and framework defaults are not substituted for actual platform overrides.

## Git deployment and Preview settings

| Setting | What can be established |
| --- | --- |
| Git integration | CONFIRMED exact repository |
| Production branch / event target | UNKNOWN |
| Effective git.deploymentEnabled | UNKNOWN; absent from versioned source, no authoritative remote override read |
| Branch-specific deployment/auto-deploy rules | UNKNOWN |
| Ignored Build Step / skip-build controls | UNKNOWN |
| Custom environments for this branch | None returned; account total 0. This does not determine Production tracking |
| Preview variables | One nonsecret BYETERY_REVIEW_ADAPTER=DIRECT_REVIEW, type plain, Preview/exact D2 branch scoped; decrypt=false |
| Hidden Production variable metadata count | 0 in the inspected response; not evidence that this branch cannot be Production |
| Deployment hooks | UNKNOWN. No hook URL requested, printed, stored or called |

**Expected effect of git push origin instaward/d2-web-mvp: UNKNOWN — classification D.** The general defaults below cannot resolve missing project settings. Neither Preview-only variable scope, no existing deployments, absent workflows nor a docs-only commit proves that no deployment will be created. Production cannot be excluded while tracking is UNKNOWN; this is uncertainty, not a CONFIRMED_YES assertion.

## Official documentation consulted — 2026-10-31

| Title / source | Applicable conclusion |
| --- | --- |
| [Deploying Git Repositories with Vercel](https://vercel.com/docs/git) | Standard Git integration creates deployments on pushes. The configured production branch routes to Production; other branches normally route to Preview or a configured custom environment. The project's actual tracking must be read |
| [Git Configuration](https://vercel.com/docs/project-configuration/git-configuration) | git.deploymentEnabled supports a Boolean or per-branch map; unspecified branches default enabled. A matching true rule can override the intent of a matching false rule |
| [Static Configuration with vercel.json](https://vercel.com/docs/project-configuration/vercel-json) | Configuration belongs in the Vercel project's root |
| [Configuring a Build](https://vercel.com/docs/builds/configure-a-build) | Remote Root Directory selects the application inside a monorepo. Build/install/output overrides must not be guessed from source layout |
| [Using Monorepos](https://vercel.com/docs/monorepos) | Each app has its project root. Automatic unaffected-project skipping has workspace requirements; this repository's lack of workspace definition is not a zero-deployment proof |
| [Project settings — Ignored Build Step](https://vercel.com/docs/project-configuration/project-settings#ignored-build-step) | A skipped build can leave a CANCELED deployment; not a valid mechanism for the required zero-deployment invariant |
| [Can you deploy based on tags/releases on Vercel?](https://vercel.com/kb/guide/can-you-deploy-based-on-tags-releases-on-vercel) | Officially recommends disabling Git auto-deploy via versioned configuration. It does not explicitly specify the first-introducing-commit decision timing needed for a strict no-record guarantee |
| [Find a project by id or name — GET API schema](https://vercel.com/docs/rest-api/projects/find-a-project-by-id-or-name) | Full API supports link.productionBranch/rootDirectory/command overrides; the connected normalized MCP projection does not return them |

Only official documentation supplies protocol/platform conclusions. Community questions without an authoritative answer are not proof. No source inspected explicitly established a zero-deployment-record guarantee for the first commit adding a branch rule to this project's unknown effective configuration.

## Proposed git.deploymentEnabled rule — analysis only

Supported official shape, scoped to the exact requested branch:

```json
{
  "git": {
    "deploymentEnabled": {
      "instaward/d2-web-mvp": false
    }
  }
}
```

This example exists **only inside this report**. It is not a new configuration file and is not committed/pushed. With no conflicting matching true rule, its intended scope is that exact branch; other branch names retain their normal settings. No Git disconnection is required by the documented mechanism.

Required location is conditional: **frontend/vercel.json if Root Directory=frontend**, repository-root vercel.json if Root Directory is the repository root, or the corresponding actual project-root path otherwise. Until the remote root is confirmed, no single location is safe to prescribe as effective. Do not add copies at multiple roots as an experiment.

**Applies to the same introducing commit: UNKNOWN under the requested strict guarantee.** The docs explain preventing Git-triggered deployments from versioned rules, but the inspected material does not explicitly settle configuration lookup/creation timing for the first introducing commit or promise zero initial records. It is reasonable to expect configuration to be evaluated for a candidate revision; that inference is not accepted as authorization to push here. There is neither evidence that a bootstrap deployment is required nor evidence certifying that no first deployment can appear. No test push was used to decide.

Before future B4.4, retirement would remove only this branch entry (or the otherwise-empty added config after reviewing any other settings), in a separately authorized change. **A push removing suppression may itself create a deployment.** Do not retire it automatically or assume the resulting target is Preview; first confirm Production tracking, an explicitly approved B4.4 target and the supported deployment path. Manual/deploy-hook behavior is not certified by this Git-rule research.

For any later authorized push, first record project/team/branch/source SHA/time and zero-deployment baseline. Immediately read all project deployments, without excluding Production/Preview or pending/canceled/error states, and independently read latestDeployment/live. Inspect the pushed SHA and pagination, not only READY results. A single empty instantaneous response cannot prove an asynchronous Git event will never create a record. If any unexpected record appears, STOP and report its ID, target and state; no promotion/replacement or cleanup mutation is pre-authorized by that check. No such push/check sequence was executed in this task.

## Risk assessment and recommendation

- **Push now:** cannot exclude Preview or Production; not safe under the owner's zero-deployment boundary.
- **Introducing a versioned block rule:** valid syntax is known, but effective placement, actual Production tracking and strict first-commit behavior remain unresolved. Do not implement or push it yet.
- **Future B4.4:** removing a rule or deploying through another path needs its own reviewed Preview authorization. This investigation is not hosted-readiness evidence.

**Recommendation: BLOCKED_INSUFFICIENT_EVIDENCE.** Required next evidence is an authoritative full project-settings read showing Production tracking, effective Root Directory and deployment/skip/hook rules, followed by resolution of the strict first-commit guarantee if a rule is proposed. Owner-visible dashboard readings can be recorded with explicit source/confidence; they must not be relabelled as an independent API read. Any actual config/authentication/publication change needs explicit owner authorization first.

## Final boundary

Only this report/JSON and ignored local read-evidence files are created. Existing project files, fixture resolution, SQL, tests, protected files, main and tags remain unchanged. No tests were rerun for this read-only investigation; the separately validated 343/343 result remains prior evidence. No Supabase/Stellar/Notion access or mutation, deployment hook, Vercel settings change, vercel.json creation, Git disconnection, temporary branch, commit, push, merge or tag change. D1 12/12; D2 5/6; D3 0/5; TOTAL 17/23; B4.4 NO PASS; D2.6 BLOCKED/PENDING. **STOP.**
