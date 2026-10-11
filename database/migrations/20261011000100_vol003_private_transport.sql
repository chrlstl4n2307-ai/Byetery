-- VOL-003: additive LOCAL validation only; never applied to Supabase DEV by this package.
begin;
create table api_private.testnet_work (
 deployment_id uuid not null, operation_id uuid primary key,
 network_id app_private.hash32 not null, contract_address app_private.address not null,
 source_account app_private.address not null check(source_account like 'G%'),
 command text not null, battery_id app_private.battery_id not null,
 context_hash app_private.nonzero_hash not null, arguments_xdr jsonb not null check(jsonb_typeof(arguments_xdr)='array'),
 state text not null default 'CLAIMED' check(state in ('CLAIMED','PREPARING','SIGNED','READY','DISPATCH_INTENT','SUBMITTED_OR_UNKNOWN','CONFIRMED_SUCCESS','CONFIRMED_FAILED','EXPIRED_NOT_APPLIED','EXPIRED_UNRESOLVED','PROJECTED')),
 dispatch_attempts integer not null default 0 check(dispatch_attempts>=0),
 confirmation jsonb, state_evidence jsonb,
 created_at timestamptz not null default now(),
 unique(deployment_id,operation_id), unique(network_id,source_account,operation_id),
 foreign key(deployment_id,operation_id,battery_id) references app_private.stellar_operations(deployment_id,id,battery_id),
 foreign key(deployment_id,network_id) references chain_private.deployments(id,network_id)
);
-- No automatic new reward identity, including after expiry/failure. A later
-- reviewed replacement policy is outside VOL-003; same-hash retry uses this row.
create unique index testnet_reward_single_effect on api_private.testnet_work(deployment_id,battery_id)
 where command='pay_reward';
create table api_private.testnet_source_leases (
 network_id app_private.hash32 not null, source_account app_private.address not null,
 deployment_id uuid not null, operation_id uuid not null,
 worker text not null check(length(worker) between 1 and 128), generation bigint not null check(generation>0),
 created_at timestamptz not null default now(), lease_until timestamptz not null,
 primary key(network_id,source_account),
 foreign key(deployment_id,operation_id) references api_private.testnet_work(deployment_id,operation_id),
 foreign key(network_id,source_account,operation_id) references api_private.testnet_work(network_id,source_account,operation_id)
);
create table api_private.testnet_envelopes (
 deployment_id uuid not null, operation_id uuid primary key,
 network_id app_private.hash32 not null, contract_address app_private.address not null,
 source_account app_private.address not null check(source_account like 'G%'),
 sequence numeric(20,0) not null check(sequence>0 and sequence<=9223372036854775807),
 signed_envelope bytea not null check(octet_length(signed_envelope) between 1 and 131072),
 transaction_hash app_private.nonzero_hash not null,
 context_hash app_private.nonzero_hash not null,
 min_time numeric(20,0) not null check(min_time>=0), max_time numeric(20,0) not null check(max_time>min_time),
 authorization_expirations bigint[] not null, prepared_ledger bigint not null check(prepared_ledger>0),
 created_at timestamptz not null default now(),
 unique(network_id,transaction_hash), unique(network_id,source_account,sequence),
 foreign key(deployment_id,operation_id) references api_private.testnet_work(deployment_id,operation_id)
);
create table api_private.testnet_observations (
 id bigint generated always as identity primary key, deployment_id uuid not null, operation_id uuid not null,
 kind text not null check(kind in ('DISPATCH_INTENT','SUBMIT_RESPONSE','RPC_OUTAGE','NOT_FOUND','SUCCESS','FAILED','STATE_READ','PROJECTION')),
 observation_ledger bigint check(observation_ledger>0), confirmation_ledger bigint check(confirmation_ledger>0),
 state_read_ledger bigint check(state_read_ledger>0), evidence jsonb not null check(jsonb_typeof(evidence)='object'),
 created_at timestamptz not null default now(),
 foreign key(deployment_id,operation_id) references api_private.testnet_work(deployment_id,operation_id)
);
create function api_private.guard_testnet_work() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if TG_OP='INSERT' then
  if NEW.state<>'CLAIMED' or NEW.dispatch_attempts<>0 or NEW.confirmation is not null or NEW.state_evidence is not null
    or not exists(select 1 from chain_private.deployments d join app_private.stellar_operations o on o.deployment_id=d.id
      where d.id=NEW.deployment_id and d.mode='TESTNET' and d.contract_address=NEW.contract_address
        and o.id=NEW.operation_id and o.command=NEW.command and o.parameters->>'kind'=NEW.command and o.parameters_hash=NEW.context_hash
        and o.command<>'set_role') then raise exception 'InvalidTestnetContext' using errcode='23514'; end if;
 else
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
    ('CLAIMED','PREPARING'),('PREPARING','SIGNED'),('SIGNED','READY'),('READY','DISPATCH_INTENT'),
    ('DISPATCH_INTENT','SUBMITTED_OR_UNKNOWN'),('READY','SUBMITTED_OR_UNKNOWN'),('SUBMITTED_OR_UNKNOWN','DISPATCH_INTENT'),
    ('EXPIRED_UNRESOLVED','SUBMITTED_OR_UNKNOWN'),('CONFIRMED_SUCCESS','PROJECTED'))
    or (OLD.state in ('READY','DISPATCH_INTENT','SUBMITTED_OR_UNKNOWN','EXPIRED_UNRESOLVED')
        and NEW.state in ('CONFIRMED_SUCCESS','CONFIRMED_FAILED','EXPIRED_NOT_APPLIED','EXPIRED_UNRESOLVED'))) then
   raise exception 'InvalidTransportTransition' using errcode='23514'; end if;
 end if;
 return NEW;
