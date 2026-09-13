# Validación del checkpoint HTTP API

Fecha: 2026-09-13. Windows, Node 24.16.0, Supabase PostgreSQL 17.6.
Rama: `codex/local-application`. Base conservada:
`767e8f45dd13a3bfb9b041ed2fd00a1b8d3381df`.
Proyecto exclusivo DEV: `aemxuqnnwfclzrwwiqfd`.

## Resultados finales

| Comprobación | Resultado |
| --- | --- |
| `cargo test --locked` | 20/20 |
| WASM release `wasm32v1-none` | Reconstruido; SHA idéntico |
| Tests con `--features wasm-tests` | 20/20 + constructor WASM 1/1 |
| rustfmt | Correcto |
| Clippy `--locked --all-targets --features wasm-tests -- -D warnings` | Correcto |
| Backend Foundation original | 50/50, sin modificar los tests originales |
| TypeScript, incluidos los nuevos módulos y tests HTTP | Correcto |
| Prueba SQL compartida en PGlite | 82/82 |
| Prueba SQL compartida en Supabase DEV | 82/82; rollback |
| Suite `remote-dev HTTP integration` | 35/35 según Node (34 casos y su contenedor) |
| Python | 4/4 |
| `npm run demo` | Flujo completo hasta SENT, exclusivamente en memoria |
| `npm run demo:api` | HTTP real + Supabase DEV, flujo completo hasta SENT |
| Arranque del servidor por su entrypoint | Correcto; sin sesión devuelve 401 |
| Conexión cliente a Supabase pooler | TLS 1.3, certificado y hostname validados |

Se ejecutó nuevamente `npm run verify` completo después de corregir la API,
con salida 0. Su log local está en `.tools/verification/http-api-full-verify.log`,
ignorado por Git. El contrato completo no tiene diferencias respecto de la base.

WASM:

`c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6`

## Demo API observada

```text
BYE-DE88665E6F52D30C

REGISTERED ✓
RETURNED   ✓
COLLECTED  ✓
RECYCLED   ✓

Reward:
SENT
10 GREEN-TEST

Source:
MOCK

Database:
SUPABASE DEV
```

Cada ejecución utiliza otros IDs. Las operaciones de negocio de la demo pasan
por HTTP; la preparación de cuentas/roles es provisioning de fixtures, no una ruta pública.

## Cobertura HTTP

Sesión ausente; rol USER intentando registrar; metadatos Auth que no conceden
ADMIN; registro ADMIN; duplicado; idempotencia con JSON reordenado; conflicto
por distinto input; rechazo de campos de identidad; wallet requerida; firma
Ed25519 real; propietario del challenge; firma incorrecta; consumo único;
cinco intentos; consumo concurrente; expiración; request CSPRNG; cancelación
por otro usuario; segunda devolución activa; cancelación válida y nuevo ID;
collector sin permiso; rol de aplicación sin rol Stellar; falta de collector
o service; evidencia de otra batería; recycling prematuro; doble autorización
correcta; cancelación posterior a collection; recompensa prematura; recycler
incorrecto; RECYCLED/PENDING; rechazo de recipient/token/amount; UNKNOWN con
reintento, operación alternativa bloqueada y restauración del mock persistido;
pago único; GET seguro; RLS base-deny; sesión revocada; ausencia de secretos.

La incertidumbre se introduce mediante una dependencia de prueba que demora la
confirmación del mock; no hay un control HTTP que permita al usuario activarla.
La recuperación crea otro coordinador y restaura desde PostgreSQL la misma
submission. Se verifica un solo reward_attempt y exactamente 100.000.000 unidades
base recibidas, equivalentes a 10 GREEN-TEST simulados.

## Migraciones, seguridad y cleanup

`20260909142956_backend_foundation.sql` permanece intacta y aplicada.
Se aplicó `20260913140711_application_http.sql` por la CLI fijada, después del
dry-run dirigido al mismo DEV. Hay 16 tablas privadas con RLS habilitado y forzado.
Las cinco tablas auxiliares están en `api_private`; no se exponen por Data API.

El cleanup final dejó **0 usuarios Auth, 0 sesiones Auth, 0 identidades de negocio
activas y 0 memberships habilitados** de las suites. El deployment de servicio
MOCK quedó preparado mediante `dev:setup`. Se mantienen los tombstones e historial
de pruebas en sus namespaces: borrarlos violaría las invariantes de Foundation.
No se borraron datos ajenos ni se deshabilitaron restricciones.

La revisión previa al commit buscó valores de credenciales configuradas y patrones
de claves/JWT en archivos candidatos, logs locales e historial Git. No hubo
hallazgos. `.env`, certificado local, dependencias, toolchains y builds están
ignorados. El certificado CA es público, aunque también se conserva solo localmente.

La primera pasada HTTP encontró dos errores de tipado de parámetros SQL en
recompensas y consulta de privilegios. Se corrigieron con casts explícitos; no
se cambiaron restricciones ni reglas funcionales. La pasada final no tiene
fallos ni tests omitidos.

Supabase Advisors informó únicamente la protección Auth de contraseñas filtradas
desactivada. No se cambió su configuración. El backend local utiliza una credencial
SQL DEV privilegiada; un rol SQL de mínimo privilegio, auditoría histórica completa,
optimización del snapshot y exposición pública requieren trabajo posterior.
Ver [API, variables y límites](../HTTP-API.md). No se implementó frontend ni Testnet.

## Archivos del checkpoint

- Modificado: `.env.example`
- Modificado: `README.md`
- Modificado: `backend/README.md`
- Modificado: `backend/package-lock.json`
- Modificado: `backend/package.json`
- Creado: `backend/remote-tests/http.test.ts`
- Creado: `backend/src/application/auth.ts`
- Creado: `backend/src/application/config.ts`
- Creado: `backend/src/application/coordinator.ts`
- Creado: `backend/src/application/demo-api.ts`
- Creado: `backend/src/application/dev-fixture.ts`
- Creado: `backend/src/application/errors.ts`
- Creado: `backend/src/application/http.ts`
- Creado: `backend/src/application/provision.ts`
- Creado: `backend/src/application/repository.ts`
- Creado: `backend/src/application/server.ts`
- Creado: `backend/src/application/validation.ts`
- Creado: `backend/src/application/wallet.ts`
- Modificado: `backend/src/mock-stellar-service.ts`
- Modificado: `backend/tsconfig.json`
- Creado: `database/migrations/20260913140711_application_http.sql`
- Creado: `database/tests/foundation-dev.sql`
- Creado: `docs/HTTP-API.md`
- Creado: `docs/SUPABASE-DEV.md`
- Creado: `docs/verification/HTTP-API-VALIDATION.md`
- Modificado: `package.json`
- Creado: `scripts/check-dev-connection.mjs`
- Creado: `scripts/test-foundation-parity.mjs`
- Creado: `scripts/test-supabase-dev.ps1`

Revisión final: `git diff --cached --check` correcto; auditoría de archivos, logs
y 91 blobs históricos sin hallazgos de credenciales; `npm audit --omit=dev`
reportó 0 vulnerabilidades.
