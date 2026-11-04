-- D3-9C. Forward-only, LOCAL validation candidate. Never applied remotely here.
begin;
set local lock_timeout='5s';
alter table api_private.testnet_work drop constraint testnet_work_state_check;
alter table api_private.testnet_work add constraint testnet_work_state_check check(state in
 ('CLAIMED','PREPARING','SIGNED','READY','DISPATCH_INTENT','SUBMITTED_OR_UNKNOWN','CONFIRMED_SUCCESS','CONFIRMED_FAILED','EXPIRED_NOT_APPLIED','EXPIRED_UNRESOLVED','PROJECTED','ABORTED_PRE_DISPATCH'));
alter table api_private.testnet_observations drop constraint testnet_observations_kind_check;
alter table api_private.testnet_observations add constraint testnet_observations_kind_check check(kind in
 ('DISPATCH_INTENT','SUBMIT_RESPONSE','RPC_OUTAGE','NOT_FOUND','SUCCESS','FAILED','STATE_READ','PROJECTION','PRE_DISPATCH_CLOSE','EXECUTION_PHASE'));
create unique index one_pre_dispatch_close on api_private.testnet_observations(deployment_id,operation_id) where kind='PRE_DISPATCH_CLOSE';
create or replace function api_private.guard_testnet_work() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if TG_OP='INSERT' then
  if NEW.state<>'CLAIMED' or NEW.dispatch_attempts<>0 or NEW.confirmation is not null or NEW.state_evidence is not null
    or not exists(select 1 from chain_private.deployments d join app_private.stellar_operations o on o.deployment_id=d.id
      where d.id=NEW.deployment_id and d.mode='TESTNET' and d.contract_address=NEW.contract_address
        and o.id=NEW.operation_id and o.command=NEW.command and o.parameters->>'kind'=NEW.command and o.parameters_hash=NEW.context_hash
        and o.command<>'set_role') then raise exception 'InvalidTestnetContext' using errcode='23514'; end if;
 else
  if OLD.state='ABORTED_PRE_DISPATCH' then
   if NEW is distinct from OLD then raise exception 'TransportTerminal' using errcode='23514'; end if;
   return NEW;
  end if;
  if NEW.state='ABORTED_PRE_DISPATCH' and (OLD.state<>'PREPARING'
    or NEW.dispatch_attempts<>0 or NEW.confirmation is not null or NEW.state_evidence is not null
    or NEW.operation_id<>'0192a5b3-36e9-4709-9708-03d6a56a5125'::uuid
    or NEW.deployment_id<>'5c0cad2f-5f25-4216-8068-6cb9d2d26325'::uuid
    or NEW.battery_id<>'BYE-D3-R1-20261103-18551C1AB983' or NEW.command<>'register_battery'
    or exists(select 1 from api_private.testnet_envelopes e where e.operation_id=NEW.operation_id)
    or exists(select 1 from api_private.testnet_observations e where e.operation_id=NEW.operation_id and e.kind in ('DISPATCH_INTENT','SUBMIT_RESPONSE','RPC_OUTAGE','SUCCESS','FAILED'))
    or not exists(select 1 from api_private.testnet_observations e where e.operation_id=NEW.operation_id and e.kind='PRE_DISPATCH_CLOSE'
      and e.evidence->>'schemaVersion'='BYETERY_PRE_DISPATCH_CLOSE_V1' and e.evidence->>'contextHash'=encode(NEW.context_hash,'hex')
      and e.evidence->>'operationId'=NEW.operation_id::text and e.evidence->>'deploymentId'=NEW.deployment_id::text
      and e.evidence->>'batteryId'=NEW.battery_id and e.evidence->>'reason'='PreDispatchAborted'
      and e.evidence->>'proofDigest'~'^[0-9a-f]{64}$' and e.evidence->>'decisionId'~'^[A-Za-z0-9._:-]{8,128}$'
      and e.evidence->>'incidentSha'='d3044d893282d9f83c72ddfd31bf850be04b78e0' and e.evidence->>'fixSha'~'^[a-f0-9]{40}$'
      and e.evidence->>'counting'='false' and e.evidence->>'physicalSignerUse'='UNKNOWN'))
   then raise exception 'UnsignedClosureNotReviewed' using errcode='23514'; end if;
  if NEW.dispatch_attempts<OLD.dispatch_attempts or NEW.dispatch_attempts>OLD.dispatch_attempts+1 then
   raise exception 'InvalidDispatchAttempt' using errcode='23514'; end if;
  if NEW.state in ('SIGNED','READY','DISPATCH_INTENT','SUBMITTED_OR_UNKNOWN','CONFIRMED_SUCCESS','CONFIRMED_FAILED','EXPIRED_NOT_APPLIED','EXPIRED_UNRESOLVED','PROJECTED')
    and not exists(select 1 from api_private.testnet_envelopes e where e.operation_id=NEW.operation_id) then
   raise exception 'IdentityNotDurable' using errcode='23514'; end if;
  if NEW.state='DISPATCH_INTENT' and NEW.dispatch_attempts<>OLD.dispatch_attempts+1 then
   raise exception 'InvalidDispatchAttempt' using errcode='23514'; end if;
  if NEW.state<>'DISPATCH_INTENT' and NEW.dispatch_attempts<>OLD.dispatch_attempts then
   raise exception 'InvalidDispatchAttempt' using errcode='23514'; end if;
  if NEW.state='CONFIRMED_FAILED' and NEW.confirmation is null then
   raise exception 'ConfirmationRequired' using errcode='23514'; end if;
  if NEW.state in ('CONFIRMED_SUCCESS','PROJECTED') and NEW.confirmation is null and coalesce(NEW.state_evidence->>'outcome','')<>'APPLIED' then
   raise exception 'ConfirmationRequired' using errcode='23514'; end if;
  if OLD.confirmation is not null and NEW.confirmation is distinct from OLD.confirmation then
   raise exception 'ConfirmationImmutable' using errcode='23514'; end if;
  if OLD.state in ('CONFIRMED_FAILED','EXPIRED_NOT_APPLIED','PROJECTED') and NEW is distinct from OLD then
   raise exception 'TransportTerminal' using errcode='23514'; end if;
  if NEW.state<>OLD.state and not ((OLD.state,NEW.state) in (
    ('PREPARING','ABORTED_PRE_DISPATCH'),('CLAIMED','PREPARING'),('PREPARING','SIGNED'),('SIGNED','READY'),('READY','DISPATCH_INTENT'),
    ('DISPATCH_INTENT','SUBMITTED_OR_UNKNOWN'),('READY','SUBMITTED_OR_UNKNOWN'),('SUBMITTED_OR_UNKNOWN','DISPATCH_INTENT'),
    ('EXPIRED_UNRESOLVED','SUBMITTED_OR_UNKNOWN'),('CONFIRMED_SUCCESS','PROJECTED'))
    or (OLD.state in ('READY','DISPATCH_INTENT','SUBMITTED_OR_UNKNOWN','EXPIRED_UNRESOLVED')
        and NEW.state in ('CONFIRMED_SUCCESS','CONFIRMED_FAILED','EXPIRED_NOT_APPLIED','EXPIRED_UNRESOLVED'))) then
   raise exception 'InvalidTransportTransition' using errcode='23514'; end if;
 end if;
 return NEW;
