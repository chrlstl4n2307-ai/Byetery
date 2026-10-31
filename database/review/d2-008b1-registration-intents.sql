-- D2-008B1: LOCAL TEST/APPLY ARTIFACT ONLY. NOT a remote migration authorization.
-- Deliberately outside database/migrations and Supabase's automatic sequence.
begin;
do $$ begin
 if current_user<>'postgres' or session_user<>'postgres'
  or (select rolsuper from pg_roles where rolname=current_user)
  or current_setting('createrole_self_grant')<>'' then
  raise exception 'ReviewRequiresNonSuperuserPostgresEmptySelfGrant';
 end if;
end $$;
do $$
begin
 if not exists(select 1 from pg_roles where rolname='byetery_d2_intent_owner') then
  create role byetery_d2_intent_owner nologin noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
 end if;
 if not exists(select 1 from pg_roles where rolname='byetery_d2_review_app') then
  create role byetery_d2_review_app login noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
 end if;
 if exists(select 1 from pg_roles where rolname in ('byetery_d2_intent_owner','byetery_d2_review_app')
   and (rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or rolreplication or rolinherit
     or (rolname='byetery_d2_intent_owner' and rolcanlogin)))
   or exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.member
     where r.rolname in ('byetery_d2_intent_owner','byetery_d2_review_app')) then
  raise exception 'UnsafeExistingReviewRole';
 end if;
end $$;
create schema review_private;
revoke all on schema review_private from public,anon,authenticated;
do $$ begin
 if exists(select from pg_roles where rolname='service_role') then
  revoke all on schema review_private from service_role;
 end if;
end $$;
-- D2-008B3.2 / DP2: owner-specific defaults did not protect postgres-created
-- functions. Explicit pre-transfer ACL closure + catalogue assertions do.
-- NOLOGIN owners finish without schema CREATE; no owner default ACL is added.

