-- D3-24 review proposal. Test only on the disposable PostgreSQL 17.6 fixture.
-- Role name mirrors the proposed hosted identity byetery_d324_h2_closer.
create role d324_fixture_h2_closer login nosuperuser nobypassrls noinherit nocreatedb nocreaterole noreplication;
grant usage on schema api_private, app_private, chain_private to d324_fixture_h2_closer;

grant select (id,deployment_id,battery_id,instance_id,expires_at), update (expires_at)
  on api_private.d324_admission to d324_fixture_h2_closer;
create policy d324_h2_read on api_private.d324_admission for select to d324_fixture_h2_closer using (true);
create policy d324_h2_lock on api_private.d324_admission for update to d324_fixture_h2_closer
  using (true) with check (false);
grant select (admission_id,deployment_id,battery_id,operation_id,command,dispatch_xid)
  on api_private.d324_step to d324_fixture_h2_closer;
create policy d324_h2_read on api_private.d324_step for select to d324_fixture_h2_closer using (true);

grant select (network_id,source_account,deployment_id,operation_id,generation,lease_until),
  update (lease_until) on api_private.testnet_source_leases to d324_fixture_h2_closer;
create policy d324_h2_read on api_private.testnet_source_leases for select to d324_fixture_h2_closer
  using (exists(select from api_private.d324_step s where
    (s.deployment_id,s.operation_id)=(testnet_source_leases.deployment_id,testnet_source_leases.operation_id)));
create policy d324_h2_lock on api_private.testnet_source_leases for update to d324_fixture_h2_closer
  using (lease_until<=clock_timestamp() and exists(select from api_private.d324_step s where
    (s.deployment_id,s.operation_id)=(testnet_source_leases.deployment_id,testnet_source_leases.operation_id)))
  with check (false);

-- The existing invoker trigger materializes the complete rows as composite values.
grant select, update (state) on api_private.testnet_work to d324_fixture_h2_closer;
grant select, update (state,error_code) on app_private.stellar_operations to d324_fixture_h2_closer;
grant select (operation_id,deployment_id) on api_private.testnet_envelopes,api_private.operation_transport
  to d324_fixture_h2_closer;
grant select (id,operation_id,deployment_id,kind,evidence), insert (operation_id,deployment_id,kind,evidence)
  on api_private.testnet_observations to d324_fixture_h2_closer;
grant usage on sequence api_private.testnet_observations_id_seq to d324_fixture_h2_closer;
grant select (operation_id,deployment_id,response_status,response_body), update (response_status,response_body)
  on api_private.idempotency to d324_fixture_h2_closer;
grant select, update (reservation_state)
  on app_private.return_requests to d324_fixture_h2_closer;
grant select (deployment_id,battery_id,request_id,operation_id,state,error_code), update (state,error_code)
  on app_private.reward_attempts to d324_fixture_h2_closer;
grant select on chain_private.return_requests to d324_fixture_h2_closer;
grant select (id,contract_address) on chain_private.deployments to d324_fixture_h2_closer;
create policy d324_h2_read on chain_private.deployments for select to d324_fixture_h2_closer
  using (id='5c0cad2f-5f25-4216-8068-6cb9d2d26325');
grant select on chain_private.batteries to d324_fixture_h2_closer;
create policy d324_h2_read on chain_private.batteries for select to d324_fixture_h2_closer
  using (deployment_id='5c0cad2f-5f25-4216-8068-6cb9d2d26325'
    and battery_id='BYE-D3-R1-20261111-DCDE088CA870');
grant execute on function api_private.d324_unsigned_close_proof(api_private.testnet_work) to d324_fixture_h2_closer;

-- All these tables already use FORCE RLS. The step predicate bounds reads to
-- the authorized D3-24 scope, while keeping evidence of a signed/unknown tx visible.
do $$
declare t text;
begin
  foreach t in array array['api_private.testnet_work','app_private.stellar_operations','api_private.testnet_envelopes',
    'api_private.operation_transport','api_private.testnet_observations','api_private.idempotency','app_private.reward_attempts'] loop
    execute format('create policy d324_h2_read on %s for select to d324_fixture_h2_closer
      using (exists(select from api_private.d324_step s where (s.deployment_id,s.operation_id)=(%I.deployment_id,%I.%I)))',
      t,split_part(t,'.',2),split_part(t,'.',2),case when t='app_private.stellar_operations' then 'id' else 'operation_id' end);
  end loop;
