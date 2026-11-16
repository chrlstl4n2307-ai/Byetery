-- Review-only delta. Apply after the three fixture H2 scripts, in PostgreSQL loopback.
begin;

alter table api_private.testnet_work
  add column h2_recorded_at timestamptz,
  add column h2_terminal_at timestamptz,
  add constraint d324_h2_terminal_window check (
    (h2_recorded_at is null and h2_terminal_at is null)
    or (h2_recorded_at is not null and h2_terminal_at is not null
      and state='ABORTED_PRE_DISPATCH'
      and h2_terminal_at>=h2_recorded_at and h2_terminal_at<h2_recorded_at+interval '30 seconds')
  );

-- PostgreSQL stamps the accepted terminal UPDATE while the approval is locked.
-- The earlier receipt guard still holds the source and verifies the exact evidence.
create or replace function api_private.d324_h2_guard_terminal_lifetime() returns trigger
  language plpgsql security invoker set search_path=pg_catalog,pg_temp as $$
declare approval_recorded_at timestamptz; approval_revoked_at timestamptz; terminal_at timestamptz;
begin
  if tg_op='INSERT' then
    if new.h2_recorded_at is not null or new.h2_terminal_at is not null then
      raise exception 'D324H2TerminalEvidenceImmutable' using errcode='42501';
    end if;
    if new.state='ABORTED_PRE_DISPATCH'
      and (new.deployment_id,new.battery_id)=('5c0cad2f-5f25-4216-8068-6cb9d2d26325','BYE-D3-R1-20261111-DCDE088CA870') then
      raise exception 'D324H2TerminalRequiresTransition' using errcode='42501';
    end if;
    return new;
  end if;
  if (new.h2_recorded_at,new.h2_terminal_at) is distinct from (old.h2_recorded_at,old.h2_terminal_at) then
    raise exception 'D324H2TerminalEvidenceImmutable' using errcode='42501';
  end if;
  if new.state<>'ABORTED_PRE_DISPATCH' or old.state='ABORTED_PRE_DISPATCH'
    or new.deployment_id<>'5c0cad2f-5f25-4216-8068-6cb9d2d26325'
    or new.battery_id<>'BYE-D3-R1-20261111-DCDE088CA870' then return new; end if;

  select a.recorded_at,a.revoked_at into approval_recorded_at,approval_revoked_at
    from api_private.d324_h2_verified_approval a
    join api_private.testnet_observations o
      on (o.deployment_id,o.operation_id)=(a.deployment_id,a.operation_id)
    where (a.deployment_id,a.operation_id)=(new.deployment_id,new.operation_id)
      and o.kind='PRE_DISPATCH_CLOSE' and o.evidence=a.receipt
    for share of a;
  terminal_at:=clock_timestamp();
  if not found or approval_revoked_at is not null or terminal_at<approval_recorded_at
    or terminal_at>=approval_recorded_at+interval '30 seconds' then
    raise exception 'D324H2ApprovalExpiredOrRevoked' using errcode='42501';
  end if;
  new.h2_recorded_at:=approval_recorded_at;
  new.h2_terminal_at:=terminal_at;
  return new;
end $$;

drop trigger z_d324_h2_terminal_lifetime on api_private.testnet_work;
create trigger z_d324_h2_terminal_lifetime before insert or update on api_private.testnet_work
  for each row execute function api_private.d324_h2_guard_terminal_lifetime();

-- At COMMIT require the exact receipt and the persisted, in-window terminal
-- transition. This check uses the timestamp taken under lock, not a new clock.
create function api_private.d324_h2_require_terminal_evidence() returns trigger
  language plpgsql security invoker set search_path=pg_catalog,pg_temp as $$
begin
  if new.kind<>'PRE_DISPATCH_CLOSE'
    or new.evidence->>'schemaVersion' is distinct from 'BYETERY_D324_PRE_DISPATCH_CLOSE_V1'
    or new.deployment_id<>'5c0cad2f-5f25-4216-8068-6cb9d2d26325' then return new; end if;
  if not exists (
    select 1 from api_private.testnet_work w
    join api_private.d324_h2_verified_approval a using (deployment_id,operation_id)
    where (w.deployment_id,w.operation_id)=(new.deployment_id,new.operation_id)
      and w.state='ABORTED_PRE_DISPATCH' and a.receipt=new.evidence
      and w.h2_recorded_at=a.recorded_at and w.h2_terminal_at>=a.recorded_at
      and w.h2_terminal_at<a.recorded_at+interval '30 seconds' and a.revoked_at is null
  ) then
    raise exception 'D324H2TerminalEvidenceRequired' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function api_private.d324_h2_require_terminal_evidence() from public;

drop trigger z_d324_h2_approval_commit on api_private.testnet_observations;
create constraint trigger z_d324_h2_approval_commit after insert on api_private.testnet_observations
  deferrable initially deferred for each row execute function api_private.d324_h2_require_terminal_evidence();

commit;
