# Byetery — Backend Foundation y API DEV

La API HTTP local sobre Supabase DEV se documenta en [HTTP-API.md](../docs/HTTP-API.md).
El contrato Rust permanece congelado, sin frontend ni conexión a Stellar Testnet.

El texto siguiente conserva el alcance original de Foundation como referencia histórica;
las limitaciones sobre HTTP, Auth y WalletVerifier se resolvieron en la nueva capa.

## Ejecutar

Requiere Node.js 24 o superior. Desde esta carpeta:

```sh
npm ci
npm run verify
```

`verify` comprueba TypeScript y ejecuta los tests. La suite de datos crea un PostgreSQL
embebido PGlite vacío, proporciona únicamente los prerrequisitos de prueba de Supabase
(`auth.users`, `anon`, `authenticated`) y ejecuta los archivos SQL de migración en orden.
Los tests ejecutan SQL real: constraints, FK diferibles, triggers, permisos y RLS.
La base de pruebas es efímera y no modifica ninguna base existente.

No se ha ejecutado una instancia completa de Supabase: Auth, PostgREST, Storage y
concurrencia entre conexiones deben validarse posteriormente con Supabase local.
PGlite usa una conexión exclusiva; los índices de exclusión lógica se prueban con
inserciones conflictivas, no con dos sesiones PostgreSQL simultáneas.

## Archivos

| Archivo | Función |
|---|---|
| `../database/migrations/20260909142956_backend_foundation.sql` | Once tablas, claves, índices, restricciones, triggers y RLS base-deny |
| `src/domain.ts` | Tipos compartidos; generación CSPRNG de request_id de 32 bytes |
| `src/stellar-service.ts` | Interfaz de lecturas, preparación, autorización, envío y consulta |
| `src/mock-stellar-service.ts` | Simulación de invariantes y pago atómico prefinanciado |
| `src/evidence.ts` | Compromiso SHA-256 sobre ScVal/XDR compatible con Rust |
| `src/wallet-verifier.ts` | Interfaz independiente del proveedor de wallet |
| `tests/database.test.ts` | Aplicación de migración, seguridad y flujo integrado mock → SQL |
| `tests/mock.test.ts` | Flujo completo y escenarios negativos del contrato |
| `tests/contract-evidence-vector.json` | Vector extraído del snapshot Rust/WASM congelado |
| `tests/checkpoint.test.ts` | Detecta cambios en código Rust y dependencias del checkpoint |
| `ARCHITECTURE.md` | Arquitectura objetivo y alcance incremental |

## Esquema implementado

`chain_private`: deployments, actor_roles, batteries, return_requests.

`app_private`: users, wallet_links, battery_records, return_requests,
evidence_versions, stellar_operations, reward_attempts.

Todas las entidades del contrato contienen deployment_id. La fila raíz deployments usa
id como clave. Users es identidad global; wallet_links está además vinculado al despliegue
para aislar las verificaciones simuladas de las futuras verificaciones reales.

No hay permisos de navegador, vistas expuestas ni RPC privilegiadas. RLS está habilitado
y forzado en todas las tablas; una política restrictiva deniega anon/authenticated.
Las credenciales de runtime y sus privilegios mínimos se incorporarán con los servicios
de aplicación. Las pruebas usan el propietario privilegiado solo como migrador/harness;
esto no constituye una configuración de autenticación para producción.

Las direcciones tienen validación estructural SQL; el SDK verifica la codificación en
el mock. La futura entrada de aplicación deberá validar también checksum y red.
La base conserva los bytes del manifiesto y exige que su SHA-256 sea payload_hash;
el compromiso exterior XDR se calcula en TypeScript y se contrasta con Rust.
El contenido semántico de los manifiestos y la carga real de archivos son trabajo posterior.

## Contrato y separación de estados

El contrato confía en Config.service para la identidad Supabase y la propiedad del claim.
No conoce user_id. El backend debe autenticar y verificar propiedad antes de firmar.
La wallet destinataria es inmutable desde open_return; cambiar el perfil no la modifica.
La asociación de usuario se confirma al recolectar, dentro de la misma transacción de
proyección que marca la solicitud CONFIRMED y la batería COLLECTED.

Los estados físicos son REGISTERED, RETURNED, COLLECTED, RECYCLED. La única vuelta es
RETURNED → REGISTERED por cancelación. La recompensa confirmada es NOT_ELIGIBLE,
PENDING o SENT. FAILED pertenece exclusivamente al intento off-chain.

Una operación SUBMITTED/UNKNOWN no cambia el estado confirmado. El mock devuelve
PENDING al enviar; el harness llama settle para avanzar la confirmación. Repetir una
misma preparación no duplica efectos. Un nuevo intento de pay_reward después de SENT
falla. Las pruebas incluyen falta de cualquiera de las autorizaciones de recolección,
evidencia incorrecta, rollback de transferencia y registros archivados/restaurados.

`authorize`, `settle`, `fund`, `failTransfers` y los controles de archivado son utilidades
exclusivas del mock, no capacidades de StellarService ni firmas criptográficas reales.
Las referencias tienen prefijo mock:. No hay adaptador real ni llamadas RPC.

WalletVerifier solamente verifica una prueba frente a un desafío. El futuro coordinador
deberá autenticar al usuario, comprobar el contexto y consumir el desafío de forma atómica.
No se incluye un verificador que devuelva true automáticamente ni se asume una wallet concreta.

## Validación y límites

Ver `VALIDATION.md`. No se ejecutaron despliegues, pruebas de red, Supabase Advisors ni
pruebas de infraestructura. Antes de habilitar Testnet se necesitarán el adaptador real,
persistencia de envelopes/autorizaciones, firmantes, recuperación de operaciones y
verificación operativa del activo configurado. GREEN-TEST es etiqueta de presentación;
el código clásico previsto es GREENTEST y la identidad del pago es Config.reward_token.

## Referencias consultadas

- https://supabase.com/changelog.md (2026-09-09: cambios recientes sin dependencia de las funciones utilizadas)
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://pglite.dev/docs/
- https://developers.stellar.org/docs/build/smart-contracts/example-contracts/auth
