# D3-24 definitive composition — uncommitted local review candidate

SECURITY_STATUS=HOLD. OPTION_A_PROVISIONAL. Custody risk, external manifest,
PRE-LIVE and LIVE are **not approved**. This is preparation, not activation.

Base: `21f5e3e7a27759d02a0477c374b7e37f35f96909`.
Capture source: `496f891463c4476fe6f9e267232e072b754d02fb`, a sibling of the
server, not its descendant. Its four files are copied from exact Git blobs.
All sixteen server-repair files remain byte-identical. The two operator files
remain in a separate clean worktree at
`d85e54e00e98c8d8bc6294c883708a701ce55440`; they are not copied into the server.
No existing commit is rewritten. No integration commit or Git push was made.

## Identity and history

The new plan is `plans/security-repair-v2.json`, canonical JSON without a trailing
newline, generated through the existing domain `plan()` and `canonical()`.
Its SHA-256 is
`0435d8436d13881ebbdf31e729cf36a80e538bc149300219353f68817b37d72d`.
The original `tools/d3-24-ratification/plan.json` remains unchanged.

The external ledger is unchanged, including its historical proposal for c50e4eb1
and the old plan. The reader verifies that exact historical scope/hash rather
than pretending it ratified the new plan. It reports the new binding separately
as REVIEW_ONLY. This does not consume or refund a transaction. The new signed
approval, when separately authorized, must explicitly bind the new identity.

The candidate operator verifier fixes SHA, parent4735b83a, tree, source blob and
SHA-256, and the exact two changed paths; Git replacements are disabled. Readiness,
capture and export reuse existing logic through the updated versioned profile.
Only the query's execution/plan metadata changed; its SELECT-only body is intact.
The new query SHA-256 is
`2a3a84852f3702bae428e646113a006f11205374caa8651086130ed2aec84ddd`.

## Sessions and authority

`session-wrapper.mjs` loads the independent operator only by its pinned SHA.
Phase A uses its real `prepareLocalRoleSessions` implementation. The server-side
`session-control.mjs` calls the existing independent Auth validator and opaque
core session receipt. It creates no public endpoint. Core receipts stay in the
server; random routing IDs are not admission authority and disappear on restart.

The wrapper compares a digest of all four server-validated identities/expiries
with the exact bearers it supplied. Decoded client claims are consistency data,
not authentication. Phase B consumes one routing handle and invokes the existing
server admission with independent owner/runner proofs and SQL revalidation.
Only then can it produce the operator's prepared-session/proof-provider options.
Rejected or uncertain admission is not automatically retried. Business requests
still require the original per-operation PoP/server/worker controls.

Cross-process fixtures use two loopback processes, synthetic signed tokens,
fixture-only approval keys and PGlite. Their HTTP control routes exist only in
`fixtures/session-server.mjs`, never in the application HTTP router. They do not
demonstrate real Auth/custody/chain interoperability. The actual operator factory
has not been run against a real API or real credentials here.

## Entry, manifest and signer

PowerShell `tools/d3-24-operational/launch.ps1 -CompositionReview` invokes a pinned
Node entry that imports no credential, owner-authorization, admission or LIVE
controller. Without that switch it rejects LIVE. Node's public entry functions
also reject exact LIVE argv. Future activation needs a separately reviewed change.

V3 field inspection is review-only. The full capture adapter additionally requires
a clean materialized checkout and the existing fixed-owner V3 signature verifier.
There is no current approved manifest. Future SHA/parent/tree come from that
external approval; null future SHA fields are metadata, not placeholders to fill
with this source file's own commit hash. There is no self-hash cycle.

The existing helper source was verified against server21f5e3e and built with
offline/locked Cargo and the already installed local LLVM/UCRT toolchain. Its
actual executable was re-hashed after the build: 374949376 bytes,
`9710311d384345f8197e7d8635c75808930e74bdda5081d83c2aa21b302b1f10`.
This independently measured value happens to equal the earlier candidate value;
no previous approval was inherited. Cargo cache reuse is not a clean-build
reproducibility proof. No key or Secure Store entry was accessed.

`pins.mjs` records this source/binary binding without approving real custody.
The future composition tree and entry/import closure must bind that pin module;
the closed V3 manifest's two bootstrap fields are not silently expanded to accept
caller-selected signer hashes. Operational use still requires an approved binary
closure, approved manifest and an explicit binary check in the future controller.

## Local commands and limits

```powershell
node --experimental-strip-types --test tools/d3-24-composition/composition.test.mjs
node --experimental-strip-types tools/d3-24-composition/fixtures/session-driver.mjs
node --experimental-strip-types tools/d3-24-composition/fixtures/five-steps.mjs
node --test tools/d3-24-capture-profile/profile.test.mjs
pwsh -NoProfile -File tools/d3-24-operational/launch.ps1 -CompositionReview
```

Use existing dependencies only. The session fixture expects the isolated
`../B24repair-op` checkout at the exact pinned operator SHA. Historical A24/F1
positive tests belong in their original frozen-byte/tree checkouts. Do not loosen
their pins to make this candidate appear historical.

Real local PostgreSQL tests use ephemeral loopback fixtures only. No .env or
credential from the application is needed. No remote migrations, Auth changes,
real grants/signatures/admission, PRE-LIVE/LIVE or Stellar transactions are allowed.

Budget: five historical confirmed, ordinary limit19, RUN1 max5, remaining14,
TX20_AUTHORIZED=NO. The unchanged three-run planning data is not authority for
RUN2/RUN3 or transaction20. A 68-minute simulation is not measured live latency.
