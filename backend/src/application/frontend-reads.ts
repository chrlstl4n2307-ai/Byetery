import type { Identity } from "./auth.ts";
import { Repository, one } from "./repository.ts";
import { bid } from "./validation.ts";
import { AppError, type Reply } from "./errors.ts";

/** Authenticated, deployment-scoped read projections. No new mutation authority. */
export async function profile(
  repo: Repository,
  identity: Identity,
): Promise<Reply> {
  return repo.transaction(async (db) => {
    const user = await repo.principal(db, identity),
      d = repo.deploymentId;
    const roles = (
      await db.query(
        "select role from api_private.memberships where deployment_id=$1 and user_id=$2 and enabled order by role",
        [d, user],
      )
    ).rows.map((r) => r.role);
    try {
      await repo.role(db,user,'USER');
    } catch(error) {
      if(!(error instanceof AppError && error.status===403 && error.code==='RoleRequired'))throw error;
      // Keep account/role status available, without querying or disclosing protected data.
      return {status:200,body:{userId:user,roles,wallets:[],requests:[],hasMoreRequests:false,source:repo.mode,membershipStatus:'DISABLED'}};
    }
    const wallets = (
      await db.query(
        `select id,address,verified_at as "verifiedAt" from app_private.wallet_links
      where deployment_id=$1 and user_id=$2 and revoked_at is null order by verified_at desc limit 100`,
        [d, user],
      )
    ).rows;
    const requests = (
      await db.query(
        `select encode(r.request_id,'hex') as "requestId",r.battery_id as "batteryId",
      r.reservation_state as "reservationState",c.state as "requestState",r.created_at as "createdAt",
      b.state as "confirmedBatteryState",case when b.request_id=r.request_id then b.reward_state else 'NOT_ELIGIBLE' end as "confirmedRewardState",
      (select jsonb_build_object('id',o.id,'state',o.state,'command',o.command) from app_private.stellar_operations o
        where o.deployment_id=r.deployment_id and o.battery_id=r.battery_id and o.state in ('QUEUED','AWAITING_AUTH','READY','SUBMITTED','UNKNOWN') order by o.created_at desc,o.id desc limit 1) as "pendingOperation",
      (select jsonb_build_object('id',o.id,'state',o.state,'command',o.command,'failureScope',
        case when o.state='REJECTED' then case when exists(select 1 from api_private.testnet_work t
          where t.deployment_id=o.deployment_id and t.operation_id=o.id and t.state='CONFIRMED_FAILED' and t.confirmation is not null)
          then 'CHAIN' else 'APPLICATION' end else null end)
        from app_private.stellar_operations o where o.deployment_id=r.deployment_id and o.battery_id=r.battery_id
        and o.state in ('CONFIRMED','REJECTED') order by o.created_at desc,o.id desc limit 1) as "latestTerminalOperation"
      from app_private.return_requests r left join chain_private.return_requests c using(deployment_id,request_id)
      left join chain_private.batteries b on b.deployment_id=r.deployment_id and b.battery_id=r.battery_id
      where r.deployment_id=$1 and r.user_id=$2 order by r.created_at desc limit 101`,
        [d, user],
      )
    ).rows;
    return {
      status: 200,
      body: {
        userId: user,
        roles,
        wallets,
        requests: requests.slice(0, 100),
        hasMoreRequests: requests.length > 100,
        source: repo.mode,
        membershipStatus: 'ENABLED',
      },
    };
  });
}
export async function batteryDetail(
  repo: Repository,
  identity: Identity,
  batteryId: string,
): Promise<Reply> {
  return repo.transaction(async (db) => {
    const user = await repo.principal(db, identity),
      id = bid(batteryId),
      d = repo.deploymentId;
    await repo.role(db,user,'USER');
    const view = await repo.view(db, id);
    const row = await one(
      db,
      "select metadata from app_private.battery_records where deployment_id=$1 and battery_id=$2",
      [d, id],
    );
    const metadata: Record<string, string> = {};
    for (const key of ["type", "manufacturer", "batch"])
      if (typeof row?.metadata?.[key] === "string")
        metadata[key] = row.metadata[key].slice(0, 160);
    const ownRequest = await one(
      db,
      `select encode(r.request_id,'hex') as "requestId",r.reservation_state as "reservationState",c.state as "requestState"
      from app_private.return_requests r left join chain_private.return_requests c using(deployment_id,request_id)
      where r.deployment_id=$1 and r.battery_id=$2 and r.user_id=$3 order by r.created_at desc limit 1`,
      [d, id, user],
    );
    return {
      status: 200,
      body: { ...view, metadata, ownRequest: ownRequest ?? null },
    };
  });
}
