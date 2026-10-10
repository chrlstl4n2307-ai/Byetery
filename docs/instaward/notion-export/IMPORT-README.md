# Notion setup / publication

## Detection result

On 2026-10-09 the plugin catalog reported Notion installed/enabled. However, no Notion search/create/update/database tools are exposed in this session, and the inspected MCP server-name inventory has no Notion server. Authentication/write capability is not confirmed. Functional integration available: NO THIS SESSION. No remote page/database was searched, created or updated; existing Notion content is therefore unknown.

Do not reinstall a duplicate or provide tokens by chat. Reconnect the existing Notion integration in the app if needed, grant access to the chosen parent and refresh/reopen the session so its tools appear. Then search for the existing Byetery page before creating anything. Never claim connection from installation status alone.

## Import steps (ready now)

1. Search Notion for **Byetery — Instaward** or an existing Byetery project page. Reuse the correct parent; if absent, create **Byetery — Instaward**.
2. Import the root page and subpages from `notion-export/`. On desktop/web use Settings -> Import -> Text & Markdown, or the Import action available in the current workspace. Markdown imports as pages. The prepared ZIP can be unpacked and the Markdown files imported individually if bulk import does not preserve folders. Do not repeatedly import the same bundle.
3. Arrange pages according to `PAGE-MAP.csv`: Pre-Sprint Baseline, Development Log (Day 0 and Week 1–4), Changelog, Deliverables (D1/D2/D3), Tests & Evidence, Stellar Transactions, Issues / Risks / Decisions, Known Limitations and Final Evidence Package.
4. Import `Byetery — Development Log.csv` as a database, or create a full-page table with the same title. CSV rows become items and columns properties; inspect/coerce types after import, rather than assuming automatic select/multi-select/date conversion.
5. Set the following property types. Existing databases must be inspected before changing schema; preserve user data. No relation/rollup setup is required for the minimal tracker.

| Property | Type |
| --- | --- |
| Title | Title |
| Date | Date |
| Week | Select |
| Type | Select |
| Deliverable | Multi-select |
| Status | Select |
| Git Commit | Text |
| Branch | Text |
| Tx Hash | Text |
| Ledger | Number |
| Evidence URL | URL |
| Summary | Text |
| Classification | Select |
| Evidence ID | Text |

6. Type options: Baseline, Development, Test, Validation, Bug, Decision, Milestone. Deliverable: Baseline, D1, D2, D3, Cross-cutting. Status: Planned, In Progress, Blocked, Validated, Completed. Classification: PRE-SPRINT BASELINE / INSTAWARD SPRINT. Week is blank/Baseline for historical records until official dates are known.
7. Paste the Day 0 Markdown into its Baseline row/page. Historical rows have stable Evidence IDs; fill their page bodies from DEV-LOG when desired. Week 1–4 placeholders are Planned, not Completed.
8. Each week copy NOTION-PROGRESS-TEMPLATE.md into a new row, assign actual dates and exact source commit, then record observed test/tx outcomes. Search the Evidence ID before adding/updating to avoid duplicates. CSV re-import is not assumed to be an upsert; edit existing rows or use a reviewed merge workflow.
9. Link GitHub using immutable `/commit/<full-hash>` and `/blob/<full-hash>/<artifact>` URLs. Link txs only to `https://stellar.expert/explorer/testnet/tx/<hash>`. Baseline links are real; draft/WIP artifact URLs remain pending until published.
10. Attach only inspected screenshots/videos without passwords, tokens, personal operator data without consent or signer material. Use public artifact URLs where authorized; never link a local filesystem path as reviewer evidence.
11. Maintain EVIDENCE-INDEX.md as the canonical ledger of claims/criteria. Add expected/actual result, source hash, date/mode and accessible artifact; update tracker and Notion from the same source. Run secret audit before publication.
12. Confirm the agreed sprint start before assigning Week 1 dates. Keep history explicitly baseline. Final package remains Planned until all 23 criteria and required three runs/two recipients/six cases are evidenced.

## Synchronization without credentials

`SYNC-MANIFEST.json` maps stable document keys, content SHA-256, desired page titles, parent keys and optional page IDs. All page IDs are null initially; no remote page or update is implied. After tools are connected, search/reuse page, save its non-secret ID, compare content hashes and update only generated sections; preserve notes/comments/user material. No token or signed XDR is needed in this manifest.

Names for future local configuration, without values: NOTION_PARENT_PAGE_ID / NOTION_DATABASE_ID. They are identifiers, not substitutes for authenticated connector access. Do not put NOTION_TOKEN, API keys or environment dumps into the repository.

## Official reference

[Notion: Import data](https://www.notion.com/help/import-data-into-notion) supports Markdown pages and CSV database import. Confirm current UI and property types after importing. [Notion: Relations and rollups](https://www.notion.com/help/relations-and-rollups) documents relational behavior; this minimal export avoids promising automatic relationship recreation.

## Publication status

Local export is prepared; Notion pages/databases created: 0. Git/tag public access is checked by the freeze procedure; Notion sharing remains a separate manual/connector action. Review the package first; avoid duplicate pages and keep private review credentials separate.

## Formal freeze reference

**HISTORICAL BASELINE:** `252fff88d4c4abbb6986460c12f1766b1ddfb574` — prior direct-contract/Testnet validation.

**FROZEN PRE-SPRINT BASELINE:** annotated tag `pre-instaward-baseline-v1`, created by this freeze procedure. Its commit SHA is resolved from the tag after creation, not guessed or embedded circularly.

Canonical source/index: https://github.com/chrlstl4n2307-ai/Byetery/tree/pre-instaward-baseline-v1

Incomplete helper work is PARTIAL / RESEARCH-SPIKE / NOT VALIDATED. Wallet/QR WIP is archived separately with its base, patch and hashes and is not merged. See FREEZE-CLASSIFICATION.md and BASELINE-MANIFEST.json. This snapshot preserves pre-sprint work; no D1/D2/D3 implementation or new product validation occurred in this freeze. Official sprint start: UNCONFIRMED.
