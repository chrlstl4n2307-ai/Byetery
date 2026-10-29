// @vitest-environment node
import { expect, it, vi } from "vitest";
import { TestnetReviewReader, verifyRows, verifySnapshot } from "@/server/direct-review/chain";
import { fixedEvidenceReview } from "@/server/direct-review/evidence";
import { CONTRACT, DEPLOYMENT, NETWORK_ID, type HistoryRow } from "@/shared/review/model";
import horizon from "./fixtures/direct-review/horizon.json";
import rpc from "./fixtures/direct-review/rpc.json";
import { battery } from "./review-fixture";
const batteryId = "BYE-W1-002-64257020134D4A0F";
const row: HistoryRow = { operationId: "11111111-1111-4111-8111-111111111111", kind: "RECYCLED", status: "CONFIRMED", transactionHash: horizon.hash, ledger: horizon.ledger,
 createdAt: horizon.created_at, updatedAt: null, errorCode: null, revision: 1, payloadHash: null, commitment: null, identityContract: CONTRACT, identityNetwork: NETWORK_ID,
 requestId: "5d48643a8915413ed889dd6aa3f8304d10a8c251e384f528ab5461d6e4c8d78c" };
it("recorded historical body verifies exact hash/ledger/source/contract/function/battery/request", async () => {
 const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json(horizon));
 const v = await new TestnetReviewReader(transport).transaction(row, batteryId); expect(v.status).toBe("VERIFIED"); expect(Number.isFinite(Date.parse(v.verifiedAt))).toBe(true);
 expect(transport.mock.calls[0][0]).toBe("https://horizon-testnet.stellar.org/transactions/" + horizon.hash); expect(transport.mock.calls[0][1]?.redirect).toBe("error");
});
for (const field of ["hash", "ledger", "source_account", "successful"] as const) it("receipt contradiction is MISMATCH: " + field, async () => {
 const modified = { ...horizon, [field]: field === "successful" ? false : field === "ledger" ? horizon.ledger + 1 : "different" };
 const reader = new TestnetReviewReader(vi.fn<typeof fetch>().mockResolvedValue(Response.json(modified)));
 expect((await reader.transaction(row, batteryId)).status).toBe("MISMATCH");
});
it("wrong expected function, battery, request or frozen identity fail closed", async () => {
 for (const [r, id] of [[{ ...row, kind: "COLLECTED" }, batteryId], [row, "WRONG-BATTERY"], [{ ...row, requestId: "00".repeat(32) }, batteryId], [{ ...row, identityContract: "WRONG" }, batteryId]] as [HistoryRow, string][]) {
  expect((await new TestnetReviewReader(vi.fn<typeof fetch>().mockResolvedValue(Response.json(horizon))).transaction(r, id)).status).toBe("MISMATCH");
 }
});
it("unavailable source is UNVERIFIED; retention miss is not success or confirmed failure", async () => {
 expect((await new TestnetReviewReader(vi.fn<typeof fetch>().mockRejectedValue(Error("timeout"))).transaction(row, batteryId)).status).toBe("UNVERIFIED");
 expect((await new TestnetReviewReader(vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 }))).transaction(row, batteryId)).status).toBe("RETENTION_UNAVAILABLE");
 expect((await new TestnetReviewReader(vi.fn<typeof fetch>().mockResolvedValue(Response.json(horizon))).transaction({ ...row, status: "UNKNOWN" }, batteryId)).status).toBe("UNVERIFIED");
});
it("getLedgerEntries only, exact derived keys, public frozen code and current state match", async () => {
 const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json(rpc));
 const v = await new TestnetReviewReader(transport).state({ ...battery, batteryId, deploymentId: DEPLOYMENT }, 5315915); expect(v.status).toBe("VERIFIED");
 const [url, init] = transport.mock.calls[0]; expect(url).toBe("https://soroban-testnet.stellar.org"); expect(init?.redirect).toBe("error");
 const body = JSON.parse(init?.body as string); expect(body.method).toBe("getLedgerEntries"); expect(body.params.keys).toEqual(rpc.result.entries.map(e => e.key));
});
it("archived/missing historical state preserves classification, while RPC errors never mean absent", async () => {
 const reader = new TestnetReviewReader(vi.fn<typeof fetch>().mockResolvedValue(Response.json({ result: { latestLedger: 6000000, entries: [] } })));
 expect((await reader.state(battery, 5315915)).status).toBe("STATE_EXPIRED");
 const unavailable = new TestnetReviewReader(vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: { code: -1 } })));
 expect((await unavailable.state(battery, 5315915)).status).toBe("UNVERIFIED");
});
it("reset requires ledger-anchor contradiction, not merely unchanged passphrase or TTL", async () => {
 const reader = new TestnetReviewReader(vi.fn<typeof fetch>().mockResolvedValue(Response.json({ result: { latestLedger: 100, entries: [] } })));
 expect((await reader.state(battery, 5315915)).status).toBe("NETWORK_RESET");
});
it("bounded history concurrency, stable chronological order, every result timestamped", async () => {
 let active = 0, peak = 0;
 const reader = { transaction: async () => { peak = Math.max(peak, ++active); await new Promise(r => setTimeout(r, 1)); active--; return { status: "UNVERIFIED" as const, reason: "FIXTURE", verifiedAt: new Date().toISOString() }; }, state: async () => ({ status: "UNVERIFIED" as const, reason: "FIXTURE", verifiedAt: new Date().toISOString() }) };
 const rows = Array.from({ length: 8 }, (_, n) => ({ ...row, operationId: String(8 - n), createdAt: new Date(1000 * (8 - n)).toISOString() }));
 const verified = await verifyRows(rows, batteryId, reader); expect(peak).toBeLessThanOrEqual(3); expect(verified[0].operationId).toBe("1"); expect(verified.every(v => !!v.verification.verifiedAt)).toBe(true);
});
it("fixed Evidence V1: original exact bytes VERIFIED; one byte tampered NOT_VERIFIED", () => {
 const e = fixedEvidenceReview(); expect(e.intact.status).toBe("VERIFIED"); expect(e.tampered.status).toBe("NOT_VERIFIED"); expect(e.byteLength).toBe(398); expect(e.limitation).toContain("NO certifica");
});
it("SSR/JSON snapshot uses strongest durable anchor and resets historical receipt labels", async () => {
 const state = vi.fn(async () => ({ status: "NETWORK_RESET" as const, reason: "ANCHOR", verifiedAt: new Date().toISOString() }));
 const transaction = vi.fn(async () => ({ status: "VERIFIED" as const, reason: "RECEIPT", verifiedAt: new Date().toISOString() }));
 const result = await verifySnapshot({ ...battery, confirmedLedger: 1 }, [row], { state, transaction });
 expect(state.mock.calls[0]).toEqual([expect.objectContaining({ batteryId: battery.batteryId }), row.ledger]);
 expect(result.entries[0].verification.status).toBe("NETWORK_RESET"); expect(result.mismatch).toBe(false);
});
it("snapshot preserves TTL uncertainty but flags contradictions for SSR stop / HTTP 503", async () => {
 const reader = { state: async () => ({ status: "STATE_EXPIRED" as const, reason: "TTL", verifiedAt: "2026-10-29T00:00:00Z" }),
  transaction: async () => ({ status: "MISMATCH" as const, reason: "CONTRACT", verifiedAt: "2026-10-29T00:00:00Z" }) };
 expect((await verifySnapshot({ ...battery, confirmedLedger: row.ledger }, [row], reader)).mismatch).toBe(true);
});