end $$;
create policy d324_h2_read on app_private.return_requests for select to d324_fixture_h2_closer
  using (exists(select from app_private.stellar_operations o where
    (o.deployment_id,o.battery_id,o.request_id)=(return_requests.deployment_id,return_requests.battery_id,return_requests.request_id)
      and o.command='open_return'));
create policy d324_h2_read on chain_private.return_requests for select to d324_fixture_h2_closer
  using (exists(select from app_private.stellar_operations o where
    (o.deployment_id,o.request_id)=(return_requests.deployment_id,return_requests.request_id) and o.command='open_return'));

create policy d324_h2_terminal on api_private.testnet_work for update to d324_fixture_h2_closer
  using (state in ('CLAIMED','PREPARING') and dispatch_attempts=0) with check (state='ABORTED_PRE_DISPATCH');
create policy d324_h2_terminal on app_private.stellar_operations for update to d324_fixture_h2_closer
  using (state='QUEUED') with check (state='CANCELLED_LOCAL' and error_code='D324ExecutionExpired');
create policy d324_h2_terminal on api_private.idempotency for update to d324_fixture_h2_closer
  using (response_body is null) with check (response_status=409 and response_body->>'class'='TERMINAL_UNSIGNED');
create policy d324_h2_terminal on app_private.return_requests for update to d324_fixture_h2_closer
  using (reservation_state='HELD') with check (reservation_state='RELEASED');
create policy d324_h2_terminal on app_private.reward_attempts for update to d324_fixture_h2_closer
  using (state='QUEUED') with check (state='FAILED' and error_code='D324ExecutionExpired');
create policy d324_h2_receipt on api_private.testnet_observations for insert to d324_fixture_h2_closer
  with check (kind='PRE_DISPATCH_CLOSE' and exists(select from api_private.d324_step s where
    (s.deployment_id,s.operation_id)=(testnet_observations.deployment_id,testnet_observations.operation_id)));

-- Scope UPDATE independently of SELECT, including SQL with no WHERE clause.
do $$
declare t text; predicate text;
begin
  foreach t in array array['api_private.testnet_work','app_private.stellar_operations','api_private.idempotency','app_private.reward_attempts'] loop
    predicate:=format('exists(select from api_private.d324_step s where (s.deployment_id,s.operation_id)=(%I.deployment_id,%I.%I))',
      split_part(t,'.',2),split_part(t,'.',2),case when t='app_private.stellar_operations' then 'id' else 'operation_id' end);
    execute format('create policy d324_h2_write_scope on %s as restrictive for update to d324_fixture_h2_closer using (%s) with check (%s)',
      t,predicate,predicate);
  end loop;
end $$;
create policy d324_h2_write_scope on app_private.return_requests as restrictive for update to d324_fixture_h2_closer
  using (exists(select from app_private.stellar_operations o where
    (o.deployment_id,o.battery_id,o.request_id)=(return_requests.deployment_id,return_requests.battery_id,return_requests.request_id)
      and o.command='open_return'))
  with check (exists(select from app_private.stellar_operations o where
    (o.deployment_id,o.battery_id,o.request_id)=(return_requests.deployment_id,return_requests.battery_id,return_requests.request_id)
      and o.command='open_return'));

-- The worker can record ordinary observations but cannot manufacture a D3-24
-- closure receipt or apply the reviewed D3-24 terminal transition by raw SQL.
create policy d324_h2_worker_receipt_deny on api_private.testnet_observations as restrictive
  for insert to d324_fixture_worker with check (kind<>'PRE_DISPATCH_CLOSE' or not exists(
    select from api_private.d324_step s where
    (s.deployment_id,s.operation_id)=(testnet_observations.deployment_id,testnet_observations.operation_id)));
create policy d324_h2_worker_terminal_deny on api_private.testnet_work as restrictive
  for update to d324_fixture_worker using (true) with check (
    state<>'ABORTED_PRE_DISPATCH' or battery_id<>'BYE-D3-R1-20261111-DCDE088CA870'
    or deployment_id<>'5c0cad2f-5f25-4216-8068-6cb9d2d26325');
