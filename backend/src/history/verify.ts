import {
  Address,
  Networks,
  Transaction,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import type { HistoryEntry, HistoryKind, HistoryRow } from "./model.ts";
import { NETWORK_ID } from "../testnet/identity.ts";
import { TESTNET_RPC } from "../testnet/rpc.ts";

export interface HistoryReceipt {
  status: "SUCCESS" | "FAILED" | "NOT_FOUND";
  txHash?: string;
  ledger?: number;
  createdAt?: string;
  envelopeXdr?: string;
  resultXdr?: string;
}
export interface HistoryChainReader {
  network(): Promise<{ passphrase: string }>;
  transaction(hash: string): Promise<HistoryReceipt>;
}
/** Read methods only. No signer, simulation, preparation, send, worker or retries. */
export class RpcHistoryReader implements HistoryChainReader {
  readonly transport: typeof fetch;
  constructor(transport: typeof fetch = fetch) {
    this.transport = transport;
  }
  private async read(method: "getNetwork" | "getTransaction", params: object) {
    const response = await this.transport(TESTNET_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      redirect: "error",
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok || !response.body) throw Error("HistoryReadUnavailable");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) {
        await response.body.cancel().catch(() => {});
        throw Error("HistoryReadUnavailable");
      }
      chunks.push(chunk);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (body.jsonrpc !== "2.0" || body.id !== 1 || body.error || !body.result)
      throw Error("HistoryReadUnavailable");
    return body.result;
  }
  async network(): Promise<{ passphrase: string }> {
    const r = await this.read("getNetwork", {});
    return { passphrase: r.passphrase };
  }
  async transaction(hash: string): Promise<HistoryReceipt> {
    if (!/^[0-9a-f]{64}$/.test(hash)) throw Error("InvalidHistoryHash");
    const r = await this.read("getTransaction", { hash });
    if (!["SUCCESS", "FAILED", "NOT_FOUND"].includes(r.status))
      throw Error("HistoryReadUnavailable");
    // Envelope/result exist only within this server-side verifier; never serialize them.
    return {
      status: r.status,
      txHash: r.txHash,
      ledger: r.ledger,
      createdAt: r.createdAt,
      envelopeXdr: r.envelopeXdr,
      resultXdr: r.resultXdr,
    };
  }
}
const methods: Partial<Record<HistoryKind, string>> = {
  REGISTERED: "register_battery",
  RETURNED: "open_return",
  COLLECTED: "confirm_collection",
  RECYCLED: "confirm_recycling",
  REWARD: "pay_reward",
  CANCELLED: "cancel_return",
};
export async function verifyHistoryRow(
  row: HistoryRow,
  batteryId: string,
  contract: string,
  chain: HistoryChainReader,
  networkVerified: boolean,
): Promise<HistoryEntry> {
  const entry: HistoryEntry = {
    operationId: row.id,
    kind: row.kind,
    category: row.kind === "REWARD" ? "REWARD" : "LIFECYCLE",
    persistedState: row.state,
    recordedAt: new Date(row.created_at).toISOString(),
    confirmedAt: null,
    transactionHash:
      row.transaction_hash && /^[0-9a-f]{64}$/.test(row.transaction_hash)
        ? row.transaction_hash
        : null,
    ledger: null,
    verification: "UNVERIFIED",
    chainResult: null,
    reason: null,
  };
  function unverified(reason: string) {
    entry.reason = reason;
    return entry;
  }
  if (!entry.transactionHash) return unverified("MISSING_TRANSACTION_HASH");
  if (row.identity_network !== NETWORK_ID || row.identity_contract !== contract)
    return unverified("PERSISTED_IDENTITY_MISMATCH");
  if (!methods[row.kind]) return unverified("UNSUPPORTED_EVENT");
  if (!networkVerified) return unverified("NETWORK_UNVERIFIED");
  try {
    const receipt = await chain.transaction(entry.transactionHash);
    if (receipt.status === "NOT_FOUND")
      return unverified("NOT_FOUND_OR_OUTSIDE_RETENTION");
    if (
      receipt.txHash !== entry.transactionHash ||
      !receipt.envelopeXdr ||
      !receipt.resultXdr
    )
      return unverified("INCOMPLETE_RECEIPT");
    const tx = new Transaction(receipt.envelopeXdr, Networks.TESTNET);
    if (Buffer.from(tx.hash()).toString("hex") !== entry.transactionHash)
      return unverified("TRANSACTION_HASH_MISMATCH");
    const envelope = tx.toEnvelope();
    if (
      envelope.type !== "envelopeTypeTx" ||
      envelope.v1.tx.operations.length !== 1
    )
      return unverified("INVOCATION_MISMATCH");
    const op = envelope.v1.tx.operations[0].body;
    if (
      op.type !== "invokeHostFunction" ||
      op.invokeHostFunctionOp.hostFunction.type !==
        "hostFunctionTypeInvokeContract"
    )
      return unverified("INVOCATION_MISMATCH");
    const call = op.invokeHostFunctionOp.hostFunction.invokeContract;
    if (
      Address.fromScAddress(call.contractAddress).toString() !== contract ||
      call.functionName.toString() !== methods[row.kind] ||
      call.args.length === 0 ||
      scValToNative(call.args[0]) !== batteryId
    )
      return unverified("INVOCATION_MISMATCH");
    const success =
      xdr.TransactionResult.fromXDR(receipt.resultXdr, "base64").result.type ===
      "txSuccess";
    if ((receipt.status === "SUCCESS") !== success)
      return unverified("RESULT_MISMATCH");
    if (
      !Number.isSafeInteger(receipt.ledger) ||
      receipt.ledger! <= 0 ||
      !/^\d+$/.test(receipt.createdAt ?? "")
    )
      return unverified("INCOMPLETE_RECEIPT");
    if (
      row.confirmation_ledger !== null &&
      Number(row.confirmation_ledger) !== receipt.ledger
    )
      return unverified("CONFIRMATION_LEDGER_MISMATCH");
    entry.ledger = receipt.ledger!;
    entry.confirmedAt = new Date(
      Number(receipt.createdAt) * 1000,
    ).toISOString();
    entry.chainResult = success ? "SUCCESS" : "FAILED";
    if (!success) return unverified("CHAIN_FAILED");
    if (row.state !== "CONFIRMED") return unverified("SQL_NOT_CONFIRMED");
    entry.verification = "CONFIRMED";
    return entry;
  } catch {
    return unverified("CHAIN_READ_UNAVAILABLE");
  }
}
async function within<T>(work: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(Error("HistoryBudgetExceeded")),
          Math.max(1, milliseconds),
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export async function verifyHistory(
  rows: HistoryRow[],
  batteryId: string,
  contract: string,
  chain: HistoryChainReader,
  budgetMs = 12000,
) {
  const deadline = Date.now() + budgetMs;
  let networkVerified = false;
  if (budgetMs > 0 && rows.some((r) => r.transaction_hash))
    try {
      networkVerified =
        (await within(chain.network(), Math.min(5000, budgetMs))).passphrase ===
        Networks.TESTNET;
    } catch {}
  // Small bounded batches; no transaction is held while waiting for a provider.
  const entries: HistoryEntry[] = [];
  for (let i = 0; i < rows.length; i += 5) {
    const batch = rows.slice(i, i + 5),
      remaining = deadline - Date.now();
    if (remaining > 0)
      try {
        entries.push(
          ...(await within(
            Promise.all(
              batch.map((r) =>
                verifyHistoryRow(
                  r,
                  batteryId,
                  contract,
                  chain,
                  networkVerified,
                ),
              ),
            ),
            remaining,
          )),
        );
        continue;
      } catch {}
    const unchecked = await Promise.all(
      batch.map((r) => verifyHistoryRow(r, batteryId, contract, chain, false)),
    );
    for (const entry of unchecked)
      if (entry.reason === "NETWORK_UNVERIFIED")
        entry.reason = "VERIFICATION_BUDGET_EXHAUSTED";
    entries.push(...unchecked);
  }
  return entries;
}