end $$;
create or replace function api_private.guard_testnet_envelope() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 perform 1 from api_private.testnet_work where operation_id=NEW.operation_id for update;
 if not exists(select 1 from api_private.testnet_work w where w.operation_id=NEW.operation_id
   and w.deployment_id=NEW.deployment_id and w.network_id=NEW.network_id and w.source_account=NEW.source_account
   and w.contract_address=NEW.contract_address and w.context_hash=NEW.context_hash and w.state='PREPARING')
   or exists(select 1 from unnest(NEW.authorization_expirations) v where v<=NEW.prepared_ledger) then
  raise exception 'EnvelopeContextMismatch' using errcode='23514'; end if;
 return NEW;
end $$;
create or replace function api_private.guard_testnet_lease() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if NEW.lease_until>clock_timestamp() and exists(select 1 from api_private.testnet_work where operation_id=NEW.operation_id and state='ABORTED_PRE_DISPATCH') then
  raise exception 'TransportTerminal' using errcode='23514'; end if;
 if NEW.generation=OLD.generation then
  if (NEW.worker,NEW.deployment_id,NEW.operation_id) is distinct from (OLD.worker,OLD.deployment_id,OLD.operation_id)
     or NEW.lease_until>OLD.lease_until then raise exception 'InvalidLeaseGeneration' using errcode='23514'; end if;
 elsif NEW.generation<>OLD.generation+1 or OLD.lease_until>clock_timestamp()
   or (NEW.operation_id<>OLD.operation_id and not exists(select 1 from api_private.testnet_work w
     where w.operation_id=OLD.operation_id and w.state in ('PROJECTED','CONFIRMED_FAILED','EXPIRED_NOT_APPLIED','ABORTED_PRE_DISPATCH'))) then
  raise exception 'InvalidLeaseGeneration' using errcode='23514';
 end if;
 return NEW;
