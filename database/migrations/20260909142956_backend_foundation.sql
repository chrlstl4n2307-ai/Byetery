-- Foundation only. Requires Supabase auth.users and anon/authenticated roles.
-- Test bootstrap supplies these in an isolated PostgreSQL instance, never in production.
begin;
create schema app_private;
create schema chain_private;
create domain app_private.hash32 as bytea check (octet_length(value) = 32);
create domain app_private.nonzero_hash as bytea check (octet_length(value) = 32 and value <> decode(repeat('00',32),'hex'));
create domain app_private.battery_id as text check (value collate "C" ~ '^[A-Z0-9-]{1,32}$');
create domain app_private.address as text check (value collate "C" ~ '^[GC][A-Z2-7]{55}$');

create table chain_private.deployments (
 id uuid primary key default gen_random_uuid(), mode text not null check(mode in ('MOCK','TESTNET')),
 network_id app_private.hash32 not null, contract_address app_private.address not null,
 wasm_hash app_private.hash32 not null, schema_version integer not null check(schema_version=1),
 admin app_private.address not null, service app_private.address not null,
 reward_token app_private.address not null, reward_amount numeric(39,0) not null,
 created_at timestamptz not null default now(),
 check(reward_token <> contract_address), check(reward_amount > 0 and reward_amount <= 170141183460469231731687303715884105727),
 unique(mode,network_id,contract_address), unique(id,network_id)
);
create table app_private.users (
 id uuid primary key default gen_random_uuid(), auth_user_id uuid unique references auth.users(id) on delete set null,
 status text not null default 'ACTIVE' check(status in ('ACTIVE','DISABLED')), created_at timestamptz not null default now()
);
create table app_private.wallet_links (
 id uuid primary key default gen_random_uuid(), deployment_id uuid not null, network_id app_private.hash32 not null,
 user_id uuid not null references app_private.users(id), address app_private.address not null,
 proof_reference text not null check(length(proof_reference)>0), verified_at timestamptz not null,
 revoked_at timestamptz, check(revoked_at is null or revoked_at >= verified_at),
 foreign key(deployment_id,network_id) references chain_private.deployments(id,network_id),
 unique(deployment_id,id,user_id,address)
);
create unique index wallet_active on app_private.wallet_links(deployment_id,user_id,address) where revoked_at is null;
create table app_private.battery_records (
 deployment_id uuid not null references chain_private.deployments(id), battery_id app_private.battery_id not null,
 metadata jsonb not null default '{}' check(jsonb_typeof(metadata)='object'),
 created_by uuid references app_private.users(id), created_at timestamptz not null default now(),
 primary key(deployment_id,battery_id)
);
create table app_private.return_requests (
 deployment_id uuid not null, request_id app_private.hash32 not null, battery_id app_private.battery_id not null,
 user_id uuid not null references app_private.users(id), wallet_link_id uuid not null,
 recipient_snapshot app_private.address not null,
 reservation_state text not null default 'HELD' check(reservation_state in ('HELD','CONSUMED','RELEASED')),
 association_confirmed_at timestamptz, created_at timestamptz not null default now(),
 primary key(deployment_id,request_id), unique(deployment_id,battery_id,request_id),
 foreign key(deployment_id,battery_id) references app_private.battery_records(deployment_id,battery_id),
 foreign key(deployment_id,wallet_link_id,user_id,recipient_snapshot) references app_private.wallet_links(deployment_id,id,user_id,address),
 check((reservation_state='CONSUMED') = (association_confirmed_at is not null))
);
create unique index one_reserved_request on app_private.return_requests(deployment_id,battery_id) where reservation_state in ('HELD','CONSUMED');
create index user_requests on app_private.return_requests(user_id,created_at);
create index request_wallet on app_private.return_requests(deployment_id,wallet_link_id,user_id,recipient_snapshot);

