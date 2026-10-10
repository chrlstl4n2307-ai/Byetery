# Cámara QR de Byetery

`ScanBattery` se reutiliza en Dashboard, Collector y Recycler. Pide cámara únicamente al pulsar “Escanear batería”. El ingreso manual siempre está disponible. El QR generado en la ficha se conserva.

## Formato y permisos

Solo se acepta `/battery/` seguido de entre 1 y 32 caracteres `A-Z`, `0-9` o `-`, exactamente como los QR existentes. Se rechazan URLs absolutas, externas, rutas relativas ambiguas, escapes porcentuales, queries, fragments, minúsculas y espacios. No se transforma un URL recibido para tratar de hacerlo válido.

El usuario consulta la batería mediante GET autenticado y navega a la ficha únicamente si existe. Collector/Recycler cargan la batería y su solicitud activa en el panel, sin ejecutar una mutación. `GET /api/batteries/:batteryId` añade `operatorRequest` solamente a usuarios con membership de operador habilitada y rol de actor habilitado en la proyección del mock. Devuelve ID/estado de solicitud; no devuelve usuario, destinatario ni wallet. Resto de usuarios: `operatorRequest: null`; `ownRequest` mantiene su alcance previo.

La recepción/reciclaje siguen requiriendo sesión, rol y botón de confirmación explícita. El backend mantiene doble autorización collector + service, evidencia vinculada a batería/solicitud y destinatario inmutable. El escaneo nunca solicita devolución, confirma collection/recycling ni paga recompensas.

## Captura y decodificación

`startCamera` solicita video sin audio y cámara trasera como preferencia. Usa BarcodeDetector solo si informa soporte `qr_code`. Si no está disponible o falla, carga `jsqr` 1.4.0 bajo demanda: Apache-2.0, sin dependencias transitivas, decodificador JavaScript local. Su ritmo de publicaciones es bajo; se mantiene fijado y cubierto por pruebas, con entrada manual como alternativa permanente.

El procesamiento ocurre en RAM y no graba video, no persiste frames, no crea archivos de imagen ni sube capturas. Un canvas temporal permite decodificar; se limpia después de cada iteración y al terminar. La frecuencia está limitada y la imagen de trabajo se reduce a un ancho máximo de 960 píxeles.

Todos los tracks se detienen al completar lectura (incluso QR inválido), cerrar, pulsar Escape, desmontar el componente, abandonar/ocultar la página o ante error. También se detiene un stream cuyo permiso llega después de cancelar. No se cambian protecciones globales: Permissions-Policy permite `camera=(self)` exclusivamente para esta app; micrófono y geolocalización siguen denegados.

Requiere contexto seguro: HTTPS o loopback `http://127.0.0.1:3000`. Esta fase no expone el servidor en LAN ni despliega una web; un teléfono no accede al localhost de este PC. Los problemas de permiso, cámara ocupada/ausente o navegador incompatible conservan la entrada manual.

## Demostración manual requerida

1. Abrir la aplicación y entrar con Supabase DEV.
2. Conectar Freighter, revisar el challenge v2 y aprobar la firma. Ver “Wallet verificada”.
3. Registrar una batería DEV aislada con ADMIN y mostrar su QR en otra pantalla o impreso.
4. Desde Dashboard abrir el escáner, permitir la cámara física y comprobar que abre esa misma batería.
5. Solicitar devolución. Con Collector escanear, comprobar batería/solicitud y confirmar recepción física.
6. Con Recycler escanear y confirmar reciclaje. Con ADMIN procesar recompensa.
7. Comprobar `RECYCLED`, `SENT`, `10 GREEN-TEST`, `DEV`, `MOCK` y que la cámara se apaga tras cada lectura/cierre.
8. Probar rechazo de permiso y entrada manual.

No se considera completada esta prueba por pasar tests con cámara o proveedor simulados. La extensión debe conservar el control de las claves y el usuario realiza las aprobaciones necesarias.

## Demostración automatizada

```powershell
npm --prefix frontend run build
npm run demo:qr
```

Amplía el flujo existente de `demo:visual` con el SVG efectivamente generado por la UI. En un contexto de Edge aislado lo convierte en un stream sintético en RAM para probar el video, jsQR, validación, GET, misma batería y lookup de solicitud. Comprueba que todos los tracks terminan. No persiste ni sube los frames del stream. Esta prueba no equivale a cámara física ni firma con extensión: el firmante criptográfico es Node y las cuentas/deployment son fixtures DEV aisladas. `npm run demo`, `demo:api` y `demo:visual` se conservan.

Referencias: [BarcodeDetector y compatibilidad](https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector), [jsQR](https://github.com/cozmo/jsQR).
