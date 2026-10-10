# Byetery - Instawards SOW V3.1

30-Day Scoped Engagement | USD 4,900 | Prepared 6 October 2026

## 1. Response to Previous Reviewer Feedback

**DRAFT - NOT READY FOR RESUBMISSION.** This SOW funds integration and verifiable demonstration of the existing Byetery MVP. It does not fund previous development. Repository access is now verified and the builder confirms the Chapter Lead is arranged. Signing readiness, operator interest, the complete baseline index and review logistics remain as previously documented.

| Reviewer Feedback | V3.1 Response | Evidence / Section |
|---|---|---|
| Public access to repository and existing contract evidence. | Repository and historical contract-validation documentation are now publicly accessible. Anonymous checks returned HTTP 200 on 6 October. Complete baseline inventory/index remains pending; no new live contract validation is claimed. | Section 2; public access verified. G1 retains baseline/index completion. |
| D1 was vague and disproportionate. | D1 now funds API/Testnet integration for USD 2,000, with named operations, binary acceptance and six recovery/revocation cases. | Sections 4–5; D1.1–D1.12. |
| Physical receipt/recycling was not externally verified. | Distinguish integrity, authorization and physical veracity. Collection/recycling are attestations; the sprint uses synthetic records and claims no physical verification. | Sections 3 and 8. |
| No real operator was evidenced. | No expression of interest was found in reviewed sources. A named operator’s non-binding expression of interest remains a blocker. A separate request template accompanies V3. | Section 8; gate G3. |
| Similar projects already received funding. | Provide a source-limited comparison with TrustedPlastic and GiveCredit. Coin Conut and EcoTracer remain unidentified; no features are invented. | Section 9; references R3–R4. |
| GREEN-TEST is only a test incentive. | Retain the existing Testnet asset with no stated monetary value. Describe a future battery producer/importer sponsor hypothesis, with no committed payer. | Sections 2, 7 and 8. |
| Explain the path toward SCF Build. | Define future validation targets and evidence to seek; no existing traction or Build approval is claimed. | Section 11. |

**Project/team:** Byetery. **Responsible builder:** Christian Medina, application integration and technical delivery. **Chapter:** Chile. **Contact email:** chr_23@outlook.com. **Chapter Lead:** Confirmed by the builder.

**Request:** three deliverables only: D1 USD 2,000; D2 USD 1,600; D3 USD 1,300. **Duration:** at most 30 calendar days from the agreed start. A start date will be agreed after approval and readiness gates; no award or payment is assumed.

Instawards guidance supports concrete Stellar-related work, clear success criteria and a scope achievable within 30 days. USD 4,900 falls within the usual initial USD 1,000–5,000 range described in the rules, not an assurance of eligibility or funding. Chapter Lead guidance and official award terms govern the process. [R1]

## 2. Public Pre-Sprint Baseline

**Repository access: VERIFIED PUBLIC.** On 6 October 2026 at 18:35 UTC, unauthenticated requests to the repository page, GitHub repository API and the historical validation document at the commit below each returned HTTP 200. GitHub reports private=false. This verifies source/document access, not current deployment availability or new implementation results.

**Repository URL:** https://github.com/chrlstl4n2307-ai/Byetery

**Historical baseline commit:** 252fff88d4c4abbb6986460c12f1766b1ddfb574

**Historical baseline date:** 26 September 2026. **Working-state inspection:** 6 October 2026. This commit is a starting reference, not a complete inventory of all subsequent local work.

**Testnet Contract ID:** CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON

**Existing SAC ID:** CB2RBZCH2DKLB2KFTKKEIDJBK53WKT2FQBQRTAN2JKJVEBAMCDEY6D7G

**Testnet asset:** GREENTEST, display label GREEN-TEST, 7 decimals. **Issuer:** GCHROKHXHL4L635J6Y6DWFFD5DDHABOAF4BP5TEUZDZQMW4XYS6DIDL7

**Configured reward:** 100000000 base units = 10 GREENTEST. No monetary value is stated. Historical identifiers are taken from local validation records; current live availability was not revalidated for this document.

