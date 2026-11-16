-- Isolated PostgreSQL 17.6 prototype. Apply only after the local H2 role proposal.
create role d324_fixture_h2_verifier login nosuperuser nobypassrls noinherit
  nocreatedb nocreaterole noreplication;
grant usage on schema api_private to d324_fixture_h2_verifier;

create table api_private.d324_h2_verified_approval (
  operation_id uuid primary key references api_private.d324_step(operation_id),
  deployment_id uuid not null check (deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325'),
  receipt jsonb not null,
  recorded_at timestamptz not null default clock_timestamp(),
  check ((receipt->>'operationId'=operation_id::text
    and receipt->>'deploymentId'=deployment_id::text
    and receipt->>'taskId'='D3-24-RUN1'
    and receipt->>'batteryId'='BYE-D3-R1-20261111-DCDE088CA870'
    and receipt->>'schemaVersion'='BYETERY_D324_PRE_DISPATCH_CLOSE_V1'
    and receipt->>'reviewDigest'~'^[a-f0-9]{64}$'
    and receipt->'budgetReleased'='false'::jsonb) is true)
);
alter table api_private.d324_h2_verified_approval enable row level security;
alter table api_private.d324_h2_verified_approval force row level security;
revoke all on api_private.d324_h2_verified_approval from public;
grant insert (operation_id,deployment_id,receipt) on api_private.d324_h2_verified_approval
  to d324_fixture_h2_verifier;
grant select on api_private.d324_h2_verified_approval to d324_fixture_h2_closer;
create policy d324_h2_verifier_append on api_private.d324_h2_verified_approval
  for insert to d324_fixture_h2_verifier with check (current_user=session_user);
create policy d324_h2_closer_read on api_private.d324_h2_verified_approval
  for select to d324_fixture_h2_closer using (current_user=session_user);

-- An invoker trigger, in addition to the existing zero-dispatch checks and
-- unique closure receipt. A sibling trigger or policy cannot OR this away.
create function api_private.d324_require_verified_h2_approval() returns trigger
  language plpgsql security invoker set search_path=pg_catalog as $$
begin
  if new.kind<>'PRE_DISPATCH_CLOSE'
    or new.deployment_id<>'5c0cad2f-5f25-4216-8068-6cb9d2d26325' then
    return new;
  end if;
  -- Preserve historical writers. The D3-24 closer never writes legacy receipts.
  if current_user<>'d324_fixture_h2_closer'
    and new.evidence->>'schemaVersion' is distinct from 'BYETERY_D324_PRE_DISPATCH_CLOSE_V1' then
    return new;
  end if;
  if current_user<>'d324_fixture_h2_closer' or session_user<>'d324_fixture_h2_closer' then
    raise exception 'D324VerifiedH2ApprovalRequired' using errcode='42501';
  end if;
  -- Direct SQL must take the same source fence as the executor. Check
  -- freshness after the lock, including waits and a changed generation.
  perform 1 from api_private.testnet_source_leases l
    join api_private.testnet_work w
      on (w.deployment_id,w.operation_id,w.network_id,w.source_account)
         =(l.deployment_id,l.operation_id,l.network_id,l.source_account)
    where (l.deployment_id,l.operation_id)=(new.deployment_id,new.operation_id)
      and l.source_account=new.evidence->>'sourceAccount'
      and l.generation::text=new.evidence->>'leaseGeneration'
      and l.lease_until<=clock_timestamp()
    for update of l;
  if not found then
    raise exception 'D324VerifiedH2ApprovalRequired' using errcode='42501';
  end if;
  if not exists(select from api_private.d324_h2_verified_approval a
    where a.operation_id=new.operation_id and a.deployment_id=new.deployment_id
      and a.receipt=new.evidence
      and a.recorded_at<=clock_timestamp()
      and clock_timestamp()<a.recorded_at+interval '30 seconds') then
    raise exception 'D324VerifiedH2ApprovalRequired' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function api_private.d324_require_verified_h2_approval() from public;
create trigger d324_verified_h2_approval before insert on api_private.testnet_observations
  for each row execute function api_private.d324_require_verified_h2_approval();

-- Column grants and RLS allow the required ancillary updates. Require the
-- already-validated work/domain pair so raw SQL cannot apply just a side effect.
create function api_private.d324_guard_h2_close_side_effect() returns trigger
  language plpgsql security invoker set search_path=pg_catalog as $$
declare op uuid;
begin
  if current_user<>'d324_fixture_h2_closer' then return new; end if;
  if tg_table_name='return_requests' then
    select o.id into op from app_private.stellar_operations o
      where (o.deployment_id,o.battery_id,o.request_id)=(new.deployment_id,new.battery_id,new.request_id)
        and o.command='open_return' and o.state='CANCELLED_LOCAL' and o.error_code='D324ExecutionExpired';
  else
    op:=new.operation_id;
    if new.response_status is distinct from 409 or new.response_body is distinct from jsonb_build_object(
      'source','TESTNET','operationId',op,'class','TERMINAL_UNSIGNED','state','CANCELLED_LOCAL',
      'transportState','ABORTED_PRE_DISPATCH','terminal',true,'transactionHash',null,
      'reason','D324ExecutionExpired') then
      raise exception 'D324VerifiedH2ApprovalRequired' using errcode='42501';
    end if;
  end if;
  if not exists(select from api_private.testnet_work w join app_private.stellar_operations o
    on (o.deployment_id,o.id)=(w.deployment_id,w.operation_id)
    where (w.deployment_id,w.operation_id)=(new.deployment_id,op)
      and w.state='ABORTED_PRE_DISPATCH' and o.state='CANCELLED_LOCAL'
      and o.error_code='D324ExecutionExpired') then
    raise exception 'D324VerifiedH2ApprovalRequired' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function api_private.d324_guard_h2_close_side_effect() from public;
create trigger d324_verified_h2_idempotency before update on api_private.idempotency
  for each row execute function api_private.d324_guard_h2_close_side_effect();
create trigger d324_verified_h2_return before update on app_private.return_requests
  for each row execute function api_private.d324_guard_h2_close_side_effect();
