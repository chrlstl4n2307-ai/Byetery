# Byetery — validación frontend MVP

Fecha: 2026-09-13. Rama `codex/frontend-mvp`, derivada del checkpoint
`90b7e23081107fcadec0e415da6476b62a4cd41e`. No se modificaron commits previos.

## Implementación

Next.js 16.3.5, React 19.3.0, TypeScript 6.0.3, Supabase JS 2.116.0 y SSR 0.12.7.
Versiones exactas y lockfile. TypeScript 7 se descartó únicamente en frontend por
incompatibilidad con typescript-eslint; el backend conserva su configuración.

```text
frontend/
├── src/
│   ├── app/
│   │   ├── login/                 # Iniciar sesión
│   │   ├── signup/                # Crear cuenta
│   │   ├── dashboard/             # Cuenta, wallet, solicitudes propias
│   │   ├── battery/[batteryId]/   # Timeline, QR, devolución y recompensa
│   │   ├── admin/                 # Registro de batería
│   │   ├── collector/             # Recepción física
│   │   ├── recycler/              # Reciclaje con evidencia
│   │   ├── api/[...path]/          # Proxy de rutas existentes
│   │   ├── auth/[action]/         # Supabase Auth con cookies HttpOnly
│   │   └── layout, page, error, not-found, globals.css
│   ├── components/                # Auth, sesión, batería, dashboard, operador
│   ├── lib/                       # Cliente tipado, tipos, política proxy, servidor
│   └── proxy.ts                   # CSP con nonce y respuestas privadas
├── tests/                         # Componentes, cliente y reintento idempotente
├── .env.example
├── next.config.ts
├── tsconfig.json
├── eslint.config.mjs
├── vitest.config.ts
├── package.json / package-lock.json
└── README.md
```

El frontend no importa implementación blockchain: reutiliza tipos de dominio y
consume la API. El servidor API conserva `StellarService → MockStellarService`.
Se añadieron únicamente las lecturas autenticadas aprobadas `/api/me` y la
ampliación de metadatos/solicitud propia en la consulta de batería. No hay gestión
HTTP de roles ni cambios de migraciones, RLS o contrato.

## Resultados verificados

| Comprobación | Resultado |
| --- | --- |
| `npm run verify` | Exit 0 |
| Rust `cargo test --locked` | 20/20 |
| Rust con feature `wasm-tests` | 20/20 nativos + 1/1 sobre WASM |
| Release `wasm32v1-none` | Recompilado, SHA idéntico |
| rustfmt / Clippy `-D warnings` | Correctos |
| Backend Foundation y TypeScript | 50/50, tipos correctos |
| HTTP real + Supabase DEV | 43/43: 35 existentes + 8 de lecturas/privacidad |
| SQL Foundation PGlite | 82/82, rollback |
| SQL Supabase DEV | 82/82, rollback |
| Python | 4/4 |
| Frontend TypeScript / ESLint | Sin errores |
| Frontend Vitest | 33/33 |
| Build Next de producción | Exit 0; rutas dinámicas, sin caché privada |
| Demo CLI original | REGISTERED → RETURNED → COLLECTED → RECYCLED → SENT |
| Demo CLI por API | SENT, 10 GREEN-TEST, MOCK, SUPABASE DEV; exit 0 |
| Demo visual Edge | Exit 0; BYE-6AEC75649E2211, SENT 10 GREEN-TEST; permisos, Origin, logout y móvil correctos |
| Bundle / entorno frontend | 17 artefactos, sin secretos privilegiados; allowlist válida |
| Auditoría npm de producción | 0 vulnerabilidades en frontend y backend |
| Contrato vs checkpoint congelado | Sin diferencias |
| `git diff --check` | Sin errores |

SHA-256 del WASM:

`c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6`

La revisión de archivos candidatos e historial Git no encontró secretos. `.env`,
`.env.local`, dependencias, `.next`, toolchains, WASM/builds y capturas de prueba
permanecen ignorados. El WASM existente se conserva localmente; su SHA y checkpoint
continúan versionados como referencia.

## Pruebas visuales y correcciones

El navegador recorre login de cuatro roles, registro, firma Ed25519 externa con
challenge real, devolución, recolección, reciclaje y pago simulado; comprueba
cookies HttpOnly, rechazo por rol, Origin ajeno, logout y vista móvil sin desborde.
La ejecución utiliza un deployment aislado y usuarios Auth temporales. No se
almacenan contraseñas ni claves privadas en archivos o navegador.

Durante la validación se corrigió el cleanup del fixture: después de cambiar una
contraseña o cerrar sesión en navegador, Auth puede rechazar el logout del token
anterior con 401/403. Se tolera exclusivamente ese caso ya revocado, después de
desactivar acceso de negocio y antes de eliminar la cuenta Auth. Otros errores
siguen fallando la prueba. Las seis cuentas de la primera ejecución interrumpida
se limpiaron usando únicamente su deployment exacto; no se borró historia de negocio.

La espera de la prueba visual se ajustó de 5 a 45 segundos para la navegación
que valida Auth y perfil contra Supabase DEV. No se cambió ninguna aserción de
permisos ni se aumentaron timeouts de la aplicación para ocultar errores.

Ver [instrucciones de demo manual y automatizada](../../frontend/README.md).
Los logs técnicos de esta validación y capturas están en `.tools/verification/`,
ignorados. No reconstruir `.next` mientras se ejecuta `demo:visual`; requiere puerto
3000 libre y Edge instalado.

## Inventario de cambios

Modificados: `.gitignore`, `AGENTS.md`, `README.md`, `package.json`,
`frontend/README.md`, `docs/HTTP-API.md`, `backend/src/application/http.ts` y
`backend/src/application/dev-fixture.ts` (solo cleanup del fixture).

Nuevos: configuración, lockfile, código y tests indicados en el árbol frontend;
`backend/src/application/frontend-reads.ts`,
`backend/remote-tests/frontend-reads.test.ts`,
`scripts/demo-visual.mts`, `scripts/check-frontend-secrets.mjs` y este informe.

No se movieron archivos del contrato ni se sustituyeron pruebas existentes.

## Límites pendientes

- Wallet gráfica específica pendiente. Se acepta firma externa Ed25519 real mediante
  la interfaz independiente; no existe bypass de firma.
- QR contiene solo la ruta/identificador de batería. Entrada manual o lector externo;
  cámara y acceso desde un teléfono al servidor loopback quedan pendientes.
- No hay fotografías públicas ni gestión de roles desde frontend. Manifiestos DEV
  inmutables con hashes/compromisos calculados por la API existente.
- Los reintentos conservan su clave en memoria mientras la pantalla permanezca abierta;
  recuperación de esa clave tras cerrar la pestaña pendiente. La coordinación durable
  y prevención de dobles operaciones siguen en backend.
- Supabase conserva el aviso previo de [protección contra contraseñas filtradas desactivada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
  Sin nuevos avisos de esquema/RLS. No se cambió esa configuración.
- Entorno exclusivamente DEV/MOCK. Sin Stellar Testnet, producción ni Vercel.

El hash del nuevo commit se entrega por separado; no se incluye dentro del archivo
para evitar una referencia circular al propio commit.
