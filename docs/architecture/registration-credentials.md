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
