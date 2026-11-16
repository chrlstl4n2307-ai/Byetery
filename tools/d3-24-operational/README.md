# D3-24 V3 offline review

`SECURITY_STATUS = HOLD`. This checkout supports source review and synthetic tests. Hosted Auth, real signing, admission, PRE-LIVE, LIVE and transaction 20 remain closed.

## Review from the integrated checkout

Use Windows with Git, Node 24 and PowerShell 7.6.9. For the pinned wrapper checks use the exact Node and PowerShell binaries identified in [bootstrap-pins.mjs](bootstrap-pins.mjs). Run the following from the repository root in a test shell free of operational credentials and runtime overrides.

Install from a prepopulated npm cache for the backend lockfile. If the cache is incomplete, obtain an offline dependency bundle built from the same `backend/package-lock.json`, unpack it to `backend/node_modules` and use `npm --prefix backend ls --depth=0` to check the installed direct dependencies before running the tests.

~~~powershell
npm --prefix backend ci --offline --ignore-scripts
if ($LASTEXITCODE -ne 0) { throw 'Offline backend dependencies unavailable' }
~~~

~~~powershell
node --test tools/d3-24-operational/h2-review.test.mjs tools/d3-24-operational/h2-supervisor.test.mjs tools/d3-24-operational/run1-composition.test.mjs
if ($LASTEXITCODE -ne 0) { throw 'Integrated fixture tests failed' }

node --test --test-name-pattern 'manifest V3 review schema|integrated manifest pins|grant, execution and LIVE' tools/d3-24-operational/v3-bootstrap.test.mjs
if ($LASTEXITCODE -ne 0) { throw 'Integrated manifest tests failed' }
~~~

These commands use synthetic sessions, database fixtures and transport. Run them in a lab with outbound networking disabled when you need evidence of network isolation. The filtered bootstrap command covers the integrated manifest tests. The checkout-sensitive launcher check uses the separate worktree below.

## Verify the pinned bootstrap in its base checkout

The integrated `-V3Review` launcher checks that HEAD is the exact published base `f1b4309b1d14260a8302d828dab5dd2fcdf0aa8b`, with parent `3ee1e4e5b5d047ccac6782459aa405a37ead983b` and tree `bc72c4be281a034c20574a99242a22c99fde868e`. The files shipped by that base pin an earlier commit. To exercise the integrated check, put only the two reviewed launcher files in the separate base worktree while keeping its HEAD at the base. The two unstaged files are expected. This worktree is solely a test of the review mode.

~~~powershell
$reviewedCommit = git --no-replace-objects rev-parse --verify HEAD
if ($LASTEXITCODE -ne 0) { throw 'Reviewed commit unavailable' }
git worktree add --detach ../byetery-v3-review-base f1b4309b1d14260a8302d828dab5dd2fcdf0aa8b
if ($LASTEXITCODE -ne 0) { throw 'Review base checkout failed' }

Push-Location ../byetery-v3-review-base
try {
    git --no-replace-objects restore --source $reviewedCommit --worktree -- tools/d3-24-operational/launch.ps1 tools/d3-24-operational/entry-bootstrap.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Reviewed launcher files unavailable' }
    git status --short
    $launcher = (Resolve-Path -LiteralPath tools/d3-24-operational/launch.ps1).Path
    pwsh -NoProfile -NonInteractive -File $launcher -V3Review
    if ($LASTEXITCODE -ne 0) { throw 'Pinned bootstrap review failed' }
} finally {
    Pop-Location
}
~~~

The expected positive result is `D324_V3_BOOTSTRAP_REVIEW_PASS`. The PowerShell process needs permission to read its own process identity through Windows CIM. The same switch on the integrated commit returns `D324_OPERATIONAL_RATIFICATION_REQUIRED` with the pinned binaries. For historical capture and composition checks, use the historical trees and lab fixtures named in their test files. Their results attest to those profiles. [Capture tests](../d3-24-capture-profile/profile.test.mjs) · [Composition tests](../d3-24-composition/composition.test.mjs)

## Independent package verification

`-V3VerifyPackage` is a review mode for an externally approved V3 package and a clean, direct child of the published base. It is separate from the clone checks above. The fixed-owner signature and the manifest bind the target SHA, parent and tree, operator, plan, artifacts, binary pins, budget, K5 and session-control. The integrated profile also binds H2 and the signer descriptor. The signer custody field accepts `OPTION_A_REVIEW_ONLY`. Logs, native H2 attestations, the protected signer, custody files and owner approvals are external artifacts.

Default launch, direct Node LIVE and historical entry points return `D324_OPERATIONAL_RATIFICATION_REQUIRED` for this candidate. The operational server/worker binding, four real sessions, effective hosted privileges and signer/custody approval remain separate gates. Review the acceptance criteria and provenance of the historical and synthetic evidence in the [D3 review guide](../../docs/instaward/d3/D3-INTEGRATION-REVIEW.md).