| Classification | Components and evidence |
|---|---|
| ALREADY COMPLETED BEFORE INSTAWARD | Frozen Soroban lifecycle contract; role/state/duplicate guards; historical Testnet deployment and reward demonstration; backend/database/authentication foundation; frontend and QR lookup. |
| PRE-EXISTING LOCAL WORK, NOT NEW FUNDED OUTPUT | Wallet/QR changes in the Desktop checkout; integration/signing investigations; documentation and a compile-only Secure Store spike in the Testnet worktree. Their existence does not prove completed application signing. |
| PROPOSED FUNDED WORK | D1: remaining application adapter, signing integration, persistence and recovery. D2: connected web interfaces and verifier. D3: new sprint runs, negative tests, manifests and reviewer package. |

**Historical documents:** docs/TESTNET-CONTRACT-VALIDATION.md; docs/testnet/validation-2026-09-26.json; docs/testnet/contract-spec.json and supporting payloads. **Design/status sources:** docs/TESTNET-APP-INTEGRATION.md; docs/SECURE-STORE-SIGNING-REVIEW.md; tools/stellar-secure-store-signer/README.md. The historical validation document is publicly accessible at the stated commit. The later local design/status sources are not automatically included in that published snapshot.

**Public evidence index:** no accessible URL established. Before resubmission, publish a baseline index and freeze the exact source snapshot, inventorying uncommitted work across both checkouts. Record any pre-sprint additions explicitly. No work completed before the agreed sprint start may be represented or charged as a new funded deliverable.

## 3. Signing Architecture and Stellar Rationale

**Observed status: SIGNING NOT VALIDATED - BLOCKER BEFORE RESUBMISSION.** The inspected integration worktree has no implemented TestnetStellarService or LocalSecureStoreSigner. Its helper README describes a compile-only spike: it does not open identities, sign, use RPC or submit. Historical CLI contract execution is not proof of this application signing path.

**Single proposed design for this draft, not an implemented result:** backend → TestnetStellarService (SDK preparation/simulation) → local Secure Store signing helper → signed Soroban authorizations and envelope → backend persists transaction identity → RPC → Stellar Testnet. Adopting this design and demonstrating a bounded signing proof are gate G2. This document does not select among multiple wallet alternatives or claim production custody.

**Custody and handling:** existing Testnet identities remain in the builder-controlled Windows Stellar Secure Store. The helper is local development infrastructure, not a public signing endpoint. It must allow only fixed identities, network, contract, methods and invocation arguments, with fee/resource/expiry bounds. No exported private keys, seeds, user-supplied signing identities or secrets in browsers, logs, fixtures or public evidence. The helper returns signed data and cannot submit; the backend owns persistence and submission. Multiple keys under one builder do not establish independent organizations.

| Actor | Historical Testnet public key |
|---|---|
| ADMIN | GBZ4HNGFYAA7FXRYECY4LBSIKSQPJPUFYJZALOWGTXUURNDR5OINUT2F |
| SERVICE | GBOOUYTB4MUH3JQUMOQ6LUEALEPUQ5SREYYIJ5WGR26BI3NCVPNG7WIX |
| COLLECTOR | GB4YAMSPXTDDUD7FNDE72BD3BKW57BEDM7D7HTX6OFWEFRBO65Z3UO6V |
| RECYCLER | GBIAVN4O4HJSPZJKFPPQZPLPXBELLBGYAJLTEGOGLJG2FRW2C5P35TF2 |

**Authorization mapping:** register_battery requires ADMIN; open_return and pay_reward require SERVICE; confirm_collection requires SERVICE plus an enabled COLLECTOR; confirm_recycling requires an enabled RECYCLER. ADMIN controls collector/recycler role grants and revocation. The human holder requests actions through authenticated application access; SERVICE is technical.

**Signing distinction:** when SERVICE is transaction source, its envelope signature can satisfy source-account authorization; the additional COLLECTOR authorization must be signed as a Soroban auth entry. Two envelope signatures or a wallet-login signature do not substitute for that entry. Recording-mode simulation alone does not validate signatures; enforcing validation and confirmed Testnet outcomes provide the acceptance evidence. [R2]

**Why Stellar:** an operational database still stores accounts and full records. Soroban adds independently inspectable authorization, attested state and commitments; the existing SAC supports conditional transfers. A third party can check a disclosed record against the recorded commitment without trusting only a Byetery database edit. Demand for this cross-organization verification remains a product hypothesis to validate with an operator.

## 4. D1 - Reliable Application-to-Soroban Testnet Integration

