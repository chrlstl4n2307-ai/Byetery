# D3-7D — Local wallet-only client (candidate; no live link yet)

This is a separate loopback page, not a change to the hosted read-only Testnet
dashboard. It pins Wallet B `GCE35NEN2O3EYK5A7SROTLFOCSAIGLN2BPVQBFS4UG52BY2P7K6VC6DB`.
The authenticated existing USER must already own active Wallet A. Missing app
principal/membership is rejected before any automatic provisioning helper.

## Scope and review boundary

**Do not launch until code review/freeze and separate interactive authorization.**
D3-7D implementation does not log in, issue a real challenge, call the extension,
sign, verify a real wallet, or start RUN1. The old frozen execution SHA is not a
future execution authorization after this candidate is committed: review/freeze
must establish a new D3_EXECUTION_SHA first. No commit is made by this task.

After that boundary, the existing normal flow is:

1. Owner opens the printed `http://127.0.0.1:<ephemeral-port>` in Chrome with Varial.
2. Owner enters existing Byetery email/password into the local form. Normal
   Supabase password grant uses the publishable key. `SupabaseAuth.validate`, live
   session, ACTIVE principal and enabled USER membership gates run on API actions.
3. Owner selects exact Wallet B and Stellar Testnet. Connect/request challenge
   validates the selected address and passphrase without signing.
4. The separate sign button displays network, purpose, address and expiry. Only
   the owner's explicit click invokes `signMessage` and opens wallet approval.
   Cancel any payment, transaction, trustline or Soroban authorization prompt.
5. The client signs the exact decoded UTF-8 message, not Base64/JSON/XDR. SEP-53
   prefix/hash is applied once by the wallet. It checks account/network again.
6. Existing `WalletService` consumes proof atomically; `/api/me` must show active
   verified A and B. STOP, no automatic operator/lifecycle action.

## Local configuration and command — future use only

Dependencies are the repository's existing backend, frontend TypeScript compiler,
and pinned `tools/wallet-link` Freighter API6.0.1. No new dependency or lockfile.
The SDK build is read locally and served from loopback, not from a CDN. Varial's
documented backwards compatibility makes integration likely; real installed
extension compatibility remains unvalidated until the later owner step.

Prepare a dedicated **ignored** root `.env.wallet-link.local` only when authorized:

```dotenv
BYETERY_ENV=DEV
BYETERY_MODE=TESTNET
SUPABASE_PROJECT_REF=aemxuqnnwfclzrwwiqfd
SUPABASE_URL=https://aemxuqnnwfclzrwwiqfd.supabase.co
SUPABASE_PUBLISHABLE_KEY=<existing-public-key>
BYETERY_TESTNET_DEPLOYMENT_ID=5c0cad2f-5f25-4216-8068-6cb9d2d26325
DATABASE_URL=<existing-private-database-connection>
DATABASE_SSL_CA=<existing-readable-CA-path>
```

No new credentials are created. Never put passwords/tokens in CLI arguments,
tracked files or logs. No privileged Auth key or signing identity is needed.
The legacy Settings type's unused `serverKey` field is an empty string; the
operational configuration loader is not called. TLS verification stays enabled.
An explicit config path may be supplied through `BYETERY_WALLET_CONFIG_FILE`.

From repository root, **after future review/authorization**:

```powershell
node --experimental-strip-types backend/src/wallet-link-local/server.ts
```

No package scripts were changed. Hosted/CI/production detection fails before
dynamic loading of config, database or Auth. Socket binds only127.0.0.1.

## HTTP surface

| Route | Purpose |
| --- | --- |
| POST `/auth/login` | Normal email/password login, existing account only |
| POST `/auth/logout` | Forget local session, revoke only this Auth session |
| GET `/api/me` | Normal authenticated profile |
| POST `/api/wallet/challenge` | Existing Coordinator / WalletService, only address B |
| POST `/api/wallet/verify` | Existing Coordinator / WalletService, only B SEP53_V2 proof |

POSTs require exact local Origin/Host, JSON and API Idempotency-Key. All other
application routes404. No CORS, arbitrary proxy, battery, reward or operator path.
Each action revalidates Auth. Access token is held server-side in memory only;
refresh token is discarded. Browser gets only an opaque random HttpOnly,
SameSite=Strict loopback cookie, with lifetime capped at30minutes/access expiry.
No token/password/signature/nonce is logged or persisted. Restart forgets sessions;
there is no refresh or session-import endpoint. Use normal login again on expiry.

### Local UI session recovery (D3-7G candidate)

On load/reload the page calls the existing normal `GET /api/me`. A valid Testnet
profile containing Wallet A restores the UI without another password grant and
keeps logout available; invalid/expired/unavailable profiles return to login.
The login button is disabled while authenticated or while restoring a session.
A repeated submission that receives `409 LogoutFirst` recovers through `/api/me`
and shows a safe session-already-active message. It never clears a valid profile
before trying login. Other recoverable errors retain the previous profile and
logout control; authentication rejection or an invalid profile fails closed.

Normal logout still calls only the existing `POST /auth/logout`. The UI clears
after its result, not before. If closing is uncertain it checks `/api/me`: a still
valid session keeps a usable logout button; a missing session returns to login
without claiming remote logout succeeded. No token/cookie extraction, manual
session import, privileged revocation, new route or guard change.
This candidate must be reviewed/frozen before another live wallet-link attempt.

Existing Coordinator is reused only for its constant challenge/verify actions
and idempotency semantics; no processor is provided and no reconcile is called.
Fresh-key proof replay409; exact Idempotency-Key retry can return its cached
success without a new consumption/link. Existing code owns all wallet SQL writes.
Tests use offline fakes/PGlite; a fake gateway never establishes real wallet proof.

Sources consulted before implementation: Raven `stellarDocs` wallet guide,
[official signing API](https://docs.freighter.app/extension-freighter-api/signing.md),
[normal Supabase password login](https://supabase.com/docs/reference/javascript/auth-signinwithpassword).
