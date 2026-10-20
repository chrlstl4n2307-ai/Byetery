# Local owner wallet-linking page (BYE-W1-003A)

Purpose: authenticate one clearly labeled Supabase DEV test principal and let
USER-1 personally approve a SEP-53 proof with Freighter. Only the existing active
API wallet challenge/verification endpoints are forwarded. No RPC, Secure Store,
Soroban operation, return request, role management or reward endpoint is exposed.

Install the pinned browser SDK locally with `npm ci --prefix tools/wallet-link
--ignore-scripts`. Node24 and the frontend's installed TypeScript6 compiler API are reused.
The browser adapter is compiled in memory from the exact preserved wallet/QR
source; only its source marker becomes TESTNET and its shared message import
becomes a local browser module. No QR or D2 UI is ported.

Launch from repository root using the existing ignored DEV configuration:

```powershell
$env:BYETERY_CONFIG_FILE = 'C:/path/to/existing/ignored/.env'
node --experimental-strip-types tools/wallet-link/server.mts --owner-wallet-only
```

The script requires the existing TESTNET deployment and checks its configuration.
It stops if an eligible user/setup already exists, rather than creating duplicates
or bypassing owner login. With none present, it uses the established DEV Auth
admin-create + real password-grant pattern to create a labeled test user. A real
validated API session creates its application principal and USER membership.
Credentials and JWT remain in process memory, never browser JavaScript, files or
logs. The browser receives only an HttpOnly/SameSiteStrict loopback-session cookie.
The task-local progress journal contains sanitized correlation, not credentials,
payloads or signatures. A restart requires reviewed resume because no credentials
are persisted; do not delete that journal to bypass this safeguard.

Open the printed loopback URL in the Chrome profile containing Freighter. Choose
USER-1 (`GDXAWG56PVUHWGB5VSJRN6OUZTEL7M3SLKL46CDKKXQ42CU2XCS3PXCS`) and
Testnet. Click Connect, review the exact Byetery message and personally approve
Sign and verify. A challenge lasts10minutes; signing is a message, not a chain
transaction. Do not give the assistant a key, password or signature.

The local page explicitly states that the wallet will be linked to the labeled
test principal, not an inferred personal email account. Origin/Host/session/body
and fixed-target checks restrict the bridge. The upstream API separately validates
Supabase session, deployment, persisted scheme and wallet proof. Success is checked
again through joined Auth/membership/challenge/wallet database facts.

Tests: `node --experimental-strip-types --test tools/wallet-link/bridge.test.mts`.
Do not claim real wallet control from these deterministic tests. Do not run any
lifecycle operation or automatically resume BYE-W1-003 after wallet success.
