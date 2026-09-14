# Byetery

> La demo MOCK valida el flujo completo de la aplicación, pero no ejecuta el contrato Soroban. El contrato Rust está validado por su propia suite de tests y su integración real queda pendiente para Stellar Testnet.

Ver [alcance de la demo y guion de presentación](docs/DEMO-SCOPE.md).

Monorepo local consolidado. Contrato Soroban congelado, Backend Foundation y demo
MockStellarService. API HTTP local y frontend Next.js sobre Supabase Cloud DEV; blockchain exclusivamente MOCK.

```text
Byetery/
├── contracts/byetery-contract/  # Rust, Cargo.lock, tests y scripts originales
├── backend/                   # Foundation TypeScript, mock y 50 tests
├── frontend/                  # Next.js, Auth DEV, paneles y pruebas
├── database/migrations/       # SQL original
├── tools/python/              # Datos ficticios y SHA-256
├── docs/                      # Arquitectura, documentos y checkpoints
├── scripts/                   # Verificación conjunta
├── .env.example
├── .gitignore
├── AGENTS.md
├── package.json
└── README.md
```

## Ejecución

Requisitos: Node.js 24+, Python 3 y PowerShell 7 (pwsh). En este equipo se conservó el toolchain
Rust local del contrato en `.tools` (excluido de Git). Desde la raíz:

```powershell
npm run demo
npm run test:backend
npm run test:python
npm run verify
```

En una copia nueva, instalar dependencias con `npm --prefix backend ci`. El script Rust
original requiere reconstruir/proveer su instalación `.tools` con Rust 1.96.0 para
Windows GNU y target wasm32v1-none, como se documenta en el README original del contrato.
No se versionan los compiladores ni builds.

La demo utiliza el mock y los tipos existentes. Muestra Battery ID, Request ID CSPRNG,
wallet pública simulada y REGISTERED → RETURNED → COLLECTED → RECYCLED → SENT.
SENT es estado de recompensa; el estado físico permanece RECYCLED. No firma ni envía
transacciones reales. La demo es en memoria; la suite existente incluye integración mock/SQL.

## Conservación

Código original conservado en Documents/Codex/Byetery. Los documentos originales de
proyecto insta permanecen en su ubicación; hay copias en docs/project. La copia definitiva
está en proyecto insta/Byetery. El contrato conserva internamente `.tools`, `target`, tests,
snapshots y scripts. El WASM generado permanece en target, fuera de Git, con SHA-256:

`c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6`

El manifiesto versionado está en docs/checkpoints/frozen-contract.json. Las evidencias
históricas se preservan aparte de los snapshots que pueden regenerar las pruebas.
ARCHITECTURE.md y VALIDATION.md originales se conservan en backend y como referencia
en docs. El informe de consolidación documenta las nuevas ubicaciones y verificaciones.

Las migraciones conservan sus pruebas PGlite y cuentan además con 82 checks SQL en Supabase DEV.
La API y la demo visual prueban Auth DEV real y PostgreSQL; Storage público queda pendiente.

Estado actualizado: ver [checkpoint validado de Windows](docs/verification/WINDOWS-CHECKPOINT.md). Los informes anteriores de bloqueo se conservan como historial.

## API de desarrollo

```powershell
node scripts/check-dev-connection.mjs
npm run dev:setup
npm run api
# En otra consola o con el servidor detenido (usa su propio puerto):
npm run demo:api
npm run test:http:dev
```

Credenciales reales solo en `.env` ignorado. El provisioning de roles se realiza
desde la consola del servidor; ver [documentación de endpoints](docs/HTTP-API.md).

Resultados del nuevo checkpoint: [validación HTTP API](docs/verification/HTTP-API-VALIDATION.md).

## Frontend MVP

Con `npm run api` activo, ejecutar `npm run frontend` y abrir `http://127.0.0.1:3000`.
Instalación reproducible: `npm --prefix frontend ci`. Configurar solo las variables de `frontend/.env.example`.

Ver [pantallas, seguridad y demo visual](frontend/README.md) y [validación frontend](docs/verification/FRONTEND-MVP.md).
La demo automatizada completa se ejecuta con `npm run demo:visual` después del build del frontend.