**Budget: USD 2,000. Completion gate: Day 14.** Integrate the existing API and frozen contract for register_battery, open_return, confirm_collection, confirm_recycling and pay_reward. Fund remaining implementation only, including the selected signing path once gate G2 is satisfied.

Work includes the Testnet adapter, role-aware authorization, an additive persistence migration, durable transaction identity before broadcast, result verification, bounded recovery and reconciliation. Preserve existing domain logic and access restrictions. No new contract, token or functional expansion is included.

| Criterion | Test | Expected result | Evidence |
|---|---|---|---|
| D1.1 Five API operations | Execute all five named methods with fresh IDs. | Each succeeds with its authorized actor and confirmed Testnet result. | API transcript; five operation/result links. |
| D1.2 Authorization | Attempt each restricted operation with an incorrect actor; test collection missing either required authorization. | All unauthorized attempts rejected; SERVICE + COLLECTOR succeeds. | Negative-test report; positive collection hash and auth detail. |
| D1.3 Confirmation | Delay, lose or fail the RPC response before observing success. | Application remains unconfirmed until SUCCESS is verified; a failed transaction never appears confirmed. | State assertions; RPC/result capture. |
| D1.4 Traceability | Inspect every submitted operation. | Operation ID, network, contract and transaction hash correlate; confirmed records include ledger/result. | Persisted operation export with sanitized fields. |
| D1.5 Idempotency | Repeat an identical request; reuse its idempotency key with changed parameters. | Identical request returns the same logical operation; changed parameters rejected. One valid effect per intended transition. | API/database assertions and chain-state reads. |
| D1.6 Reward guard and reproducibility | Request a second reward; rerun tests at the recorded commit. | No second successful payment or additional reward balance change. Exact commit and commands reproduce expected results. | Reward result/balances; test manifest. |

**Recovery criteria D1.7–D1.12** are defined in Section 5 and are part of D1, not a separate deliverable. D1 is complete only when all twelve criteria pass and its evidence is accessible.

**Planned Evidence of Completion:** public baseline and final commit/tag; existing Contract ID; API examples; Testnet hashes and result records; automated integration/authorization/recovery tests; sanitized operation-state exports; runbook and commands. Link each item through Section 12’s index. Tests record exact commit, date, environment and actual outcome.

**Prerequisites:** usable existing Testnet deployment and actor identities, sufficient Testnet fee/reward balances, recipient trustlines where required and a validated signing path. If unavailable, report the blocked dependency; do not silently substitute mock success or introduce another deployment/asset within this SOW.

## 5. D1 Acceptance Matrix for Recovery and Revocation

These tests exercise the application around RPC using controlled interruption or a fault-injection fixture. Clearly distinguish simulated transport faults from transactions actually confirmed on Testnet. Existing contract tests can support regression checks but cannot substitute for the new application recovery evidence.

| Criterion | Test | Expected result | Evidence |
|---|---|---|---|
| D1.7 A - Before submit | Interrupt after transaction identity is durable but before broadcast. Restart and resume by logical operation ID. | No pre-submit chain effect; recovery retains one logical operation and at most one valid intended effect. | Before/after durable record; submit trace; chain read. |
| D1.8 B - Lost response | Broadcast, then suppress the submit response. | Mark unresolved; look up the persisted hash. Confirm if SUCCESS is found; no blind replacement transaction. | Lost-response fixture; original hash/result; state transition log. |
| D1.9 C - RPC outage | Make RPC temporarily unavailable, then restore it. | Preserve operation and uncertainty; fail visibly without false confirmation. Resume reconciliation when reachable. | Outage/recovery assertions; sanitized errors. |
| D1.10 D - Restart | Restart with durable SUBMITTED or UNKNOWN operation. | Recover the same operation and hash; reconcile without losing or duplicating its effect. | Restart test and record comparison. |
| D1.11 E - Unresolved lookup | Return NOT_FOUND/unknown after an uncertain submission. | Remain unresolved; no automatic replacement envelope. Any permitted rebroadcast uses the same signed transaction identity and is recorded. | Reconciliation trace; envelope/hash identity; state read. |
| D1.12 F - Revoked role | Disable an existing collector/recycler role in an isolated authorized test fixture, then attempt its restricted operation. | Revoked actor rejected; no lifecycle advancement or reward. Restore test configuration where applicable. | Role-state fixture; rejection and unchanged-state assertions. |

