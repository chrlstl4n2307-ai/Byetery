// @vitest-environment node
import { beforeAll, afterAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { reviewPostgres } from "./review-postgres";
import { PgReviewDatabase } from "@/server/direct-review/database";
import { reviewHttp } from "@/server/direct-review/http";
import { reviewDeps, post } from "./review-fixture";
let f: Awaited<ReturnType<typeof reviewPostgres>>, db: PgReviewDatabase;
beforeAll(async () => { f = await reviewPostgres(); db = new PgReviewDatabase(f.app); }, 30000);
afterAll(async () => { await f?.close(); });
for (const role of ["USER", "ADMIN", "COLLECTOR", "RECYCLER"]) it("real SQL profile intersection " + role, async () => {
 const p = await db.profile(f.users[role].authUid); expect(p.roles).toEqual([role]); expect(p.canCreateIntent).toBe(role === "ADMIN");
 const text = JSON.stringify(p); for (const u of Object.values(f.users)) { expect(text).not.toContain(u.authUid); expect(text).not.toContain(u.principal); }
});
it("USER ownRequest is private; other review roles cannot see it", async () => {
 expect((await db.battery(f.users.USER.authUid, f.batteryId)).ownRequest).not.toBeNull();
 for (const role of ["ADMIN", "COLLECTOR", "RECYCLER"]) expect((await db.battery(f.users[role].authUid, f.batteryId)).ownRequest).toBeNull();
});
it("unknown, outside allowlist and cross-user scope return indistinguishable NotFound", async () => {
 for (const [role, id] of [["USER", "UNKNOWN"], ["USER", "BYE-B2-HIDDEN"], ["ADMIN", "BYE-B2-HIDDEN"], ["OTHER_USER", f.batteryId], ["COLLECTOR", "BYE-B2-USER-ONLY"], ["RECYCLER", "BYE-B2-USER-ONLY"]])
  await expect(db.battery(f.users[role].authUid, id)).rejects.toMatchObject({ status: 404, code: "NotFound" });
});
it("disabled principal, membership, review access, mismatched role cannot grant authority", async () => {
 const u = f.users.USER;
 for (const [sql, restore] of [
  ["update app_private.users set status='DISABLED' where id=$1", "update app_private.users set status='ACTIVE' where id=$1"],
  ["update api_private.memberships set enabled=false where user_id=$1", "update api_private.memberships set enabled=true where user_id=$1"],
  ["update review_private.review_access set enabled=false where principal_id=$1", "update review_private.review_access set enabled=true where principal_id=$1"],
  ["update review_private.review_access set review_role='COLLECTOR' where principal_id=$1", "update review_private.review_access set review_role='USER' where principal_id=$1"],
 ]) { await f.setup.query(sql, [u.principal]); try { await expect(db.profile(u.authUid)).rejects.toMatchObject({ status: 403, code: "ReviewAccessDisabled" }); } finally { await f.setup.query(restore, [u.principal]); } }
});
it("hosted DTO is bounded: no command/parameters/XDR/principal/idempotency/signer fields", async () => {
 const b = await db.battery(f.users.ADMIN.authUid, f.batteryId), h = await db.history(f.users.ADMIN.authUid, f.batteryId);
 const forbidden = new Set(["command", "parameters", "idempotency_key", "input_hash", "envelope_xdr", "signed_envelope", "signatures", "auth_uid", "principal", "signer", "worker", "lease"]);
 function walk(v: unknown) { if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { expect(forbidden.has(k)).toBe(false); walk(x); } }
 walk(b); walk(h); expect(b.latestTerminalOperation?.operationId).toBe(f.operationId); expect(b.latestTerminalOperation?.updatedAt).toBeNull();
});
it("restricted role gets exactly five functions, no B1 bypass, raw tables or adoption", async () => {
 for (const query of ["select * from app_private.users", "select * from api_private.memberships", "select * from app_private.battery_records", "select * from app_private.stellar_operations", "select * from api_private.testnet_envelopes", "select * from review_private.review_access", "update chain_private.batteries set reward_state='SENT'", "create schema b2_forbidden", "create role b2_forbidden"]) await expect(f.app.query(query)).rejects.toMatchObject({ code: "42501" });
 for (const query of ["select review_private.create_registration_intent($1,'BYPASS-KEY','{\"templateVersion\":1}')", "select review_private.registration_intent_status($1,$1)", "select review_private.adopt_registration_intent($1)", "select review_private.resolve_review($1)"]) await expect(f.app.query(query, [f.users.ADMIN.principal])).rejects.toMatchObject({ code: "42501" });
 const allowed = (await f.setup.query("select p.proname from pg_proc p where p.pronamespace='review_private'::regnamespace and has_function_privilege('byetery_d2_review_app',p.oid,'EXECUTE') order by p.proname")).rows.map(r => r.proname);
 expect(allowed).toEqual(["battery", "create_review_registration_intent", "history_rows", "profile", "review_registration_intent_status"]);
 expect((await f.setup.query("select has_schema_privilege('byetery_d2_read_owner','auth','USAGE') allowed")).rows[0].allowed).toBe(false);
 expect((await f.setup.query("select count(*) n from pg_class where relowner='byetery_d2_read_owner'::regrole and relkind='r'")).rows[0].n).toBe("0");
 const attrs = (await f.setup.query("select rolcanlogin,rolinherit,rolbypassrls,rolsuper from pg_roles where rolname='byetery_d2_read_owner'")).rows[0];
 expect(attrs).toEqual({ rolcanlogin: false, rolinherit: false, rolbypassrls: false, rolsuper: false });
});
it("ADMIN only bounded route invokes unchanged B1, WAITING has zero Foundation effects", async () => {
 const d = reviewDeps(); d.deps.database = db; d.deps.auth.getUser = async () => ({ id: f.users.ADMIN.authUid, role: "authenticated" });
 const result = await reviewHttp(post(), d.deps); expect(result.status).toBe(202); const i = await result.json(); expect(i.status).toBe("WAITING"); expect(i.transactionHash).toBeNull();
 const again = await reviewHttp(post(), d.deps); expect((await again.json()).operationId).toBe(i.operationId);
 await expect(db.battery(f.users.ADMIN.authUid, i.batteryId)).rejects.toMatchObject({ status: 404, code: "NotFound" });
 expect((await db.profile(f.users.ADMIN.authUid)).batteries).not.toContain(i.batteryId);
 await expect(db.create(f.users.ADMIN.authUid, "B2-fixture-idempotency", { templateVersion: 2 })).rejects.toMatchObject({ code: "IdempotencyConflict" });
 for (const table of ["app_private.battery_records", "app_private.evidence_versions", "app_private.stellar_operations"]) expect((await f.setup.query(`select count(*) n from ${table} where battery_id=$1`, [i.batteryId])).rows[0].n).toBe("0");
 for (const table of ["api_private.testnet_work", "api_private.testnet_envelopes", "api_private.testnet_source_leases"]) expect((await f.setup.query(`select count(*) n from ${table} where operation_id=$1`, [i.operationId])).rows[0].n).toBe("0");
 expect(d.calls.chain).toBe(0);
 for (const role of ["USER", "COLLECTOR", "RECYCLER"]) await expect(db.create(f.users[role].authUid, randomUUID(), { templateVersion: 1 })).rejects.toMatchObject({ status: 403 });
 await f.setup.query("update review_private.review_access set can_create_intent=false where principal_id=$1", [f.users.ADMIN.principal]);
 try { await expect(db.create(f.users.ADMIN.authUid, randomUUID(), { templateVersion: 1 })).rejects.toMatchObject({ status: 403 }); } finally { await f.setup.query("update review_private.review_access set can_create_intent=true where principal_id=$1", [f.users.ADMIN.principal]); }
 expect((await db.intent(f.users.ADMIN.authUid, i.operationId)).operationId).toBe(i.operationId);
 await expect(db.intent(f.users.USER.authUid, i.operationId)).rejects.toMatchObject({ status: 404, code: "NotFound" });
 await expect(db.intent(f.users.OTHER_ADMIN.authUid, i.operationId)).rejects.toMatchObject({ status: 404, code: "NotFound" });
 await expect(db.intent(f.users.ADMIN.authUid, randomUUID())).rejects.toMatchObject({ status: 404, code: "NotFound" });
});
it("browser headers/query cannot choose the principal or review role", async () => {
 const d = reviewDeps(); d.deps.database = db; d.deps.auth.getUser = async () => ({ id: f.users.USER.authUid, role: "authenticated" });
 const response = await reviewHttp(new Request("https://byetery-unit.vercel.app/api/me?role=ADMIN", { headers: { "x-role": "ADMIN" } }), d.deps);
 expect((await response.json()).roles).toEqual(["USER"]);
});
