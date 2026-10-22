# D2-001 — Testnet web read-model integration

2026-10-22 · OFFICIAL INSTAWARD SPRINT / FUNDED SPRINT.

Branch `instaward/d2-web-mvp`, starting checkpoint `3c7d373ec893a2e66101c4bcfbee354b3a53e434`. D1 branch remains frozen. Baseline comparison remains `450c21b`; D2-only scope is compared separately with the starting checkpoint. No D2 acceptance decision is made here.

## Result

**IMPLEMENTED / TESTED locally; deployed authenticated HTTPS integration remains PARTIAL / BLOCKED on read-API hosting.** There is no Vercel Preview URL yet. The enclosing task commit records this implementation; no self-referential or unpublished public commit URL is fabricated.

Frontend Battery/Profile/Challenge source types accept the backend's actual `MOCK | TESTNET` vocabulary. The existing API routes and Repository view remain unchanged. The Next BFF checks successful read responses against the configured source, rejects missing/mismatched source with 503 and never falls back to MOCK. TESTNET data has explicit `NETWORK: STELLAR TESTNET` labels; MOCK explanations appear only for MOCK data. RECYCLED is described as an authorized lifecycle attestation, not independent physical/environmental certification.

## Configuration and authority

- LOCAL keeps the historical loopback DEV/MOCK defaults. Local TESTNET reads require the full existing deployment UUID; the source is never guessed from a request.
- D2_PREVIEW requires TESTNET, explicit canonical HTTPS web/API origins, and separate JSON allowlists of reviewed exact origins. No wildcard, URL credentials, path/query/fragment, loopback or private/internal API target is accepted.
- On Vercel, configuration additionally requires Preview, the exact D2 branch and a web origin matching deployment/branch system metadata. Production/main are rejected. Headers supplied by the browser cannot choose origin or upstream.
- Cookies remain HttpOnly, SameSite=Strict and path `/`; HTTPS enforces Secure on both SDK defaults and every cookie write. No Domain cookie is configured. Existing same-origin checks, body bounds, redirect rejection and private/no-store responses remain.
- TESTNET business POSTs are rejected by the BFF before authentication/forwarding, even if a user crafts a request manually. Operator/registration/reward/wallet controls and signup are unavailable in this read-only phase. Existing account login/logout remain. LOCAL MOCK business controls are preserved.
- Only the non-sensitive runtime label/source/read-only flag is serialized by layout. No upstream, database credential, service-role key, token or signing material is passed as a client prop. The frontend continues to forward only the user's session bearer to its fixed upstream; the existing API performs authoritative Auth/session checks.

## Existing deployment verification

The exact UUID was obtained from the existing SQL deployment configuration, not invented: `5c0cad2f-5f25-4216-8068-6cb9d2d26325`. Existing contract: `CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON`.

[Sanitized read-model observation](D2-001-READ-MODEL.json) uses the actual existing `Repository.config/view` in `BEGIN READ ONLY` against Supabase DEV. It observed the historical battery RECYCLED/SENT, no pending operation and last reward attempt SUCCEEDED. No worker, signer, RPC, Auth login, new principal or new business row was invoked/created. This is the SQL projection, **not a fresh independent chain verification**.

The current API response does not include deployment UUID or the latest terminal Stellar receipt. The frontend pins its intended deployment in configuration and checks source, but cannot independently prove an upstream's deployment from response metadata alone. Upstream deployment configuration and an authenticated end-to-end read must be checked before a hosted Preview is called operational. No backend change is inferred from this limitation.

## Validation

| Check | Result |
| --- | --- |
| Existing plus new frontend tests | 82/82 PASS; serial worker |
| TypeScript | PASS |
| ESLint | PASS |
| Next production build (local, no deployment) | PASS |
| Client bundle / frontend env allowlist audit | PASS; 17 artifacts, no privileged secrets |
| Existing real TESTNET SQL read model | PASS; read-only projection observation |
| Root verification before checkpoint | PASS — Rust native/WASM, release build, fmt/Clippy, backend 148/148 and TypeScript, Python 4/4, MOCK demo |
| Authenticated deployed browser/API read | NOT RUN; HTTPS API unavailable |

New tests cover LOCAL/MOCK, local TESTNET, HTTPS configuration, exact allowlists, incorrect origins/upstreams, production/wrong-branch rejection, actual SSR Secure cookie writes, same-origin checks, fixed-upstream session forwarding, sessionless reads, source mismatch, upstream outage and server-side TESTNET mutation denial. UI tests cover correct labels and the absence of mutation controls for TESTNET, including ADMIN. Original 33 frontend tests remain.

An initial sandbox test run lost its temporary Vite file (ENOENT); the same installed suite ran with a stable ignored temporary directory. One new test initially used an ambiguous text selector (heading plus QR link); selecting the heading fixed the test. These were not SDK changes or suppressed product failures. No dependency or lockfile changed.

## Limits and safety

No claim that a public lifecycle works. No A2, D2-003, D2-007 or D3. No new Stellar transaction, operational signature, broadcast, role, contract/WASM, deployment, schema/RLS or Supabase business mutation. No Secure Store access. No main/tag changes, Notion write or Obsidian synchronization. The two protected local files remain outside commits.

Owner acceptance remains D1 12/12, D2 0/6, D3 0/5, total 12/23. This is internal project status, not Stellar/SDF/Instawards acceptance/payment.