create table app_private.evidence_versions (
 id uuid primary key default gen_random_uuid(), deployment_id uuid not null, battery_id app_private.battery_id not null,
 request_id app_private.hash32, kind text not null check(kind in ('REGISTRATION','COLLECTION','RECYCLING')),
 revision integer not null check(revision>0), format_version integer not null check(format_version=1),
 manifest_bytes bytea not null, payload_hash app_private.nonzero_hash not null check(payload_hash=sha256(manifest_bytes)),
 commitment app_private.nonzero_hash, object_path text not null unique,
 created_by uuid references app_private.users(id), finalized_at timestamptz not null default now(),
 foreign key(deployment_id,battery_id) references app_private.battery_records(deployment_id,battery_id),
 foreign key(deployment_id,battery_id,request_id) references app_private.return_requests(deployment_id,battery_id,request_id),
 check((kind='REGISTRATION' and request_id is null and commitment is null) or (kind<>'REGISTRATION' and request_id is not null and commitment is not null)),
 unique nulls not distinct(deployment_id,battery_id,request_id,kind,revision)
);
create table chain_private.actor_roles (
 deployment_id uuid not null references chain_private.deployments(id), actor_address app_private.address not null,
 role text not null check(role in ('COLLECTOR','RECYCLER')), enabled boolean not null,
 confirmed_ledger bigint not null check(confirmed_ledger>0), primary key(deployment_id,actor_address,role)
);
create table chain_private.batteries (
 deployment_id uuid not null references chain_private.deployments(id), battery_id app_private.battery_id not null,
 state text not null check(state in ('REGISTERED','RETURNED','COLLECTED','RECYCLED')),
 registration_hash app_private.nonzero_hash not null, request_id app_private.hash32,
 collector app_private.address, collection_hash app_private.nonzero_hash,
 recycler app_private.address, recycling_hash app_private.nonzero_hash,
 reward_state text not null check(reward_state in ('NOT_ELIGIBLE','PENDING','SENT')),
 confirmed_ledger bigint not null check(confirmed_ledger>0), primary key(deployment_id,battery_id),
 check (
  (state='REGISTERED' and request_id is null and collector is null and collection_hash is null and recycler is null and recycling_hash is null and reward_state='NOT_ELIGIBLE') or
  (state='RETURNED' and request_id is not null and collector is null and collection_hash is null and recycler is null and recycling_hash is null and reward_state='NOT_ELIGIBLE') or
  (state='COLLECTED' and request_id is not null and collector is not null and collection_hash is not null and recycler is null and recycling_hash is null and reward_state='NOT_ELIGIBLE') or
  (state='RECYCLED' and request_id is not null and collector is not null and collection_hash is not null and recycler is not null and recycling_hash is not null and reward_state in ('PENDING','SENT'))
 )
);
create table chain_private.return_requests (
 deployment_id uuid not null, request_id app_private.hash32 not null, battery_id app_private.battery_id not null,
 recipient app_private.address not null, state text not null check(state in ('OPEN','CANCELLED','CONFIRMED')),
 confirmed_ledger bigint not null check(confirmed_ledger>0), primary key(deployment_id,request_id),
 unique(deployment_id,battery_id,request_id),
 foreign key(deployment_id,battery_id) references chain_private.batteries(deployment_id,battery_id) deferrable initially deferred
);
alter table chain_private.batteries add foreign key(deployment_id,battery_id,request_id)
 references chain_private.return_requests(deployment_id,battery_id,request_id) deferrable initially deferred;
create unique index one_live_chain_request on chain_private.return_requests(deployment_id,battery_id) where state in ('OPEN','CONFIRMED');

create table app_private.stellar_operations (
 id uuid primary key default gen_random_uuid(), deployment_id uuid not null references chain_private.deployments(id),
 principal text not null check(length(principal)>0), idempotency_key text not null check(length(idempotency_key)>0),
 command text not null check(command in ('register_battery','set_role','open_return','cancel_return','confirm_collection','confirm_recycling','pay_reward')),
 battery_id app_private.battery_id, request_id app_private.hash32,
 parameters jsonb not null check(jsonb_typeof(parameters)='object'), parameters_hash app_private.nonzero_hash not null,
 state text not null default 'QUEUED' check(state in ('QUEUED','AWAITING_AUTH','READY','SUBMITTED','UNKNOWN','CONFIRMED','REJECTED','CANCELLED_LOCAL')),
 error_code text, created_at timestamptz not null default now(),
 unique(deployment_id,principal,idempotency_key), unique(deployment_id,id,battery_id),
 foreign key(deployment_id,battery_id) references app_private.battery_records(deployment_id,battery_id),
 foreign key(deployment_id,battery_id,request_id) references app_private.return_requests(deployment_id,battery_id,request_id),
 check((command='set_role' and battery_id is null and request_id is null) or
       (command in ('register_battery','pay_reward') and battery_id is not null and request_id is null) or
       (command in ('open_return','cancel_return','confirm_collection','confirm_recycling') and battery_id is not null and request_id is not null))
);
create index pending_operations on app_private.stellar_operations(state,created_at) where state in ('QUEUED','AWAITING_AUTH','READY','SUBMITTED','UNKNOWN');
create index operations_request on app_private.stellar_operations(deployment_id,battery_id,request_id);
create table app_private.reward_attempts (
 id uuid primary key default gen_random_uuid(), deployment_id uuid not null, battery_id app_private.battery_id not null,
 request_id app_private.hash32 not null, operation_id uuid not null unique,
 attempt_number integer not null check(attempt_number>0),
 state text not null default 'QUEUED' check(state in ('QUEUED','SUBMITTED','UNKNOWN','SUCCEEDED','FAILED')),
 error_code text, created_at timestamptz not null default now(),
 unique(deployment_id,battery_id,attempt_number),
 unique(deployment_id,id),
 foreign key(deployment_id,operation_id,battery_id) references app_private.stellar_operations(deployment_id,id,battery_id),
 foreign key(deployment_id,battery_id,request_id) references chain_private.return_requests(deployment_id,battery_id,request_id)
);
create unique index one_active_reward_attempt on app_private.reward_attempts(deployment_id,battery_id) where state in ('QUEUED','SUBMITTED','UNKNOWN');
create unique index one_successful_reward_attempt on app_private.reward_attempts(deployment_id,battery_id) where state='SUCCEEDED';
create index reward_request on app_private.reward_attempts(deployment_id,battery_id,request_id);

