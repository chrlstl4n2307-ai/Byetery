# VOLUNTARY PRE-SPRINT DEVELOPMENT

Authorization/date: 2026-10-11, America/Santiago.

Branch: `pre-sprint/voluntary-d1`.
Frozen parent: `450c21b151a0973064986327f09d55e4f36c43e0`.
Frozen annotated tag: `pre-instaward-baseline-v1`.
Tag object: `de9c9c284427aa339cb775a56ee5c3a27cb324fe`.

This work is voluntary and precedes an official Instaward sprint. It must
never be represented or charged as funded delivery. Official start remains
UNCONFIRMED / NOT STARTED; acceptance remains D1 0/12, D2 0/6, D3 0/5,
total 0/23. The frozen commit, tag and contract sources remain unchanged.

## Authorized first package

- VOL-001: read-only Testnet archival/TTL assessment, including simulations.
- VOL-002: local build/tests and actual offline signing with the existing
  four approved Secure Store identities. No key export, no broadcasting.
- VOL-003: inspect and propose the minimal transaction-identity/persistence
  refactor. Implementation awaits review; no large refactor is authorized.

Use VOL-* task identifiers. BYE-W1-* identifiers are reserved for a later
official sprint. Keep evidence, exact source commits, chronology and small
commits; do not squash history or alter the frozen tag. No push is included
in this package.

## Hard boundary

No sendTransaction, restore, TTL extension, funding, deployment, new asset,
signer fee-limit change, Mainnet, Supabase mutation or contract modification.
Simulation does not imply a submitted transaction or physical recycling.
Signed envelopes/signatures stay in memory and out of logs/Git/Notion.

Stop if key export, unsafe Secure Store access, broadcasting, contract changes,
Mainnet, tag changes or destructive migrations become necessary.

## Evidence policy

For each VOL task record date/timezone, branch, exact tested commit (identify
dirty work explicitly), tests, actual result, artifacts, network access and
transactions submitted. New results are VOLUNTARY PRE-SPRINT, never funded
criterion PASS. Use existing Notion Project Plan/indices; no new main pages.

Product development is resumed only for the voluntary scope above. The
Instaward sprint remains not started. After the first package, stop before
broadcasting and await the owner's next instruction.
