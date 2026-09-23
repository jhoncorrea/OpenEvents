# Credenciales opacas de inscripción

## Alcance de OE-04-001A / Issue #63

Emisión interna autorizada mediante issueRegistrationCredentialForOrganizer. No añade endpoint HTTP, interfaz, imagen QR, envío por correo, validación de credenciales, reemisión ni check-in. El token es un secreto portador; no representa identidad ni autorización del organizador. El futuro consumidor deberá autorizar su propio recorrido.

## Contrato y autorización

Entradas: conexión Drizzle PostgreSQL, UUID de evento, UUID de inscripción y AuthenticatedUser previamente verificado. Requiere organizer global; tenantId/objectId UUID; usuario local activo identificado por entra:<tenantId>:<objectId>; asignación organizer al evento. No provisiona ni reactiva usuarios. Admin u operador sin organizer no bastan; con varios roles globales sigue exigiéndose la asignación local organizer.

Solo permite eventos draft/active e inscripciones confirmed pertenecientes al evento. Una inscripción cancelada o evento closed/cancelled impide emitir. El resultado contiene id, eventId, registrationId, status active, issuedAt como Date y token. No incluye hash, correo, nombre ni otros campos del registro.

## Secreto y almacenamiento

Se generan 32 bytes con node:crypto randomBytes (256 bits); token = oe1_ + base64url sin relleno, de 47 caracteres. El prefijo identifica formato y no contiene datos personales. Se almacena SHA-256 hexadecimal de los bytes UTF-8 del token completo. La base no permite recuperar el secreto. El token existe transitoriamente en memoria y en el resultado; el llamador debe evitar registrarlo, persistirlo en claro o incluirlo en errores.

## Atomicidad y concurrencia

Una transacción bloquea, en orden, usuario, asignación y evento con SHARE, y la inscripción con UPDATE. Los bloqueos mantienen estables permisos y estados hasta terminar. Dos emisiones de la misma inscripción se serializan: una obtiene el token y la otra recibe conflicto. Inscripciones diferentes pueden emitirse concurrentemente. Las restricciones únicas de registration_id y token_hash protegen también frente a escritores externos.

Con la conexión raíz, la promesa de emisión se resuelve después del commit. Si el llamador aporta una transacción existente, la función usa un savepoint: el resultado no debe entregarse hasta confirmar la transacción exterior. El llamador no debe reutilizarlo si esta se revierte. Las pruebas de integración usan este mecanismo para aislar fixtures; las de concurrencia usan conexiones independientes y limpian exclusivamente sus datos sintéticos.

Revocaciones o cambios de estado confirmados antes de adquirir el bloqueo se observan al continuar. Si la emisión toma primero los bloqueos, los cambios esperan; no se promete revocación retroactiva. Los escritores futuros deben respetar un orden de bloqueos compatible. Un error de persistencia revierte la escritura; si se pierde la confirmación del commit, el resultado puede ser incierto y no debe suponerse que no se creó la fila.

## Errores y repetición

| Condición | Error interno |
| --- | --- |
| Falta organizer global o usuario local deshabilitado | AuthorizationError |
| Identidad tenantId/objectId inválida | AuthenticationError |
| UUID de evento o inscripción inválido | ZodError |
| Usuario desconocido, evento inexistente o sin asignación organizer | EventNotFoundError |
| Inscripción inexistente o perteneciente a otro evento | RegistrationNotFoundError |
| Estado no elegible del evento o inscripción | CredentialIssuanceNotAllowedError |
| Credencial existente en cualquier estado | RegistrationCredentialExistsError |
| Fallo del generador, persistencia o colisión de hash | CredentialIssuanceFailedError |

La validación global precede a la entrada en la base; la autorización local precede a consultar inscripción/credencial y el estado elegible precede al conflicto de credencial. Los fallos inesperados se sustituyen por un mensaje fijo sin excepción original ni cause. La operación no escribe logs. Esta tabla no define códigos HTTP.

No hay replay del token ni idempotencia de respuesta: repetir una emisión completada devuelve conflicto. Una credencial revoked/expired también ocupa la inscripción. Perder la respuesta tras el commit exige un futuro flujo explícito de recuperación/rotación; #63 no sobrescribe ni regenera automáticamente. No existe caducidad automática ni endpoint de revocación en este incremento.

## Evidencia

Typecheck, lint y build de API aprobados en copia aislada. 131 pruebas focalizadas distintas: generador (2), entradas de consultas de inscripción (55), emisión (25), concurrencia (7), alta de asistentes (20) y consultas de inscripciones (22). Las 34 nuevas cubren formato/hash, autorización e aislamiento, estados, credencial preexistente, colisión, fallo de aleatoriedad y persistencia, rollback y bloqueos reales en PostgreSQL. No acreditan un flujo HTTP/Entra de emisión ni entrega visual. Validación global del mantenedor del 22 de septiembre de 2026: typecheck, lint y build aprobados; 704 pruebas API y 395 de integración PostgreSQL aprobadas. La primera ejecución web obtuvo 822 aprobadas y 2 fallidas (foco del error al registrar y conservación de edición tras resultado incierto). Ambas pasaron aisladamente. Se corrigió la lectura diferida de checked en EditEventForm capturando su valor durante el evento, se reforzó la prueba de marcar/desmarcar y se esperó el efecto de foco con waitFor en RegisterAttendeeForm.test.tsx. Tras el ajuste, las 824 pruebas web, typecheck, lint y build pasaron en copia aislada. Validación web del mantenedor confirmada tras la corrección: 824 pruebas, typecheck, lint y build aprobados. En conjunto quedan verificadas 1.923 pruebas distintas (704 API, 824 web y 395 PostgreSQL), incluidas las 34 nuevas de #63. La API y PostgreSQL no se repitieron después del ajuste exclusivamente web. git diff --check sin errores de espacios; solo avisos CRLF a LF. Las 131 pruebas focalizadas están incluidas en las suites respectivas y no deben sumarse otra vez.

