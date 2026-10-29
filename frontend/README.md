# D2 DIRECT_REVIEW package — 2026-10-29

Local-only package: [D2-008B2 report](../docs/instaward/d2/D2-008B2-DIRECT-REVIEW-LOCAL.md). No hosted Preview or remote SQL has been configured. D2.6 remains pending.

`BYETERY_REVIEW_ADAPTER=DIRECT_REVIEW` selects separate `*.review.ts(x)` routes and server-only bounded SQL/chain readers. The legacy catch-all exists only in the normal LOCAL build. `npm run audit:review` must run after the DIRECT_REVIEW build to inspect actual routes, server actions, client chunks and checksum-validated seed candidates. Never build this mode with legacy upstream/admin/signing environment variables; their presence is rejected.

Tests require the existing guarded portable PostgreSQL fixture on loopback, not Supabase Cloud. `npm run verify` uses one Vitest worker for reproducible Windows execution. All external fetch is denied by default in tests; fixed receipt/RPC fixtures explicitly replace the transport. No credential provisioning or package installation is performed by the tests.

The existing browser harnesses now live in `scripts/browser-tests/d2-role-qr.test.mjs` and `scripts/browser-tests/d2-state-lanes.test.mjs`, outside the isolated frontend package. Their integration fixtures have not been converted into DIRECT_REVIEW operational endpoints. They were preserved and syntax-checked; their real browser workflows were not rerun in B2.

Future-only configuration names and security gates are listed in the B2 report. Its restricted DB URL must never be replaced with DATABASE_URL/admin/service-role credentials. Future Vercel root: `frontend`, outside-root build inclusion OFF, Protection enabled before deploy and exact Preview origins/branch verified. No B2A Auth experiment or deployment is authorized by this package.

---

# D2 earlier scope — 2026-10-22

D2-001 supports authenticated API read models with explicit MOCK/TESTNET source, a pinned existing Testnet deployment, and separate LOCAL / D2_PREVIEW HTTPS configuration. TESTNET business mutations and signup are disabled in the web proxy and UI for this phase. The backend, contract and signer are unchanged.

Configuration policy: `src/lib/web-config.ts`. HTTPS requires reviewed exact origin/upstream allowlists and Secure/HttpOnly/SameSite=Strict cookies. On Vercel, only Preview from `instaward/d2-web-mvp` is accepted. No backend database/service-role/signing material belongs in frontend configuration. Existing `.env.local` values remain local and unchanged.

See [D2 evidence](../docs/instaward/d2/EVIDENCE-INDEX.md). A real authenticated HTTPS read API is required before Vercel deployment; frontend configuration alone is not a working public integration. The historical baseline below is preserved and its earlier “pending” statements describe that checkpoint.

---

# Byetery frontend MVP — DEV / MOCK

> La demo MOCK valida el flujo completo de la aplicación, pero no ejecuta el contrato Soroban. El contrato Rust está validado por su propia suite de tests y su integración real queda pendiente para Stellar Testnet.

Ver [alcance de la demo y guion de presentación](../docs/DEMO-SCOPE.md).

Next.js App Router + React + TypeScript. Solo Supabase **Byetery Dev** para Auth/datos y `MockStellarService` para blockchain. No Testnet, Vercel ni base de producción.

## Inicio

Desde la raíz del monorepo, con Node 24 y las dependencias instaladas:

```powershell
npm run dev:setup
npm run api
```

En otra terminal:

```powershell
npm --prefix frontend run dev
```

Abrir `http://127.0.0.1:3000`. Usar siempre ese host: `localhost` es un origen diferente. El API escucha en `127.0.0.1:3001`.

`frontend/.env.local` está ignorado. Su única configuración permitida está en `.env.example`: `BYETERY_WEB_ORIGIN`, `BYETERY_API_URL`, `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`. No copiar el `.env` del backend. No se utilizan variables `NEXT_PUBLIC_*`; Next gestiona Auth usando exclusivamente la clave publicable en el servidor. Las variables y secretos del backend se mantienen en el `.env` raíz.

## Pantallas

| Ruta | Función |
| --- | --- |
| `/login`, `/signup` | Acceso y alta con Supabase DEV; confirmación de correo según configuración de Auth |
| `/dashboard` | Cuenta, roles obtenidos de API, wallets verificadas y hasta 100 solicitudes propias |
| `/battery/[batteryId]` | Metadatos, timeline confirmado, recompensa separada, QR, solicitud/cancelación y reward ADMIN |
| `/admin` | Registro y consulta de baterías |
| `/collector` | Confirmación física con Battery ID, Request ID y manifiesto |
| `/recycler` | Confirmación de reciclaje con evidencia local |

La aplicación no concede roles. Un operador autorizado los asigna con el comando existente `npm run dev:setup -- --auth-user-id UUID --role ADMIN` (o `COLLECTOR` / `RECYCLER`). Nunca se usan los metadatos editables de Auth para autorización.

## Sesiones y API

