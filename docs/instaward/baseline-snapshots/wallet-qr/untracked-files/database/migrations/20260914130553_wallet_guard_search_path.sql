-- Pin the private invoker trigger's resolution context. No grants or RLS changes.
alter function api_private.require_sep53_challenge() set search_path = pg_catalog;