-- Identity fields remain immutable even for privileged application writers.
create function app_private.protect_fields() returns trigger language plpgsql set search_path = pg_catalog as $$
declare k text;
begin
 if TG_OP='DELETE' then raise exception 'HistoryDeletionForbidden' using errcode='23514'; end if;
 foreach k in array TG_ARGV loop
  if (to_jsonb(NEW)->k) is distinct from (to_jsonb(OLD)->k) then raise exception 'ImmutableField: %',k using errcode='23514'; end if;
 end loop;
 return NEW;
end $$;
create trigger immutable_deployment before update or delete on chain_private.deployments for each row execute function app_private.protect_fields('id','mode','network_id','contract_address','wasm_hash','schema_version','admin','service','reward_token','reward_amount','created_at');
create trigger immutable_user before update or delete on app_private.users for each row execute function app_private.protect_fields('id','created_at');
create trigger immutable_wallet before update or delete on app_private.wallet_links for each row execute function app_private.protect_fields('id','deployment_id','network_id','user_id','address','proof_reference','verified_at');
create trigger immutable_record before update or delete on app_private.battery_records for each row execute function app_private.protect_fields('deployment_id','battery_id','created_by','created_at');
create trigger immutable_request before update or delete on app_private.return_requests for each row execute function app_private.protect_fields('deployment_id','request_id','battery_id','user_id','wallet_link_id','recipient_snapshot','created_at');
create trigger immutable_evidence before update or delete on app_private.evidence_versions for each row execute function app_private.protect_fields('id','deployment_id','battery_id','request_id','kind','revision','format_version','manifest_bytes','payload_hash','commitment','object_path','created_by','finalized_at');
create trigger immutable_role before update or delete on chain_private.actor_roles for each row execute function app_private.protect_fields('deployment_id','actor_address','role');
create trigger immutable_battery before update or delete on chain_private.batteries for each row execute function app_private.protect_fields('deployment_id','battery_id','registration_hash');
create trigger immutable_chain_request before update or delete on chain_private.return_requests for each row execute function app_private.protect_fields('deployment_id','request_id','battery_id','recipient');
create trigger immutable_operation before update or delete on app_private.stellar_operations for each row execute function app_private.protect_fields('id','deployment_id','principal','idempotency_key','command','battery_id','request_id','parameters','parameters_hash','created_at');
create trigger immutable_attempt before update or delete on app_private.reward_attempts for each row execute function app_private.protect_fields('id','deployment_id','battery_id','request_id','operation_id','attempt_number','created_at');

create function app_private.guard_local_request() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if TG_OP='INSERT' then
  if NEW.reservation_state <> 'HELD' or not exists(select 1 from app_private.wallet_links w join app_private.users u on u.id=w.user_id
   where w.id=NEW.wallet_link_id and w.deployment_id=NEW.deployment_id and w.user_id=NEW.user_id and w.address=NEW.recipient_snapshot and w.revoked_at is null and u.status='ACTIVE') then
   raise exception 'InvalidWalletOrReservation' using errcode='23514';
  end if;
 elsif OLD.reservation_state <> 'HELD' and NEW is distinct from OLD then
  raise exception 'TerminalReservation' using errcode='23514';
 end if;
 return NEW;
end $$;
create trigger guard_local_request before insert or update on app_private.return_requests for each row execute function app_private.guard_local_request();