**Safety criterion:** one valid contractual effect for each intended lifecycle transition, and exactly one successful reward per eligible lifecycle. Multiple transport attempts may occur; the acceptance claim is not “a transaction is never transmitted twice.” Reuse of the same signed transaction is distinguished from constructing a new transaction.

**State handling:** SUBMITTED and UNKNOWN are application transport states. Confirmed application projections require a verified Stellar SUCCESS and corresponding domain result. Network errors and NOT_FOUND are not proof of contractual failure. Do not mutate the attested lifecycle or reward to a successful state based solely on request acceptance.

**Reconciliation boundary:** document attempt limits, retry/backoff configuration, unresolved-operation visibility and operator recovery steps as part of D1. No general job platform or new dispute system is required. If a new envelope is ever justified after a definitively expired/failed transaction, require a documented state check and authorization; never replace an uncertain transaction blindly.

**Gate evidence:** test report contains six explicit case IDs, pass/fail assertions, exact commit and artifact links. A human-readable summary explains how to reproduce at least one interruption without accessing private keys. No live role changes or failure injection have been executed in preparing this SOW.

## 6. D2 - Connected Byetery Web MVP & Verification Interface

**Budget: USD 1,600. Completion gate: Day 21.** Connect the existing interface to D1. Show **attested lifecycle state**, transaction status and reward state separately. All demo records are labeled “Synthetic Testnet demonstration.” SERVICE remains a technical actor.

| Human interface | Reviewer action and boundary |
|---|---|
| User / Holder | ID/QR lookup, return request, history and reward; no collection/recycling confirmation or privileged payment. |
| Administrator | Register a synthetic battery and inspect results. Reuse existing controlled role administration; no new management product. |
| Collection Point | Confirm an eligible collection with COLLECTOR + SERVICE; reject unauthorized/revoked actors. |
| Recycler | Attest synthetic recycling for an eligible collected request, subject to transition guards. |

| Criterion | Test | Expected result | Evidence |
|---|---|---|---|
| D2.1 Roles | Exercise four interfaces and prohibited actions. | Allowed actions succeed; forbidden actions rejected by server/contract, not merely hidden. | Permission matrix; UI/API test report. |
| D2.2 QR lookup | Open known ID/QR as permitted user; attempt a privileged action with QR only. | Correct record retrieved; QR grants no authority. | QR fixture; lookup/rejection trace. |
| D2.3 State display | Observe pending, uncertain, confirmed and failed operations. | Attested state, transaction and reward remain distinct; no false successful status. | State fixtures; screenshots and video. |
| D2.4 History | Inspect each confirmed operation. | Timeline exposes the correct Testnet transaction reference and result. | UI-to-manifest mapping. |
| D2.5 Integrity | Verify a disclosed record, then alter its bytes. | Intact passes; altered fails against the same commitment. | Versioned fixtures; verifier steps/output. |
| D2.6 Review access | Follow the supplied review instructions. | Evaluator can access all four test roles and run the documented checks without receiving signing keys. | Access instructions; working demo; access test. |

**Proposed demo access:** deliver a reviewable URL in D2, available through Day 30 and for 14 calendar days after handoff. If the local signer requires the builder’s host, agree review windows/timezone and disclose downtime. Hosting and access feasibility remain gate G4; no deployment or production SLA is claimed.

Share test-role invitations/temporary credentials privately with the evaluator, never in the public index. Use synthetic data and revoke access after the agreed window. Browsers cannot receive keys or select arbitrary signer identities.

**Planned Evidence of Completion:** URL/instructions, role tests, QR, timeline links, verifier fixtures, video/screenshots and exact commit. Preserve SHA-256/XDR encoding of BYETERY_EVIDENCE_V1, network ID, contract and Evidence; disclose sanitized record bytes for recomputation.

## 7. D3 - Authorized Lifecycle & Testnet Reward Demonstration

**Budget: USD 1,300. Completion gate: Day 30.** Execute three new synthetic lifecycles through the connected MVP, across at least two recipient wallets: **Register → Return → Collect → Recycle → Reward**. Use fresh run-specific battery IDs and request IDs. No physical recycling is asserted.

