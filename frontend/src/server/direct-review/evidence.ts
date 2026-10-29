import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { Address, xdr } from "@stellar/stellar-base";
import disclosure from "./data/evidence-v1.json";
import { CONTRACT, NETWORK_ID } from "@/shared/review/model";
/** Same frozen V1 wire encoding, isolated from backend runtime. Fixed disclosure only. */
function integrity(bytes: Uint8Array) {
 const symbol = (v: string) => xdr.ScVal.scvSymbol(v), hash = (v: string) => xdr.ScVal.scvBytes(Buffer.from(v, "hex"));
 const payloadHash = createHash("sha256").update(bytes).digest("hex");
 const fields: [string, xdr.ScVal][] = [["battery_id", xdr.ScVal.scvString(disclosure.batteryId)], ["kind", xdr.ScVal.scvVec([symbol("Recycling")])],
  ["payload_hash", hash(payloadHash)], ["request_id", hash(disclosure.requestId)], ["version", xdr.ScVal.scvU32(1)]];
 const wire = xdr.ScVal.scvVec([xdr.ScVal.scvString("BYETERY_EVIDENCE_V1"), hash(NETWORK_ID), new Address(CONTRACT).toScVal(),
  xdr.ScVal.scvMap(fields.map(([k, v]) => new xdr.ScMapEntry({ key: symbol(k), val: v }))) ]).toXDR();
 const commitment = createHash("sha256").update(wire).digest("hex");
 return { status: timingSafeEqual(Buffer.from(commitment, "hex"), Buffer.from(disclosure.expectedCommitment, "hex")) ? "VERIFIED" : "NOT_VERIFIED", payloadHash, commitment };
}
export function fixedEvidenceReview() {
 const bytes = Buffer.from(disclosure.manifestBase64, "base64"), tampered = Buffer.from(bytes); tampered[0] ^= 1;
 return { batteryId: disclosure.batteryId, byteLength: bytes.length, intact: integrity(bytes), tampered: integrity(tampered),
  limitation: "Esto demuestra integridad y una atestación registrada; NO certifica que el reciclaje físico haya ocurrido.",
  historicalEvidence: "https://github.com/chrlstl4n2307-ai/Byetery/blob/48b6a723ab78973f8a3314499c0351fb6155d172/docs/instaward/d2/D2-006-EVIDENCE-V1.md" };
}