create function chain_private.guard_transition() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if NEW.confirmed_ledger < OLD.confirmed_ledger then raise exception 'StaleObservation' using errcode='23514'; end if;
 if TG_TABLE_NAME='batteries' then
  if not (NEW.state=OLD.state or (OLD.state,NEW.state) in (('REGISTERED','RETURNED'),('RETURNED','REGISTERED'),('RETURNED','COLLECTED'),('COLLECTED','RECYCLED'))) then
   raise exception 'InvalidStateTransition' using errcode='23514'; end if;
  if OLD.state in ('COLLECTED','RECYCLED') and (NEW.request_id,NEW.collector,NEW.collection_hash) is distinct from (OLD.request_id,OLD.collector,OLD.collection_hash) then
   raise exception 'CollectionImmutable' using errcode='23514'; end if;
  if OLD.state='RECYCLED' and (NEW.recycler,NEW.recycling_hash) is distinct from (OLD.recycler,OLD.recycling_hash) then raise exception 'RecyclingImmutable' using errcode='23514'; end if;
  if OLD.reward_state='SENT' and NEW.reward_state<>'SENT' then raise exception 'RewardTerminal' using errcode='23514'; end if;
  if OLD.state='COLLECTED' and NEW.state='RECYCLED' and NEW.reward_state<>'PENDING' then raise exception 'MustBecomePending' using errcode='23514'; end if;
  if OLD.state='RETURNED' and NEW.state='RETURNED' and NEW.request_id is distinct from OLD.request_id then raise exception 'RequestImmutable' using errcode='23514'; end if;
 elsif TG_TABLE_NAME='return_requests' then
  if OLD.state<>'OPEN' and NEW.state<>OLD.state then raise exception 'RequestTerminal' using errcode='23514'; end if;
 end if;
 return NEW;
end $$;
create trigger battery_transition before update on chain_private.batteries for each row execute function chain_private.guard_transition();
create trigger request_transition before update on chain_private.return_requests for each row execute function chain_private.guard_transition();
create trigger role_observation before update on chain_private.actor_roles for each row execute function chain_private.guard_transition();

-- Cross-row consistency checked at COMMIT, including cancellation and double-claim races.
create function chain_private.check_consistency() returns trigger language plpgsql set search_path=pg_catalog as $$
declare b chain_private.batteries; r chain_private.return_requests;
begin
 select * into b from chain_private.batteries where deployment_id=NEW.deployment_id and battery_id=NEW.battery_id;
 if not found then return null; end if;
 if b.request_id is not null then
  select * into r from chain_private.return_requests where deployment_id=b.deployment_id and request_id=b.request_id;
  if not found or r.battery_id<>b.battery_id or (b.state='RETURNED' and r.state<>'OPEN') or (b.state in ('COLLECTED','RECYCLED') and r.state<>'CONFIRMED') then
   raise exception 'BatteryRequestMismatch' using errcode='23514'; end if;
 end if;
 if exists(select 1 from chain_private.return_requests q where q.deployment_id=b.deployment_id and q.battery_id=b.battery_id and q.state in ('OPEN','CONFIRMED') and q.request_id is distinct from b.request_id) then
  raise exception 'DetachedLiveRequest' using errcode='23514'; end if;
 return null;
end $$;
create constraint trigger battery_consistency after insert or update on chain_private.batteries deferrable initially deferred for each row execute function chain_private.check_consistency();
create constraint trigger request_consistency after insert or update on chain_private.return_requests deferrable initially deferred for each row execute function chain_private.check_consistency();

create function app_private.guard_attempt() returns trigger language plpgsql set search_path=pg_catalog as $$
declare b chain_private.batteries; op app_private.stellar_operations;
begin
 select * into b from chain_private.batteries where deployment_id=NEW.deployment_id and battery_id=NEW.battery_id;
 select * into op from app_private.stellar_operations where id=NEW.operation_id and deployment_id=NEW.deployment_id;
 if b.state is distinct from 'RECYCLED' or b.request_id is distinct from NEW.request_id or op.command is distinct from 'pay_reward' then raise exception 'RewardNotEligible' using errcode='23514'; end if;
 if TG_OP='INSERT' and (NEW.state<>'QUEUED' or b.reward_state<>'PENDING') then raise exception 'InvalidRewardAttempt' using errcode='23514'; end if;
 if TG_OP='UPDATE' and OLD.state in ('SUCCEEDED','FAILED') and NEW.state<>OLD.state then raise exception 'AttemptTerminal' using errcode='23514'; end if;
 if NEW.state='SUCCEEDED' and (b.reward_state<>'SENT' or op.state<>'CONFIRMED') then raise exception 'PaymentNotConfirmed' using errcode='23514'; end if;
 if NEW.state='FAILED' and op.state<>'REJECTED' then raise exception 'FailureNotConfirmed' using errcode='23514'; end if;
 return NEW;