| Criterion | Required result and planned evidence |
|---|---|
| D3.1 Three complete runs | Three distinct IDs complete all five operations; at least two recipient wallets. Each has UI/API evidence and confirmed Testnet references. |
| D3.2 Conditional reward | Exactly one successful payment of 10 GREEN-TEST per eligible lifecycle. Recycling sets Pending; SERVICE separately requests payment; only successful payment yields Sent. |
| D3.3 Six negative cases | Unauthorized recycler, altered record, early reward, duplicate reward, invalid transition and uncertain-response reconciliation all produce the specified rejection or unresolved/recovered result. |
| D3.4 Manifests and integrity | Complete per-operation manifests for each lifecycle; disclosed records recompute to the commitment. Reward before/after balances correlate with the payment result. |
| D3.5 Final handoff | Exact final commit, passing acceptance results, reviewer instructions and final demo video covering successful and negative flows. Clearly labeled new sprint evidence. |

**Lifecycle manifest:** JSON/CSV rows per operation, grouped by lifecycle, with a readable summary:

| Field group | Required fields and interpretation |
|---|---|
| Identity | Battery ID; Request ID; Actor / public address; Operation; all required collection authorizers. For registration before request creation, mark Request ID not applicable. |
| Transaction | Tx hash; Ledger; Result. If rejection occurs before submission, use “not submitted” and no hash/ledger; attach rejection evidence. Never fabricate transaction references. |
| Reward | Recipient; Asset (code + issuer + SAC); Reward amount; Balance before; Balance after. Record exact base units and display units for the GREENTEST asset. |
| Evidence | Commitment/evidence reference; fixture link; commit; date; environment; PRE-SPRINT BASELINE or INSTAWARD SPRINT EVIDENCE label. |

Use the existing asset in Section 2: three successful runs total 30 GREEN-TEST. Verify each transfer separately; balances alone do not prove lifecycle causality. Capture asset balances immediately around each payment and disclose other activity.

**Historical Testnet evidence** from 26 September proves only the earlier baseline. **New sprint completion evidence** must come from the delivered application after sprint start, with fresh IDs and dates. Historical hashes, videos or tests cannot be relabeled as new integration.

**Planned Evidence of Completion:** three manifests, result exports, balances, six negative-case reports, verifier outputs, exact commit, reproduction steps and final video. Uncertainty tests reuse D1 recovery; no extra deliverable.

## 8. Real-World Verification Model and Operator Status

**Operational model to validate:** Holder → Collection Point → Recycler. A collection point issues a receipt attestation; a recycler issues a processing/recycling attestation. Full supporting records remain off-chain. Stellar anchors the corresponding commitment and records authorized transitions and reward state.

| Assurance | What is demonstrated | What is not demonstrated |
|---|---|---|
| Integrity | Disclosed bytes match a context-bound recorded commitment. | A false document does not become true because its hash matches. |
| Authorization | Required configured identities approved an operation under contract rules. | Keys do not prove independent organizations, legal authority or professional licensing. |
| Physical Veracity | Depends on a real operator and reviewable real-world evidence. | Blockchain alone does not prove existence, weight, receipt or physical recycling. The sprint uses synthetic examples. |

Later operator records should identify organization, responsible person, battery/batch, event, date and supporting documents. Agree appropriate evidence with that operator; no hardware or certification is included. Conflicting records may be held for application review before submission; the frozen contract gains no oracle, dispute or physical-verification mechanism.

Residual risks: **false declaration, actor collusion and falsified supporting evidence**. Unique IDs do not prevent relabeling a physical battery. Revocation limits future actions, not the truth of earlier statements. A blockchain role does not prove legal authorization to recycle batteries.

### 8.1 Operator or Partner

**BLOCKER BEFORE RESUBMISSION:** no signed or otherwise attributable expression of interest was found in the reviewed materials. No partnership, deployment, commercial agreement or confirmed pilot is claimed.

Required evidence: organization, consenting contact, problem, collection/recycler role, workflow and possible records. Label a **non-binding expression of interest** only as such. Obtain permission to publish contact details. The separate request template is not an executed letter; this task contacted nobody.

### 8.2 Incentive Model

**Current state:** GREEN-TEST is an existing technical Testnet demonstration asset with no stated monetary value. There is **no committed payer** for real-world incentives.

**Future hypothesis:** a battery producer/importer sponsoring a take-back program → prefunds an incentive pool → defines eligibility and reward size → receives authorized recycling attestations and agreed supporting evidence → releases the reward under agreed rules. This identifies a target sponsor category, not an existing sponsor or commitment. Production economics, funding and implementation are outside this sprint.