end $$;
create function api_private.guard_testnet_envelope() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if not exists(select 1 from api_private.testnet_work w where w.operation_id=NEW.operation_id
   and w.deployment_id=NEW.deployment_id and w.network_id=NEW.network_id and w.source_account=NEW.source_account
   and w.contract_address=NEW.contract_address and w.context_hash=NEW.context_hash and w.state='PREPARING')
   or exists(select 1 from unnest(NEW.authorization_expirations) v where v<=NEW.prepared_ledger) then
  raise exception 'EnvelopeContextMismatch' using errcode='23514'; end if;
 return NEW;
end $$;
create trigger testnet_context before insert or update on api_private.testnet_work for each row execute function api_private.guard_testnet_work();
create trigger testnet_envelope_context before insert on api_private.testnet_envelopes for each row execute function api_private.guard_testnet_envelope();
create trigger immutable_testnet_work before update or delete on api_private.testnet_work for each row execute function app_private.protect_fields('deployment_id','operation_id','network_id','contract_address','source_account','command','battery_id','context_hash','arguments_xdr','created_at');
create trigger immutable_testnet_envelope before update or delete on api_private.testnet_envelopes for each row execute function app_private.protect_fields('deployment_id','operation_id','network_id','contract_address','source_account','sequence','signed_envelope','transaction_hash','context_hash','min_time','max_time','authorization_expirations','prepared_ledger','created_at');
create trigger immutable_testnet_observation before update or delete on api_private.testnet_observations for each row execute function app_private.protect_fields('id','deployment_id','operation_id','kind','observation_ledger','confirmation_ledger','state_read_ledger','evidence','created_at');
create function api_private.guard_testnet_lease() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if NEW.generation=OLD.generation then
  if (NEW.worker,NEW.deployment_id,NEW.operation_id) is distinct from (OLD.worker,OLD.deployment_id,OLD.operation_id)
     or NEW.lease_until>OLD.lease_until then raise exception 'InvalidLeaseGeneration' using errcode='23514'; end if;
 elsif NEW.generation<>OLD.generation+1 or OLD.lease_until>clock_timestamp()
   or (NEW.operation_id<>OLD.operation_id and not exists(select 1 from api_private.testnet_work w
     where w.operation_id=OLD.operation_id and w.state in ('PROJECTED','CONFIRMED_FAILED','EXPIRED_NOT_APPLIED'))) then
  raise exception 'InvalidLeaseGeneration' using errcode='23514';
 end if;
 return NEW;
end $$;
create trigger testnet_lease_fence before update on api_private.testnet_source_leases for each row execute function api_private.guard_testnet_lease();
create trigger immutable_testnet_lease_key before update or delete on api_private.testnet_source_leases for each row execute function app_private.protect_fields('network_id','source_account','created_at');
do $$ declare t text; begin
 foreach t in array array['testnet_work','testnet_source_leases','testnet_envelopes','testnet_observations'] loop
  execute format('alter table api_private.%I enable row level security',t);
  execute format('alter table api_private.%I force row level security',t);
  execute format('create policy browser_deny on api_private.%I as restrictive for all to anon,authenticated using(false) with check(false)',t);
  execute format('revoke all on api_private.%I from public,anon,authenticated',t);
 end loop;
end $$;
revoke all on all functions in schema api_private from public,anon,authenticated;
revoke all on all sequences in schema api_private from public,anon,authenticated;
commit;
