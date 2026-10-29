import { readFile, readdir, realpath } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { Pool } from "pg";
import { DEPLOYMENT, NETWORK_ID, CONTRACT, WASM } from "@/shared/review/model";
export const ACTORS = { admin: "GBZ4HNGFYAA7FXRYECY4LBSIKSQPJPUFYJZALOWGTXUURNDR5OINUT2F", service: "GBOOUYTB4MUH3JQUMOQ6LUEALEPUQ5SREYYIJ5WGR26BI3NCVPNG7WIX", collector: "GB4YAMSPXTDDUD7FNDE72BD3BKW57BEDM7D7HTX6OFWEFRBO65Z3UO6V", recycler: "GBIAVN4O4HJSPZJKFPPQZPLPXBELLBGYAJLTEGOGLJG2FRW2C5P35TF2" };
export async function reviewPostgres() {
 const config = JSON.parse(await readFile(new URL("../../.tools/d2-gap2b/postgres-test.json", import.meta.url), "utf8"));
 if (config.host !== "127.0.0.1" || config.user !== "byetery_gap2b" || config.database !== "postgres" || config.port < 49152) throw Error("LocalPostgresRequired");
 const admin = new Pool({ ...config, max: 2, connectionTimeoutMillis: 3000 });
 const data = (await admin.query("select current_setting('data_directory') d")).rows[0].d;
 if ((await realpath(data)).toLowerCase() !== (await realpath(new URL("../../.tools/d2-gap2b/pgdata", import.meta.url))).toLowerCase()) throw Error("WrongTestDirectory");
 const database = "byetery_b2_" + randomUUID().replaceAll("-", ""); await admin.query("create database " + database);
 const setup = new Pool({ ...config, database, max: 2 }), app = new Pool({ ...config, database, user: "byetery_d2_review_app", max: 1 });
 const close = async () => { await app.end(); await setup.end(); await admin.query("drop database " + database + " with (force)"); await admin.end(); };
 try {
  await setup.query("create schema auth; create table auth.users(id uuid primary key);");
  await setup.query("do $$ begin create role anon; exception when duplicate_object then null; end $$; do $$ begin create role authenticated; exception when duplicate_object then null; end $$;");
  const migrations = new URL("../../database/migrations/", import.meta.url);
  for (const name of (await readdir(migrations)).filter(x => x.endsWith(".sql")).sort()) await setup.query(await readFile(new URL(name, migrations), "utf8"));
  for (const name of ["d2-008b1-registration-intents.sql", "d2-008b2-direct-review.sql"]) await setup.query(await readFile(new URL("../../database/review/" + name, import.meta.url), "utf8"));
  await setup.query(`insert into chain_private.deployments(id,mode,network_id,contract_address,wasm_hash,schema_version,admin,service,reward_token,reward_amount)
   values($1,'TESTNET',decode($2,'hex'),$3,decode($4,'hex'),1,$5,$6,$7,100000000)`, [DEPLOYMENT, NETWORK_ID, CONTRACT, WASM, ACTORS.admin, ACTORS.service, "CB2RBZCH2DKLB2KFTKKEIDJBK53WKT2FQBQRTAN2JKJVEBAMCDEY6D7G"]);
  const users = Object.fromEntries(["USER", "ADMIN", "COLLECTOR", "RECYCLER", "OTHER_USER", "OTHER_ADMIN"].map(role => [role, { principal: randomUUID(), authUid: randomUUID() }])) as Record<string, { principal: string; authUid: string }>;
  for (const [name, u] of Object.entries(users)) {
   const role = name === "OTHER_USER" ? "USER" : name === "OTHER_ADMIN" ? "ADMIN" : name;
   await setup.query("insert into auth.users values($1)", [u.authUid]); await setup.query("insert into app_private.users(id,auth_user_id) values($1,$2)", [u.principal, u.authUid]);
   await setup.query("insert into api_private.memberships(deployment_id,user_id,role,actor_address) values($1,$2,$3,$4)", [DEPLOYMENT, u.principal, role, role === "COLLECTOR" ? ACTORS.collector : role === "RECYCLER" ? ACTORS.recycler : null]);
   await setup.query("insert into review_private.review_access(deployment_id,principal_id,review_role,can_create_intent) values($1,$2,$3,$4)", [DEPLOYMENT, u.principal, role, role === "ADMIN"]);
   if (role === "ADMIN") await setup.query("insert into review_private.permissions(deployment_id,principal,capability) values($1,$2,'CREATE_D2_REGISTRATION_INTENT')", [DEPLOYMENT, u.principal]);
  }
  const batteryId = "BYE-B2-HISTORICAL", requestId = "ab".repeat(32), wallet = randomUUID();
  for (const id of [batteryId, "BYE-B2-HIDDEN", "BYE-B2-USER-ONLY"]) await setup.query("insert into app_private.battery_records(deployment_id,battery_id,created_by,metadata) values($1,$2,$3,$4)", [DEPLOYMENT, id, users.USER.principal, { type: "Synthetic AA", batch: "LOCAL-B2" }]);
  await setup.query("insert into review_private.review_batteries(deployment_id,battery_id,purpose,user_principal_id,collector_relevant,recycler_relevant) values($1,$2,'HISTORICAL',$3,true,true),($1,'BYE-B2-USER-ONLY','HISTORICAL',$3,false,false)", [DEPLOYMENT, batteryId, users.USER.principal]);
  await setup.query("insert into app_private.wallet_links(id,deployment_id,network_id,user_id,address,proof_reference,verified_at) values($1,$2,decode($3,'hex'),$4,$5,'LOCAL-B2',now())", [wallet, DEPLOYMENT, NETWORK_ID, users.USER.principal, ACTORS.admin]);
  await setup.query("insert into app_private.return_requests(deployment_id,request_id,battery_id,user_id,wallet_link_id,recipient_snapshot) values($1,decode($2,'hex'),$3,$4,$5,$6)", [DEPLOYMENT, requestId, batteryId, users.USER.principal, wallet, ACTORS.admin]);
  await setup.query("begin");
  await setup.query("insert into chain_private.return_requests values($1,decode($2,'hex'),$3,$4,'CONFIRMED',5315915)", [DEPLOYMENT, requestId, batteryId, ACTORS.admin]);
  await setup.query(`insert into chain_private.batteries(deployment_id,battery_id,state,registration_hash,request_id,collector,collection_hash,recycler,recycling_hash,reward_state,confirmed_ledger)
   values($1,$2,'RECYCLED',decode($3,'hex'),decode($4,'hex'),$5,decode($3,'hex'),$6,decode($3,'hex'),'SENT',5315915)`, [DEPLOYMENT, batteryId, "01".repeat(32), requestId, ACTORS.collector, ACTORS.recycler]);
  await setup.query("update app_private.return_requests set reservation_state='CONSUMED',association_confirmed_at=now() where deployment_id=$1", [DEPLOYMENT]); await setup.query("commit");
  const operationId = randomUUID(), params = { kind: "register_battery", batteryId, registrationHash: "01".repeat(32) }, h = createHash("sha256").update(JSON.stringify(params)).digest("hex");
  await setup.query("insert into app_private.stellar_operations(id,deployment_id,principal,idempotency_key,command,battery_id,parameters,parameters_hash,state) values($1,$2,$3,'LOCAL-B2-OP','register_battery',$4,$5,decode($6,'hex'),'CONFIRMED')", [operationId, DEPLOYMENT, users.ADMIN.principal, batteryId, params, h]);
  return { setup, app, users, batteryId, operationId, close };
 } catch (e) { await close(); throw e; }
}
