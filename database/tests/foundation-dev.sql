-- Remote DEV integration smoke tests. Run only against Byetery Dev.
-- All fixtures, temporary helpers and temporary grants are rolled back.
-- Auth API/session validation is a separate, still-pending integration suite.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
create temporary table dev_checks (name text not null);
create function pg_temp.expect_error(label text, statement text, expected text) returns void
language plpgsql security invoker as $$
declare failed boolean := false;
begin
 begin
  execute statement;
 exception when others then
  if sqlerrm !~ expected then raise; end if;
  failed := true;
 end;
 if not failed then raise exception 'Expected rejection: %', label; end if;
 insert into pg_temp.dev_checks values(label);
end $$;
do $$
declare
 d uuid := gen_random_uuid(); u uuid := gen_random_uuid(); w uuid := gen_random_uuid();
 op uuid := gen_random_uuid();
 r bytea := sha256(convert_to(gen_random_uuid()::text,'UTF8'));
 cancelled bytea := sha256(convert_to(gen_random_uuid()::text,'UTF8'));
 h bytea := sha256('DEV fixture'::bytea);
 net bytea := sha256('DEV network fixture'::bytea);
 recipient text := 'G'||repeat('A',55);
 v_collector text := 'G'||repeat('B',55);
 v_recycler text := 'G'||repeat('C',55);
 predicate text;
 t record; browser_role text; fq text; visible_rows bigint;
