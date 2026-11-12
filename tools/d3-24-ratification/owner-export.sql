-- BYETERY D3-24 RUN1 OWNER EXPORT V1. Candidate for review. Use only a read-only transaction.
-- psql inputs: operation_ids (JSON array of exact UUIDs), query_sha256 (approved file hash).
-- No credentials, Auth/profile tables, command parameters, or internal principals are exported.
WITH requested_input AS (
  SELECT :'operation_ids'::jsonb AS ids
), requested AS (
  SELECT value::uuid AS operation_id
  FROM requested_input, pg_catalog.jsonb_array_elements_text(ids)
  WHERE pg_catalog.jsonb_array_length(ids) BETWEEN 1 AND 5
), selected AS (
  SELECT w.deployment_id, w.operation_id, w.battery_id, w.command,
         w.source_account, w.state AS durable_state, o.state AS logical_state,
         CASE WHEN w.state = 'PROJECTED' THEN 'CONFIRMED_SUCCESS' ELSE w.state END AS state,
         w.confirmation, w.state_evidence,
         pg_catalog.jsonb_build_object(
           'transaction_hash', pg_catalog.encode(e.transaction_hash, 'hex'),
           'signed_envelope', pg_catalog.replace(pg_catalog.encode(e.signed_envelope, 'base64'), E'\n', ''),
           'network_id', pg_catalog.encode(e.network_id, 'hex'),
           'contract_address', e.contract_address
         ) AS envelope,
         (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'kind', x.kind, 'evidence', x.evidence,
           'observation_ledger', x.observation_ledger,
           'confirmation_ledger', x.confirmation_ledger,
           'state_read_ledger', x.state_read_ledger
         ) ORDER BY x.id)
          FROM api_private.testnet_observations x
          WHERE x.deployment_id = w.deployment_id AND x.operation_id = w.operation_id
            AND x.kind IN ('SUCCESS', 'FAILED')) AS terminal_evidence
  FROM api_private.testnet_work w
  JOIN requested r ON r.operation_id = w.operation_id
  JOIN app_private.stellar_operations o
    ON o.deployment_id = w.deployment_id AND o.id = w.operation_id
  JOIN api_private.testnet_envelopes e
    ON e.deployment_id = w.deployment_id AND e.operation_id = w.operation_id
  WHERE w.deployment_id = '5c0cad2f-5f25-4216-8068-6cb9d2d26325'::uuid
    AND w.battery_id = 'BYE-D3-R1-20261111-DCDE088CA870'
    AND w.state IN ('CONFIRMED_SUCCESS', 'CONFIRMED_FAILED', 'PROJECTED')
    AND w.confirmation IS NOT NULL
)
SELECT pg_catalog.jsonb_build_object(
  'schema', 'BYETERY_D324_OWNER_EXPORT_V1',
  'metadata', pg_catalog.jsonb_build_object(
    'query_sha256', :'query_sha256'::text,
    'export_time', pg_catalog.statement_timestamp(),
    'deployment_id', '5c0cad2f-5f25-4216-8068-6cb9d2d26325',
    'database', 'SUPABASE_DEV', 'project_ref', 'aemxuqnnwfclzrwwiqfd',
    'business_execution_sha', 'c50e4eb1f7f538a231c5ecfc31d19283998dc234',
    'task_id', 'D3-24-RUN1',
    'plan_hash', '3c03cfe14ea2bb091fba229c378ebea859b8ebdadbdbb6ee739b23b1b831a02d',
    'battery_id', 'BYE-D3-R1-20261111-DCDE088CA870',
    'transaction_read_only', pg_catalog.current_setting('transaction_read_only'),
    'requested_operation_ids',
      (SELECT pg_catalog.jsonb_agg(operation_id::text ORDER BY operation_id::text COLLATE "C") FROM requested)
  ),
  'rows', coalesce(
    (SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(selected) ORDER BY operation_id::text COLLATE "C") FROM selected),
    '[]'::jsonb
  )
) AS owner_export
WHERE pg_catalog.current_setting('transaction_read_only') = 'on';
