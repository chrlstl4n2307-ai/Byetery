# Byetery instructions

- The Soroban contract is frozen. Do not change its functional rules or frozen sources without explicit approval.
- Preserve Cargo.lock, original contract tests, historical test snapshots and the checkpoint manifest in docs/checkpoints.
- Expected WASM SHA-256: c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6.
- Keep the existing 50-test Backend Foundation suite intact. Contract paths now point into contracts/byetery-contract; migration paths point into database/migrations.
- Do not connect Stellar Testnet or Supabase remote without explicit approval. Supabase DEV and the frontend MVP are explicitly authorized on codex/frontend-mvp. Do not connect production, Stellar Testnet or deploy to Vercel.
- Reuse MockStellarService and domain types. Python helpers must not reimplement states, authorization or rewards.
- Browser roles remain base-deny. Never expose signing keys or service credentials.
- Run npm run verify at the root before checkpointing changes. Fix structural failures before proceeding.
- Ignore local toolchains, dependencies, builds, ephemeral databases and secrets. Only non-sensitive examples belong in .env.example.
