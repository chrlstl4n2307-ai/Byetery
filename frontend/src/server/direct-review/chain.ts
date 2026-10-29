import "server-only";
import { createHash } from "node:crypto";
import { Address, StrKey, Transaction, scValToNative, xdr } from "@stellar/stellar-base";
import { CONTRACT, WASM, PASSPHRASE, NETWORK_ID, type HistoryRow, type Verification, type ReviewBattery } from "@/shared/review/model";
const HORIZON = "https://horizon-testnet.stellar.org";
const RPC = "https://soroban-testnet.stellar.org";
const SOURCE = { REGISTERED: "GBZ4HNGFYAA7FXRYECY4LBSIKSQPJPUFYJZALOWGTXUURNDR5OINUT2F", RECYCLED: "GBIAVN4O4HJSPZJKFPPQZPLPXBELLBGYAJLTEGOGLJG2FRW2C5P35TF2" };
const SERVICE = "GBOOUYTB4MUH3JQUMOQ6LUEALEPUQ5SREYYIJ5WGR26BI3NCVPNG7WIX";
const METHODS = { REGISTERED: "register_battery", RETURNED: "open_return", COLLECTED: "confirm_collection", RECYCLED: "confirm_recycling", REWARD: "pay_reward", CANCELLED: "cancel_return", OTHER: "" };
const fact = (status: Verification["status"], reason: string, confirmedAt?: string): Verification => ({ status, reason, verifiedAt: new Date().toISOString(), ...(confirmedAt ? { confirmedAt } : {}) });
export interface ReviewChain {
 transaction(row: HistoryRow, batteryId: string): Promise<Verification>;
 state(battery: ReviewBattery, anchorLedger: number): Promise<Verification>;
}
/** Fixed official Testnet read endpoints. The fetch dependency is mocked in CI. */
export class TestnetReviewReader implements ReviewChain {
 constructor(private readonly transport: typeof fetch = fetch) {}
 async transaction(row: HistoryRow, batteryId: string): Promise<Verification> {
  if (!row.transactionHash || !/^[0-9a-f]{64}$/.test(row.transactionHash) || row.status !== "CONFIRMED" || !row.ledger)
   return fact("UNVERIFIED", "NO_DURABLE_CONFIRMATION");
  if (row.identityContract !== CONTRACT || row.identityNetwork !== NETWORK_ID) return fact("MISMATCH", "PERSISTED_CONTEXT_MISMATCH");
  try {
   const response = await this.transport(`${HORIZON}/transactions/${row.transactionHash}`, { method: "GET", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(4000) });
   if (response.status === 404) return fact("RETENTION_UNAVAILABLE", "NOT_RETAINED_BY_HORIZON");
   if (!response.ok) return fact("UNVERIFIED", "HORIZON_UNAVAILABLE");
   const v = await response.json();
   if (v.hash !== row.transactionHash || v.successful !== true || v.ledger !== row.ledger || typeof v.envelope_xdr !== "string" || typeof v.created_at !== "string" || !Number.isFinite(Date.parse(v.created_at))) return fact("MISMATCH", "RECEIPT_MISMATCH");
   const tx = new Transaction(v.envelope_xdr, PASSPHRASE);
   const expectedSource = row.kind === "REGISTERED" ? SOURCE.REGISTERED : row.kind === "RECYCLED" ? SOURCE.RECYCLED : SERVICE;
   if (tx.hash().toString("hex") !== row.transactionHash || tx.source !== expectedSource || v.source_account !== expectedSource || tx.operations.length !== 1) return fact("MISMATCH", "TRANSACTION_IDENTITY_MISMATCH");
   const op = tx.operations[0];
   if (op.type !== "invokeHostFunction" || op.func.switch().name !== "hostFunctionTypeInvokeContract") return fact("MISMATCH", "INVOCATION_MISMATCH");
   const call = op.func.invokeContract();
   if (Address.fromScAddress(call.contractAddress()).toString() !== CONTRACT || call.functionName().toString() !== METHODS[row.kind] ||
    call.args().length === 0 || scValToNative(call.args()[0]) !== batteryId) return fact("MISMATCH", "INVOCATION_MISMATCH");
   if (row.requestId && ["RETURNED", "COLLECTED", "RECYCLED", "CANCELLED"].includes(row.kind) &&
    Buffer.from(scValToNative(call.args()[1])).toString("hex") !== row.requestId) return fact("MISMATCH", "REQUEST_CONTEXT_MISMATCH");
   return fact("VERIFIED", "OFFICIAL_RECEIPT_MATCH", v.created_at);
  } catch (e) { return fact(e instanceof SyntaxError ? "MISMATCH" : "UNVERIFIED", e instanceof SyntaxError ? "MALFORMED_RECEIPT" : "HORIZON_UNAVAILABLE_OR_UNSUPPORTED_DATA"); }
 }
 async state(battery: ReviewBattery, anchorLedger: number): Promise<Verification> {
  try {
   const contract = new Address(CONTRACT).toScAddress();
   const keys = [xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({ contract, key: xdr.ScVal.scvLedgerKeyContractInstance(), durability: xdr.ContractDataDurability.persistent() })),
    xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: Buffer.from(WASM, "hex") })),
    xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({ contract, key: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("Battery"), xdr.ScVal.scvString(battery.batteryId)]), durability: xdr.ContractDataDurability.persistent() }))].map(k => k.toXDR("base64"));
   const response = await this.transport(RPC, { method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(4000),
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getLedgerEntries", params: { keys } }) });
   if (!response.ok) return fact("UNVERIFIED", "RPC_UNAVAILABLE");
   const payload = await response.json(), r = payload.result;
   if (payload.error || !r || !Number.isSafeInteger(r.latestLedger) || !Array.isArray(r.entries)) return fact("UNVERIFIED", "RPC_UNAVAILABLE");
   if (anchorLedger > 0 && r.latestLedger < anchorLedger) return fact("NETWORK_RESET", "CURRENT_LEDGER_BELOW_CONFIRMED_ANCHOR");
   const entries = keys.map(k => r.entries.find((e: { key: string }) => e.key === k));
   if (entries.some(e => !e || !Number.isSafeInteger(e.liveUntilLedgerSeq) || e.liveUntilLedgerSeq < r.latestLedger))
    return fact(battery.confirmedBatteryState ? "STATE_EXPIRED" : "UNVERIFIED", battery.confirmedBatteryState ? "HISTORICAL_STATE_NOT_CURRENTLY_LIVE" : "NO_CONFIRMED_STATE");
   const instance = xdr.LedgerEntryData.fromXDR(entries[0].xdr, "base64");
   const code = xdr.LedgerEntryData.fromXDR(entries[1].xdr, "base64");
   const current = xdr.LedgerEntryData.fromXDR(entries[2].xdr, "base64");
   if (instance.switch().name !== "contractData" || code.switch().name !== "contractCode" || current.switch().name !== "contractData") return fact("MISMATCH", "LEDGER_ENTRY_TYPE_MISMATCH");
   if (Address.fromScAddress(instance.contractData().contract()).toString() !== CONTRACT || Address.fromScAddress(current.contractData().contract()).toString() !== CONTRACT ||
    instance.contractData().key().toXDR("base64") !== xdr.ScVal.scvLedgerKeyContractInstance().toXDR("base64") ||
    current.contractData().key().toXDR("base64") !== xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("Battery"), xdr.ScVal.scvString(battery.batteryId)]).toXDR("base64") ||
    code.contractCode().hash().toString("hex") !== WASM) return fact("MISMATCH", "STORAGE_CONTEXT_MISMATCH");
   const executable = instance.contractData().val().instance().executable();
   if (executable.switch().name !== "contractExecutableWasm" || executable.wasmHash().toString("hex") !== WASM || createHash("sha256").update(code.contractCode().code()).digest("hex") !== WASM)
    return fact("MISMATCH", "CONTRACT_CODE_MISMATCH");
   const decoded = scValToNative(current.contractData().val());
   const states: Record<string, string> = { Registered: "REGISTERED", Returned: "RETURNED", Collected: "COLLECTED", Recycled: "RECYCLED" };
   const rewards: Record<string, string> = { NotEligible: "NOT_ELIGIBLE", Pending: "PENDING", Sent: "SENT" };
   if (states[decoded.state?.[0]] !== battery.confirmedBatteryState || rewards[decoded.reward_state?.[0]] !== battery.confirmedRewardState)
    return fact("MISMATCH", "CURRENT_STATE_DIFFERS_FROM_PROJECTION");
   return fact("VERIFIED", "CURRENT_STORAGE_MATCH");
  } catch { return fact("UNVERIFIED", "RPC_UNAVAILABLE_OR_UNSUPPORTED_DATA"); }
 }
}
export async function verifyRows(rows: HistoryRow[], id: string, reader: ReviewChain) {
 const result: (HistoryRow & { verification: Verification })[] = [];
 for (let i = 0; i < Math.min(rows.length, 30); i += 3) result.push(...await Promise.all(rows.slice(i, i + 3).map(async row => ({ ...row, verification: await reader.transaction(row, id) }))));
 return result.sort((a, b) => Date.parse(a.verification.confirmedAt ?? a.createdAt) - Date.parse(b.verification.confirmedAt ?? b.createdAt) || a.operationId.localeCompare(b.operationId));
}
/** The SSR and JSON surfaces use the same current-network guard over historical receipts. */
export async function verifySnapshot(battery: ReviewBattery & { confirmedLedger: number | null }, rows: HistoryRow[], reader: ReviewChain) {
 const [networkVerification, history] = await Promise.all([
  reader.state(battery, Math.max(battery.confirmedLedger ?? 0, ...rows.map(e => e.ledger ?? 0))),
  verifyRows(rows, battery.batteryId, reader),
 ]);
 const entries = history.map(e => ({ ...e, verification: networkVerification.status === "NETWORK_RESET" ? networkVerification : e.verification }));
 return { networkVerification, entries, mismatch: networkVerification.status === "MISMATCH" || entries.some(e => e.verification.status === "MISMATCH") };
}
export function validPublicAddress(address: string) { return StrKey.isValidEd25519PublicKey(address); }
