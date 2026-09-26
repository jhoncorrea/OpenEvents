# Check-in persistente: operación interna

## Alcance

OE-04-002A, issue #73. registerCheckInForOperator(db, eventId, token, source, actor) acepta una identidad ya autenticada; no verifica JWT por sí misma. No se registra una ruta nueva ni se conecta el demo POST /api/check-ins, que continúa usando memoria y códigos de prueba.

## Entradas y autorización

eventId es UUID normalizado. source solo acepta manual o qr, sin normalización, y describe el origen declarado; no demuestra uso de cámara. El actor exige tenantId/objectId UUID y rol global checkin_operator. external_subject se deriva de esos UUID en minúsculas; subject libre, correo y datos del cliente no identifican al operador. No se crean usuarios ni asignaciones. Organizer o admin solos no heredan permisos; roles múltiples requieren igualmente la asignación local checkin_operator.

Usuario inexistente, evento inexistente y asignación ausente/incompatible producen EventNotFoundError. Usuario disabled o rol global incompatible producen AuthorizationError; identidad mal formada, AuthenticationError. UUID/origen inválidos generan ZodError antes de acceder a la base. El adaptador HTTP futuro deberá autenticar y traducir estas clases sin exponer detalles internos.

Solo el estado active permite ingresar; draft, closed y cancelled producen CheckInNotAllowedError. No se deriva apertura automáticamente de starts_at/ends_at. Activación/cierre de eventos quedan pendientes y las pruebas usan fixtures. Las inscripciones deben permanecer confirmed y la credencial active con revoked_at NULL.

## Código y resultados

El token tiene prefijo oe1_ y 43 caracteres base64url canónicos que representan exactamente 32 bytes. No se recortan espacios ni se cambia el uso de mayúsculas. Se calcula SHA-256 del token completo; no se usa la normalización del demo. No se guarda ni se devuelve el token o su hash.

| Resultado | Contrato |
|---|---|
| invalid | Únicamente status. Código mal formado, inexistente, ajeno al evento, inscripción cancelada o credencial inactiva/revocada; no escribe check_in ni auditoría. |
| accepted | status y checkIn con id, registrationId, performedBy, checkedInAt (Date) y source. |
| duplicate | Misma proyección del registro original; conserva operador, fecha y origen. No produce otra auditoría de ingreso. |

Permisos y estados actuales se comprueban antes de retornar duplicate: un historial de ingreso no evita una revocación posterior. No se incluyen datos del asistente. El registro original no se modifica ni borra mediante esta operación; otros escritores futuros deben conservar esta inmutabilidad.

## Transacción y concurrencia

La transacción raíz usa READ COMMITTED. Se comprueba SHOW transaction_isolation y se rechazan transacciones externas repeatable read/serializable con CheckInFailedError. Una transacción externa READ COMMITTED puede invocar la operación mediante savepoint, pero su resultado aún depende del COMMIT externo. Con una conexión raíz, la promesa solo confirma accepted al completarse la transacción propia.

Orden de bloqueos: usuario SHARE, asignación SHARE, evento SHARE, inscripción UPDATE y credencial SHARE. Primero se localiza la inscripción mediante una lectura del hash unida al evento; esa lectura no autoriza: después del bloqueo de inscripción se vuelve a consultar la credencial con hash y registration_id y se validan sus estados bajo SHARE. Se evita invertir el orden de la emisión existente.

Los bloqueos protegen los estados leídos hasta commit. Un cambio confirmado antes de adquirirlos se observa; si el ingreso los toma primero, la modificación espera. Los escritores futuros de múltiples entidades deberán usar el mismo orden para evitar interbloqueos. Una revocación posterior no borra ingresos previos. Los errores de serialización, conexión, timeout o deadlock no se convierten en invalid/duplicate ni se reintentan automáticamente.

El bloqueo UPDATE de la inscripción serializa intentos sobre ella. UNIQUE(registration_id) conserva la defensa de base de datos; ON CONFLICT se limita a esa columna y recupera el ingreso ganador. Los conflictos inesperados de otras restricciones son fallos. No hay bloqueo global de todas las inscripciones.