end $$;

-- Existing invoker trigger functions retain their ACLs. New invoker checks use
-- existing private tables only; no role, grant, RLS or SECURITY DEFINER changes.
create or replace function api_private.guard_testnet_close_pair() returns trigger language plpgsql set search_path=pg_catalog as $$
declare op uuid; w api_private.testnet_work; o app_private.stellar_operations; n integer;
begin
 if TG_TABLE_NAME='stellar_operations' then op:=NEW.id; else op:=NEW.operation_id; end if;
 select * into w from api_private.testnet_work where operation_id=op;
 if not found then return null; end if;
 select * into o from app_private.stellar_operations where id=op;
 select count(*) into n from api_private.testnet_observations where operation_id=op and kind='PRE_DISPATCH_CLOSE';
 if w.state='ABORTED_PRE_DISPATCH' or n>0 or (op='0192a5b3-36e9-4709-9708-03d6a56a5125'::uuid and w.state='PREPARING' and o.state='CANCELLED_LOCAL') then
  if w.state<>'ABORTED_PRE_DISPATCH' or o.state<>'CANCELLED_LOCAL' or o.error_code is distinct from 'PreDispatchAborted' or n<>1
    or w.dispatch_attempts<>0 or w.confirmation is not null or w.state_evidence is not null
    or exists(select 1 from api_private.testnet_envelopes where operation_id=op)
    or exists(select 1 from api_private.operation_transport where operation_id=op)
    or exists(select 1 from api_private.testnet_observations where operation_id=op and kind in ('DISPATCH_INTENT','SUBMIT_RESPONSE','RPC_OUTAGE','SUCCESS','FAILED'))
    or exists(select 1 from api_private.testnet_source_leases where network_id=w.network_id and source_account=w.source_account and lease_until>clock_timestamp())
    or exists(select 1 from chain_private.batteries where deployment_id=w.deployment_id and battery_id=w.battery_id)
    or not exists(select 1 from api_private.idempotency i where i.operation_id=op and i.response_status=409
      and i.response_body->>'class'='TERMINAL_UNSIGNED') then
   raise exception 'UnsignedClosePairRequired' using errcode='23514'; end if;
 end if;
 return null;
end $$;
create constraint trigger testnet_close_pair after insert or update on api_private.testnet_work deferrable initially deferred for each row execute function api_private.guard_testnet_close_pair();
create constraint trigger logical_close_pair after update on app_private.stellar_operations deferrable initially deferred for each row execute function api_private.guard_testnet_close_pair();
create constraint trigger receipt_close_pair after insert on api_private.testnet_observations deferrable initially deferred for each row execute function api_private.guard_testnet_close_pair();
create or replace function api_private.guard_closed_logical() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if OLD.state='CANCELLED_LOCAL' and NEW is distinct from OLD and exists(select 1 from api_private.testnet_work where operation_id=OLD.id and state='ABORTED_PRE_DISPATCH') then
  raise exception 'TransportTerminal' using errcode='23514'; end if;
 return NEW;
end $$;
create trigger closed_logical_immutable before update on app_private.stellar_operations for each row execute function api_private.guard_closed_logical();
commit;
