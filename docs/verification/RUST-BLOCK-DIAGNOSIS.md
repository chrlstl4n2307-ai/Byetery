# Diagnóstico del bloqueo Rust — 12 de septiembre de 2026

Estado: bloqueo reproducido, causa identificada; sin cambios de seguridad ni solución aplicada.

## Ejecutables

Archivo bloqueado en la reproducción actual:

```text
C:\Users\Christián\Desktop\proyecto insta\Byetery\contracts\byetery-contract\target\debug\build\soroban-env-common-7dfa7961f3512ad7\build-script-build.exe
```

SHA-256 plano: `e355cc69d4301eb328462c273d9bb8b2a4b78978d9164fb151464d20ae520ef8`.

Segunda variante bloqueada en la ejecución anterior, todavía presente y sin firma:

```text
C:\Users\Christián\Desktop\proyecto insta\Byetery\contracts\byetery-contract\target\debug\build\soroban-env-common-86f46f2b87b2d90b\build-script-build.exe
```

SHA-256 plano: `a9f10d058a4b969f1a5393dc92c4dbbdd1aaea88ff55fe4aa8e15999303c88e9`.

Proceso llamador identificado en el evento:

```text
C:\Users\Christián\Desktop\proyecto insta\Byetery\contracts\byetery-contract\.tools\rustup\toolchains\1.96.0-x86_64-pc-windows-gnu\bin\cargo.exe
```

Cadena de ejecución reproducida desde la raíz del monorepo:

```text
npm run verify
  → pwsh -NoProfile -File scripts/verify.ps1
  → pwsh -NoProfile -File contracts/byetery-contract/scripts/verify.ps1
  → scripts/cargo-local.ps1 -CargoArguments test --locked
  → cargo.exe test --locked
  → target/debug/build/soroban-env-common-7dfa7961f3512ad7/build-script-build.exe
```

Cargo muestra la ruta sin extensión en su diagnóstico; Code Integrity identifica el
archivo PE con extensión .exe. No hay evidencia de una DLL bloqueada en este fallo.

## Evidencia de Windows

Reproducción: 2026-09-12 21:57:05 America/Santiago (2026-09-13 00:57:05 UTC).
Canal: Microsoft-Windows-CodeIntegrity/Operational.

- Evento 3077, RecordId 359344: ejecución denegada.
- PolicyName: VerifiedAndReputableDesktop.
- PolicyGUID: {0283ac0f-fff1-49ae-ada1-8a933130cad6}.
- Estado: 0xc0e90002, mostrado por Cargo como error Windows 4551.
- Evento correlacionado 3089: TotalSignatureCount=0, emisor/editor desconocido.
- Evento correlacionado 3118: Smart App Control Block Details; DefenderDisabled=false.
- Get-AuthenticodeSignature confirma NotSigned en ambos ejecutables.
- VerifiedAndReputablePolicyState=1 en la lectura del registro, coherente con SAC activo.

Estos datos identifican un rechazo de confianza/firma de Smart App Control. No son
por sí mismos prueba de malware ni de un fallo en la lógica del contrato. No se
interpretaron campos internos de Defender como diagnósticos de red o antivirus.
CiTool -lp -json devolvió acceso denegado; el diagnóstico de política procede de los
eventos accesibles, no de una enumeración administrativa completa de políticas.

## Origen

Cargo y rustc llegan a compilar dependencias; el bloqueo aparece al ejecutar un
programa auxiliar recién compilado de soroban-env-common 27.0.1. Su build.rs imprime
una instrucción rerun-if-changed e invoca crate_git_revision::init(). No es el
compilador Rust ni el linker el archivo señalado por Windows.

Se revisaron PATH/Get-Command, ~/.cargo/bin, ~/.rustup, Program Files, Program Files (x86)
y AppData/Local/Programs. No se encontró otra instalación de Rust en esas ubicaciones.
El toolchain utilizado es la instalación local preservada en .tools. Reutilizar o
reinstalar Cargo no firma automáticamente los auxiliares generados por dependencias.

## Solución conservadora propuesta

Microsoft indica que Smart App Control no proporciona excepciones individuales;
recomienda firma con un certificado válido para aplicaciones de desarrollo.

Por tanto, no corresponde recomendar una excepción de carpeta, desactivar protecciones,
usar un certificado autofirmado como atajo, renombrar ejecutables, moverlos para eludir
controles ni modificar dependencias para evitar el build script.

Para conservar la compilación nativa y SAC activo se necesita un proceso autorizado de
firma de código con certificado válido reconocido por SAC para los auxiliares revisados
y, potencialmente, otros binarios nativos generados. Su firma cambiaría el hash de esos
PE, no las fuentes Rust. Deben preservarse hashes previos y posteriores y comprobarse
nuevamente la aceptación por Windows. No se promete que cualquier certificado sea suficiente.

No hay certificados de firma de código en el almacén personal del usuario inspeccionado.
No se dispone de un servicio de firma autorizado en esta tarea. No se compraron
certificados ni se enviaron archivos a servicios externos.

Corrección del informe anterior: la frase genérica «autorizar este archivo» no implica
que SAC ofrezca un botón de excepción; su documentación indica que no existe esa opción.

Referencia oficial consultada:
https://support.microsoft.com/en-us/windows/security/threat-malware-protection/smart-app-control-frequently-asked-questions

## Resultados de esta ejecución

| Verificación | Resultado |
|---|---|
| npm run verify | Falló en cargo test --locked por 4551 |
| rustfmt | Aprobado antes de cargo test |
| Tests Rust nativos | No ejecutados: compilación bloqueada |
| Reconstrucción WASM / tests WASM / Clippy | No alcanzados; no se afirma nueva validación |
| Backend + TypeScript + migraciones PostgreSQL PGlite | 50/50 aprobados al ejecutar la suite independientemente |
| Python | 4/4 aprobados |
| npm run demo | Éxito: REGISTERED → RETURNED → COLLECTED → RECYCLED → SENT |
| Pago demo | 100000000 unidades base = 10 GREEN-TEST simulados |
| Hash del WASM conservado | c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6 |

No se recompiló el WASM en esta ejecución; no hubo cambio de hash que explicar.

## Git

Rama codex/consolidation; cero commits y cero archivos rastreados. No se creó el
checkpoint porque no se cumple la condición de que toda la verificación pase.
Los archivos del proyecto y diagnósticos continúan como ?? (sin seguimiento).
.tools, target/WASM, node_modules, .env, datos demo, caches y temporales permanecen
excluidos deliberadamente por .gitignore. Se puede consultar el inventario exacto
en git-status.txt y untracked-files.txt junto a este informe.

No se modificaron fuentes congeladas, reglas funcionales, política SAC, SmartScreen,
Defender ni protecciones globales. No se avanzó a frontend, servicios remotos ni Testnet.