checked_in_at se obtiene con clock_timestamp() durante la inserción, después de las esperas. Es el instante de registro, no una medición exacta del COMMIT. Se persiste como timestamptz; el adaptador HTTP futuro serializará a UTC. occurred_at de auditoría utiliza la fecha devuelta al proceso (precisión de milisegundos de Date).

## Auditoría, fallos y privacidad

Se inserta audit_log con action=check_in.accepted, entity_type=check_in, entity_id del ingreso, event_id, actor_id y metadata vacío. Comparte transacción con el ingreso: un fallo de auditoría revierte ambos. No se auditan rechazos o duplicados como ingresos aceptados.

Los errores técnicos producen CheckInFailedError con mensaje fijo, sin SQL, parámetros ni cause. No se registran secretos. Un fallo de red al confirmar puede dejar resultado incierto; el error no garantiza ausencia de ingreso. Repetir explícitamente un código todavía válido permite obtener duplicate si ya existe, pero este incremento no incorpora reintentos ni UI.

## Evidencia y límites

21 pruebas nuevas de entrada y 43 de integración cubren permisos, estados, aislamiento, auditoría, rollback, intentos simultáneos con conexiones independientes y una barrera real de ingreso sin confirmar. Se comprueba mediante pg_blocking_pids la espera ante cambios de usuario, asignación, evento, inscripción y credencial. Totales de API: 769 unitarias y 453 PostgreSQL; no son pruebas de navegador, JWT real ni carga de 20 operadores/p95. No cambia esquema ni dependencias.

## Transporte HTTP - OE-04-002B / #75

#73 quedó integrado mediante PR #74, merge 6360e7a, con CI 35909350092 aprobado y limpieza local confirmada. #75 registra POST /api/v1/events/:eventId/check-ins en buildApp y conecta el servidor a la operación interna con conexión raíz. No altera las garantías ni conecta el demo.

Recibe JSON estricto con code string de hasta 256 caracteres y source manual/qr; UUID validado, query prohibida y cuerpo hasta 1 KiB. Content-Type application/json, charset UTF-8 opcional. El secreto permanece exacto. El guard exige checkin_operator antes de parsing. accepted=201, duplicate=409 y invalid=404. Los dos primeros devuelven solo id, registrationId, checkedInAt UTC y source dentro de checkIn; no exponen performedBy ni datos personales. invalid contiene solo status. El [contrato API](api-contract.md) sustituye los ejemplos provisionales con camera, attendee y previousCheckInAt.

Autorización, evento no activo y fallos técnicos usan errores separados. Todas las respuestas de la ruta son no-store; logs de códigos fijos, sin token, cuerpo, URL/query ni errores originales. No se implementan reintentos: una respuesta perdida puede ocultar un commit confirmado y un nuevo intento depende de permisos/estados vigentes.

58 pruebas HTTP nuevas verifican parsing, permisos globales, respuestas, UTC, proyección, no-store y logs. 18 nuevas de integración usan operación y PostgreSQL reales dentro de fixtures revertidos; comprueban filas y auditoría, pero no un COMMIT exterior HTTP real ni JWT de Entra. Las 43 pruebas internas, incluidas concurrencia con conexiones independientes y commit, se ejecutaron como regresión. Totales verificados: 827 unitarias API y 61 PostgreSQL focalizadas. Sin UI, cámara, activación/cierre, migraciones ni dependencias.

## Coordinación con el cierre (#77)

closeEventForOrganizer obtiene UPDATE sobre el evento, incompatible con SHARE de check-in. Un ingreso que bloquea primero puede confirmar antes del cierre; cuando el cierre confirma primero, el ingreso pendiente observa closed y se rechaza sin escritura. Se conservan ingresos/credenciales/inscripciones existentes. La activación y el cierre internos no añaden todavía rutas ni botones: [contrato](event-lifecycle.md).

## Recorrido manual web - OE-04-002C / #83

El operador selecciona un evento mediante el recorrido de #61. Solo el detalle active ofrece un campo de credencial y Registrar ingreso. El código se captura exactamente antes de esperar MSAL, sin trim ni conversión de mayúsculas; POST autenticado con {code, source: manual}. Campo vacío o mayor de 256 caracteres se rechaza localmente. El servidor revalida asignación y estados, por lo que la vista no concede acceso.

