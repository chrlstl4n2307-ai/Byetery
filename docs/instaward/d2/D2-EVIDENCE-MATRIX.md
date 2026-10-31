# D2 evidence matrix — B4.4 PREP

Date: 2026-10-31. Branch: `instaward/d2-web-mvp`. Base HEAD:
`d406dad4d9edd7b9b46a0c8a8090d333554dbeb1`. This is a local evidence inventory,
not a new acceptance decision. Current authority remains
[D2-OWNER-ACCEPTANCE.json](D2-OWNER-ACCEPTANCE.json).

| Criterion | Description | Current Status | Evidence Level | Evidence Source | Commit SHA | Local/Remote/Hosted | PROVEN / NOT PROVEN | Remaining Gap |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| D2.1 | Roles / permissions | PASS — OWNER ACCEPTED | IMPLEMENTED, LOCAL_TEST, OWNER_ACCEPTANCE | D2-005-ROLE-QR-ADVERSARIAL.md; D2-OWNER-ACCEPTANCE.md | `c774360e7c7f4b849945f9361cc277a3e93f7034` reviewed owner checkpoint | Local tests; historical owner decision | PROVEN within accepted scope | Current hosted four-role access remains D2.6 work |
| D2.2 | QR lookup; QR grants no authority | PASS — OWNER ACCEPTED | IMPLEMENTED, LOCAL_TEST, OWNER_ACCEPTANCE | D2-005-ROLE-QR-ADVERSARIAL.md; D2-OWNER-ACCEPTANCE.md | `c774360e7c7f4b849945f9361cc277a3e93f7034` reviewed owner checkpoint | Local tests; historical owner decision | PROVEN within accepted scope | Hosted lookup/denial demonstration remains separate |
| D2.3 | Independent state lanes | PASS — OWNER ACCEPTED | IMPLEMENTED, LOCAL_TEST, TESTNET, OWNER_ACCEPTANCE | D2-007-STATE-LANES.md and RESULTS.json; D2-OWNER-ACCEPTANCE.md | `70e290728b3a60b4506cecd1285749068d296f74` reviewed implementation | Local negative/intermediate fixtures; separate historical Testnet evidence | PROVEN within accepted scope | No new hosted claim from this PREP |
| D2.4 | Confirmed history | PASS — OWNER ACCEPTED | IMPLEMENTED, LOCAL_TEST, TESTNET, OWNER_ACCEPTANCE | D2-003-TIMELINE.md/json; owner record | `56786b5299728aaa6d28af65b1b217cca536ca16` historical report | Historical real Testnet receipt verification; current tests offline | PROVEN historical evidence; NOT freshly verified online here | Present-day retention/state may differ; preserve uncertainty |
| D2.5 | Evidence V1 integrity | PASS — OWNER ACCEPTED | IMPLEMENTED, LOCAL_TEST, TESTNET, OWNER_ACCEPTANCE | D2-006-EVIDENCE-V1.md and RESULTS.json | `e6e5167e7b1ac4753d39897c8114d134ced3e8e3` implementation | Local exact-byte verification; separately recorded historical Testnet provenance | PROVEN integrity within accepted scope | No proof of physical recycling, truthfulness or certification |
| D2.6 | Review access | BLOCKED / PENDING | DESIGN, IMPLEMENTED, LOCAL_TEST, LOCAL_BUILD, REAL_AUTH, REAL_DB | B1/B2 design/code; B4 through B4.3R2 reports; PREP final report | B1/B2 in base HEAD; B4–B4.3: **LOCAL EVIDENCE — SHA PENDING**; PREP: **LOCAL EVIDENCE — SHA PENDING** | Local build/tests; historical real Auth/restricted DB reads; **no Hosted Preview** | **NOT PROVEN — HOSTED PREVIEW REQUIRED** | Reviewed publishable SHA, exact origin/configuration, approved Preview provisioning and hosted four-role runbook execution |

Evidence levels are claims about their specific sources, not a ladder that automatically
upgrades one result to another. REAL_AUTH / REAL_DB above describe prior authorized
executions recorded locally, not fresh network activity in PREP. LOCAL_BUILD uses dummy
configuration and cannot log into Supabase. No row claims HOSTED_PREVIEW.

B4.3R2 carries forward USER profile/battery results from B4.3; its USER history and
other three roles are fresh only as of that historical gate. Its public projection
used explicit UNVERIFIED metadata, not a fresh chain read. See
[four-role report](D2-008B4_3R2-FOUR-ROLE-AUTH-READ.md).

Current totals remain D1 **12/12**, D2 **5/6**, D3 **0/5**, total **17/23**.
B4.4 **NO PASS**. All acceptance is internal owner acceptance, with no claim of
Stellar/SDF/Instawards approval or payment. Historical decisions are unchanged.
