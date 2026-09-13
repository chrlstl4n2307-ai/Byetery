> Historical connection/Foundation milestone. The current HTTP implementation and validation are in [HTTP-API.md](HTTP-API.md) and [HTTP-API-VALIDATION.md](verification/HTTP-API-VALIDATION.md).

# Supabase Cloud DEV: Foundation validation

Validated on 2026-09-12 (America/Santiago). This is an intermediate milestone;
Auth sessions, the HTTP application layer and `demo:api` are not implemented yet.

## Approved target

- Project: **Byetery Dev**, dedicated development environment.
- Project ref: `aemxuqnnwfclzrwwiqfd`.
- Database: `postgres`, PostgreSQL 17.6.
- Database host: `db.aemxuqnnwfclzrwwiqfd.supabase.co`.
- Branch: `codex/local-application`.
- Frozen base: `767e8f45dd13a3bfb9b041ed2fd00a1b8d3381df`.
- CLI: project-pinned Supabase 2.117.0; no global installation.

CLI login uses its official credential mechanism outside Git. That credential is
for administration; it must not become the application's database credential.

## Migration source and application

`database/migrations/` remains the only editable source. The ignored CLI context
is `.tools/supabase-dev`. Its `supabase/migrations` directory is a Windows junction
to the repository's `database/migrations/`, not a second migration copy.

Initial remote inspection found no Byetery schemas, migrations or Auth users.
`db push --dry-run --linked --skip-vault` selected only
`20260909142956_backend_foundation.sql`, with no seeds or additional roles.
The same command without `--dry-run`, with `--yes`, successfully applied it.
Remote migration history confirms version `20260909142956`, name
`backend_foundation`. The SQL file was not changed. No reset was performed.

All CLI commands use `--workdir .tools/supabase-dev`. The linked ref was checked
before applying changes. Process-local `SUPABASE_TELEMETRY_DISABLED=1` was used.
The context is machine-local and intentionally ignored by Git.

## Real PostgreSQL inventory

Every table has a primary key and enabled + forced RLS with restrictive
`browser_deny` policies for `anon` and `authenticated`.

| Schema/table | FK | CHECK | Deferrable constraints | Indexes | User triggers |
| --- | ---: | ---: | ---: | ---: | ---: |
| app_private.battery_records | 2 | 1 | 0 | 1 | 1 |
| app_private.evidence_versions | 3 | 5 | 0 | 3 | 1 |
| app_private.return_requests | 3 | 2 | 1 | 5 | 3 |
| app_private.reward_attempts | 2 | 2 | 0 | 7 | 2 |
| app_private.stellar_operations | 3 | 6 | 0 | 5 | 2 |
| app_private.users | 1 | 1 | 0 | 2 | 2 |
| app_private.wallet_links | 2 | 2 | 0 | 3 | 2 |
| chain_private.actor_roles | 1 | 2 | 0 | 1 | 2 |
| chain_private.batteries | 2 | 4 | 2 | 1 | 3 |
| chain_private.deployments | 0 | 4 | 0 | 3 | 1 |
| chain_private.return_requests | 1 | 2 | 3 | 3 | 4 |

Counts are from PostgreSQL catalogs; CHECK counts exclude reusable domain checks.
The security advisor returned no lints after applying Foundation.

## Reproducible checks

From the repository root:

```powershell
npm --prefix backend run verify
node scripts/test-foundation-parity.mjs
pwsh -NoProfile -File scripts/test-supabase-dev.ps1
```

- Original Backend Foundation: **50/50**, including the frozen-source checkpoint
  and Rust/WASM evidence vector; TypeScript passed.
- Shared Foundation SQL smoke suite: **82/82 in PGlite** and **82/82 in Supabase
  PostgreSQL 17.6**. No behavioral difference was observed in these cases.
- Coverage: restrictive/forced RLS on every table; browser grant denial;
  duplicate identifiers; immutable ownership/recipient; deferred consistency;
  cancellation; retained history; active claim uniqueness; evidence binding and
  hashes; premature/backward transitions; stale observations; UNKNOWN preserving
  confirmed state; successful SQL reward projection and terminal reward state.
- Both browser roles were also tested with temporary accidental grants plus a
  permissive policy. Restrictive RLS still prevented reads, updates and inserts.

The SQL smoke suite runs inside `BEGIN`/`ROLLBACK`, uses random fixture identifiers
and temporary helpers, and creates no persistent test rows. Post-run inspection
confirmed zero deployments, business users, Auth users and temporary policies;
both browser roles still lack schema USAGE. No deletion guard was weakened.
This is SQL projection validation, not an HTTP/Auth integration test and not a
blockchain transaction. Its addresses are SQL domain fixtures, not wallet proofs.

## Application credentials and connection validation

An ignored root `.env` has been prepared with the DEV URL/ref and empty credential
values. Fill these locally from **this same project's** dashboard:

- `DATABASE_URL`: server-side PostgreSQL connection string; use the session pooler
  from the project's Connect dialog if direct IPv6 is unavailable. Keep TLS enabled.
- `SUPABASE_PUBLISHABLE_KEY`: project publishable key.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only key for upcoming test Auth administration.

Other planned environment names already present there:
`BYETERY_ENV`, `BYETERY_MODE`, `BYETERY_DEPLOYMENT_ID`,
`SUPABASE_PROJECT_REF`, `SUPABASE_URL`.

Do not paste credentials into chat, source files, documentation, shell command
arguments or test output. The CLI's successful login does not supply these
runtime settings. The `.env` is preparation only; the current mock harness does
not consume it. No endpoint or new runtime dependency has been added.

## Remaining work

Validate Auth and server database connectivity, then implement application
authorization, wallet challenges, durable coordination, HTTP routes and the
separate remote-dev API integration suite. Preserve all approved invariants.
Storage is not configured yet. Do not use production, Stellar RPC, frontend or
Vercel. Run the full requested verification and secret audit before the eventual
application checkpoint; no new commit was created at this intermediate milestone.

## Connection recheck (2026-09-13)

Run `node scripts/check-dev-connection.mjs` from the root. It reads the ignored
`.env`, verifies the dedicated DEV target, and prints only sanitized status.
Both publishable and server Auth key checks returned HTTP 200. These are key
checks, not user-session or application-authorization validation.

PostgreSQL accepted the connection credentials. The Node-to-session-pooler
connection negotiated TLS 1.3 with hostname and certificate validation enabled.
The same 82 SQL tests also passed through this `pg` connection, with rollback.
`pg_stat_ssl` reports the pooler-to-Postgres hop (false in this project); it does
not describe the verified TLS socket from Node to the pooler. No server settings
or global Windows certificate stores were changed.

The first attempt failed with `SELF_SIGNED_CERT_IN_CHAIN`. The fix was a
connection-scoped public CA certificate, not disabling verification. Set
`DATABASE_SSL_CA=.tools/certificates/supabase-ca.crt` in the ignored `.env`.
The certificate is downloaded over HTTPS from the URL published in Supabase
Studio's official `apps/studio/hooks/custom-content/custom-content.json`:
https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt
Its SHA-256 certificate fingerprint is
`80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`.
The certificate is public despite the provider's `prod` filename; the target
remains Byetery Dev. Download it again into the ignored path on a new machine.

After adding the driver, TypeScript and all 50 existing tests passed again.
`git diff --check` passed. No new checkpoint or API implementation in this step.
