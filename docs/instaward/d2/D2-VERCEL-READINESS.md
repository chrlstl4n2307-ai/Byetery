# D2 — Vercel Preview readiness

2026-10-22 · **VERCEL PREVIEW: BLOCKED**. Architecture gate reviewed before any deploy. No project was created, no environment uploaded, no deployment attempted and no URL/deployment ID is claimed. D2 criterion acceptance remains 0/6.

## 1. Frontend deployment architecture

Target is the existing Next.js frontend, Root Directory **frontend**, target **PREVIEW**, branch **instaward/d2-web-mvp** only. Browser requests remain same-origin to Next route handlers; the server forwards the existing user session bearer only to a fixed, explicitly reviewed API origin. Responses stay private/no-store. HTTPS cookies are Secure, HttpOnly and SameSite=Strict. Exact web/API allowlists reject arbitrary origin and upstream selection. Vercel runtime metadata must match Preview, the D2 branch and approved deployment/branch origin. No main deployment, production domain or promotion.

Only environment/source/read-only display flags are passed to client components. No database, service-role or signing material enters browser props. A TESTNET read never falls back to MOCK. A missing configuration or upstream is an error, not fabricated data.

## 2. Backend dependency

`backend/src/application/server.ts` is a persistent Node server, binds loopback, reconciles queued operations on startup and periodically, and selects the local Windows Secure Store signer in TESTNET mode. It is **not** a Vercel Function. Deploying that entry point or copying its environment to Vercel is not authorized or safe for this milestone.

The current web API/read model requires Supabase Auth/session validation and private SQL projections. Private tables are not available to a publishable key through the browser. No RLS/grant/schema change is proposed to make deployment easier. The current GET handlers also call `Repository.principal`, whose initialization statements are writes even when they become conflicts/no-ops; they cannot simply be run under a strictly read-only SQL role without a reviewed adaptation.

## 3. Frontend environment variables — names only

| Names | Use |
| --- | --- |
| BYETERY_WEB_ENV | Explicit local or D2 preview configuration |
| BYETERY_SOURCE | Expected read-model source |
| BYETERY_DEPLOYMENT_ID | Full pinned existing deployment |
| BYETERY_WEB_ORIGIN | Canonical reviewed web origin |
| BYETERY_API_URL | Real reachable HTTPS API upstream |
| BYETERY_ALLOWED_WEB_ORIGINS | Reviewed exact web origins, JSON array |
| BYETERY_ALLOWED_API_ORIGINS | Reviewed exact API origins, JSON array |
| SUPABASE_URL | Existing DEV Auth project |
| SUPABASE_PUBLISHABLE_KEY | Existing publishable key; server SDK, not privileged |
| VERCEL, VERCEL_ENV, VERCEL_URL, VERCEL_BRANCH_URL, VERCEL_GIT_COMMIT_REF | Platform-supplied deployment metadata, checked by policy |

No wildcard allowlists. Preview variables must be scoped to Preview/D2, not production. The local `.env` files are never uploaded or copied automatically. See `.env.example` for local defaults only; test hostnames in unit fixtures are not an existing API.

## 4. Secrets — names only and justification

The frontend Preview requires **no privileged static application secret** with the recommended architecture. Existing user sessions use HttpOnly cookies; their tokens are not environment variables or log artifacts. A Vercel deployment credential, if needed later, authenticates the deployment tool only and is not a browser/runtime variable.

DATABASE_URL, DATABASE_SSL_CA and SUPABASE_SERVICE_ROLE_KEY are **not frontend Preview variables**. No service-role key is justified for this frontend. No ADMIN/SERVICE/COLLECTOR/RECYCLER/TTL seed, private key, Secure Store material or signer executable may be uploaded. Backend/read-service credentials would need separate review and least-privilege provisioning; none were created or copied here.

## 5. What can work on Vercel

The Next frontend can build and render, handle existing-account Auth via its publishable configuration, and proxy authenticated read-only requests **once** a reachable reviewed HTTPS read API exists and both origin lists are configured. TESTNET business mutation and signup paths are denied in this milestone, including hand-crafted POSTs. The UI explicitly labels its limited Testnet read/verification scope.

Local frontend tests (102/102), TypeScript, lint, production build and client-bundle audit pass; root npm run verify also passes (backend 148/148, Python 4/4, Rust native/WASM/release/fmt/Clippy and MOCK demo). The local build and controlled HTTPS/auth-cookie/proxy tests do not prove a hosted integration. D2.4 still needs real operation/hash/ledger presentation; the existing minimal read model has no latest terminal receipt. No successful historical battery state is used to invent a current transaction confirmation.

## 6. What cannot work yet

There is no configured/reviewed public HTTPS API for Vercel to contact. The restored API upstream is local loopback; cloud functions cannot use that as a route to this Windows machine. Read-only Vercel inventory returned no Byetery project in the accessible account/team, including a repository-filtered lookup for chrlstl4n2307-ai/Byetery. Local SQL projection verification succeeded, but an authenticated deployed browser/API read has not been executed. A blank login shell or a fake backend would not satisfy this milestone.

Mutating public lifecycle actions remain outside this implementation. Windows Secure Store stays local; no attempt was made to move it into Vercel, export keys or start a live TESTNET worker. No new Stellar transaction is needed to assess readiness.

## 7. Real blockers and deployment evidence

- A reachable, authenticated HTTPS read API with its own validated existing TESTNET deployment configuration.
- A reviewed exact API origin and a canonical Preview origin/allowlist for the new or existing Vercel project.
- An authenticated end-to-end read and source/deployment check through the deployed BFF, plus user-access review. No new role/principal is inferred.
- Root Directory/frontend monorepo build review: type-only shared domain imports reference the repository backend source. Keep that source available in the build context; no backend executable/signing dependency belongs in the frontend bundle.

Preview URL: NOT CREATED. Deployment ID: NOT CREATED. Deployment commit: NOT DEPLOYED. Remote build/log/page-load: NOT RUN. Local implementation checkpoints: D2-001 `6e5ee6adbf573cb2d792242bd275644b2be2ed36`; D2-002 `41fbd44473edf36ac04c9c8629393198baf87fb4`. Build/test evidence is recorded per task in [the D2 index](EVIDENCE-INDEX.md). These commits have not been pushed in this task. No project setting, DNS, cloud secret or deployment mutation occurred.

## 8. Minimum recommended next architecture

Review a **dedicated HTTPS read API without signer or dispatch worker**. Permit only authenticated profile/battery reads, validate the existing session and select existing principals without automatic provisioning, and use least-privilege SQL access to the existing projections. Reuse existing projection fields and authorization invariants. This is a proposed next change, not an implemented service or authorization to alter RLS/Auth.

After that API is available, approve its exact origin, create/link a Vercel project with Root Directory/frontend, configure only the frontend names above for Preview on the D2 branch, deploy, inspect logs and test an authenticated known-battery read. Keep the local signing/write application separate. No tunnel exposing the existing signer-enabled generic API, no silent conversion to serverless and no mock substitute.

Sources consulted: [Vercel deployment environments](https://vercel.com/docs/deployments/environments), [system metadata](https://vercel.com/docs/environment-variables/system-environment-variables), [Next cookies](https://nextjs.org/docs/app/api-reference/functions/cookies), [Supabase SSR clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client), installed pinned SDK and the existing backend sources. API inventory is a point-in-time read, not a claim about uninspected projects/services.

**STOP at the deployment gate. No A2, D2-003, D2-007, D3, contract/WASM change, key export or new Testnet transaction is authorized by this assessment.**
