-- Existing rows retain RAW_ED25519_V1. All inserts after this migration must be SEP53_V2.
alter table api_private.wallet_challenges add column signing_scheme text not null default 'RAW_ED25519_V1'
  check (signing_scheme in ('RAW_ED25519_V1','SEP53_V2'));
alter table api_private.wallet_challenges alter column signing_scheme set default 'SEP53_V2';
create function api_private.require_sep53_challenge() returns trigger language plpgsql as $$
begin
  if NEW.signing_scheme <> 'SEP53_V2' then
    raise exception 'LegacyChallengeIssuanceForbidden' using errcode='23514';
  end if;
  return NEW;
end $$;
create trigger require_sep53_challenge before insert on api_private.wallet_challenges
  for each row execute function api_private.require_sep53_challenge();
create trigger immutable_challenge_scheme before update or delete on api_private.wallet_challenges
  for each row execute function app_private.protect_fields('signing_scheme');
revoke all on function api_private.require_sep53_challenge() from public,anon,authenticated;