El navegador llama al mismo origen Next. `/auth/login`, `/auth/signup`, `/auth/logout` y `/auth/session` usan el SDK oficial Supabase SSR por petición. Access/refresh tokens permanecen en cookies HttpOnly, SameSite=Strict; solo se usa HTTP en loopback DEV. No se guardan tokens en localStorage. El servidor renueva la sesión al consultar Auth o al reenviar operaciones. No hay caché de respuestas privadas.

`/api/[...path]` es un proxy limitado a rutas conocidas, con upstream fijo en loopback. No admite URLs arbitrarias, gestión de roles, redirecciones ni cabeceras privilegiadas del cliente. Los POST requieren Origin exacto y clave de idempotencia. Next agrega el bearer de la sesión; la API valida cada bearer con Supabase y verifica `auth.sessions`. El navegador no tiene acceso directo a tablas privadas.

Se añadieron, con autorización explícita, `GET /api/me` y una proyección ampliada de `GET /api/batteries/:id`. No se modificó ninguna operación del contrato ni de escritura del coordinador. El perfil solo devuelve wallets/solicitudes del usuario autenticado; la batería expone `type`, `manufacturer`, `batch` y la solicitud propia, nunca una wallet o claim ajenos.

## Demo visual manual

1. Crear cuentas DEV desde `/signup`, confirmar correo si corresponde y asignar los roles operativos mediante el comando interno anterior.
2. Como ADMIN, registrar un identificador nuevo (por ejemplo `BYE-DEMO-001`) con tipo, fabricante y lote.
3. Como usuario, vincular una dirección G…: solicitar challenge, firmar externamente **los bytes decodificados** de `messageBase64`, pegar solo la firma Ed25519 Base64 y verificarla. No pegar claves privadas. El contrato/verificación siguen siendo los existentes.
4. Consultar la pila mediante la búsqueda o la ruta indicada en su QR. Solicitar devolución y copiar el Request ID. `RETURNED` significa **Devolución solicitada**. Antes de recepción se puede cancelar.
5. Como COLLECTOR, introducir Battery ID y Request ID, consultar, revisar recepción física y confirmar con evidencia DEV. La API debe devolver `COLLECTED`.
6. Como RECYCLER, introducir los mismos identificadores, consultar y confirmar reciclaje. La API debe devolver `RECYCLED` y recompensa `PENDING`.
7. Como ADMIN, abrir la pila y procesar recompensa DEV. No se introduce destinatario, importe ni token.
8. El usuario actualiza la pila y ve `SENT`, `10 GREEN-TEST`, `DEV` y `MOCK`.

El QR contiene únicamente `/battery/BYE-...`; es un identificador/ruta local, sin claim, usuario, wallet ni autorización. Puede abrirse desde la interfaz. La captura por cámara y acceso desde un teléfono a este servidor loopback no están implementados; se admite entrada manual o lector externo como teclado.

## Demo automatizada real

```powershell
npm --prefix frontend run build
npm run demo:visual
```

Requiere Edge instalado y puerto 3000 libre. El script reutiliza el fixture DEV, crea cuentas temporales y un deployment MOCK aislado, inicia Next contra su API real y recorre las pantallas. Las claves y contraseñas de prueba existen solo en memoria del proceso Node; la firma se produce fuera del navegador. Al terminar cierra los procesos creados, revoca sesiones y deshabilita los registros de prueba. Mantiene la historia inmutable de negocio. Capturas locales ignoradas en `.tools/verification/frontend-desktop.png` y `frontend-mobile.png`.

## Estados y límites

- Los clics no avanzan estados. Se muestran exclusivamente estados confirmados por la API; pending/UNKNOWN e intentos fallidos se presentan aparte.
- Un timeout conserva en memoria el contenido y la clave de idempotencia. El botón de reintento vuelve a enviar exactamente la misma operación. No hay reintentos automáticos de mutaciones. Mantener la pantalla abierta hasta resolver la incertidumbre; la recuperación de claves de cliente tras cerrar la pestaña queda pendiente. El coordinador durable y las restricciones del backend siguen impidiendo duplicaciones de negocio.
- El panel wallet admite firma externa real y una interfaz `WalletSigner` independiente. La conexión a una wallet gráfica concreta queda pendiente; no hay bypass de firma.
- No hay cámara, carga pública de fotografías, gestión HTTP de roles ni recompensas reales. Los manifiestos de prueba preservan UTF-8 exacto; SHA-256, XDR y revisiones los calcula y guarda el backend existente.
- Sesión y perfil se actualizan al volver a la ventana, cada minuto o tras una acción; los permisos efectivos siempre se verifican en servidor. Operaciones de batería pendientes se consultan cada 5 segundos.
- CSP usa nonce por respuesta; `unsafe-eval` solo es necesario en `next dev`, no en el build de producción. Sin HTML de usuario sin escapar.

## Verificación

```powershell
npm --prefix frontend run verify
node scripts/check-frontend-secrets.mjs
npm run verify
npm run test:http:dev
pwsh -NoProfile -File scripts/test-supabase-dev.ps1
npm run demo:api
git diff --check
```

Referencias consultadas: [Next.js instalación](https://nextjs.org/docs/app/getting-started/installation), [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/advanced-guide), [changelog Supabase](https://supabase.com/changelog).
