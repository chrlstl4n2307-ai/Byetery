# Consolidación de Byetery — 2026-09-12

Destino definitivo: `C:\Users\Christián\Desktop\proyecto insta\Byetery`.

Estado: reorganización terminada; validación Rust bloqueada por Control de aplicaciones
de Windows. No se creó el commit condicionado a que toda la verificación pasara.

## Árbol

```text
Byetery/
├── contracts/byetery-contract/
│   ├── src/ y tests/                 (bytes originales)
│   ├── Cargo.toml, Cargo.lock, rust-toolchain.toml
│   ├── scripts/verify.ps1, cargo-local.ps1
│   ├── README.md, TESTING.md
│   ├── test_snapshots/               (local, ignorado)
│   ├── target/                      (WASM y builds, ignorados)
│   └── .tools/                      (toolchain, ignorado)
├── backend/
│   ├── src/                         (Foundation + demo.ts)
│   ├── tests/                       (50 tests originales)
│   ├── package.json, package-lock.json, tsconfig.json
│   └── README.md, ARCHITECTURE.md, VALIDATION.md
├── frontend/README.md               (reservado)
├── database/migrations/20260909142956_backend_foundation.sql
├── database/README.md
├── tools/python/
│   ├── generate_demo_data.py
│   ├── verify_payload_hash.py
│   ├── test_tools.py
│   └── README.md
├── docs/
│   ├── ARCHITECTURE.md, VALIDATION.md (referencias históricas)
│   ├── CONSOLIDATION.md              (este informe)
│   ├── checkpoints/                 (hashes, snapshots e historial original)
│   ├── project/                     (Word/PDF existentes)
│   └── verification/                (logs de esta ejecución)
├── scripts/verify.ps1
├── .env.example, .gitignore, .gitattributes
├── AGENTS.md
├── package.json
└── README.md
```

## Componentes trasladados mediante copia conservadora

| Origen | Destino dentro del monorepo |
|---|---|
| Documents/Codex/Byetery: contrato, dependencias Rust, scripts, tests, WASM y toolchain | contracts/byetery-contract |
| Documents/Codex/Byetery/backend | backend |
| backend/supabase/migrations | database/migrations |
| Snapshots y logs originales del contrato | docs/checkpoints (además del historial local del contrato) |
| Arquitectura y validación Foundation | Conservadas en backend y copiadas en docs |
| Word/PDF de proyecto insta | docs/project |

No se borraron originales. El archivo temporal de bloqueo de Word (~$…) no se copió.
La carpeta de migraciones tiene una sola ubicación activa en el monorepo.

## Cambios y archivos nuevos

No se alteraron reglas funcionales, fuentes Rust, Cargo.lock ni SQL. Solo se ajustaron
las rutas de dos tests backend: checkpoint hacia contracts/byetery-contract y migración
hacia database/migrations. README backend refleja la nueva ubicación SQL.

Nuevos: lanzador conjunto scripts/verify.ps1, comando raíz npm run demo, backend/src/demo.ts,
dos utilidades Python con pruebas/README, documentación del monorepo, AGENTS.md,
.env.example, .gitignore y .gitattributes. Este último evita que Git transforme los bytes
y saltos de línea del checkpoint. Se añadió únicamente el script demo al package.json backend.

## Resultados nuevos

| Verificación | Resultado |
|---|---|
| Integridad de fuentes Rust y Cargo | Aprobada por hashes del checkpoint |
| WASM conservado | SHA-256 esperado, intacto |
| rustfmt | Aprobado; el lanzador avanzó a cargo test |
| cargo test --locked | Bloqueado antes de ejecutar tests por Windows, error 4551 |
| Reconstrucción WASM / tests WASM / Clippy | No alcanzados por el bloqueo anterior |
| TypeScript | Aprobado |
| Backend Foundation, incluido PostgreSQL e integración | 50/50, sin omitidos |
| Python | 4/4 |
| Demo local | REGISTERED → RETURNED → COLLECTED → RECYCLED → SENT |

El historial Rust previo se conserva: 20 tests nativos + los mismos 20 sobre WASM +
1 test del constructor, todos aprobados en la validación anterior. No se presentan
como pruebas nuevas de esta reorganización.

WASM SHA-256:
`c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6`.

Python generó 10 baterías con semilla 42 y verificó MATCH para SHA-256
`83ab9b8495cd3d2077fcdc21a981ee8ca4c555a5b26bdec6886da5b30f23a5dd`.

Demo ejecutada:
- Battery ID: BYE-000001.
- Request ID: 75c96986109d1d0fc961b4bc8bd8b937a916ab7d2aec6457affb0dc891749c34.
- Wallet simulada: GACQKBIFAUCQKBIFAUCQKBIFAUCQKBIFAUCQKBIFAUCQKBIFAUCQKG7N.
- Recompensa: SENT, 100000000 unidades base, equivalentes a 10 GREEN-TEST simulados.
- Estado físico final: RECYCLED. SENT corresponde a la recompensa.

## Git y limitaciones

Repositorio inicializado en rama codex/consolidation, todavía sin commits. Los archivos
permanecen sin staging para no presentar un checkpoint validado incompleto. Se comprobaron
exclusiones de .tools, target, node_modules, .env y .demo-data. El WASM se conserva localmente;
su hash se conserva en el manifiesto versionable, pero el build no se incluirá en Git.

Se resolvieron rutas largas de Windows durante la copia y el lanzador nuevo requiere
PowerShell 7 (pwsh). Los scripts originales del contrato no se modificaron.

El evento 3077 de Microsoft-Windows-CodeIntegrity/Operational confirmó que dos
build-script-build.exe de soroban-env-common no cumplen la política de integridad/firma
de Windows. No se cambiaron políticas del sistema ni se intentó eludir el bloqueo.
Se requiere una autorización conforme a esa política para ejecutar esos binarios de
desarrollo; después se debe repetir npm run verify y, si pasa todo, crear el commit.

No hay Testnet, Supabase remoto ni frontend. PostgreSQL se verificó con PGlite;
Auth/PostgREST/Storage y concurrencia real siguen fuera del alcance de Foundation.

## Repetir

```powershell
npm run demo
npm run test:backend
npm run test:python
npm run verify
```

El último comando es deliberadamente fail-fast: no continúa si falla Rust o cualquier
otra verificación. Logs actuales: docs/verification/full-verification.log, backend.log,
python.log y demo.log.
