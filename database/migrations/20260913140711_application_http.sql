begin;
-- Application-only infrastructure. Foundation and contract projection rules stay intact.
create schema api_private;
alter table app_private.stellar_operations add unique(deployment_id,id);
create table api_private.memberships (
 deployment_id uuid not null references chain_private.deployments(id),
 user_id uuid not null references app_private.users(id),
 role text not null check(role in ('USER','ADMIN','COLLECTOR','RECYCLER')),
 actor_address app_private.address, enabled boolean not null default true,
 primary key(deployment_id,user_id,role),
 check((role in ('COLLECTOR','RECYCLER')) = (actor_address is not null))
);
create table api_private.wallet_challenges (
 id uuid primary key, deployment_id uuid not null, user_id uuid not null references app_private.users(id),
 network_id app_private.hash32 not null, address app_private.address not null check(address like 'G%'),
 nonce app_private.nonzero_hash not null unique, purpose text not null check(purpose='LINK_WALLET'),
 message_bytes bytea not null, created_at timestamptz not null default now(), expires_at timestamptz not null,
 attempts integer not null default 0 check(attempts between 0 and 5),
 consumed_at timestamptz, foreign key(deployment_id,network_id) references chain_private.deployments(id,network_id),
 check(expires_at > created_at and expires_at <= created_at + interval '10 minutes'),
 check(consumed_at is null or (consumed_at >= created_at and consumed_at < expires_at)),
 unique(deployment_id,id)
);
create index wallet_challenges_owner on api_private.wallet_challenges(deployment_id,user_id,expires_at);
create table api_private.idempotency (
 deployment_id uuid not null references chain_private.deployments(id),
 user_id uuid not null references app_private.users(id), key text not null check(length(key) between 8 and 128),
 input_hash app_private.hash32 not null, operation_id uuid,
 response_status integer check(response_status between 200 and 599), response_body jsonb,
 created_at timestamptz not null default now(), primary key(deployment_id,user_id,key),
 foreign key(deployment_id,operation_id) references app_private.stellar_operations(deployment_id,id),
 check((response_status is null) = (response_body is null))
);
create table api_private.operation_transport (
 deployment_id uuid not null, operation_id uuid primary key,
 prepared jsonb not null, submission jsonb not null,
 foreign key(deployment_id,operation_id) references app_private.stellar_operations(deployment_id,id),
 check(jsonb_typeof(prepared)='object' and jsonb_typeof(submission)='object'),
 check(submission->>'source'='MOCK')
);
create table api_private.mock_runtime (
 deployment_id uuid primary key references chain_private.deployments(id),
 snapshot bytea not null, revision bigint not null default 1 check(revision > 0)
);
create function api_private.guard_challenge() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if NEW.attempts < OLD.attempts or NEW.attempts > OLD.attempts+1 or
    (OLD.consumed_at is not null and NEW is distinct from OLD) or
    (NEW.consumed_at is not null and (OLD.attempts>=5 or NEW.attempts<>OLD.attempts+1)) then
  raise exception 'ChallengeTerminalOrInvalidAttempt' using errcode='23514';
 end if;
 return NEW;
end $$;
create trigger challenge_progress before update on api_private.wallet_challenges for each row execute function api_private.guard_challenge();
create trigger immutable_challenge before update or delete on api_private.wallet_challenges for each row execute function app_private.protect_fields('id','deployment_id','user_id','network_id','address','nonce','purpose','message_bytes','created_at','expires_at');
create trigger immutable_membership before update or delete on api_private.memberships for each row execute function app_private.protect_fields('deployment_id','user_id','role','actor_address');
create trigger immutable_idempotency before update or delete on api_private.idempotency for each row execute function app_private.protect_fields('deployment_id','user_id','key','input_hash','operation_id','created_at');
create trigger immutable_transport before update or delete on api_private.operation_transport for each row execute function app_private.protect_fields('deployment_id','operation_id','prepared','submission');
create trigger immutable_runtime before update or delete on api_private.mock_runtime for each row execute function app_private.protect_fields('deployment_id');
do $$ declare t record; begin
 for t in select tablename from pg_tables where schemaname='api_private' loop
  execute format('alter table api_private.%I enable row level security',t.tablename);
  execute format('alter table api_private.%I force row level security',t.tablename);
  execute format('create policy browser_deny on api_private.%I as restrictive for all to anon,authenticated using(false) with check(false)',t.tablename);
 end loop;
end $$;
revoke all on schema api_private from public,anon,authenticated;
revoke all on all tables in schema api_private from public,anon,authenticated;
revoke all on all functions in schema api_private from public,anon,authenticated;
alter default privileges in schema api_private revoke all on tables from public,anon,authenticated;
alter default privileges in schema api_private revoke execute on functions from public,anon,authenticated;
commit;