end $$;
create trigger guard_attempt before insert or update on app_private.reward_attempts for each row execute function app_private.guard_attempt();

create function app_private.guard_progress() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if TG_TABLE_NAME='wallet_links' then
  if OLD.revoked_at is not null and NEW.revoked_at is distinct from OLD.revoked_at then raise exception 'RevocationImmutable' using errcode='23514'; end if;
 end if;
 if TG_TABLE_NAME='users' then
  if NEW.auth_user_id is distinct from OLD.auth_user_id and NEW.auth_user_id is not null then raise exception 'IdentityImmutable' using errcode='23514'; end if;
 end if;
 if TG_TABLE_NAME='stellar_operations' then
  if not (NEW.state=OLD.state or
   (OLD.state='QUEUED' and NEW.state in ('AWAITING_AUTH','READY','REJECTED','CANCELLED_LOCAL')) or
   (OLD.state='AWAITING_AUTH' and NEW.state in ('READY','REJECTED','CANCELLED_LOCAL')) or
   (OLD.state='READY' and NEW.state in ('SUBMITTED','REJECTED','CANCELLED_LOCAL')) or
   (OLD.state='SUBMITTED' and NEW.state in ('UNKNOWN','CONFIRMED','REJECTED')) or
   (OLD.state='UNKNOWN' and NEW.state in ('CONFIRMED','REJECTED'))) then raise exception 'InvalidOperationTransition' using errcode='23514'; end if;
 end if;
 return NEW;
end $$;
create trigger wallet_progress before update on app_private.wallet_links for each row execute function app_private.guard_progress();
create trigger user_progress before update on app_private.users for each row execute function app_private.guard_progress();
create trigger operation_progress before update on app_private.stellar_operations for each row execute function app_private.guard_progress();

create function app_private.check_claim_binding() returns trigger language plpgsql set search_path=pg_catalog as $$
declare a app_private.return_requests; c chain_private.return_requests; contract text;
begin
 select contract_address into contract from chain_private.deployments where id=NEW.deployment_id;
 select * into a from app_private.return_requests where deployment_id=NEW.deployment_id and request_id=NEW.request_id;
 select * into c from chain_private.return_requests where deployment_id=NEW.deployment_id and request_id=NEW.request_id;
 if c.recipient=contract or a.recipient_snapshot=contract then raise exception 'InvalidRecipient' using errcode='23514'; end if;
 if a.request_id is null then return null; end if;
 if c.request_id is not null then
  if (a.battery_id,a.recipient_snapshot) is distinct from (c.battery_id,c.recipient) then raise exception 'ClaimBindingMismatch' using errcode='23514'; end if;
  if (c.state='OPEN' and a.reservation_state<>'HELD') or (c.state='CONFIRMED' and a.reservation_state<>'CONSUMED') or (c.state='CANCELLED' and a.reservation_state<>'RELEASED') then raise exception 'ClaimStateMismatch' using errcode='23514'; end if;
 elsif a.reservation_state='CONSUMED' then raise exception 'CollectionNotConfirmed' using errcode='23514';
 elsif a.reservation_state='RELEASED' and exists(select 1 from app_private.stellar_operations o where o.deployment_id=a.deployment_id and o.request_id=a.request_id and o.state not in ('REJECTED','CANCELLED_LOCAL')) then
  raise exception 'UnresolvedOperation' using errcode='23514';
 end if;
 return null;
end $$;
create constraint trigger local_claim_binding after insert or update on app_private.return_requests deferrable initially deferred for each row execute function app_private.check_claim_binding();
create constraint trigger chain_claim_binding after insert or update on chain_private.return_requests deferrable initially deferred for each row execute function app_private.check_claim_binding();

-- No browser access. Explicit restrictive policies survive accidental future permissive policies.
do $$ declare t record; begin
 for t in select schemaname,tablename from pg_tables where schemaname in ('app_private','chain_private') loop
  execute format('alter table %I.%I enable row level security',t.schemaname,t.tablename);
  execute format('alter table %I.%I force row level security',t.schemaname,t.tablename);
  execute format('create policy browser_deny on %I.%I as restrictive for all to anon, authenticated using (false) with check (false)',t.schemaname,t.tablename);
 end loop;
end $$;
revoke all on schema app_private,chain_private from public,anon,authenticated;
revoke all on all tables in schema app_private,chain_private from public,anon,authenticated;
revoke all on all functions in schema app_private,chain_private from public,anon,authenticated;
alter default privileges in schema app_private,chain_private revoke all on tables from public,anon,authenticated;
alter default privileges in schema app_private,chain_private revoke execute on functions from public,anon,authenticated;
commit;
