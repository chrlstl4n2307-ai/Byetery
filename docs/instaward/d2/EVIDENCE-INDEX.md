# D2 evidence index

OFFICIAL INSTAWARD SPRINT / FUNDED SPRINT · started 2026-10-22 by explicit owner authorization.

Branch: `instaward/d2-web-mvp`. Start: `3c7d373ec893a2e66101c4bcfbee354b3a53e434`. Frozen pre-sprint comparison: `450c21b`; D2-only changes also compared with the start. D1 branch and historical evidence are preserved.

| Task | Artifact | Technical result | Limits / publication |
| --- | --- | --- | --- |
| D2-001 | [Implementation and tests](D2-001-REPORT.md) | IMPLEMENTED / TESTED locally | Commit `6e5ee6adbf573cb2d792242bd275644b2be2ed36` is local; deployed authenticated read remains pending |
| D2-001 | [Existing SQL read-model observation](D2-001-READ-MODEL.json) | TESTNET / RECYCLED / SENT in read-only SQL | Projection, not a new chain read or transaction; not a browser/Auth end-to-end proof |
| D2-002 | [Three separate state lanes and tests](D2-002-REPORT.md) | IMPLEMENTED / TESTED locally; 102/102 frontend tests | Commit `41fbd44473edf36ac04c9c8629393198baf87fb4` is local; no inferred receipt or success from pending/unknown |
| Preview | [Architecture/readiness assessment](D2-VERCEL-READINESS.md) | BLOCKED | No reachable authenticated HTTPS API; no deployment attempted or URL invented |

No criterion automatically becomes PASS. Owner acceptance remains **D1 12/12; D2 0/6; D3 0/5; total 12/23**. No organizer approval/payment asserted. A local test PASS is not owner acceptance or proof of a hosted integration.

Secret material, local environment files, custody audit, signing payloads and `tools/sync_obsidian.py` do not belong in this evidence package. No new lifecycle, reward, signature or broadcast is evidence for this task.
