import {local,check,CaptureError} from './common.mjs';
export function assertReadonlyRole(r,expected){check(r&&expected&&r.current_user===expected&&r.session_user===expected&&!['postgres','service_role','supabase_admin','authenticator'].includes(expected),'UNSAFE_SQL_CREDENTIAL');check(r.rolsuper===false&&r.rolbypassrls===false&&r.rolcreatedb===false&&r.rolcreaterole===false&&r.rolreplication===false&&r.memberships===0&&r.database_create===false&&r.database_temp===false&&r.schema_ddl===0&&r.table_mutations===0&&r.user_functions===0,'UNSAFE_SQL_CREDENTIAL');}
// Historical compatibility API only. Option A never reads credentials, loads pg,
// opens a database connection or executes a query.
export async function readSqlReceipt(){local();throw new CaptureError('BLOCKED_PENDING_READONLY_CREDENTIAL',{policy:'OWNER_EXPORT_ONLY_NO_DATABASE_CONNECTION'});}
