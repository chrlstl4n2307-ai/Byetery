# D3-24 RUN1 candidate for review

This isolated composition is based on 864dd0c and verifies the materialized operator c50e4eb from its clean linked worktree. The D3-24 review entry accepts only the exact identity and a separately supplied SHA-256 of composition-files.json. It reads and verifies the candidate and reports a review-only descriptor. The D3-23 launcher retains its existing binding and rejects D3-24.

| Component | Candidate binding |
| --- | --- |
| Operator | Final confirmed journal row carries the original operation ID. Parent, tree, blob and source SHA-256 are pinned in operator-identity.mjs. |
| Readiness | Exact plan and hash-chained ledger, D3-24 battery in SQL and Stellar RPC, coordinated read-only SQL, and a complete confirmed prefix of the D3-24 journal. |
| Receipt capture | Create-only directory dedicated to D3-24. Its identity file binds the task, business SHA, plan hash, battery, exact operation scope, classification and receipt inventory. Synthetic receipts cannot enter the signed-transaction verification path. |
| Owner export | Dedicated SELECT-only query pinned by digest. It scopes one deployment and battery and limits the SQL request to five IDs. The final verifier requires the five journal identities, exact export metadata and independently corroborated Testnet observations. |
| Composition and launcher | composition.mjs pins the baseline, worktree, operator object, plan, ledger, export query and reviewed file hashes. review.mjs accepts the exact review arguments. The composition reuses the existing serial launcher with synthetic ports, checks readiness and journal identity before each next operation, and verifies a separate receipt inventory for every completed step. |

The five published ledger entries are an exact byte prefix of the candidate ledger. Its sixth entry accounts for the D3-23 registration as historical consumption and carries the sealed inventory reference. It grants zero transactions. The original no-dispatch exception remains excluded. RUN1 is capped at five and would take the external count from five to ten.

The SOW still requires three complete RUNs. The external execution limit remains 19 and the absolute cap remains 20. RUN3 needs a separate, durable stop before its final payment. The current uninterrupted operator cannot implement that stop. A future design must preserve exactly one claim for each operation, reconcile the 19 earlier transactions with no pending, uncertain or duplicated work, and require a new owner authorization bound to the final payment's task, SHA, plan, battery and recipient. Any additional consumed slot stops the plan for a new budget decision. There is no contingency switch or renewal in this candidate.

## File classification

- Changed shared tooling. The launcher accepts a dedicated synthetic review profile. The SQL, chain, readiness and export verification adapters support the separate pinned D3-24 identity while retaining the historical defaults.
- Added candidate files. The composition and review entry, profile, plan, append-only ledger, journal/readiness verification, receipt capture, export verification and query, operator object verifier, composition manifest, tests and this document.
- Verify only. The materialized and frozen operators, the historical receipt tooling, SQL export query, plan, ledger, journals and markers, the API scheduler and quiescence controls, and the existing launcher grant, Auth, session and activation wiring. The legacy artifacts stay at their original identities. No historical evidence is exported or rewritten.

Run the dedicated offline checks with node --test tools/d3-24-ratification/ratification.test.mjs from the composition worktree. The test operator worktree defaults to ../B24op and can be set explicitly with BYETERY_D324_TEST_OPERATOR_ROOT. The review CLI accepts the exact task, operator SHA, plan hash, battery, operator root and review-manifest SHA-256. It exposes no operational entry point.