create table review_private.permissions (
 deployment_id uuid not null references chain_private.deployments(id),
 principal uuid not null references app_private.users(id),
 capability text not null check(capability='CREATE_D2_REGISTRATION_INTENT'),
 enabled boolean not null default true,
 created_at timestamptz not null default now(),
 primary key(deployment_id,principal,capability),
 check(deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325')
);
create table review_private.registration_intents (
 operation_id uuid primary key default gen_random_uuid(),
 deployment_id uuid not null references chain_private.deployments(id),
 principal uuid not null references app_private.users(id),
 idempotency_key text not null check(idempotency_key ~ '^[A-Za-z0-9._:-]{8,128}$'),
 input_hash app_private.hash32 not null,
 battery_id app_private.battery_id not null check(battery_id ~ '^BYE-REVIEW-[A-F0-9]{20}$'),
 manifest_bytes bytea not null check(octet_length(manifest_bytes) between 1 and 1024),
 registration_hash app_private.nonzero_hash not null,
 status text not null default 'WAITING' check(status in ('WAITING','ADOPTED')),
 created_at timestamptz not null default now(),
 adopted_at timestamptz,
 adopted_operation_id uuid,
 constraint review_manifest_hash check(registration_hash=sha256(manifest_bytes)),
 constraint review_intent_state check(
  (status='WAITING' and adopted_at is null and adopted_operation_id is null) or
  (status='ADOPTED' and adopted_at is not null and adopted_at>=created_at
   and adopted_operation_id is not null and adopted_operation_id=operation_id)),
 check(deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325'),
 unique(deployment_id,principal,idempotency_key),
 unique(deployment_id,battery_id),
 foreign key(deployment_id,adopted_operation_id) references app_private.stellar_operations(deployment_id,id)
);
create unique index review_one_waiting_per_principal
 on review_private.registration_intents(deployment_id,principal) where status='WAITING';

create function review_private.immutable_intent() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='DELETE' then raise exception 'ReviewIntentImmutable' using errcode='23514'; end if;
 if (to_jsonb(NEW)-array['status','adopted_at','adopted_operation_id'])
    is distinct from (to_jsonb(OLD)-array['status','adopted_at','adopted_operation_id'])
    or OLD.status<>'WAITING' or NEW.status<>'ADOPTED' then
  raise exception 'ReviewIntentImmutable' using errcode='23514';
 end if;
 return NEW;
end $$;
create trigger review_intent_immutable before update or delete on review_private.registration_intents
 for each row execute function review_private.immutable_intent();
create trigger review_permission_identity before update or delete on review_private.permissions
 for each row execute function app_private.protect_fields('deployment_id','principal','capability','created_at');

alter table review_private.permissions enable row level security;
alter table review_private.permissions force row level security;
alter table review_private.registration_intents enable row level security;
alter table review_private.registration_intents force row level security;
create policy review_permission_read on review_private.permissions for select to byetery_d2_intent_owner
 using(deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and capability='CREATE_D2_REGISTRATION_INTENT');
create policy review_intent_read on review_private.registration_intents for select to byetery_d2_intent_owner
 using(deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325');
create policy review_intent_insert on review_private.registration_intents for insert to byetery_d2_intent_owner
 with check(deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and status='WAITING'
  and principal=nullif(current_setting('byetery.review_principal',true),'')::uuid
  and adopted_at is null and adopted_operation_id is null);
create policy review_intent_adopt on review_private.registration_intents for update to byetery_d2_intent_owner
 using(deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and status in ('WAITING','ADOPTED'))
 with check(deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and status='ADOPTED'
  and adopted_operation_id=operation_id);

grant usage on schema review_private,app_private,api_private,chain_private to byetery_d2_intent_owner;
grant select on review_private.registration_intents,review_private.permissions to byetery_d2_intent_owner;
grant insert on review_private.registration_intents to byetery_d2_intent_owner;
grant update(status,adopted_at,adopted_operation_id) on review_private.registration_intents to byetery_d2_intent_owner;
-- FOR SHARE needs UPDATE privilege plus scoped UPDATE visibility under RLS.
-- The policies below preserve ACTIVE/enabled values; no callable function mutates
-- this authority. These column privileges exist only for current-authority locks.
grant update(enabled) on review_private.permissions,api_private.memberships to byetery_d2_intent_owner;
grant update(status) on app_private.users to byetery_d2_intent_owner;
grant select(id,status) on app_private.users to byetery_d2_intent_owner;
grant select(deployment_id,user_id,role,enabled) on api_private.memberships to byetery_d2_intent_owner;
grant select(id,mode,network_id,contract_address,wasm_hash) on chain_private.deployments to byetery_d2_intent_owner;
grant select(deployment_id,battery_id) on app_private.battery_records to byetery_d2_intent_owner;
grant select(id,deployment_id) on app_private.stellar_operations to byetery_d2_intent_owner;
grant insert(deployment_id,battery_id,metadata,created_by) on app_private.battery_records to byetery_d2_intent_owner;
grant insert(deployment_id,battery_id,kind,revision,format_version,manifest_bytes,payload_hash,object_path,created_by)
 on app_private.evidence_versions to byetery_d2_intent_owner;
grant insert(id,deployment_id,principal,idempotency_key,command,battery_id,parameters,parameters_hash)
 on app_private.stellar_operations to byetery_d2_intent_owner;
grant insert(deployment_id,user_id,key,input_hash,operation_id) on api_private.idempotency to byetery_d2_intent_owner;

create policy review_existing_user on app_private.users for select to byetery_d2_intent_owner
 using(id=nullif(current_setting('byetery.review_principal',true),'')::uuid);
create policy review_user_lock on app_private.users for update to byetery_d2_intent_owner
 using(id=nullif(current_setting('byetery.review_principal',true),'')::uuid and status='ACTIVE')
 with check(id=nullif(current_setting('byetery.review_principal',true),'')::uuid and status='ACTIVE');
create policy review_existing_admin on api_private.memberships for select to byetery_d2_intent_owner
 using(deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and role='ADMIN'
  and user_id=nullif(current_setting('byetery.review_principal',true),'')::uuid);
create policy review_admin_lock on api_private.memberships for update to byetery_d2_intent_owner
 using(deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and role='ADMIN'
  and user_id=nullif(current_setting('byetery.review_principal',true),'')::uuid and enabled)
 with check(deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and role='ADMIN'
  and user_id=nullif(current_setting('byetery.review_principal',true),'')::uuid and enabled);
create policy review_permission_lock on review_private.permissions for update to byetery_d2_intent_owner
 using(deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and capability='CREATE_D2_REGISTRATION_INTENT'
  and principal=nullif(current_setting('byetery.review_principal',true),'')::uuid and enabled)
 with check(deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and capability='CREATE_D2_REGISTRATION_INTENT'
  and principal=nullif(current_setting('byetery.review_principal',true),'')::uuid and enabled);
create policy review_pinned_deployment on chain_private.deployments for select to byetery_d2_intent_owner
 using(id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and mode='TESTNET');
create policy review_battery_collision_read on app_private.battery_records for select to byetery_d2_intent_owner
 using(deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and battery_id like 'BYE-REVIEW-%');
create policy review_uuid_collision_read on app_private.stellar_operations for select to byetery_d2_intent_owner
 using(deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325');
create policy review_adopt_battery on app_private.battery_records for insert to byetery_d2_intent_owner
 with check(deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325'
  and created_by=nullif(current_setting('byetery.review_principal',true),'')::uuid
  and exists(select 1 from review_private.registration_intents i where i.deployment_id=battery_records.deployment_id
    and i.battery_id=battery_records.battery_id and i.principal=battery_records.created_by and i.status='WAITING'));
create policy review_adopt_evidence on app_private.evidence_versions for insert to byetery_d2_intent_owner
 with check(deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and kind='REGISTRATION' and revision=1
  and format_version=1 and request_id is null and commitment is null
  and created_by=nullif(current_setting('byetery.review_principal',true),'')::uuid
  and exists(select 1 from review_private.registration_intents i where i.deployment_id=evidence_versions.deployment_id
    and i.battery_id=evidence_versions.battery_id and i.principal=evidence_versions.created_by and i.status='WAITING'
    and i.manifest_bytes=evidence_versions.manifest_bytes and i.registration_hash=evidence_versions.payload_hash));
create policy review_adopt_operation on app_private.stellar_operations for insert to byetery_d2_intent_owner
 with check(deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and command='register_battery'
  and state='QUEUED' and request_id is null
  and principal=current_setting('byetery.review_principal',true)
  and exists(select 1 from review_private.registration_intents i where i.operation_id=stellar_operations.id
   and i.deployment_id=stellar_operations.deployment_id and i.battery_id=stellar_operations.battery_id
   and i.principal::text=stellar_operations.principal and i.idempotency_key=stellar_operations.idempotency_key and i.status='WAITING'));
create policy review_adopt_idempotency on api_private.idempotency for insert to byetery_d2_intent_owner
 with check(deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325'
  and user_id=nullif(current_setting('byetery.review_principal',true),'')::uuid
  and exists(select 1 from review_private.registration_intents i where i.operation_id=idempotency.operation_id
   and i.deployment_id=idempotency.deployment_id and i.principal=idempotency.user_id
   and i.idempotency_key=idempotency.key and i.input_hash=idempotency.input_hash and i.status='WAITING'));

-- Temporary transition bridge. Every new function is still created as postgres.
grant create on schema review_private to byetery_d2_intent_owner;
grant byetery_d2_intent_owner to postgres with inherit false, set true granted by postgres;
create function review_private.require_authority(p_principal uuid) returns void
 language plpgsql security definer set search_path='' as $$
begin
 perform set_config('byetery.review_principal',p_principal::text,true);
 perform id from app_private.users where id=p_principal and status='ACTIVE' for share;
 if not found then raise exception 'ReviewAuthorityRequired' using errcode='42501'; end if;
 perform role from api_private.memberships where deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325'
  and user_id=p_principal and role='ADMIN' and enabled for share;
 if not found then raise exception 'ReviewAuthorityRequired' using errcode='42501'; end if;
 perform capability from review_private.permissions where deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325'
  and principal=p_principal and capability='CREATE_D2_REGISTRATION_INTENT' and enabled for share;
 if not found then raise exception 'ReviewAuthorityRequired' using errcode='42501'; end if;
 perform id from chain_private.deployments where id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and mode='TESTNET'
  and contract_address='CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON'
  and network_id=decode('cee0302d59844d32bdca915c8203dd44b33fbb7edc19051ea37abedf28ecd472','hex')
  and wasm_hash=decode('c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6','hex');
 if not found then raise exception 'ReviewDeploymentMismatch' using errcode='23514'; end if;
end $$;

-- A fixed template, canonical key order identical to application/validation.canonical.
-- No browser material, battery ID, manifest, metadata, command or UUID arguments.
create function review_private.create_registration_intent(p_principal uuid,p_key text,p_request jsonb)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare
 i review_private.registration_intents%rowtype;
 b text; raw bytea; ih bytea;
begin
 if p_principal is null or p_key is null or p_key !~ '^[A-Za-z0-9._:-]{8,128}$' or p_request is null
  or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>64
  or not (p_request ? 'templateVersion') or (p_request-'templateVersion')<>'{}'::jsonb
  or jsonb_typeof(p_request->'templateVersion')<>'number' or p_request->>'templateVersion' !~ '^[12]$' then
  raise exception 'InvalidReviewRequest' using errcode='22023';
 end if;
 perform review_private.require_authority(p_principal);
 ih:=sha256(convert_to('{"templateVersion":'||(p_request->>'templateVersion')||'}','UTF8'));
 select * into i from review_private.registration_intents where deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325'
  and principal=p_principal and idempotency_key=p_key;
 if found then
  if i.input_hash<>ih then raise exception 'ReviewIdempotencyConflict' using errcode='23505'; end if;
 else
  if p_request->>'templateVersion'<>'1' then raise exception 'UnsupportedReviewTemplate' using errcode='22023'; end if;
  b:='BYE-REVIEW-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,20));
  if exists(select 1 from app_private.battery_records where deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and battery_id=b) then
   raise exception 'ReviewBatteryAlreadyExists' using errcode='23505';
  end if;
  raw:=convert_to(format('{"batteryId":"%s","metadata":{"batch":"D2-REVIEW-V1","purpose":"D2.6 SYNTHETIC REVIEW","type":"SYNTHETIC AA"},"version":1}',b),'UTF8');
  insert into review_private.registration_intents(deployment_id,principal,idempotency_key,input_hash,battery_id,manifest_bytes,registration_hash)
   values('5c0cad2f-5f25-4216-8068-6cb9d2d26325',p_principal,p_key,ih,b,raw,sha256(raw))
   on conflict(deployment_id,principal,idempotency_key) do nothing;
  select * into strict i from review_private.registration_intents where deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325'
   and principal=p_principal and idempotency_key=p_key;
  if i.input_hash<>ih then raise exception 'ReviewIdempotencyConflict' using errcode='23505'; end if;
 end if;
 return jsonb_build_object('operationId',i.operation_id,'batteryId',i.battery_id,'registrationHash',encode(i.registration_hash,'hex'),
  'status',i.status,'createdAt',i.created_at,'adoptedAt',i.adopted_at,'adoptedOperationId',i.adopted_operation_id,
  'source','TESTNET','deploymentId',i.deployment_id,'transactionHash',null);
end $$;

create function review_private.registration_intent_status(p_principal uuid,p_operation uuid)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare i review_private.registration_intents%rowtype;
begin
 perform review_private.require_authority(p_principal);
 select * into i from review_private.registration_intents where operation_id=p_operation and principal=p_principal;
 if not found then raise exception 'ReviewIntentNotFound' using errcode='P0002'; end if;
 return jsonb_build_object('operationId',i.operation_id,'batteryId',i.battery_id,'registrationHash',encode(i.registration_hash,'hex'),
  'status',i.status,'createdAt',i.created_at,'adoptedAt',i.adopted_at,'adoptedOperationId',i.adopted_operation_id,
  'source','TESTNET','deploymentId',i.deployment_id,'transactionHash',null);
end $$;

-- LOCAL OWNER ONLY. Called after a trusted read-only chain absence precheck.
-- No preparation/process/sign/send inside this transaction/function.
create function review_private.adopt_registration_intent(p_operation uuid)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare i review_private.registration_intents%rowtype; cmd text; meta jsonb;
begin
 select * into i from review_private.registration_intents where operation_id=p_operation for update;
 if not found then raise exception 'ReviewIntentNotFound' using errcode='P0002'; end if;
 if i.status<>'WAITING' then raise exception 'ReviewIntentAlreadyAdopted' using errcode='23505'; end if;
 perform review_private.require_authority(i.principal);
 if i.registration_hash<>sha256(i.manifest_bytes)
  or i.input_hash<>sha256(convert_to('{"templateVersion":1}','UTF8')) then
  raise exception 'ReviewMaterialMismatch' using errcode='23514';
 end if;
 -- Parse only to inspect the fixed template; hash verification above uses stored bytes.
 meta:=convert_from(i.manifest_bytes,'UTF8')::jsonb;
 if meta->>'batteryId' is distinct from i.battery_id or meta->'version' is distinct from '1'::jsonb
  or meta->'metadata' is distinct from '{"batch":"D2-REVIEW-V1","purpose":"D2.6 SYNTHETIC REVIEW","type":"SYNTHETIC AA"}'::jsonb
  or meta-'batteryId'-'version'-'metadata' is distinct from '{}'::jsonb then
  raise exception 'ReviewMaterialMismatch' using errcode='23514';
 end if;
 if exists(select 1 from app_private.battery_records where deployment_id=i.deployment_id and battery_id=i.battery_id)
  or exists(select 1 from app_private.stellar_operations where id=i.operation_id) then
  raise exception 'ReviewFoundationCollision' using errcode='23505';
 end if;
 insert into app_private.battery_records(deployment_id,battery_id,metadata,created_by)
  values(i.deployment_id,i.battery_id,meta->'metadata',i.principal);
 insert into app_private.evidence_versions(deployment_id,battery_id,kind,revision,format_version,manifest_bytes,payload_hash,object_path,created_by)
  values(i.deployment_id,i.battery_id,'REGISTRATION',1,1,i.manifest_bytes,i.registration_hash,
   i.deployment_id::text||'/'||i.battery_id||'/registration/1',i.principal);
 cmd:=format('{"batteryId":"%s","kind":"register_battery","registrationHash":"%s"}',i.battery_id,encode(i.registration_hash,'hex'));
 insert into app_private.stellar_operations(id,deployment_id,principal,idempotency_key,command,battery_id,parameters,parameters_hash)
  values(i.operation_id,i.deployment_id,i.principal::text,i.idempotency_key,'register_battery',i.battery_id,cmd::jsonb,sha256(convert_to(cmd,'UTF8')));
 insert into api_private.idempotency(deployment_id,user_id,key,input_hash,operation_id)
  values(i.deployment_id,i.principal,i.idempotency_key,i.input_hash,i.operation_id);
 update review_private.registration_intents set status='ADOPTED',adopted_at=clock_timestamp(),adopted_operation_id=i.operation_id
  where operation_id=i.operation_id;
 return jsonb_build_object('operationId',i.operation_id,'batteryId',i.battery_id,'status','ADOPTED','operationState','QUEUED',
  'source','TESTNET','deploymentId',i.deployment_id);
end $$;

-- Close every new function ACL while postgres is still its owner (design A).
revoke all on all tables in schema review_private from public,anon,authenticated,byetery_d2_review_app;
revoke all on all functions in schema review_private from public,anon,authenticated,byetery_d2_review_app;
do $$ begin
 if exists(select from pg_roles where rolname='service_role') then
  revoke all on all tables in schema review_private from service_role;
  revoke all on all functions in schema review_private from service_role;
 end if;
end $$;
grant usage on schema review_private to byetery_d2_review_app;
grant execute on function review_private.create_registration_intent(uuid,text,jsonb),
 review_private.registration_intent_status(uuid,uuid) to byetery_d2_review_app;
alter function review_private.require_authority(uuid) owner to byetery_d2_intent_owner;
alter function review_private.create_registration_intent(uuid,text,jsonb) owner to byetery_d2_intent_owner;
alter function review_private.registration_intent_status(uuid,uuid) owner to byetery_d2_intent_owner;
alter function review_private.adopt_registration_intent(uuid) owner to byetery_d2_intent_owner;
-- OWNER-approved single post-transfer exception: reconstruct independent
-- local adoption EXECUTE because ALTER OWNER rewrites old-owner ACL entries.
set local role byetery_d2_intent_owner;
grant execute on function review_private.adopt_registration_intent(uuid) to postgres;
reset role;
revoke create on schema review_private from byetery_d2_intent_owner;
-- Remove only our direct grant; retain the safe automatic creator ADMIN edge.
revoke byetery_d2_intent_owner from postgres granted by postgres;

-- Fail closed inside this file's transaction. Do not accept WARNING-only success.
do $postconditions$
declare f record; stored_proc record; a text[]; owner_name text;
begin
 if current_user<>'postgres' or session_user<>'postgres' then
  raise exception 'ReviewExecutorNotRestored';
 end if;
 foreach owner_name in array array['byetery_d2_intent_owner'] loop
  if not exists(select from pg_roles where rolname=owner_name and not rolcanlogin
   and not rolinherit and not rolsuper and not rolbypassrls and not rolcreatedb
   and not rolcreaterole and not rolreplication) then
   raise exception 'UnsafeReviewOwner: %',owner_name;
  end if;
  if has_schema_privilege(owner_name,'review_private','CREATE')
   or pg_has_role('postgres',owner_name,'SET') or pg_has_role('postgres',owner_name,'USAGE') then
   raise exception 'ReviewTransitionPrivilegeSurvived: %',owner_name;
  end if;
  -- NOLOGIN owners must not be members of any other role. Their sole incoming
  -- member may be postgres through a safe automatic bootstrap-superuser grant.
  if exists(select from pg_auth_members where member=owner_name::regrole)
   or (select count(*) from pg_auth_members where roleid=owner_name::regrole)<>1
   or exists(select from pg_auth_members m join pg_roles g on g.oid=m.grantor
    where m.roleid=owner_name::regrole and
     (m.member<>'postgres'::regrole or not m.admin_option or m.inherit_option
       or m.set_option or not g.rolsuper or m.grantor='postgres'::regrole)) then
   raise exception 'UnexpectedReviewOwnerMembership: %',owner_name;
  end if;
 end loop;
 if not exists(select from pg_roles where rolname='byetery_d2_review_app' and rolcanlogin
  and not rolinherit and not rolsuper and not rolbypassrls and not rolcreatedb
  and not rolcreaterole and not rolreplication)
  or exists(select from pg_auth_members where member='byetery_d2_review_app'::regrole) then
  raise exception 'UnsafeHostedReviewRole';
 end if;
 if has_schema_privilege('byetery_d2_review_app','review_private','CREATE') then
  raise exception 'HostedReviewSchemaCreate';
 end if;
 if (select count(*) from pg_proc where pronamespace='review_private'::regnamespace)<>5 then
  raise exception 'UnexpectedReviewFunctionSet';
 end if;
 for f in select * from (values
  ('review_private.immutable_intent()','postgres',false,array['postgres']::text[]),
  ('review_private.require_authority(uuid)','byetery_d2_intent_owner',true,array['byetery_d2_intent_owner']::text[]),
  ('review_private.create_registration_intent(uuid,text,jsonb)','byetery_d2_intent_owner',true,array['byetery_d2_intent_owner','byetery_d2_review_app']::text[]),
  ('review_private.registration_intent_status(uuid,uuid)','byetery_d2_intent_owner',true,array['byetery_d2_intent_owner','byetery_d2_review_app']::text[]),
  ('review_private.adopt_registration_intent(uuid)','byetery_d2_intent_owner',true,array['byetery_d2_intent_owner','postgres']::text[])
 ) as expected(signature,owner_name,definer,grantees) loop
  select * into stored_proc from pg_proc where oid=to_regprocedure(f.signature);
  if not found or stored_proc.proowner<>f.owner_name::regrole or stored_proc.prosecdef<>f.definer
   or stored_proc.proconfig is distinct from array['search_path=""']::text[] then
   raise exception 'UnsafeReviewFunction: %',f.signature;
  end if;
  select array_agg(pg_get_userbyid(x.grantee)::text order by pg_get_userbyid(x.grantee)::text) into a
   from aclexplode(coalesce(stored_proc.proacl,acldefault('f',stored_proc.proowner))) x where x.privilege_type='EXECUTE';
  if a is distinct from f.grantees or exists(
   select from aclexplode(coalesce(stored_proc.proacl,acldefault('f',stored_proc.proowner))) x
   where x.grantor<>stored_proc.proowner or x.is_grantable or x.privilege_type<>'EXECUTE') then
   raise exception 'UnexpectedReviewFunctionACL: %',f.signature;
  end if;
 end loop;
 if exists(select from pg_proc where pronamespace='review_private'::regnamespace
  and prosecdef and proowner='postgres'::regrole) then
  raise exception 'PostgresOwnedReviewDefiner';
 end if;
 if not has_function_privilege('postgres','review_private.adopt_registration_intent(uuid)','EXECUTE')
  or not exists(select from pg_proc p cross join lateral aclexplode(p.proacl) x
   where p.oid='review_private.adopt_registration_intent(uuid)'::regprocedure
    and x.grantee='postgres'::regrole and x.grantor='byetery_d2_intent_owner'::regrole
    and x.privilege_type='EXECUTE' and not x.is_grantable) then
  raise exception 'IndependentLocalAdoptionExecuteMissing';
 end if;
 select array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text) into a
  from pg_proc p where pronamespace='review_private'::regnamespace
   and has_function_privilege('byetery_d2_review_app',p.oid,'EXECUTE');
 if a is distinct from array['review_private.create_registration_intent(uuid,text,jsonb)','review_private.registration_intent_status(uuid,uuid)']::text[] then raise exception 'UnexpectedHostedEntrypoints'; end if;
 if (select count(*) from pg_class where relnamespace='review_private'::regnamespace and relkind='r')<>2
  or exists(select from pg_class where relnamespace='review_private'::regnamespace and relkind='r'
   and (relowner<>'postgres'::regrole or not relrowsecurity or not relforcerowsecurity))
  or (select nspowner from pg_namespace where oid='review_private'::regnamespace)<>'postgres'::regrole then
  raise exception 'UnsafeReviewTableOwnershipOrRLS';
 end if;
 if exists(select from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('review_private','app_private','api_private','chain_private') and c.relkind in ('r','p')
  and (has_table_privilege('byetery_d2_review_app',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   or has_any_column_privilege('byetery_d2_review_app',c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))) then
  raise exception 'HostedRawTableOrColumnPrivilege';
 end if;
 if exists(select from pg_default_acl where defaclrole=any(array['byetery_d2_intent_owner']::regrole[])) then
  raise exception 'UnexpectedOwnerDefaultACL_DP2';
 end if;
end $postconditions$;
commit;