El cliente exige parejas HTTP/cuerpo: 201 accepted, 409 duplicate, 404 invalid. Proyecta exclusivamente id, registrationId, checkedInAt ISO UTC y source; valida UUID/fecha/origen. Accepted debe tener source manual; duplicate puede conservar manual o qr del ingreso original. No se muestran datos personales del asistente ni operador. EVENT_NOT_FOUND y CHECK_IN_NOT_ALLOWED mantienen mensajes distintos. Ante estado incompatible se retira el formulario y se pide Consultar estado actual, que vuelve a cargar el detalle.

Una solicitud pendiente bloquea otro envío. Red, timeout de 15 segundos, 5xx o cuerpo inesperado se consideran resultado incierto. No hay reintentos automáticos: un envío nuevo requiere pulsar el botón y puede obtener duplicate si ya ingresó, sujeto a permisos y validez actuales. La consulta del evento no resuelve por sí sola la existencia de un ingreso. Volver cancela la espera, no revierte un commit.

El código permanece en memoria de la vista, en campo oculto y sin almacenamiento, URL ni logs propios. Se limpia tras accepted/duplicate/invalid, limpieza explícita, salida o invalidación de acceso. El cuerpo HTTP sí contiene el código para que el servidor lo valide; no se promete eliminarlo de herramientas de desarrollo o infraestructura. Cambiar cuenta, sesión, evento o desmontar aborta y descarta respuestas tardías. La búsqueda por nombre/correo sigue independiente y no registra ingresos.

Pruebas automatizadas nuevas: 42 cliente, 20 vista y 4 sesión; suite web completa 1.085 aprobada. Evidencia manual del mantenedor del 24 de septiembre de 2026, en el evento de prueba «Prueba de edición API 031 - actualizada»: acceso con cuenta operadora en Firefox, evento asignado activo y formulario disponible; emisión de credencial desde la cuenta organizadora; ingreso aceptado con fecha visible 24 de septiembre, 17:02 America/Lima y campo vacío; repetición con aviso de ingreso existente sin crear otro y campo vacío; código inválido rechazado; tras cerrar el evento, listado y detalle muestran Cerrado sin formulario de ingreso y conservan la búsqueda. La captura recortada del duplicado no permite verificar visualmente su fecha original; esa conservación mantiene cobertura automatizada. No se atribuye prueba manual de timeout, revocación, concurrencia o cambio de cuenta. Sin cámara, migraciones, dependencias ni cambios de servidor. #81 integrado en PR #82, merge dd6ddc9.

## Captura con cámara (#85)

El recorrido manual de #83 se integró mediante PR #84, merge 1abee74, con CI verde y limpieza local confirmada. Iniciar cámara solicita vídeo; una lectura detiene la captura y deja el código listo para Registrar ingreso. No existe envío automático. El cliente acepta source manual/qr y exige que accepted coincida con el origen enviado; duplicate conserva el original. Editar el código leído cambia a manual. No cambia el contrato HTTP. Véase [cámara QR](qr-camera.md).

## Consulta del ingreso en inscripciones (#87)

El ingreso persistido se muestra como Ya ingresó y su fecha original, separado del estado de inscripción. Un duplicado no modifica esa fecha. La búsqueda del operador se actualiza con Repetir búsqueda; el organizador actualiza su listado o vuelve a consultar el detalle. No se registra un ingreso desde esas consultas ni se cambian las reglas de acceso. Véase [asistencia](registration-attendance.md).

### Resumen de asistencia (Issue #89)

GET /api/v1/events/:eventId/attendance-summary permite a organizer o checkin_operator con usuario activo y asignación compatible consultar contadores persistidos, sin datos personales ni secretos. pending excluye canceladas; checkedIn conserva ingresos históricos y cancelledCheckedIn los desglosa. Una sentencia produce todos los contadores y observedAt UTC; no-store también en errores. Sin cambios en admisión ni web. Contrato y límites: [attendance-summary.md](attendance-summary.md); ADR-088.


### Métricas web por evento (Issue #91)

El detalle autorizado consulta métricas con cuenta y scope vigentes. Cancelación y descarte de respuestas al salir/cambiar contexto; pérdida de acceso retira cifras. Después de ingresar se usa Actualizar métricas, sin incremento optimista ni polling. Contrato y límites: [attendance-summary-web.md](attendance-summary-web.md).
