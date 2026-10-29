-- LOCAL AUDIT/APPLY ARTIFACT. Apply AFTER B1 only in disposable local tests.
-- Remote apply/credentials and Auth session experiments require separate approval.
begin;
do $$ begin
 if not exists(select 1 from pg_roles where rolname='byetery_d2_read_owner') then
  create role byetery_d2_read_owner nologin noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
 end if;
 if exists(select 1 from pg_roles where rolname='byetery_d2_read_owner' and
  (rolcanlogin or rolinherit or rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or rolreplication))
  or exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.member where r.rolname='byetery_d2_read_owner')
 then raise exception 'UnsafeReviewReadOwner'; end if;
end $$;
alter default privileges for role byetery_d2_read_owner revoke execute on functions from public;
create table review_private.review_access (
 deployment_id uuid not null references chain_private.deployments(id),
 principal_id uuid not null references app_private.users(id),
 review_role text not null check(review_role in ('USER','ADMIN','COLLECTOR','RECYCLER')),
 enabled boolean not null default true, can_create_intent boolean not null default false,
 granted_at timestamptz not null default now(), disabled_at timestamptz,
 primary key(deployment_id,principal_id),
 check(deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325'),
 check(not can_create_intent or review_role='ADMIN')
);
create table review_private.review_batteries (
 deployment_id uuid not null references chain_private.deployments(id),
 battery_id app_private.battery_id not null, enabled boolean not null default true,
 purpose text not null check(purpose in ('HISTORICAL','SYNTHETIC_INTENT')),
 user_principal_id uuid references app_private.users(id),
 collector_relevant boolean not null default false, recycler_relevant boolean not null default false,
 intent_operation_id uuid references review_private.registration_intents(operation_id),
 approved_at timestamptz not null default now(), primary key(deployment_id,battery_id),
 check(deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325'),
 check((purpose='HISTORICAL' and intent_operation_id is null) or
  (purpose='SYNTHETIC_INTENT' and intent_operation_id is not null and battery_id like 'BYE-REVIEW-%'
   and not collector_relevant and not recycler_relevant and user_principal_id is null))
);
alter table review_private.review_access enable row level security;
alter table review_private.review_access force row level security;
alter table review_private.review_batteries enable row level security;
alter table review_private.review_batteries force row level security;
revoke all on review_private.review_access,review_private.review_batteries from public,anon,authenticated,byetery_d2_review_app;
grant usage on schema review_private,app_private,api_private,chain_private to byetery_d2_read_owner;
grant select on review_private.review_access,review_private.review_batteries to byetery_d2_read_owner;
grant select(deployment_id,principal,capability,enabled) on review_private.permissions to byetery_d2_read_owner;
grant select(operation_id,deployment_id,principal,battery_id) on review_private.registration_intents to byetery_d2_read_owner;
grant select(id,auth_user_id,status) on app_private.users to byetery_d2_read_owner;
grant select(deployment_id,user_id,role,actor_address,enabled) on api_private.memberships to byetery_d2_read_owner;
grant select(id,mode,network_id,contract_address,wasm_hash) on chain_private.deployments to byetery_d2_read_owner;
grant select(deployment_id,battery_id,created_by,metadata) on app_private.battery_records to byetery_d2_read_owner;
grant select(deployment_id,battery_id,state,reward_state,request_id,collector,recycler,confirmed_ledger) on chain_private.batteries to byetery_d2_read_owner;
grant select(deployment_id,request_id,battery_id,user_id,reservation_state,created_at) on app_private.return_requests to byetery_d2_read_owner;
grant select(deployment_id,request_id,battery_id,state) on chain_private.return_requests to byetery_d2_read_owner;
grant select(id,deployment_id,battery_id,request_id,command,state,error_code,created_at) on app_private.stellar_operations to byetery_d2_read_owner;
grant select(deployment_id,battery_id,request_id,operation_id,state,attempt_number,error_code) on app_private.reward_attempts to byetery_d2_read_owner;
grant select(deployment_id,operation_id,state,confirmation) on api_private.testnet_work to byetery_d2_read_owner;
grant select(deployment_id,operation_id,transaction_hash,network_id,contract_address) on api_private.testnet_envelopes to byetery_d2_read_owner;
grant select(deployment_id,battery_id,request_id,kind,revision,payload_hash,commitment,finalized_at) on app_private.evidence_versions to byetery_d2_read_owner;

create policy review_access_read on review_private.review_access for select to byetery_d2_read_owner
 using(deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325'
  and principal_id=nullif(current_setting('byetery.read_principal',true),'')::uuid);
create policy review_batteries_read on review_private.review_batteries for select to byetery_d2_read_owner
 using(deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and enabled);
create policy review_permissions_read on review_private.permissions for select to byetery_d2_read_owner
 using(deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and capability='CREATE_D2_REGISTRATION_INTENT'
  and principal=nullif(current_setting('byetery.read_principal',true),'')::uuid);
create policy review_intents_read_owner on review_private.registration_intents for select to byetery_d2_read_owner
 using(deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325'
  and principal=nullif(current_setting('byetery.read_principal',true),'')::uuid);
create policy review_auth_mapping on app_private.users for select to byetery_d2_read_owner
 using(auth_user_id=nullif(current_setting('byetery.read_auth_uid',true),'')::uuid);
create policy review_read_memberships on api_private.memberships for select to byetery_d2_read_owner
 using(deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and user_id=nullif(current_setting('byetery.read_principal',true),'')::uuid);
create policy review_read_deployment on chain_private.deployments for select to byetery_d2_read_owner
 using(id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and mode='TESTNET');
-- Purpose/deployment fences supplement the per-role checks inside bounded functions.
create policy review_approved_records on app_private.battery_records for select to byetery_d2_read_owner
 using(deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and exists(select 1 from review_private.review_batteries a where a.deployment_id=battery_records.deployment_id and a.battery_id=battery_records.battery_id and a.enabled));
create policy review_approved_chain on chain_private.batteries for select to byetery_d2_read_owner
 using(deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and exists(select 1 from review_private.review_batteries a where a.deployment_id=batteries.deployment_id and a.battery_id=batteries.battery_id and a.enabled));
create policy review_approved_requests on app_private.return_requests for select to byetery_d2_read_owner
 using(deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and exists(select 1 from review_private.review_batteries a where a.deployment_id=return_requests.deployment_id and a.battery_id=return_requests.battery_id and a.enabled));
create policy review_approved_chain_requests on chain_private.return_requests for select to byetery_d2_read_owner
 using(deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and exists(select 1 from review_private.review_batteries a where a.deployment_id=return_requests.deployment_id and a.battery_id=return_requests.battery_id and a.enabled));
create policy review_approved_operations on app_private.stellar_operations for select to byetery_d2_read_owner
 using(deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and exists(select 1 from review_private.review_batteries a where a.deployment_id=stellar_operations.deployment_id and a.battery_id=stellar_operations.battery_id and a.enabled));
create policy review_approved_attempts on app_private.reward_attempts for select to byetery_d2_read_owner
 using(deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and exists(select 1 from review_private.review_batteries a where a.deployment_id=reward_attempts.deployment_id and a.battery_id=reward_attempts.battery_id and a.enabled));
create policy review_approved_evidence on app_private.evidence_versions for select to byetery_d2_read_owner
 using(deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and exists(select 1 from review_private.review_batteries a where a.deployment_id=evidence_versions.deployment_id and a.battery_id=evidence_versions.battery_id and a.enabled));
create policy review_approved_work on api_private.testnet_work for select to byetery_d2_read_owner
 using(deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and exists(select 1 from app_private.stellar_operations o where o.deployment_id=testnet_work.deployment_id and o.id=testnet_work.operation_id));
create policy review_approved_envelopes on api_private.testnet_envelopes for select to byetery_d2_read_owner
 using(deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and exists(select 1 from app_private.stellar_operations o where o.deployment_id=testnet_envelopes.deployment_id and o.id=testnet_envelopes.operation_id));

create function review_private.resolve_review(p_auth uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p uuid; a review_private.review_access%rowtype; c boolean;
begin
 perform set_config('byetery.read_auth_uid',p_auth::text,true);
 select id into p from app_private.users where auth_user_id=p_auth and status='ACTIVE';
 if p is null then raise exception 'ReviewAccessDisabled' using errcode='42501'; end if;
 perform set_config('byetery.read_principal',p::text,true);
 select r.* into a from review_private.review_access r join api_private.memberships m
  on m.deployment_id=r.deployment_id and m.user_id=r.principal_id and m.role=r.review_role
  where r.deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and r.principal_id=p and r.enabled and m.enabled;
 if not found then raise exception 'ReviewAccessDisabled' using errcode='42501'; end if;
 if not exists(select 1 from chain_private.deployments where id=a.deployment_id and mode='TESTNET'
  and contract_address='CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON'
  and network_id=decode('cee0302d59844d32bdca915c8203dd44b33fbb7edc19051ea37abedf28ecd472','hex')
  and wasm_hash=decode('c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6','hex'))
 then raise exception 'ReviewDeploymentMismatch' using errcode='23514'; end if;
 c:=a.review_role='ADMIN' and a.can_create_intent and exists(select 1 from review_private.permissions
  where deployment_id=a.deployment_id and principal=p and capability='CREATE_D2_REGISTRATION_INTENT' and enabled);
 return jsonb_build_object('principal',p,'role',a.review_role,'canCreateIntent',c);
end $$;

create function review_private.visible_battery(p uuid,r text,b text) returns boolean language sql security definer set search_path='' as $$
 select exists(select 1 from review_private.review_batteries a join app_private.battery_records br
  on br.deployment_id=a.deployment_id and br.battery_id=a.battery_id
  left join chain_private.batteries cb on cb.deployment_id=a.deployment_id and cb.battery_id=a.battery_id
  where a.deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and a.battery_id=b and a.enabled and (
   (r='ADMIN' and (a.purpose='HISTORICAL' or exists(select 1 from review_private.registration_intents i where i.operation_id=a.intent_operation_id and i.principal=p)))
   or (r='USER' and a.user_principal_id=p and (br.created_by=p or exists(select 1 from app_private.return_requests q where q.deployment_id=a.deployment_id and q.battery_id=b and q.user_id=p)))
   or (r='COLLECTOR' and a.collector_relevant and exists(select 1 from api_private.memberships m where m.deployment_id=a.deployment_id and m.user_id=p and m.role=r and m.enabled and m.actor_address=cb.collector))
   or (r='RECYCLER' and a.recycler_relevant and exists(select 1 from api_private.memberships m where m.deployment_id=a.deployment_id and m.user_id=p and m.role=r and m.enabled and m.actor_address=cb.recycler))
  ));
$$;

create function review_private.profile(p_auth uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare ctx jsonb; ids jsonb;
begin
 ctx:=review_private.resolve_review(p_auth);
 select coalesce(jsonb_agg(battery_id),'[]') into ids from (select battery_id from review_private.review_batteries
  where review_private.visible_battery((ctx->>'principal')::uuid,ctx->>'role',battery_id)
   and exists(select 1 from app_private.battery_records b where b.deployment_id=review_batteries.deployment_id and b.battery_id=review_batteries.battery_id)
  order by approved_at,battery_id limit 20) q;
 return jsonb_build_object('roles',jsonb_build_array(ctx->>'role'),'canCreateIntent',ctx->'canCreateIntent','batteries',ids,
  'source','TESTNET','deploymentId','5c0cad2f-5f25-4216-8068-6cb9d2d26325');
end $$;

create function review_private.operation_dto(p_operation uuid) returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('operationId',o.id,'kind',case o.command when 'register_battery' then 'REGISTERED' when 'open_return' then 'RETURNED'
  when 'confirm_collection' then 'COLLECTED' when 'confirm_recycling' then 'RECYCLED' when 'pay_reward' then 'REWARD' when 'cancel_return' then 'CANCELLED' else 'OTHER' end,
  'status',o.state,'transactionHash',encode(e.transaction_hash,'hex'),'ledger',(w.confirmation->>'confirmationLedger')::bigint,
  'createdAt',o.created_at,'updatedAt',null,'errorCode',case when o.state='REJECTED' then
   case when w.state='CONFIRMED_FAILED' and w.confirmation is not null then 'CONFIRMED_CHAIN_FAILURE' else 'APPLICATION_REJECTED' end else null end)
 from app_private.stellar_operations o left join api_private.testnet_envelopes e on e.deployment_id=o.deployment_id and e.operation_id=o.id
 left join api_private.testnet_work w on w.deployment_id=o.deployment_id and w.operation_id=o.id
 where o.deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and o.id=p_operation limit 1;
$$;

create function review_private.battery(p_auth uuid,p_battery text) returns jsonb language plpgsql security definer set search_path='' as $$
declare ctx jsonb; result jsonb;
begin
 ctx:=review_private.resolve_review(p_auth);
 if p_battery is null or p_battery !~ '^[A-Z0-9-]{1,32}$' or not review_private.visible_battery((ctx->>'principal')::uuid,ctx->>'role',p_battery)
 then raise exception 'NotFound' using errcode='P0002'; end if;
 select jsonb_build_object('batteryId',b.battery_id,'confirmedBatteryState',c.state,'confirmedRewardState',c.reward_state,
  'pendingOperation',(select review_private.operation_dto(o.id) from app_private.stellar_operations o where o.deployment_id=b.deployment_id and o.battery_id=b.battery_id and o.state in ('QUEUED','AWAITING_AUTH','READY','SUBMITTED','UNKNOWN') order by o.created_at desc,o.id desc limit 1),
  'latestTerminalOperation',(select review_private.operation_dto(o.id) from app_private.stellar_operations o where o.deployment_id=b.deployment_id and o.battery_id=b.battery_id and o.state in ('CONFIRMED','REJECTED') order by o.created_at desc,o.id desc limit 1),
  'lastAttempt',(select jsonb_build_object('state',a.state,'errorCode',case when a.error_code is not null then 'REWARD_ATTEMPT_ERROR' else null end) from app_private.reward_attempts a where a.deployment_id=b.deployment_id and a.battery_id=b.battery_id order by a.attempt_number desc limit 1),
  'metadata',jsonb_strip_nulls(jsonb_build_object('type',case when jsonb_typeof(b.metadata->'type')='string' then left(b.metadata->>'type',160) end,
   'manufacturer',case when jsonb_typeof(b.metadata->'manufacturer')='string' then left(b.metadata->>'manufacturer',160) end,'batch',case when jsonb_typeof(b.metadata->'batch')='string' then left(b.metadata->>'batch',160) end)),
  'ownRequest',(select jsonb_build_object('requestId',encode(r.request_id,'hex'),'reservationState',r.reservation_state,'requestState',q.state) from app_private.return_requests r
   left join chain_private.return_requests q using(deployment_id,request_id) where r.deployment_id=b.deployment_id and r.battery_id=b.battery_id and r.user_id=(ctx->>'principal')::uuid order by r.created_at desc limit 1),
  'source','TESTNET','deploymentId',b.deployment_id,'confirmedLedger',c.confirmed_ledger)
 into result from app_private.battery_records b left join chain_private.batteries c using(deployment_id,battery_id)
 where b.deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and b.battery_id=p_battery;
 if result is null then raise exception 'NotFound' using errcode='P0002'; end if;
 return result;
end $$;

create function review_private.history_rows(p_auth uuid,p_battery text) returns jsonb language plpgsql security definer set search_path='' as $$
declare ctx jsonb; rows jsonb;
begin
 ctx:=review_private.resolve_review(p_auth);
 if p_battery is null or p_battery !~ '^[A-Z0-9-]{1,32}$' or not review_private.visible_battery((ctx->>'principal')::uuid,ctx->>'role',p_battery)
 then raise exception 'NotFound' using errcode='P0002'; end if;
 select coalesce(jsonb_agg(q.row order by q.at,q.id),'[]') into rows from (
  select o.created_at at,o.id,review_private.operation_dto(o.id)||jsonb_build_object(
   'revision',v.revision,'payloadHash',encode(v.payload_hash,'hex'),'commitment',encode(v.commitment,'hex'),
   'identityContract',e.contract_address,'identityNetwork',encode(e.network_id,'hex'),'requestId',encode(o.request_id,'hex')) row
  from app_private.stellar_operations o left join api_private.testnet_envelopes e on e.deployment_id=o.deployment_id and e.operation_id=o.id
  left join lateral (select ev.revision,ev.payload_hash,ev.commitment from app_private.evidence_versions ev where ev.deployment_id=o.deployment_id and ev.battery_id=o.battery_id
    and ev.request_id is not distinct from o.request_id and ev.kind=case o.command when 'register_battery' then 'REGISTRATION' when 'confirm_collection' then 'COLLECTION' when 'confirm_recycling' then 'RECYCLING' end
    and ev.finalized_at<=o.created_at order by ev.revision desc limit 1) v on true
  where o.deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and o.battery_id=p_battery order by o.created_at,o.id limit 30
 ) q;
 return jsonb_build_object('batteryId',p_battery,'entries',rows,'source','TESTNET','deploymentId','5c0cad2f-5f25-4216-8068-6cb9d2d26325');
end $$;

-- Wrappers map Auth UID -> existing principal. Only B1 creates synthetic material.
grant execute on function review_private.resolve_review(uuid) to byetery_d2_intent_owner;
grant select(deployment_id,principal_id,review_role,enabled,can_create_intent),update(enabled)
 on review_private.review_access to byetery_d2_intent_owner;
create policy review_intent_access_lock_read on review_private.review_access for select to byetery_d2_intent_owner
 using(deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and principal_id=nullif(current_setting('byetery.read_principal',true),'')::uuid);
create policy review_intent_access_lock on review_private.review_access for update to byetery_d2_intent_owner
 using(deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and principal_id=nullif(current_setting('byetery.read_principal',true),'')::uuid and enabled and review_role='ADMIN' and can_create_intent)
 with check(deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and principal_id=nullif(current_setting('byetery.read_principal',true),'')::uuid and enabled and review_role='ADMIN' and can_create_intent);
grant select(deployment_id,battery_id,purpose,intent_operation_id) on review_private.review_batteries to byetery_d2_intent_owner;
grant insert(deployment_id,battery_id,purpose,intent_operation_id) on review_private.review_batteries to byetery_d2_intent_owner;
create policy review_intent_allowlist_read on review_private.review_batteries for select to byetery_d2_intent_owner
 using(deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and purpose='SYNTHETIC_INTENT');
create policy review_intent_allowlist_insert on review_private.review_batteries for insert to byetery_d2_intent_owner
 with check(deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and purpose='SYNTHETIC_INTENT'
  and exists(select 1 from review_private.registration_intents i where i.operation_id=review_batteries.intent_operation_id and i.battery_id=review_batteries.battery_id and i.deployment_id=review_batteries.deployment_id and i.principal=nullif(current_setting('byetery.review_principal',true),'')::uuid));
create function review_private.create_review_registration_intent(p_auth uuid,p_key text,p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare ctx jsonb; result jsonb;
begin
 ctx:=review_private.resolve_review(p_auth);
 if ctx->>'role'<>'ADMIN' or ctx->'canCreateIntent'<>'true'::jsonb then raise exception 'ReviewAccessDisabled' using errcode='42501'; end if;
 perform principal_id from review_private.review_access where deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325'
  and principal_id=(ctx->>'principal')::uuid and enabled and review_role='ADMIN' and can_create_intent for share;
 if not found then raise exception 'ReviewAccessDisabled' using errcode='42501'; end if;
 result:=review_private.create_registration_intent((ctx->>'principal')::uuid,p_key,p_request);
 insert into review_private.review_batteries(deployment_id,battery_id,purpose,intent_operation_id)
  values('5c0cad2f-5f25-4216-8068-6cb9d2d26325',result->>'batteryId','SYNTHETIC_INTENT',(result->>'operationId')::uuid)
  on conflict(deployment_id,battery_id) do nothing;
 if not exists(select 1 from review_private.review_batteries where deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325' and battery_id=result->>'batteryId' and intent_operation_id=(result->>'operationId')::uuid and purpose='SYNTHETIC_INTENT')
 then raise exception 'ReviewAllowlistConflict' using errcode='23505'; end if;
 return result;
end $$;
create function review_private.review_registration_intent_status(p_auth uuid,p_operation uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare ctx jsonb;
begin
 ctx:=review_private.resolve_review(p_auth);
 if ctx->>'role'<>'ADMIN' then raise exception 'NotFound' using errcode='P0002'; end if;
 return review_private.registration_intent_status((ctx->>'principal')::uuid,p_operation);
end $$;

alter function review_private.resolve_review(uuid) owner to byetery_d2_read_owner;
alter function review_private.visible_battery(uuid,text,text) owner to byetery_d2_read_owner;
alter function review_private.profile(uuid) owner to byetery_d2_read_owner;
alter function review_private.operation_dto(uuid) owner to byetery_d2_read_owner;
alter function review_private.battery(uuid,text) owner to byetery_d2_read_owner;
alter function review_private.history_rows(uuid,text) owner to byetery_d2_read_owner;
alter function review_private.create_review_registration_intent(uuid,text,jsonb) owner to byetery_d2_intent_owner;
alter function review_private.review_registration_intent_status(uuid,uuid) owner to byetery_d2_intent_owner;
revoke execute on function review_private.resolve_review(uuid),review_private.visible_battery(uuid,text,text),review_private.profile(uuid),
 review_private.operation_dto(uuid),review_private.battery(uuid,text),review_private.history_rows(uuid,text),
 review_private.create_review_registration_intent(uuid,text,jsonb),review_private.review_registration_intent_status(uuid,uuid)
 from public,anon,authenticated,byetery_d2_review_app;
-- The old principal-taking functions cannot bypass the new review_access gate.
revoke execute on function review_private.create_registration_intent(uuid,text,jsonb),review_private.registration_intent_status(uuid,uuid) from byetery_d2_review_app;
grant execute on function review_private.resolve_review(uuid) to byetery_d2_intent_owner;
grant execute on function review_private.profile(uuid),review_private.battery(uuid,text),review_private.history_rows(uuid,text),
 review_private.create_review_registration_intent(uuid,text,jsonb),review_private.review_registration_intent_status(uuid,uuid) to byetery_d2_review_app;
commit;
