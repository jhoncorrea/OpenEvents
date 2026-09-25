# Asistencia de una inscripción

Issue #87, ADR-087. La inscripción mantiene status confirmed/cancelled. La asistencia deriva exclusivamente del registro persistido check_in vinculado a registration_id.

## Contrato de lectura

GET /api/v1/events/:eventId/registrations, su detalle /:registrationId y /search devuelven en cada inscripción checkedInAt: null si no existe ingreso, o una fecha UTC ISO con milisegundos. No se devuelve performedBy, identificador del ingreso ni contenido de credenciales. La escritura de inscripción conserva su respuesta actual.

La selección y el LEFT JOIN ocurren dentro de la lectura autorizada existente: usuario activo, asignación compatible y evento. El índice único check_in_registration_unique mantiene una fila por inscripción; paginación y límites conservan su significado. La unión se hace por inscripción, no por asistente o correo. Las lecturas no modifican el historial. No se filtran ingresos cuando la inscripción esté cancelada o el evento cerrado.

## Presentación y actualización

Pendiente de ingreso usa una etiqueta ámbar; Ya ingresó usa una etiqueta verde y muestra fecha con zona horaria del evento. El texto hace el significado independiente del color. El componente compartido se usa en listado/detalle/búsqueda del organizador y búsqueda del operador.

Actualizar inscripciones, abrir de nuevo el detalle o Repetir búsqueda consultan PostgreSQL. En el detalle del organizador, volver al listado conserva el dato recién consultado. Un check-in no cambia las tarjetas de forma optimista: el operador repite la búsqueda para consultar asistencia actual. No se introducen solicitudes de fondo ni se modifica la gestión de credenciales sensibles.

Un error no se transforma en checkedInAt null; el cliente exige el campo y valida la fecha UTC canónica. Al reiniciar una consulta se retiran sus resultados anteriores; no hay fallback a pendiente. Las vistas conservan los controles de salida, cancelación y descarte de respuestas de otro contexto.

## Despliegue y prueba

Actualizar API y web juntas; reiniciar la API tras compilar. Una web nueva ante una API antigua muestra respuesta inválida hasta actualizarla. No hay migraciones ni instalación de nuevas dependencias. Verificar ambos roles, una inscripción con ingreso y otra sin ingreso, actualización después de check-in y duplicado conservando fecha. La validación automatizada también cubre cancelación histórica y permisos. No se conectan contadores demo.
