# Ciclo de vida del evento

## Operaciones internas - OE-02-003A / #77

`activateEventForOrganizer(db, eventId, { expectedVersion }, actor)` y `closeEventForOrganizer(db, eventId, { expectedVersion }, actor)` retornan la proyección existente QueriedEvent. No están expuestas por HTTP ni por la web. El PATCH de edición conserva su contrato y no acepta status.

| Operación | Estado requerido | Destino |
|---|---|---|
| activateEventForOrganizer | draft | active |
| closeEventForOrganizer | active | closed |

Se rechazan otros estados, incluidos cancelled y repetir el destino. No se reabre un evento cerrado ni se condiciona la transición a la fecha actual. La entrada es objeto estricto con expectedVersion entero de 1 a 2147483646, sin coerción ni campos extra; el UUID se valida y normaliza.

## Autorización y transacción

El actor debe proceder de autenticación previa y tener organizer global e identidad tenantId/objectId UUID válida. Se busca externalSubject normalizado, nunca correo; no se provisionan usuarios o asignaciones. Usuario local active y event_staff organizer son obligatorios. Admin y checkin_operator solos no conceden acceso.

Una transacción READ COMMITTED bloquea usuario SHARE, asignación SHARE y evento UPDATE, en ese orden. Revalida permisos tras esperas. Usuario inexistente o evento/asignación inaccesibles generan EventNotFoundError; usuario deshabilitado produce AuthorizationError. Bajo el bloqueo del evento se comprueba primero el estado y luego expectedVersion. Una transición incompatible genera EventTransitionNotAllowedError (EVENT_TRANSITION_NOT_ALLOWED); una versión obsoleta genera EventLifecycleVersionConflictError (EVENT_VERSION_CONFLICT).

Se incrementa version exactamente una vez y se conservan nombre, slug, fechas, timezone, ubicación y createdAt. La auditoría usa event.activated o event.closed, entityType event, entityId/eventId y actorId; metadata contiene únicamente fromStatus, toStatus, fromVersion, toVersion. occurredAt usa clock_timestamp() tras las esperas. No contiene credenciales ni datos personales.

Estado, versión y auditoría se confirman juntos. Si falla la auditoría, se revierte todo. Los fallos técnicos generan EventLifecycleFailedError (EVENT_LIFECYCLE_FAILED), sin cause, SQL ni parámetros. No se convierten en conflictos de negocio ni se reintentan. La conexión raíz retorna después del COMMIT; bajo un savepoint el resultado depende todavía del COMMIT exterior. Se rechaza aislamiento exterior incompatible. Perder la respuesta puede dejar confirmación incierta; consultar el evento es necesario antes de decidir otra acción.

## Concurrencia y conservación

Dos solicitudes concurrentes con la misma versión solo consiguen una transición y una auditoría. La segunda observa el nuevo estado y se rechaza. Una edición draft que confirma primero cambia version y obliga a consultar de nuevo antes de activar. Si la activación confirma primero, la edición pendiente observa active y se rechaza.

Check-in usa bloqueo SHARE del evento. Si lo obtiene primero, el cierre espera y ese ingreso puede confirmarse antes de closed. Si el cierre obtiene primero UPDATE y confirma closed, el check-in pendiente se rechaza sin ingreso ni auditoría de ingreso. Las pruebas verifican las esperas mediante pg_blocking_pids y barreras, no solo retrasos temporales.

Cerrar conserva inscripciones, credenciales e ingresos previos: no los elimina ni revoca. El check-in exige active incluso para comprobar un duplicado. Las operaciones existentes que exigen draft/active dejan de admitir closed. La consulta autorizada sigue permitiendo revisar el historial. No cambia el esquema ni añade dependencias.

## Evidencia

Validación del agente en copia aislada: 845 pruebas unitarias API y 120 PostgreSQL focalizadas aprobadas (965 casos distintos). Incluyen 77 nuevas (18 de entrada y 59 de integración) y 61 regresiones (18 edición y 43 check-in). Typecheck, lint y build API correctos. No se repiten pruebas web sin cambios. Validación global confirmada por la salida del mantenedor del 24 de septiembre de 2026: 2.311 pruebas aprobadas (845 API, 936 web y 530 PostgreSQL), typecheck, lint y build correctos. Las pruebas anteriores están incluidas y no se suman nuevamente. git diff --check sin errores de espacios; solo avisos de normalización CRLF a LF. Pendientes commit, PR, CI y merge.

Las pruebas usan fixtures sintéticos y conexiones PostgreSQL independientes. No acreditan un recorrido HTTP o web de activación/cierre.
