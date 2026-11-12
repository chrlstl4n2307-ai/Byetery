-- Local candidate. The reservation is present from the first commit of this migration.
begin;
set local lock_timeout = '5s';
select pg_advisory_xact_lock(hashtextextended('5c0cad2f-5f25-4216-8068-6cb9d2d26325',0));
lock table app_private.battery_records, app_private.stellar_operations, chain_private.batteries in access exclusive mode;
do $$
begin
 if exists(select 1 from app_private.battery_records where deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and battery_id='BYE-D3-R1-20261111-DCDE088CA870')
 or exists(select 1 from chain_private.batteries where deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and battery_id='BYE-D3-R1-20261111-DCDE088CA870')
 then raise exception 'D324ReservationConflict' using errcode='23514'; end if;
end $$;

-- No FK to a battery or deployment that may be provisioned after migrations.
create table api_private.d324_reservation (
 deployment_id uuid not null check(deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325'),
 battery_id app_private.battery_id not null check(battery_id='BYE-D3-R1-20261111-DCDE088CA870'),
 task text not null unique check(task='D3-24-RUN1'),
 recipient app_private.address not null check(recipient='GDXAWG56PVUHWGB5VSJRN6OUZTEL7M3SLKL46CDKKXQ42CU2XCS3PXCS'),
 primary key(deployment_id,battery_id)
);
insert into api_private.d324_reservation values('5c0cad2f-5f25-4216-8068-6cb9d2d26325',
 'BYE-D3-R1-20261111-DCDE088CA870','D3-24-RUN1','GDXAWG56PVUHWGB5VSJRN6OUZTEL7M3SLKL46CDKKXQ42CU2XCS3PXCS');

create table api_private.d324_admission (
 id uuid primary key,
 deployment_id uuid not null,
 battery_id app_private.battery_id not null,
 instance_id app_private.hash32 not null,
 grant_nonce app_private.hash32 not null unique,
 grant_hash app_private.hash32 not null unique,
 manifest_hash app_private.hash32 not null,
 live_hash app_private.hash32 not null unique,
 execution_hash app_private.hash32 not null unique,
 sessions jsonb not null check(jsonb_typeof(sessions)='array' and jsonb_array_length(sessions)=4),
 runner_key app_private.hash32 not null,
 admitted_at timestamptz not null,
 expires_at timestamptz not null check(expires_at>admitted_at and expires_at<=admitted_at+interval '75 minutes'),
 revoked_at timestamptz check(revoked_at>=admitted_at),
 unique(deployment_id,battery_id),
 unique(id,deployment_id,battery_id),
 foreign key(deployment_id,battery_id) references api_private.d324_reservation
);
create table api_private.d324_step (
 admission_id uuid not null,
 deployment_id uuid not null,
 battery_id app_private.battery_id not null,
 ordinal smallint not null check(ordinal between 1 and 5),
 command text not null check(command=(array['register_battery','open_return','confirm_collection','confirm_recycling','pay_reward'])[ordinal]),
 principal uuid not null references app_private.users(id),
 session_id uuid not null,
 idempotency_key text not null,
 input_hash app_private.hash32 not null,
 operation_id uuid not null unique,
 proof_expires_at timestamptz not null,
 enqueue_xid bigint not null default txid_current(),
 prepare_xid bigint,
 dispatch_xid bigint,
 primary key(admission_id,ordinal),
 unique(deployment_id,principal,idempotency_key),
 foreign key(admission_id,deployment_id,battery_id) references api_private.d324_admission(id,deployment_id,battery_id),
 foreign key(deployment_id,operation_id,battery_id) references app_private.stellar_operations(deployment_id,id,battery_id)
   deferrable initially deferred
);
alter table api_private.d324_reservation enable row level security;
alter table api_private.d324_admission enable row level security;
alter table api_private.d324_step enable row level security;
alter table api_private.d324_reservation force row level security;
alter table api_private.d324_admission force row level security;
alter table api_private.d324_step force row level security;
revoke all on api_private.d324_reservation,api_private.d324_admission,api_private.d324_step from public,anon,authenticated;
create trigger d324_reservation_immutable before update or delete on api_private.d324_reservation for each row
 execute function app_private.protect_fields('deployment_id','battery_id','task','recipient');
create trigger d324_admission_immutable before update or delete on api_private.d324_admission for each row
 execute function app_private.protect_fields('id','deployment_id','battery_id','instance_id','grant_nonce','grant_hash','manifest_hash',
 'live_hash','runner_key','admitted_at','expires_at','execution_hash','sessions');
create trigger d324_step_immutable before update or delete on api_private.d324_step for each row
 execute function app_private.protect_fields('admission_id','deployment_id','battery_id','ordinal','command','principal','session_id',
 'idempotency_key','input_hash','operation_id','enqueue_xid','proof_expires_at');

create function api_private.d324_monotonic() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if (TG_TABLE_NAME='d324_admission' and (to_jsonb(NEW)->>'revoked_at') is distinct from (to_jsonb(OLD)->>'revoked_at')
     and ((to_jsonb(OLD)->>'revoked_at') is not null or (to_jsonb(NEW)->>'revoked_at') is null))
 or (TG_TABLE_NAME='d324_step' and (to_jsonb(NEW)->>'dispatch_xid') is distinct from (to_jsonb(OLD)->>'dispatch_xid')
     and ((to_jsonb(OLD)->>'dispatch_xid') is not null or (to_jsonb(NEW)->>'dispatch_xid')::bigint is distinct from txid_current()))
 or (TG_TABLE_NAME='d324_step' and (to_jsonb(NEW)->>'prepare_xid') is distinct from (to_jsonb(OLD)->>'prepare_xid')
     and ((to_jsonb(OLD)->>'prepare_xid') is not null or (to_jsonb(NEW)->>'prepare_xid')::bigint is distinct from txid_current()))
 then raise exception 'D324AuthorityImmutable' using errcode='23514'; end if;
 return NEW;
end $$;
create trigger d324_admission_monotonic before update on api_private.d324_admission for each row execute function api_private.d324_monotonic();
create trigger d324_step_monotonic before update on api_private.d324_step for each row execute function api_private.d324_monotonic();

-- Read only. Older deployments may not have the optional review schema.
create function api_private.d324_waiting_review() returns boolean language plpgsql set search_path=pg_catalog as $$
begin
 if to_regclass('review_private.registration_intents') is null then return false; end if;
 return exists(select 1 from review_private.registration_intents where deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325'
  and (status='WAITING' or battery_id='BYE-D3-R1-20261111-DCDE088CA870'));
end $$;
revoke all on function api_private.d324_waiting_review() from public,anon,authenticated;
create function api_private.d324_enqueue_window(a api_private.d324_admission, deadline timestamptz) returns boolean
 language plpgsql set search_path=pg_catalog as $$
declare session_count integer; session_cutoff timestamptz;
begin
 select count(*),min(least(q.not_after,to_timestamp((p->>'tokenExpiresAt')::numeric/1000)))-interval '120 seconds'
 into session_count,session_cutoff from jsonb_array_elements(a.sessions) p
 join auth.sessions q on q.id=(p->>'sessionId')::uuid and q.user_id=(p->>'authUserId')::uuid;
 return a.revoked_at is null and session_count=4 and session_cutoff is not null
  and clock_timestamp()<least(a.expires_at,deadline,session_cutoff);
end $$;
create function api_private.d324_guard_intake() returns trigger language plpgsql set search_path=pg_catalog as $$
declare s api_private.d324_step%rowtype;
begin
 if NEW.deployment_id<>'5c0cad2f-5f25-4216-8068-6cb9d2d26325'
 or NEW.battery_id is distinct from 'BYE-D3-R1-20261111-DCDE088CA870' then return NEW; end if;
 if TG_TABLE_NAME='battery_records' then
  select step.* into s from api_private.d324_step step
    where step.deployment_id=NEW.deployment_id and step.battery_id=NEW.battery_id
      and step.ordinal=1 and step.principal=NEW.created_by and step.enqueue_xid=txid_current();
 else
  if NEW.parameters->>'batteryId' is distinct from NEW.battery_id or NEW.parameters->>'kind' is distinct from NEW.command
  then raise exception 'D324OperationContextMismatch' using errcode='23514'; end if;
  select step.* into s from api_private.d324_step step
    where step.deployment_id=NEW.deployment_id and step.battery_id=NEW.battery_id
      and step.operation_id=NEW.id and step.principal::text=NEW.principal and step.command=NEW.command
      and step.idempotency_key=NEW.idempotency_key and step.enqueue_xid=txid_current();
 end if;
 if s.operation_id is null then raise exception 'D324AdmissionRequired' using errcode='23514'; end if;
 if not exists(select 1 from api_private.d324_admission a
     where a.id=s.admission_id and api_private.d324_enqueue_window(a,s.proof_expires_at))
 then raise exception 'D324WriteProofExpired' using errcode='23514'; end if;
 return NEW;
end $$;
-- Recheck at transaction completion, including time spent after queueing
-- and before committing the idempotency response. A failure rolls back all writes.
create function api_private.d324_guard_step_commit() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if NEW.enqueue_xid<>txid_current() or not exists(select 1 from api_private.d324_admission a
   where a.id=NEW.admission_id and api_private.d324_enqueue_window(a,NEW.proof_expires_at))
 then raise exception 'D324WriteProofExpired' using errcode='23514'; end if;
 return null;
end $$;
create constraint trigger d324_step_commit after insert on api_private.d324_step
 deferrable initially deferred for each row execute function api_private.d324_guard_step_commit();
create trigger d324_guard_battery_insert before insert on app_private.battery_records for each row execute function api_private.d324_guard_intake();
create trigger d324_guard_operation_insert before insert on app_private.stellar_operations for each row execute function api_private.d324_guard_intake();

-- Older writers cannot begin or retry a dispatch without a same-transaction claim.
create function api_private.d324_guard_dispatch() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if NEW.deployment_id<>'5c0cad2f-5f25-4216-8068-6cb9d2d26325'
 or NEW.battery_id<>'BYE-D3-R1-20261111-DCDE088CA870' then return NEW; end if;
 if NEW.state='PREPARING' and not exists(select 1 from api_private.d324_step s join api_private.d324_admission a on a.id=s.admission_id
    where s.operation_id=NEW.operation_id and s.command=NEW.command and s.prepare_xid=txid_current()
      and a.revoked_at is null and a.expires_at>clock_timestamp())
 then raise exception 'D324PreparationAuthorityRequired' using errcode='23514'; end if;
 if NEW.dispatch_attempts>OLD.dispatch_attempts and (
  NEW.dispatch_attempts<>1 or not exists(select 1 from api_private.d324_step s join api_private.d324_admission a on a.id=s.admission_id
    where s.operation_id=NEW.operation_id and s.command=NEW.command and s.dispatch_xid=txid_current()
      and a.revoked_at is null and a.expires_at>clock_timestamp()))
 then raise exception 'D324DispatchAuthorityRequired' using errcode='23514'; end if;
 return NEW;
end $$;
create trigger d324_guard_first_dispatch before update on api_private.testnet_work for each row execute function api_private.d324_guard_dispatch();
revoke all on function api_private.d324_monotonic(),api_private.d324_guard_intake(),api_private.d324_guard_dispatch()
 from public,anon,authenticated;
revoke all on function api_private.d324_guard_step_commit(),api_private.d324_enqueue_window(api_private.d324_admission,timestamptz) from public,anon,authenticated;
-- No public function or automated expiration path can close this work.
-- Proof is corroborated by the old logical/work rows and append-only observations.
create function api_private.d324_unsigned_close_proof(w api_private.testnet_work) returns boolean
 language sql set search_path=pg_catalog as $$
 select w.dispatch_attempts=0 and w.confirmation is null and w.state_evidence is null
  and not exists(select 1 from api_private.testnet_envelopes where operation_id=w.operation_id)
  and not exists(select 1 from api_private.operation_transport where operation_id=w.operation_id)
  and not exists(select 1 from api_private.testnet_observations x where x.operation_id=w.operation_id and
    (x.kind in ('DISPATCH_INTENT','SUBMIT_RESPONSE','RPC_OUTAGE','SUCCESS','FAILED','NOT_FOUND','PROJECTION')
      or x.evidence->>'phase' in ('ENVELOPE_SIGN_RETURNED','IDENTITY_PERSIST_START')
      or (x.evidence ? 'transactionHash' and not (x.kind='EXECUTION_PHASE' and coalesce(x.evidence->>'phase','')='SIGNING_IDENTITY_VALIDATED'))
      or x.evidence->>'classification' in ('DURABLE_IDENTITY_UNCERTAIN','UNCERTAIN_OPEN_RPC')
      or (x.kind='EXECUTION_PHASE' and x.evidence->>'phase'='ENVELOPE_SIGN_START'
        and not exists(select 1 from api_private.testnet_observations blocked
          where blocked.operation_id=w.operation_id and blocked.id>x.id and blocked.kind='EXECUTION_PHASE'
            and blocked.evidence->>'phase'='ENVELOPE_SIGN_NOT_STARTED'
            and blocked.evidence->>'generation'=x.evidence->>'generation'))))
  and exists(select 1 from api_private.testnet_observations x
    join api_private.d324_step s on s.operation_id=x.operation_id and s.deployment_id=x.deployment_id
    join api_private.d324_admission a on a.id=s.admission_id
    join app_private.stellar_operations o on o.id=s.operation_id and o.deployment_id=s.deployment_id
    where x.operation_id=w.operation_id and x.deployment_id=w.deployment_id and x.kind='PRE_DISPATCH_CLOSE'
      and s.battery_id=w.battery_id and s.command=w.command and o.parameters_hash=w.context_hash
      and o.state in ('QUEUED','CANCELLED_LOCAL') and s.dispatch_xid is null and a.expires_at<=clock_timestamp()
      and x.evidence->>'schemaVersion'='BYETERY_D324_PRE_DISPATCH_CLOSE_V1'
      and x.evidence->>'admissionId'=a.id::text and x.evidence->>'operationId'=w.operation_id::text
      and x.evidence->>'deploymentId'=w.deployment_id::text and x.evidence->>'batteryId'=w.battery_id
      and x.evidence->>'sourceAccount'=w.source_account and x.evidence->>'contextHash'=encode(w.context_hash,'hex')
      and x.evidence->>'reason'='D324ExecutionExpired' and x.evidence->>'budgetReleased'='false'
      and x.evidence->>'decisionId'~'^[a-zA-Z0-9._:-]{8,128}$' and x.evidence->>'reviewDigest'~'^[0-9a-f]{64}$');
$$;
revoke all on function api_private.d324_unsigned_close_proof(api_private.testnet_work) from public,anon,authenticated;
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
  if NEW.state='ABORTED_PRE_DISPATCH' and NEW.deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325'
    and NEW.battery_id='BYE-D3-R1-20261111-DCDE088CA870' then
   if OLD.state not in ('CLAIMED','PREPARING') or (to_jsonb(NEW)-'state') is distinct from (to_jsonb(OLD)-'state')
    or not api_private.d324_unsigned_close_proof(OLD)
   then raise exception 'D324UnsignedClosureNotReviewed' using errcode='23514'; end if;
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
create or replace function api_private.guard_testnet_close_pair() returns trigger language plpgsql set search_path=pg_catalog as $$
declare op uuid; w api_private.testnet_work; o app_private.stellar_operations; n integer;
begin
 if TG_TABLE_NAME='stellar_operations' then op:=NEW.id; else op:=NEW.operation_id; end if;
 select * into w from api_private.testnet_work where operation_id=op;
 if not found then return null; end if;
 select * into o from app_private.stellar_operations where id=op;
 select count(*) into n from api_private.testnet_observations where operation_id=op and kind='PRE_DISPATCH_CLOSE';
 if w.deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and w.battery_id='BYE-D3-R1-20261111-DCDE088CA870'
    and (n>0 or w.state='ABORTED_PRE_DISPATCH' or o.state='CANCELLED_LOCAL') then
  if w.state<>'ABORTED_PRE_DISPATCH' or o.state<>'CANCELLED_LOCAL' or o.error_code is distinct from 'D324ExecutionExpired'
    or n<>1 or not api_private.d324_unsigned_close_proof(w)
    or exists(select 1 from api_private.testnet_source_leases where operation_id=op and lease_until>clock_timestamp())
    or not exists(select 1 from api_private.idempotency i where i.operation_id=op and i.response_status=409
       and i.response_body->>'class'='TERMINAL_UNSIGNED')
  then raise exception 'D324UnsignedClosePairRequired' using errcode='23514'; end if;
  return null;
 end if;
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
commit;