begin
 if (select count(*) from pg_tables where schemaname in ('app_private','chain_private')) <> 11 then
  raise exception 'Expected exactly eleven Foundation tables';
 end if;
 for t in select c.*, n.nspname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('app_private','chain_private') and c.relkind='r' loop
  fq := format('%I.%I',t.nspname,t.relname);
  if not t.relrowsecurity or not t.relforcerowsecurity then raise exception 'RLS missing: %',fq; end if;
  if not exists(select 1 from pg_policies p where p.schemaname=t.nspname and p.tablename=t.relname
   and p.policyname='browser_deny' and p.permissive='RESTRICTIVE' and p.qual='false' and p.with_check='false') then
   raise exception 'Restrictive policy missing: %',fq;
  end if;
  insert into pg_temp.dev_checks values('RLS enabled/forced/restrictive: '||fq);
  foreach browser_role in array array['anon','authenticated'] loop
   if has_schema_privilege(browser_role,t.nspname,'USAGE') or
      has_table_privilege(browser_role,fq,'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'Unexpected browser privilege: % %',browser_role,fq;
   end if;
   perform pg_temp.expect_error(browser_role||' read denied: '||fq,
    format('set local role %I; select * from %s',browser_role,fq),'permission denied');
   perform pg_temp.expect_error(browser_role||' delete denied: '||fq,
    format('set local role %I; delete from %s',browser_role,fq),'permission denied');
  end loop;
 end loop;
 insert into chain_private.deployments(id,mode,network_id,contract_address,wasm_hash,schema_version,admin,service,reward_token,reward_amount)
 values(d,'MOCK',net,'C'||repeat('D',55),h,1,v_collector,v_recycler,'C'||repeat('E',55),100000000);
 insert into app_private.users(id) values(u);
 insert into app_private.wallet_links(id,deployment_id,network_id,user_id,address,proof_reference,verified_at)
 values(w,d,net,u,recipient,'DEV SQL fixture only - not a verified Auth session',now());
 insert into app_private.battery_records(deployment_id,battery_id,created_by) values(d,'DEV-SQL-ROLLBACK',u),(d,'DEV-SQL-OTHER',u);
 insert into app_private.return_requests(deployment_id,request_id,battery_id,user_id,wallet_link_id,recipient_snapshot)
 values(d,cancelled,'DEV-SQL-ROLLBACK',u,w,recipient);
 insert into chain_private.batteries(deployment_id,battery_id,state,registration_hash,reward_state,confirmed_ledger)
 values(d,'DEV-SQL-ROLLBACK','REGISTERED',h,'NOT_ELIGIBLE',1);
 predicate := format('deployment_id=%L and battery_id=%L',d,'DEV-SQL-ROLLBACK');
 perform pg_temp.expect_error('duplicate battery',format('insert into app_private.battery_records(deployment_id,battery_id) values(%L,%L)',d,'DEV-SQL-ROLLBACK'),'duplicate key');
 perform pg_temp.expect_error('duplicate request',format('insert into app_private.return_requests select * from app_private.return_requests where %s',predicate),'duplicate key');
 perform pg_temp.expect_error('owner immutable',format('update app_private.return_requests set user_id=gen_random_uuid() where %s',predicate),'ImmutableField');
 perform pg_temp.expect_error('recipient immutable',format('update app_private.return_requests set recipient_snapshot=%L where %s',v_collector,predicate),'ImmutableField');
 perform pg_temp.expect_error('premature collection association',format('update app_private.return_requests set reservation_state=''CONSUMED'',association_confirmed_at=now() where %s; set constraints all immediate',predicate),'CollectionNotConfirmed');
 insert into chain_private.return_requests values(d,cancelled,'DEV-SQL-ROLLBACK',recipient,'OPEN',2);
 update chain_private.batteries set state='RETURNED',request_id=cancelled,confirmed_ledger=2 where deployment_id=d;
 set constraints all immediate; set constraints all deferred;
 perform pg_temp.expect_error('detached request',format('update chain_private.batteries set state=''REGISTERED'',request_id=null where %s; set constraints all immediate',predicate),'DetachedLiveRequest');
 perform pg_temp.expect_error('open claim cannot be released',format('update app_private.return_requests set reservation_state=''RELEASED'' where %s; set constraints all immediate',predicate),'ClaimStateMismatch');
 update chain_private.return_requests set state='CANCELLED',confirmed_ledger=3 where deployment_id=d;
 update chain_private.batteries set state='REGISTERED',request_id=null,confirmed_ledger=3 where deployment_id=d;
 update app_private.return_requests set reservation_state='RELEASED' where deployment_id=d;
 set constraints all immediate; set constraints all deferred;
 insert into pg_temp.dev_checks values('valid cancellation to REGISTERED');
 perform pg_temp.expect_error('cancelled request terminal',format('update chain_private.return_requests set state=''OPEN'' where %s',predicate),'RequestTerminal');
 perform pg_temp.expect_error('history retained',format('delete from chain_private.return_requests where %s',predicate),'HistoryDeletionForbidden');
 insert into app_private.return_requests(deployment_id,request_id,battery_id,user_id,wallet_link_id,recipient_snapshot)
 values(d,r,'DEV-SQL-ROLLBACK',u,w,recipient);
 perform pg_temp.expect_error('second active claim',format('insert into app_private.return_requests(deployment_id,request_id,battery_id,user_id,wallet_link_id,recipient_snapshot) values(%L,%L,%L,%L,%L,%L)',d,h,'DEV-SQL-ROLLBACK',u,w,recipient),'duplicate key');
 perform pg_temp.expect_error('evidence wrong battery',format('insert into app_private.evidence_versions(deployment_id,battery_id,request_id,kind,revision,format_version,manifest_bytes,payload_hash,commitment,object_path) values(%L,%L,%L,''COLLECTION'',1,1,%L,%L,%L,%L)',d,'DEV-SQL-OTHER',r,'DEV fixture'::bytea,h,h,d||'/wrong'),'foreign key');
 insert into app_private.evidence_versions(deployment_id,battery_id,request_id,kind,revision,format_version,manifest_bytes,payload_hash,commitment,object_path)
 values(d,'DEV-SQL-ROLLBACK',r,'COLLECTION',1,1,'DEV fixture'::bytea,h,h,d||'/v1');
 perform pg_temp.expect_error('evidence immutable',format('update app_private.evidence_versions set manifest_bytes=''other''::bytea where %s',predicate),'ImmutableField');
 perform pg_temp.expect_error('payload hash mismatch',format('insert into app_private.evidence_versions(deployment_id,battery_id,kind,revision,format_version,manifest_bytes,payload_hash,object_path) values(%L,%L,''REGISTRATION'',1,1,%L,%L,%L)',d,'DEV-SQL-ROLLBACK','other'::bytea,h,d||'/bad-hash'),'check constraint');
 insert into chain_private.return_requests values(d,r,'DEV-SQL-ROLLBACK',recipient,'OPEN',4);
 update chain_private.batteries set state='RETURNED',request_id=r,confirmed_ledger=4 where deployment_id=d;
 insert into app_private.stellar_operations(id,deployment_id,principal,idempotency_key,command,battery_id,parameters,parameters_hash)
 values(op,d,'DEV-SQL','pay','pay_reward','DEV-SQL-ROLLBACK','{}',h);
 perform pg_temp.expect_error('premature reward',format('insert into app_private.reward_attempts(deployment_id,battery_id,request_id,operation_id,attempt_number) values(%L,%L,%L,%L,1)',d,'DEV-SQL-ROLLBACK',r,op),'RewardNotEligible');
 update chain_private.return_requests set state='CONFIRMED',confirmed_ledger=5 where deployment_id=d and request_id=r;
 update chain_private.batteries set state='COLLECTED',collector=v_collector,collection_hash=h,confirmed_ledger=5 where deployment_id=d;
 update app_private.return_requests set reservation_state='CONSUMED',association_confirmed_at=now() where deployment_id=d and request_id=r;
 set constraints all immediate; set constraints all deferred;
 update chain_private.batteries set state='RECYCLED',recycler=v_recycler,recycling_hash=h,reward_state='PENDING',confirmed_ledger=6 where deployment_id=d;
 perform pg_temp.expect_error('backward transition',format('update chain_private.batteries set state=''COLLECTED'' where %s',predicate),'InvalidStateTransition');
 perform pg_temp.expect_error('stale observation',format('update chain_private.batteries set confirmed_ledger=1 where %s',predicate),'StaleObservation');
 insert into app_private.reward_attempts(deployment_id,battery_id,request_id,operation_id,attempt_number) values(d,'DEV-SQL-ROLLBACK',r,op,1);
 update app_private.stellar_operations set state='READY' where id=op;
 update app_private.stellar_operations set state='SUBMITTED' where id=op;
 update app_private.reward_attempts set state='SUBMITTED' where operation_id=op;
 update app_private.stellar_operations set state='UNKNOWN' where id=op;
 update app_private.reward_attempts set state='UNKNOWN' where operation_id=op;
 perform pg_temp.expect_error('UNKNOWN cannot be cancelled locally',format('update app_private.stellar_operations set state=''CANCELLED_LOCAL'' where id=%L',op),'InvalidOperationTransition');
 if not exists(select 1 from chain_private.batteries where deployment_id=d and state='RECYCLED' and reward_state='PENDING') then raise exception 'Pending projection changed'; end if;
 insert into pg_temp.dev_checks values('UNKNOWN preserves RECYCLED/PENDING');
 perform pg_temp.expect_error('reward not yet confirmed',format('update app_private.reward_attempts set state=''SUCCEEDED'' where operation_id=%L',op),'PaymentNotConfirmed');
 update chain_private.batteries set reward_state='SENT',confirmed_ledger=7 where deployment_id=d;
 update app_private.stellar_operations set state='CONFIRMED' where id=op;
 update app_private.reward_attempts set state='SUCCEEDED' where operation_id=op;
 set constraints all immediate;
 insert into pg_temp.dev_checks values('complete SQL projection reaches SENT');
 perform pg_temp.expect_error('SENT terminal',format('update chain_private.batteries set reward_state=''PENDING'' where %s',predicate),'RewardTerminal');
 perform pg_temp.expect_error('double reward attempt',format('insert into app_private.reward_attempts(deployment_id,battery_id,request_id,operation_id,attempt_number) values(%L,%L,%L,%L,2)',d,'DEV-SQL-ROLLBACK',r,op),'InvalidRewardAttempt');
 -- Defense in depth: all grants below exist only inside this rollback transaction.
 grant usage on schema app_private,chain_private to anon,authenticated;
 grant select,insert,update,delete on all tables in schema app_private,chain_private to anon,authenticated;
 create policy dev_accidental_allow on chain_private.batteries for all to anon,authenticated using(true) with check(true);
 foreach browser_role in array array['anon','authenticated'] loop
  execute format('set local role %I',browser_role);
  select count(*) into visible_rows from chain_private.batteries where deployment_id=d;
  if visible_rows <> 0 then raise exception 'Restrictive RLS leaked rows'; end if;
  update chain_private.batteries set reward_state='PENDING' where deployment_id=d;
  get diagnostics visible_rows = row_count;
  if visible_rows <> 0 then raise exception 'Restrictive RLS allowed update'; end if;
  reset role;
  insert into pg_temp.dev_checks values(browser_role||' restrictive RLS survives accidental grants and permissive policy');
  perform pg_temp.expect_error(browser_role||' restrictive RLS insert denied',
   format('set local role %I; insert into chain_private.batteries(deployment_id,battery_id,state,registration_hash,reward_state,confirmed_ledger) values(%L,''DEV-EVIL'',''REGISTERED'',%L,''NOT_ELIGIBLE'',1)',browser_role,d,h),'row-level security');
 end loop;
end $$;
select 'foundation-dev-sql' as suite, count(*) as passed, 'ROLLBACK' as cleanup from pg_temp.dev_checks;
rollback;
