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
