# Qué demuestra Byetery hoy

Texto para documentación, diapositivas y presentación oral:

> La demo MOCK valida el flujo completo de la aplicación, pero no ejecuta el contrato Soroban. El contrato Rust está validado por su propia suite de tests y su integración real queda pendiente para Stellar Testnet.

La interfaz utiliza Auth y PostgreSQL de Supabase DEV, la API HTTP y el coordinador.
Las operaciones blockchain pasan por `StellarService` y actualmente solo existe
`MockStellarService`. El mock no invoca Rust, no carga el WASM ni envía transacciones
a Stellar. Las pruebas del contrato son una validación independiente.

## Guion breve para una presentación

1. Mostrar **DEV / MOCK** antes de comenzar. Explicar la separación entre simulación
   de operaciones Stellar y contrato Soroban probado independientemente.
2. Registrar una batería y mostrar su QR: identifica el registro; no autoriza acciones.
3. Solicitar una devolución con usuario autenticado y wallet verificada.
   “Devolución solicitada” todavía no significa recepción física.
4. Confirmar recolección y reciclaje con los roles correspondientes. Mostrar el
   estado físico separado de la recompensa pendiente.
5. Procesar la recompensa simulada. Mostrar “Ciclo completado”, “Enviada” y
   “+10 GREEN-TEST” únicamente tras confirmar `RECYCLED` y `SENT` en la API.
6. Cerrar aclarando que todavía no se demostró una transacción real en Stellar.

## Mock permanente e integración futura

```text
Frontend → API → StellarService
                  ├── MockStellarService       [actual: demo/desarrollo]
                  └── TestnetStellarService    [futuro: Soroban en Testnet]
```

`TestnetStellarService` es una decisión de diseño futura, no una clase implementada.
El mock se conservará para pruebas rápidas y reproducibles. La demo CLI en memoria
`npm run demo` funciona sin red; la demo web y `demo:api` siguen necesitando red para
Supabase DEV, aunque no dependen de la red Stellar.

En una integración futura, entorno, red y origen de las operaciones deberán
provenir de configuración validada y del adaptador efectivo. Cambiar un rótulo
a `STELLAR` no demuestra ejecución on-chain: será necesario verificar el contrato,
la red y los resultados reales de las transacciones. Los rótulos actuales siguen
siendo **Environment: DEV** y **Blockchain source: MOCK**.

Orden acordado: respaldo GitHub privado → retoques visuales → wallet gráfica y
cámara QR → adaptador Testnet → validación real contra Soroban → despliegue.

Los documentos históricos y checkpoints conservan sus versiones originales;
este texto es la referencia actual para nuevas presentaciones.
