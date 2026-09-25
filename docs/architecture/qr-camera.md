# Cámara QR del operador

OE-04-006, issue #85. Usa el recorrido persistente del operador de #83, separado del demo. Requiere evento asignado y activo. No modifica API, base de datos ni permisos.

## Lectura y confirmación

Iniciar cámara solicita únicamente vídeo con preferencia no obligatoria por cámara trasera y resolución 1280x720. getUserMedia requiere contexto seguro (HTTPS o localhost). Firefox no depende de BarcodeDetector: jsQR 1.4.0 decodifica localmente. Se promueve la dependencia existente a producto sin cambiar versión; Apache-2.0 se conserva en public/third-party/jsqr-LICENSE.txt.

Se analiza un frame como máximo cada 250 ms después del análisis anterior, limitado a 640x480. No se graban, envían ni persisten imágenes. La primera lectura detiene todos los tracks, limpia srcObject y libera el canvas. Solo un token oe1_ con 43 caracteres base64url canónicos prepara el campo; otro QR muestra error fijo y no abre URLs ni envía solicitudes. Esta comprobación de formato no prueba validez: la API determina evento, credencial y permisos.

Registrar ingreso es una acción separada. Un QR preparado usa source qr; editar o pegar cambia a manual. Limpiar borra el código y origen. Durante captura, campo/envío manual se bloquean; Detener cámara los devuelve. Durante HTTP no se puede iniciar cámara. Ante incertidumbre se conserva el código/origen solo en memoria para reenvío explícito, con las advertencias existentes. No se reanuda captura ni se reintenta HTTP automáticamente.

## Ciclo de vida

Cancelar es posible aunque el diálogo de permiso siga pendiente. Una resolución tardía detiene el stream recibido sin instalarlo en la vista. Salida, cambio de cuenta/contexto o desmontaje detienen captura; la página oculta también la detiene y requiere un inicio explícito al volver. Se liberan tracks, listener de visibilidad, temporizador, srcObject y canvas. Una desconexión termina el ciclo. Permiso denegado, ausencia de cámara, fallo de reproducción/decodificación y contexto inseguro tienen mensajes fijos con alternativa manual.

## Verificación y límites

54 pruebas nuevas: 27 lifecycle de cámara, 4 decodificación de QR sintético real, 10 vista, 8 origen HTTP y 5 sesión. Suite completa web: 1.139 aprobadas; typecheck, lint y build correctos. No se atribuye prueba de hardware real a jsdom. Evidencia manual del mantenedor del 25 de septiembre de 2026, en Firefox con webcam del equipo y QR mostrado desde el teléfono: evento de prueba «Prueba de inscripción API 035» activo y accesible al operador; vista previa de cámara; lectura que prepara el código y muestra la confirmación pendiente sin vista previa; ingreso aceptado a las 14:52 America/Lima y campo vacío; nueva lectura y envío con aviso de duplicado que conserva esa misma fecha y limpia el campo. El mantenedor confirmó por texto que probó y detuvo la cámara; la captura posterior muestra el modo manual y el rechazo de un código inválido con campo vacío. No se atribuye prueba manual de permisos denegados, permisos tardíos, ocultación de página, revocación o cambio de cuenta; mantienen cobertura automatizada. No se reproducen credenciales ni capturas con secretos en la documentación.

Para webcam en el mismo equipo puede usarse http://localhost:5173. Abrir http://IP-del-equipo:5173 en el teléfono no equivale a localhost: se necesita HTTPS y configuración de autenticación/API coherente; este incremento no expone la red ni cambia CORS o Entra. Probar inicialmente con webcam y QR mostrado desde otra pantalla evita esa configuración adicional. Eventos cerrados no se reabren; la prueba necesita otro evento activo asignado si el anterior se cerró.

Referencias: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia y https://github.com/cozmo/jsQR . No se prometen todos los dispositivos, rendimiento p95, lectura continua masiva ni selección de cámara específica.
