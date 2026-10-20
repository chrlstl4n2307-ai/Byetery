# BYE-W1-003B bounded operator

This operator calls the existing real HTTP API and TestnetStellarService. It does
not implement contract rules, change the contract, add public endpoints or run a
general queue worker. Only the fixed sprint battery/deployment and open_return /
confirm_collection are allowed. No recycling, reward, cancellation, registration,
Mainnet, redeployment or on-chain role change is available.

## Owner-approved collector setup

The initial gate found an existing on-chain Collector role but no application
COLLECTOR membership. The owner explicitly authorized a dedicated Auth test
principal, BYETERY-INSTAWARD-COLLECTOR-1, and only its COLLECTOR association in
deployment 5c0cad2f-5f25-4216-8068-6cb9d2d26325, mapped to the already approved
collector. The existing Repository also assigns its standard base USER membership.
USER-1's roles and verified wallet are unchanged; no ADMIN/RECYCLER is granted.

`--setup` is a one-time setup command with a durable intent before account creation.
It refuses to create a second fixture after an existing attempt. Test credentials
remain in memory. This command is not authorization to provision additional roles.

To recover an existing test principal's login, the server fetches its known Auth
identity, checks the fixture label, generates an admin magic-link token without
sending email, consumes it through Auth /verify, and validates the returned session
through the existing SupabaseAuth. Tokens, email links and passwords are never
written to the journal or logs. No password or Auth configuration is changed.
The user-facing API still accepts only validated sessions, not injected identities.

References:
https://supabase.com/docs/guides/auth/auth-email-passwordless
https://supabase.com/docs/reference/swift/auth-admin-generatelink

## Execution and recovery

Run from the repository root with the existing ignored DEV configuration selected
through BYETERY_CONFIG_FILE. Do not print or copy its contents. The operator overrides
the repository mode/deployment internally to its fixed TESTNET target, while retaining
the validated Supabase DEV connection. The normal frontend remains DEV/MOCK.

1. Run focused tests and complete regressions. Checkpoint the tested implementation.
2. Record the actual tested HEAD and allPassed=true in the ignored
   `.tools/bye-w1-003b/verification.json`. A flag is not a substitute for test evidence.
3. `node --experimental-strip-types backend/src/testnet/sprint-return-collection.ts --return`
4. Independently verify RETURNED/OPEN, recipient and SQL projection.
5. `node --experimental-strip-types backend/src/testnet/sprint-return-collection.ts --collection`
6. Independently verify COLLECTED/CONFIRMED, collector and evidence commitment. STOP.

Do not delete/reset `.tools/bye-w1-003b/live.json` to retry. Stage changes and the
idempotency context are persisted before the HTTP mutation. A partial/uncertain
attempt refuses automatic re-entry. Review the original operation/key/hash in SQL;
recover only that durable identity. No new API idempotency key, automatic preparation,
replacement envelope or unchecked broadcast is allowed after uncertainty.

The normal application worker owns simulation, two-phase signing, SDK hash/body
verification, durable identity COMMIT, dispatch intent, source check and reconciliation.
The operator additionally verifies persisted envelope bytes before the worker's last
source-sequence read. Its send guard performs only in-memory checks afterwards, then
calls RPC. Shared/manual source use is treated as unconfirmed; a lease is not a fence
against external transactions. Sequence drift stays in the worker's durable reviewed
hold path. The original 50,000,000-stroop cap and signer allowlists are unchanged.

## Collection negative evidence

Before signing the actual positive simulation, validate the complete original auth
structure. Test removal of SERVICE and COLLECTOR independently and substitution of
the collector command address through the existing strict validateAuth boundary.
These are deterministic application/signing-guard tests, not invalid live submissions.
Separately confirm the USER-1 address has no Collector role and simulate an unsigned
collection using that address. It must return an error. No negative case is signed
or broadcast. Preserve the original positive envelope unchanged for the real signer.

The full manifest is synthetic, explicitly identifying a Testnet test attestation,
not proof that a physical battery was collected. Its exact UTF-8 bytes, payload SHA-256
and existing BYETERY_EVIDENCE_V1 XDR commitment are retained for independent checking.
No personal data is put on-chain. Only sanitized auth metadata is public; auth
signatures/envelopes remain private. No raw RPC diagnostics are logged.

After each success, replay only the identical API body/key and compare counts of
requests, logical operations, immutable identities and dispatch attempts. There must
be no new identity or send. Check the chain again and report the original transaction's
actual charged fee/ledger/event separately from simulation estimates.
