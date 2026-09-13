# Backend Foundation — validación

Fecha: 2026-09-09. Entorno: Windows, Node.js 24.16.0.

Comando ejecutado: `npm run verify`.

| Comprobación | Resultado |
|---|---|
| TypeScript estricto, sin emisión | Correcto |
| Migración en PostgreSQL PGlite vacío | Aplicada correctamente |
| Pruebas de base de datos e integración | 25/25 |
| Pruebas del mock y compromiso XDR | 24/24 |
| Integridad del checkpoint Rust/Cargo | 1/1 |
| Total | **50/50, sin fallos ni pruebas omitidas** |

La migración crea 11 tablas, con RLS habilitado y forzado. Se comprobaron permisos
denegados a anon/authenticated para todas las tablas, y se probó además que una
política restrictiva sigue bloqueando acceso aunque se concedan permisos y una política
permisiva por accidente. No se crearon funciones SECURITY DEFINER ni mutadores públicos.

Casos ejecutados: flujo completo REGISTERED → RETURNED → COLLECTED → RECYCLED → SENT;
cancelación y conservación de IDs; duplicados; destinatario/propietario inmutables;
wallet revocada; cruces entre batería/solicitud/despliegue; evidencia incorrecta y hash
incoherente; transición hacia atrás; ledger antiguo; doble autorización y falta de
cualquiera de ellas; rol revocado; idempotencia; operaciones inciertas; saldo insuficiente;
fallo atómico de transferencia; reintento y doble recompensa; simulación de archivado;
compatibilidad del compromiso XDR con el snapshot de Rust/WASM.

El test integrado prepara/envía/confirma mediante MockStellarService y proyecta en SQL
los estados y solicitudes. Al final, la batería SQL tiene recompensa SENT y la wallet
simulada recibe exactamente el importe configurado. El coordinador del test es un harness;
no se ha implementado un endpoint ni un worker de producción.

Contrato congelado: pruebas de hash cubren src/lib.rs, src/types.rs, src/events.rs,
src/test.rs, Cargo.toml y Cargo.lock. WASM existente conservado:
`c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6`.

## Alcance de la evidencia

PGlite ejecuta PostgreSQL embebido, no simula constraints con JavaScript. El bootstrap
de auth.users/roles pertenece solo a pruebas. No hubo conexión a Supabase remoto ni
a Stellar Testnet. No se ejecutaron Auth, PostgREST, Storage, Advisors ni concurrencia
de múltiples sesiones PostgreSQL. La base de tests es efímera: la migración se vuelve
a aplicar desde cero al ejecutar la suite.

Quedan deliberadamente para fases posteriores los permisos de runtime, servicios
autenticados, desafíos de wallet persistentes, carga de archivos, work_assignments,
reconciliación histórica, auditoría completa y conexión real. WalletVerifier es una
interfaz independiente; ninguna verificación criptográfica de una wallet se declara
implementada por esta fase.
