import type { Pool } from "pg";
import type { Identity } from "../application/auth.ts";
import { databaseTransaction } from "../application/database.ts";
import { requireThat } from "../application/errors.ts";
import { requireMembership } from "../application/membership.ts";
import { bid } from "../application/validation.ts";
import { CONTRACT } from "../testnet/abi.ts";
import { NETWORK_ID } from "../testnet/identity.ts";
import {
  HISTORY_DEPLOYMENT_ID,
  chronological,
  type BatteryHistory,
  type HistoryRow,
} from "./model.ts";
import { verifyHistory, type HistoryChainReader } from "./verify.ts";

export interface HistoryRepository {
  pool: Pool;
  deploymentId: string;
  mode: "MOCK" | "TESTNET";
}
/** No Repository.principal(), writes, worker, RPC or Auth provisioning in this transaction. */
export async function historyRows(
  repo: HistoryRepository,
  identity: Identity,
  batteryId: string,
) {
  requireThat(
    repo.mode === "TESTNET" && repo.deploymentId === HISTORY_DEPLOYMENT_ID,
    503,
    "TestnetHistoryRequired",
  );
  const id = bid(batteryId),
    d = repo.deploymentId;
  return databaseTransaction(
    repo.pool,
    async (db) => {
      await db.query("set transaction read only");
      await db.query("set local statement_timeout='5s'");
      const session = (
        await db.query(
          `select 1 from auth.sessions where id=$1 and user_id=$2
      and (not_after is null or not_after>now())`,
          [identity.sessionId, identity.authUserId],
        )
      ).rows[0];
      requireThat(session, 401, "SessionRevoked");
      const user = (
        await db.query(
          `select u.id from app_private.users u where u.auth_user_id=$1 and u.status='ACTIVE'`,
          [identity.authUserId],
        )
      ).rows[0];
      requireThat(user, 403, "HistoryReadForbidden");
      await requireMembership(db,d,user.id,'USER','HistoryReadForbidden');
      const config = (
        await db.query(
          `select id,mode,encode(network_id,'hex') as network_id,contract_address
      from chain_private.deployments where id=$1`,
          [d],
        )
      ).rows[0];
      requireThat(
        config?.mode === "TESTNET" &&
          config.network_id === NETWORK_ID &&
          config.contract_address === CONTRACT,
        503,
        "TestnetHistoryRequired",
      );
      requireThat(
        (
          await db.query(
            "select 1 from app_private.battery_records where deployment_id=$1 and battery_id=$2",
            [d, id],
          )
        ).rows[0],
        404,
        "BatteryNotFound",
      );
      // command is an existing scalar enum. Only a fixed CASE-derived event label leaves SQL;
      // parameters, evidence, recipient, raw command, signatures and envelopes are not selected.
      const rows = (
        await db.query<HistoryRow>(
          `select o.id,o.state,o.created_at,
      case o.command when 'register_battery' then 'REGISTERED' when 'open_return' then 'RETURNED'
      when 'confirm_collection' then 'COLLECTED' when 'confirm_recycling' then 'RECYCLED'
      when 'pay_reward' then 'REWARD' when 'cancel_return' then 'CANCELLED' else 'OTHER' end as kind,
      encode(e.transaction_hash,'hex') as transaction_hash,encode(e.network_id,'hex') as identity_network,
      e.contract_address as identity_contract,w.confirmation->>'confirmationLedger' as confirmation_ledger
      from app_private.stellar_operations o
      left join api_private.testnet_work w on w.operation_id=o.id and w.deployment_id=o.deployment_id
      left join api_private.testnet_envelopes e on e.operation_id=o.id and e.deployment_id=o.deployment_id
      where o.deployment_id=$1 and o.battery_id=$2 order by o.created_at,o.id limit 101`,
          [d, id],
        )
      ).rows;
      return {
        batteryId: id,
        contractAddress: config.contract_address as string,
        rows: rows.slice(0, 100),
        hasMore: rows.length > 100,
      };
    },
    "5s",
  );
}
export async function batteryHistory(
  repo: HistoryRepository,
  identity: Identity,
  batteryId: string,
  chain: HistoryChainReader,
): Promise<BatteryHistory> {
  const snapshot = await historyRows(repo, identity, batteryId);
  const entries = await verifyHistory(
    snapshot.rows,
    snapshot.batteryId,
    snapshot.contractAddress,
    chain,
  );
  return {
    batteryId: snapshot.batteryId,
    source: "TESTNET",
    network: "STELLAR TESTNET",
    deploymentId: repo.deploymentId,
    contractAddress: snapshot.contractAddress,
    checkedAt: new Date().toISOString(),
    entries: chronological(entries),
    hasMore: snapshot.hasMore,
  };
}
