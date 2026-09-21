# Consulta de eventos asignados al operador

OE-03-003D / Issue #59. Dependencia del recorrido web de búsqueda para operadores.

## Rutas y respuestas

- GET `/api/v1/operator/events`: query estricta con `limit` y `cursor` opcionales. Respuesta 200 `{ items, nextCursor }`.
- GET `/api/v1/operator/events/:eventId`: UUID normalizado, sin parámetros query. Respuesta 200 con un evento.
- No hay alias HEAD. Los GET rechazan cuerpos mediante Content-Length no cero o Transfer-Encoding; los parsers del framework pueden rechazar antes formatos no admitidos. No se modifican parsers globales.
- Bearer se verifica en onRequest antes de validar parámetros. Respuestas del recorrido protegido, incluidos errores de autenticación, usan Cache-Control: no-store.
- Proyección exacta: id, name, startsAt, endsAt, timezone, location y status. Fechas ISO UTC. No incluye slug, version, createdAt, asignaciones ni datos de asistentes. La serialización HTTP vuelve a proyectar explícitamente.
- 400 INVALID_EVENT_QUERY: entrada inválida. 401 UNAUTHORIZED con WWW-Authenticate: Bearer. 403 FORBIDDEN: rol incompatible o cuenta local inactiva. 404 EVENT_NOT_FOUND: detalle inexistente o inaccesible, con el mismo cuerpo. 500 INTERNAL_SERVER_ERROR: mensaje fijo, sin SQL ni excepción original.
- El fallo inesperado registra únicamente OPERATOR_EVENT_QUERY_FAILED y un mensaje fijo. Se conserva la configuración existente que desactiva logs automáticos de solicitudes. CORS mantiene el origen local existente.

## Identidad y permisos

Se usa `entra:<tenantId>:<objectId>` normalizado, procedente del verificador. El subject libre, correo y parámetros del cliente no definen la identidad. Se requiere checkin_operator en el token y en event_staff para el mismo usuario y evento. Admin no hereda permisos. Con organizer y checkin_operator globales, una asignación organizer por sí sola no entra en este listado.

Usuario desconocido o sin asignaciones: lista vacía; detalle ajeno, inexistente o desconocido: 404. Usuario local disabled: 403 en ambas consultas. Ninguna lectura crea usuarios o asignaciones. Las rutas existentes de organizadores, alta, edición e inscripciones conservan sus guards y permisos. Leer eventos no habilita edición ni check-in.

## Paginación y consistencia

Reutiliza event-query-input: limit decimal canónico 1..100, por defecto 20. Cursor base64url canónico de hasta 100 caracteres, con `v1:<último UUID>`. Campos desconocidos, arrays por parámetros repetidos y cursores mal formados se rechazan. Orden event.id ASC y lectura limit + 1; nextCursor null al terminar. No hay conteo total ni orden por fecha. Se muestran todos los estados persistidos del evento.

El cursor no está ligado a una identidad ni firmado: es una posición reutilizable, nunca una autorización. Una posición de otro recorrido no evita el filtro de asignaciones. No necesita que el evento del cursor siga existiendo. No existe snapshot entre páginas; cambios concurrentes pueden alterar resultados.

Cada llamada abre una transacción y bloquea el usuario con FOR SHARE para comprobar su estado. La lectura une evento y asignación en la misma sentencia. No bloquea asignaciones ni eventos durante todo el recorrido: usa la visibilidad de la sentencia. Una revocación confirmada antes de una lectura posterior se aplica; no se promete revocación retroactiva de respuestas ya leídas. No se implementa administración de personal en esta entrega.

## Pruebas y límites

46 casos HTTP nuevos y 25 PostgreSQL nuevos; 114 regresiones, total focalizado 185. Pruebas: roles globales/locales, doble rol, identidad normalizada, aislamiento entre tenants y eventos, usuario desconocido/inactivo, proyección, paginación, revocación entre páginas, no-store, errores y ausencia de ampliación de rutas previas. Typecheck, lint y build correctos en copia aislada.

Validación global confirmada por la salida del mantenedor del 21 de septiembre de 2026: 1.812 pruebas aprobadas (702 API, 747 web y 363 de integración PostgreSQL), typecheck, lint y build correctos. Las 185 focalizadas están incluidas en ese total y no se suman nuevamente. git diff --check sin errores. Pendientes commit, PR, CI y merge.

Fixtures sintéticos con rollback. Se sustituye el verificador de tokens; no se ha hecho una práctica con un operador Entra real ni una prueba de carga. No incluye interfaz web, alta de asignaciones, QR o check-in. No hace falta ejecutar migraciones.

## Ejemplo de contrato

`GET /api/v1/operator/events?limit=20`, con Authorization: Bearer del operador.

Una página vacía es `{ "items": [], "nextCursor": null }`. Cada item permite seleccionar el id para una llamada posterior al endpoint de búsqueda de inscripciones ya existente. La web de operadores se implementará en otro incremento.