**Validation method:** interview an operator and a prospective producer/importer sponsor, review the workflow, test willingness to fund and document the proposed value, costs and conditions. A token transfer alone does not demonstrate sustainable incentives or increased recycling.

## 9. Differentiation and Verified Prior Art

Byetery’s proposed positioning is **battery-specific identity + authorized lifecycle attestations + chain-of-custody records + off-chain evidence commitments + conditional incentive**. This is a product differentiation hypothesis, not a claim of absolute uniqueness or superior environmental performance.

The comparison below uses sources retrieved through Stellar Raven on 6 October 2026. “Not established” means the reviewed evidence does not answer the question; it does not mean the project lacks that feature. Funding history does not prove present operation or feature completeness.

| Project / domain | Traceability and evidence model supported by sources | Reward / incentive supported by sources | Byetery distinction or limit |
|---|---|---|---|
| Byetery / batteries | Proposed connected MVP: identified batteries, authorized custody attestations, context-bound off-chain record commitments; synthetic Testnet demonstration. | Existing GREENTEST asset; 10 units after eligible lifecycle; no real payer. | Battery type/batch context and inspectable custody workflow; operator demand unvalidated. |
| TrustedPlastic / plastic waste [R3] | SCF #22 awarded submission describes enabling plastic collection through transparency. Detailed attestation/verification design not established by the retrieved record. | Reward mechanism not established by the retrieved record. | Battery workflow is a different focus. Do not claim TrustedPlastic lacks rewards, commitments or verification features. |
| GiveCredit / environmental funding [R4] | SCF #28 awarded submission describes carbon-offset donations automated by Soroban; product narrative describes donation flows and carbon-credit retirement. | Donations fund environmental action; this is not evidence of a battery-return reward system. | Byetery proposes battery custody and a lifecycle-conditioned test reward rather than donation-driven carbon retirement. No broad feature-absence claim. |
| Coin Conut / identity unconfirmed | No unambiguous match in Raven Scout or LumenLoop directory searches. Semantic neighbors were discarded. | Not established. | Obtain canonical reference from reviewer before comparison; no claim of nonexistence. |
| EcoTracer / identity unconfirmed | No unambiguous match in the same two Raven sources. Semantic neighbors were discarded. | Not established. | Obtain canonical reference from reviewer; no invented funding history or capabilities. |

**Specific need to validate:** a collection point and recycler may need to reconcile who attested receipt/processing, which supporting record version was used and whether the associated reward was already paid. Stellar can expose those checks beyond the application database. If all actors remain controlled by one operator and nobody needs independent verification, a conventional database may be sufficient; the operator evaluation must test the added value.

The response to the reviewer should attach verified references and explicitly request the two unresolved project links. The missing identities cannot be filled using similarly named projects. No novelty, adoption, physical-verification or licensing claim is inferred from the local prototype.

## 10. Deliverable Budget and Execution Plan

**Fixed deliverable total: USD 4,900.** No hourly rate is asserted. Costs fund only future work remaining after the published baseline, not reimbursement for the contract, previous frontend/backend, historical validation, wallet/QR changes or signing investigations already performed.

| Deliverable | Fixed allocation | Work supporting the allocation |
|---|---|---|
| D1 - Integration | USD 2,000 | Highest integration risk: signing, adapter, durable persistence, multi-auth, reconciliation and recovery. Reuses existing contract/domain logic. |
| D2 - Web and verification | USD 1,600 | Connect existing role interfaces, timeline, verifier, transaction links and evaluator access. No complete redesign or new wallet product. |
| D3 - Demonstration | USD 1,300 | Execute three E2E runs and negative tests; produce manifests, final video/documentation and corrections. Existing contract tests are not billed again. |
| TOTAL | USD 4,900 | Fixed deliverable-based request; no reimbursement for prior work. |

**Responsible builder:** Christian Medina for D1–D3. The proposal is priced against deliverables and acceptance gates. No hourly rate, personal working schedule or dedicated-hour commitment is included. No additional team member or funded subcontractor is assumed. **Demo review-access logistics:** [USER CONFIRMATION REQUIRED].

**Assumptions:** existing contract and code are reusable; no production deployment; no new asset/contract; Testnet accounts and existing reward pool remain usable; a viable signing path is validated before submission; test/demo hosting uses an agreed low-cost arrangement within the fixed budget. No invoice amount or infrastructure availability is represented as known. Resolve blocked prerequisites before accepting the sprint; preserve the Day 27–29 correction window.