## Evolución HTTP - OE-04-001B / #65

El alcance interno descrito arriba corresponde a #63, integrado mediante PR #64 (merge 30aad88, CI 35793409546 aprobado). #65 expone su emisión en POST /api/v1/events/:eventId/registrations/:registrationId/qr. Se espera la operación sobre la conexión raíz y se entrega JSON con el token, no una imagen QR. La petición no admite cuerpo, Content-Type ni query. Los errores y el éxito usan no-store. Se conserva la exclusión de recuperación, reemisión, revocación, caducidad y check-in. Contrato detallado en api-contract.md, sección Emisión HTTP de credenciales.

Evidencia de #65: 44 pruebas HTTP nuevas y 15 de integración PostgreSQL, incluidas dos carreras mediante conexiones independientes (mismo organizador y organizadores distintos). Con regresiones, 148 pruebas focalizadas distintas aprobadas; typecheck, lint y build correctos en copia aislada. El verificador de Entra se sustituye en pruebas. Validación global del mantenedor confirmada el 22 de septiembre de 2026: 1.982 pruebas distintas aprobadas (748 API, 824 web y 410 PostgreSQL), typecheck, lint y build correctos. Las 148 focalizadas están incluidas en el total y no se suman nuevamente. git diff --check sin errores de espacios; solo avisos CRLF a LF.

## Recorrido web - OE-04-001C / #67

#65 quedó integrado mediante PR #66, merge 2f73568 y CI 35796812981 aprobado. #67 permite emitir desde el detalle del organizador, no desde el recorrido operador. La acción aparece para inscripción confirmed y evento draft/active, sin inferir que aún no existe una credencial: no hay endpoint de consulta de existencia. La API revalida permisos y estado.

La vista explica antes de emitir que la respuesta contiene un secreto no recuperable. Emitir credencial es una acción explícita; abrir el detalle no envía. Mientras espera hay bloqueo de doble envío. Éxito retira la acción y muestra el código readOnly, identificador y fecha UTC; Copiar código usa el portapapeles exclusivamente por petición del usuario. Si falla, selecciona el texto para copia manual. No se vuelve a emitir para copiar.

Conflictos, configuración/entrada inválida y resultado incierto bloquean la repetición directa en esa vista. Solo la cancelación conocida antes del envío permite volver a intentar allí. Reabrir un detalle no recupera el secreto ni garantiza una nueva emisión: el servidor rechazará una credencial existente. No se ofrece una estrategia de recuperación o reemisión.

Salir al listado/evento o cerrar sesión con código visible o emisión pendiente requiere confirmar la posible pérdida. beforeunload pide la advertencia nativa cuando hay estado sensible, sin prometer que todos los navegadores la muestren. El usuario puede salir y perder el resultado; abortar no asegura rollback. Cambio de cuenta/acceso/evento/inscripción y desmontaje eliminan el estado visible, abortan la espera y descartan resultados tardíos. Un 404 de inscripción retira ese detalle del listado; uno de evento elimina su acceso; 401/403 invalidan la sesión verificada.

No se escriben código ni respuesta en storage, IndexedDB, URL, historial, logs ni telemetría propios. El token existe en memoria, DOM y, si el usuario lo solicita, portapapeles. No se promete borrado criptográfico, eliminación del portapapeles, ni control sobre extensiones, capturas o infraestructura externa. La copia ya solicitada puede completarse después de abandonar la vista; su confirmación tardía no se muestra.

Evidencia del agente: 897 pruebas web aprobadas (73 nuevas: 43 cliente, 23 vista, 7 sesión), typecheck, lint y build correctos. Cubren validación, roles, doble envío, copia, conflictos, resultados inciertos, navegación, sesión y respuestas tardías. No sustituyen una prueba manual de emisión con Entra y API reales. Validación web del mantenedor confirmada: 897 pruebas aprobadas, typecheck, lint y build correctos; git diff --check sin errores de espacios, solo avisos CRLF a LF. Captura manual aportada con inscripción de prueba: credencial emitida, código y metadatos visibles y confirmación de copia al portapapeles. Capturas adicionales muestran la advertencia de salida con el código visible y, posteriormente, el conflicto por credencial existente con el botón deshabilitado y sin el código anterior. El mantenedor confirmó además por texto y capturas, usando otra inscripción de prueba, que Cancelar mantiene el detalle y el código visibles. El cierre de sesión con código visible no se ha acreditado manualmente; cuenta con cobertura automatizada. Validación global del mantenedor confirmada el 22 de septiembre de 2026: 2.055 pruebas distintas aprobadas (748 API, 897 web y 410 PostgreSQL), typecheck, lint y build correctos. Las 897 pruebas web, incluidas las 73 nuevas, están incluidas en el total y no se suman nuevamente. git diff --check sin errores de espacios; solo avisos CRLF a LF. Pendientes commit, PR, CI y merge. Sin cambios de API, esquema o dependencias; QR gráfico, descarga, correo, recuperación, revocación y check-in siguen fuera de alcance.
