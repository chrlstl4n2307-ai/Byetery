# D2 evidence index

OFFICIAL INSTAWARD SPRINT / FUNDED SPRINT · started 2026-10-22 by explicit owner authorization.

Branch: `instaward/d2-web-mvp`. Start: `3c7d373ec893a2e66101c4bcfbee354b3a53e434`. Frozen pre-sprint comparison: `450c21b`; D2-only changes also compared with the start. D1 branch and historical evidence are preserved.

| Task | Artifact | Technical result | Limits / publication |
| --- | --- | --- | --- |
| D2-001 | [Implementation and tests](D2-001-REPORT.md) | IMPLEMENTED / TESTED locally | Commit `6e5ee6adbf573cb2d792242bd275644b2be2ed36` was published via checkpoint f9d9fc2; deployed authenticated read remains deferred |
| D2-001 | [Existing SQL read-model observation](D2-001-READ-MODEL.json) | TESTNET / RECYCLED / SENT in read-only SQL | Projection, not a new chain read or transaction; not a browser/Auth end-to-end proof |
| D2-002 | [Three separate state lanes and tests](D2-002-REPORT.md) | IMPLEMENTED / TESTED locally; 102/102 frontend tests | Commit `41fbd44473edf36ac04c9c8629393198baf87fb4` was published via checkpoint f9d9fc2; no inferred receipt or success from pending/unknown |
| D2-003 | [Timeline implementation and verification](D2-003-TIMELINE.md), [sanitized receipts](D2-003-TIMELINE.json) | IMPLEMENTED / TESTED / EVIDENCE READY | Historical D1 fixture, five independent SUCCESS reads; frontend 123/123, backend 174/174; no new Stellar transaction or D2 acceptance |
| D2-004 | [Role/permission matrix, historical findings and GAP1 fix](D2-004-PERMISSION-MATRIX.md), [historical sanitized SQL/chain reads](D2-004-ROLE-READS.json) | PARTIAL — GAP 1 FIXED / GAP 2 PENDING | Exact USER gate; focused 52/52, complete backend 184/184, frontend 123/123, Rust/WASM and Python PASS. Original 177-test blocked checkpoint retained historically; no D2.1 acceptance or GAP2 work |
| Preview | [Architecture/readiness assessment](D2-VERCEL-READINESS.md) | DEFERRED — D2.6 INFRASTRUCTURE | Prior access blocker retained as research; no deployment attempted |
| D2-VERCEL-001 | [Read-only API architecture gate](D2-VERCEL-READONLY.md) | DEFERRED — D2.6 INFRASTRUCTURE | Preserved architectural research; no reader role, grants/RLS migration, Auth experiment or Preview credentials resumed |

No criterion automatically becomes PASS. By explicit [OWNER ACCEPTANCE — 2026-10-22](D2-OWNER-ACCEPTANCE.md), **D2.4 — History = PASS — OWNER ACCEPTED**. Current owner acceptance: **D1 12/12; D2 1/6; D3 0/5; total 13/23**. D2.1/D2.2/D2.3/D2.5/D2.6 are not accepted. No organizer approval/payment asserted. A local test PASS is not owner acceptance or proof of a hosted integration.

Secret material, local environment files, custody audit, signing payloads and `tools/sync_obsidian.py` do not belong in this evidence package. No new lifecycle, reward, signature or broadcast is evidence for this task.

Owner priority change (2026-10-22): core D2 resumed for D2-003 only. Data-access/Auth/Preview investigation is deferred to D2.6. Historical research remains available; it does not authorize infrastructure changes.

Subsequent owner decision (2026-10-22): D2.4 accepted and D2-004 read/verify authorized. D2-004 stopped on the documented fail-closed gaps. D2-005 has not started; no permission fix, role change or new Testnet transaction was performed.

Latest owner decision after Council review: GAP1 fix only, policy B (continuous until broadcast), D1 DO NOT REOPEN. Application-request USER checks are implemented; GAP2 transport/signing enforcement remains pending. No new real transaction/signature/broadcast, remote Supabase change, Vercel work or D2-005 was authorized/performed for this fix.
