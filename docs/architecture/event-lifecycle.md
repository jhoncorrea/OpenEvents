# Ciclo de vida del evento

## Operaciones internas - OE-02-003A / #77

`activateEventForOrganizer(db, eventId, { expectedVersion }, actor)` y `closeEventForOrganizer(db, eventId, { expectedVersion }, actor)` retornan la proyección existente QueriedEvent. Desde #79 están expuestas por HTTP; #81 incorpora su consumo web, pendiente de validación manual. El PATCH de edición conserva su contrato y no acepta status.

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

## Exposición HTTP - OE-02-003B / #79

#77 quedó integrado mediante PR #78, merge d7d1be6, CI 36030450886 aprobado y limpieza local confirmada. #79 registra POST /api/v1/events/:eventId/activate y /close con organizer antes del parser, JSON estricto expectedVersion, UUID y sin query. Devuelve 200 con el evento y fechas UTC. Mantiene errores explícitos, no-store y logs sanitizados. El [contrato API](api-contract.md) define límites y estados HTTP.

El servidor utiliza conexión raíz, sin transacción exterior ni reintentos. Las 25 pruebas HTTP/PostgreSQL nuevas verifican permisos, estados, versión, repetición, auditoría y commit visible desde otra conexión antes del éxito. Se simula el verificador de identidad. 114 pruebas HTTP nuevas y 59 regresiones internas también aprobadas; typecheck, lint y build API correctos. Los botones web siguen pendientes.

## Recorrido web - OE-02-003C / #81

#79 se integró mediante PR #80, merge a4bce65, CI 36033784013 aprobado y limpieza local confirmada. El detalle de Mis eventos añade Activar evento para draft y Cerrar evento para active. Una confirmación nativa identifica el evento, explica el efecto y permite cancelar sin envío. Cerrar no permite reapertura; conserva historial. Al confirmar se usa expectedVersion del detalle consultado.

El cliente usa MSAL con cuenta/scope actuales, URL validada, JSON, no-store, credentials omit y redirect error. Valida proyección ApiEvent, ID, destino y versión anterior + 1. Espera máxima 15 segundos. Errores fijos, sin cuerpo original ni secretos; no hay reintentos ni almacenamiento de tokens/respuestas en storage.

Durante el envío se bloquean acciones del detalle salvo volver al listado. La vuelta aborta la espera, no garantiza rollback; abrir de nuevo requiere consultar el detalle. Éxito actualiza fila/detalle y enfoca el encabezado. 409 o resultado incierto deshabilitan acciones dependientes del estado y ofrecen Consultar estado actual. Una consulta fallida mantiene la necesidad de actualizar; una exitosa usa el estado observado sin atribuirlo al envío previo. 404 retira el evento inaccesible; fallos de acceso usan la comprobación de sesión existente.

AbortSignal, secuencia de solicitudes y verificación de cuenta impiden mostrar respuestas tardías al salir, desmontar, cambiar cuenta o cerrar sesión. El cliente comprueba también la cuenta después de obtener el token. Reabrir o recuperar acceso obliga a consultar de nuevo antes de actuar. Los formularios de edición, CSV e inscripciones y la protección de credenciales conservan su recorrido separado.

Pruebas: 62 cliente, 17 detalle y 4 sesión nuevas; suite web total 1.019 aprobada. Incluyen confirmación/cancelación, estados, doble envío, errores, actualización, refresh fallido, aislamiento, permisos y timeout. La UI se prueba con jsdom y confirm simulado; pendiente evidencia manual del navegador con evento sintético. No se implementa check-in web ni cámara.

## Evidencia del mantenedor - 24 septiembre 2026

Validación global confirmada por la salida del mantenedor del 24 de septiembre de 2026: 2.533 pruebas aprobadas (959 API, 1.019 web y 555 PostgreSQL), typecheck, lint y build correctos. Las pruebas anteriores están incluidas y no se suman nuevamente. git diff --check sin errores; avisos CRLF/LF de normalización. Capturas del evento sintético «Evento 24 de setiembre» muestran creación en borrador, confirmación de activación, estado activo sin edición, confirmación de cierre, estado cerrado sin activar/cerrar/registrar y fila del listado cerrada. Evidencia manual complementaria del evento sintético «Evento 24 setiembre test2»: la secuencia de capturas anotadas muestra Cancelar activación seguido de Borrador con Activar/Editar disponibles; Aceptar activación seguido de Activo; Cancelar cierre seguido de Activo con Cerrar disponible; Aceptar cierre seguido de Cerrado; listado Cerrado y detalle nuevamente abierto que conserva Cerrado sin acciones de activar/cerrar/editar/registrar. Queda acreditado el recorrido manual solicitado. Conflictos, resultados inciertos y aislamiento conservan cobertura automatizada, sin atribuirles verificación manual. Pendientes commit, PR, CI y merge.