| Period | Work and acceptance gate | Completion evidence |
|---|---|---|
| Days 1–14 | D1 signing implementation, Testnet adapter, persistence, multi-auth, reconciliation and failure recovery. D1 complete only when D1.1–D1.12 pass. | Confirmed API operations, hashes and recovery/authorization report. |
| Days 15–21 | D2 frontend integration, four roles, verifier, transaction references and evaluator access. D2.1–D2.6 pass. | Reviewable web demo, role/record fixtures and instructions. |
| Days 22–30 | D3: three E2E runs, negative tests and manifests on Days 22–26. Reserve Days 27–29 for defects, focused retests and evidence corrections. Day 30 final video, documentation and handoff. | D3.1–D3.5 pass; final evidence index and exact commit. |

D2 depends on D1; D3 depends on both. An unresolved Day 14 gate is a schedule risk to report immediately, not permission to replace Testnet with mock evidence. This allocation defines deliverable costs, not SDF’s disbursement schedule. Award/payment terms are agreed with the program separately. [R1, R5]

## 11. Post-Instaward Validation Path and Scope Boundaries

After the technical sprint, Byetery would seek real-world validation before considering SCF Build. No Build invitation, award, adoption or current traction is promised. The following are **PROPOSED TARGET - USER/OPERATOR TO CONFIRM**, not additional funded deliverables or existing results.

| Future measure | Proposed target or decision to confirm | Evidence to seek |
|---|---|---|
| Participating operator | At least one identified operator interested in reviewing the flow. | Attributable consent/interest and defined role. |
| Pilot period and volume | Agree a bounded period and battery/batch count with the operator before starting. | Dated pilot plan and observed records; no volume invented here. |
| Supporting evidence | Define required fields and an agreed completeness threshold. | Complete/total records and reasons for missing evidence. |
| Integrity verification | Record intact passes, mismatches and total verified records. | Recomputable commitments and measured pass rate. |
| Reconciliation and duplicates | Measure unresolved/failed reconciliation and duplicate successful rewards; target zero duplicate payments. | Operation logs, denominator and observation window. |
| Operator feedback | Obtain documented workflow/usability feedback from the participating operator. | Interview notes or review statement with permission. |
| Incentive funding | Test willingness to fund with a prospective producer/importer sponsor and record a yes/no/conditional response. | Sponsor interview and funding conditions, not a claimed commitment. |

Before a Build application, present measured outcomes, operator feedback, remaining technical risks and evidence on the sponsor hypothesis. Select the appropriate Build path based on then-current requirements. Instaward technical demonstrations are not automatically product-market fit. [R6]

### 11.1 Out of Scope

Mainnet; a new smart contract or new token; production token economics; public token sale; exchange listing; production USDC; custody service; native mobile application; marketplace; IoT; NFC; RFID; oracles; hardware; industrial integration; nationwide deployment; carbon credits; NFTs; environmental/legal certification; physical audits; production incentive funding; production SLAs; commercial logistics or processing services.

Existing contract rules remain frozen. The signer is limited local/Testnet integration infrastructure, not a production custody product. Future operator/sponsor validation does not expand the three deliverables or USD 4,900 request. Any required change of contract, deployment or asset is outside the approved scope and must be resolved before relying on it.

### 11.2 AI Transparency

AI tools may assist development and documentation; this V3.1 was prepared with AI assistance. The builder reviews changes, executes the required tests, validates reported results and remains responsible for all deliverables and claims. AI-generated output is not completion evidence until checked against reproducible artifacts.

## 12. Public Evidence Index and Completion Review

The builder will maintain one public index with two explicitly separate collections: **PRE-SPRINT BASELINE** and **INSTAWARD SPRINT EVIDENCE**. Publish the baseline before resubmission. Add new completion artifacts during the sprint; do not relabel historical proof.

| Field for each acceptance criterion | Required content |
|---|---|
| Deliverable | D1, D2 or D3; no fourth deliverable. |
| Criterion | Stable ID: D1.1–D1.12, D2.1–D2.6, D3.1–D3.5. |
| Artifact | Test result, operation/manifest export, disclosed record, UI/video or reproduction instructions. |
| Expected result | The binary result in the corresponding matrix. |
| Actual result | Not executed, PASS, FAIL or BLOCKED, with reason. Never pre-fill a successful result. |
| Commit | Exact source commit and any test/fixture version necessary to reproduce. |
| Date | Execution timestamp, timezone and baseline/sprint classification. |
| Environment | Network, contract/SAC, tool versions and whether any fault was simulated. |
| Link | Direct accessible artifact link; sanitized evidence only. Private demo access delivered separately. |

