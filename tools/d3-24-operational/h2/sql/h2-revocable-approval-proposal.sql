-- Local follow-up to h2-verified-approval-proposal.sql. Keeps one permanent
-- attestation per operation and keeps revocation as an auditable state change.
begin;
create role d324_fixture_h2_revoker login nosuperuser nobypassrls noinherit
  nocreatedb nocreaterole noreplication;
grant usage on schema api_private to d324_fixture_h2_revoker;
alter table api_private.d324_h2_verified_approval add revoked_at timestamptz;
grant select (operation_id,revoked_at), update (revoked_at)
  on api_private.d324_h2_verified_approval to d324_fixture_h2_revoker;
create policy d324_revoker_read on api_private.d324_h2_verified_approval
  for select to d324_fixture_h2_revoker using (current_user=session_user);
create policy d324_revoker_update on api_private.d324_h2_verified_approval
  for update to d324_fixture_h2_revoker
  using (current_user=session_user and revoked_at is null)
  with check (current_user=session_user and revoked_at is not null);

-- Row lock ACL for the closer. The restrictive policy forbids actual UPDATE.
grant update (revoked_at) on api_private.d324_h2_verified_approval to d324_fixture_h2_closer;
create policy d324_closer_approval_lock on api_private.d324_h2_verified_approval
  for update to d324_fixture_h2_closer using (current_user=session_user) with check (false);
create policy d324_closer_never_mutates_approval on api_private.d324_h2_verified_approval as restrictive
  for update to d324_fixture_h2_closer using (current_user=session_user) with check (false);

create function api_private.d324_stamp_h2_revocation() returns trigger
  language plpgsql security invoker set search_path=pg_catalog,pg_temp as $$
begin
  if old.revoked_at is not null or new.revoked_at is null then
    raise exception 'D324H2RevocationImmutable' using errcode='42501';
  end if;
  new.revoked_at:=clock_timestamp();
  return new;
end $$;
revoke all on function api_private.d324_stamp_h2_revocation() from public;
create trigger d324_stamp_h2_revocation before update of revoked_at on api_private.d324_h2_verified_approval
  for each row execute function api_private.d324_stamp_h2_revocation();

-- The earlier invoker trigger checks the source/lease fence and exact receipt.
-- Run after it. Keep the approval row locked until the close transaction ends.
create function api_private.d324_h2_approval_lifetime() returns trigger
  language plpgsql security invoker set search_path=pg_catalog,pg_temp as $$
declare observed timestamptz; revoked timestamptz;
begin
  if new.kind<>'PRE_DISPATCH_CLOSE'
    or new.evidence->>'schemaVersion' is distinct from 'BYETERY_D324_PRE_DISPATCH_CLOSE_V1'
    or new.deployment_id<>'5c0cad2f-5f25-4216-8068-6cb9d2d26325' then return new; end if;
  select a.recorded_at,a.revoked_at into observed,revoked from api_private.d324_h2_verified_approval a
    where (a.deployment_id,a.operation_id)=(new.deployment_id,new.operation_id) and a.receipt=new.evidence
    for share of a;
  if not found or revoked is not null or clock_timestamp()<observed
    or clock_timestamp()>=observed+interval '30 seconds' then
      raise exception 'D324H2ApprovalExpiredOrRevoked' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function api_private.d324_h2_approval_lifetime() from public;
create trigger z_d324_h2_lock_approval before insert on api_private.testnet_observations
  for each row execute function api_private.d324_h2_approval_lifetime();
create constraint trigger z_d324_h2_approval_commit after insert on api_private.testnet_observations
  deferrable initially deferred for each row execute function api_private.d324_h2_approval_lifetime();

-- A raw SQL client can make the deferred constraint immediate. Fence the
-- terminal write itself so an early receipt cannot extend the 30s window.
create function api_private.d324_h2_guard_terminal_lifetime() returns trigger
  language plpgsql security invoker set search_path=pg_catalog,pg_temp as $$
begin
  if new.state<>'ABORTED_PRE_DISPATCH' or old.state='ABORTED_PRE_DISPATCH'
    or new.deployment_id<>'5c0cad2f-5f25-4216-8068-6cb9d2d26325'
    or new.battery_id<>'BYE-D3-R1-20261111-DCDE088CA870' then return new; end if;
  if not exists (select 1 from api_private.d324_h2_verified_approval a
    join api_private.testnet_observations o
      on (o.deployment_id,o.operation_id)=(a.deployment_id,a.operation_id)
    where (a.deployment_id,a.operation_id)=(new.deployment_id,new.operation_id)
      and o.kind='PRE_DISPATCH_CLOSE' and o.evidence=a.receipt and a.revoked_at is null
      and clock_timestamp()>=a.recorded_at and clock_timestamp()<a.recorded_at+interval '30 seconds') then
    raise exception 'D324H2ApprovalExpiredOrRevoked' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function api_private.d324_h2_guard_terminal_lifetime() from public;
create trigger z_d324_h2_terminal_lifetime before update of state on api_private.testnet_work
  for each row execute function api_private.d324_h2_guard_terminal_lifetime();
commit;