**Index structure:** overview and source snapshot; historical contract validation; D1 integration/recovery; D2 web/verifier; D3 manifests/video; limitations and reproduction steps. Each criterion must point to a specific result, not merely the repository homepage.

**Reviewer procedure:** open the baseline and final code, check the exact commit, follow a fresh-ID scenario, correlate API/UI operations with result records, recompute intact/altered fixtures and inspect the negative-case reports. Test-role access must work without exposing signer keys. Mark unsupported criteria BLOCKED rather than complete.

**Persistence of evidence:** archive non-sensitive transaction/result records, ledger numbers, asset identity, canonical fixtures and dates alongside live Testnet links. This preserves historical evidence if Testnet resets; it does not guarantee the old deployment remains usable. Do not silently redeploy or create assets to repair a reset under this SOW.

**Completion rule:** all 23 acceptance IDs must pass, including the specified operations, role checks, recovery cases and D3 negative tests. The counts summarize criteria, not the number of individual tests. D3 contains at least three successful lifecycle manifests and six negative-case reports. Failed or unexecuted criteria remain visible and cannot be satisfied by screenshots of a different version.

**Public-access state today:** repository and historical validation documentation are verified accessible anonymously. A complete public evidence index remains pending. No demo URL, new sprint hash, new manifest result or final-test PASS is invented in V3.1; these are future outputs.

## 13. Open Fields and Sources

**Resubmission recommendation: NO.** The draft must not be labeled “final for submission” until G1–G4 are closed with evidence. The remaining source clarification in G5 must be disclosed rather than invented.

| Gate / open field | Current state and closure requirement |
|---|---|
| G1 Public baseline and index | Repository and historical validation document verified public (HTTP 200). Complete the exact pre-sprint snapshot, inventory prior local work and publish the baseline index URL. |
| G2 Signing and existing deployment readiness | Proposed local Secure Store design is unimplemented/unvalidated. Confirm one architecture with source, exact commit and bounded auth/envelope proof; verify existing deployment/identities are usable. No secret export or new contract/asset is assumed. |
| G3 Operator interest | BLOCKER BEFORE RESUBMISSION. Obtain an attributable non-binding expression of interest identifying organization, consenting contact, problem, role, workflow and possible evidence. |
| G4 Submission and review logistics | Chapter Lead confirmed by the builder; email is chr_23@outlook.com. Demo review-access logistics remain pending in Section 10. |
| G5 Competitor references | Coin Conut and EcoTracer not identified. Ask reviewer for canonical links; keep comparison explicitly unverified until sourced. |

**Open-field audit:** only demo review-access logistics retain a user-confirmation marker (Section 10). Chapter Lead is confirmed and public repository access is verified. Baseline-index/signing/operator gaps remain visible gates. Future pilot targets remain subject to confirmation; demo URL and sprint results are future outputs. The V3 audit is historical and predates these two updates.

### 13.1 References

Stellar Raven retrieval: 6 October 2026. Sources observed 6 October (R1/R2/R5/R6) and 5 October (R3/R4). Scout/LumenLoop semantic neighbors were discarded for unresolved identities. Sources support facts; drafting and readiness judgments are the author’s analysis.

[R1] Instawards Official Rules: https://stellar.gitbook.io/scf-handbook/scf-awards/instawards/official-rules

[R2] Stellar Transaction Simulation, authorization and multi-party examples: https://developers.stellar.org/docs/learn/fundamentals/contract-development/contract-interactions/transaction-simulation

[R3] TrustedPlastic, SCF #22 submission: https://communityfund.stellar.org/submissions/recdFUWjyYR7VoqYC

[R4] GiveCredit, SCF #28 submission: https://communityfund.stellar.org/submissions/recjpO5HRcHKL3QhH

[R5] Build budget guidance, not Instaward tranche rules: https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/budget-and-deliverable-guidelines

[R6] Build Open Track, for future-path context only: https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/open-track

Local sources: Sections 2–3. Anonymous GitHub checks were separate from Raven. No Stellar/SDF/Instawards endorsement is claimed.
