# Búsqueda de inscripciones

OE-03-003A / Issue #53 / RF-ATT-003 (parcial).

## Contrato

`searchRegistrationsForStaff(db, eventId, input, actor)` devuelve `{ items, nextCursor }`. Es la operación interna incorporada en A; el transporte HTTP y la pantalla de organizadores se describen más abajo. Reutiliza la proyección de lectura (id, eventId, status, source, createdAt y attendee con id, fullName, email); no expone credenciales QR, datos de usuario ni metadata de importación.

`input` es un objeto estricto con `q` obligatorio, `limit` y `cursor` opcionales. `q` admite hasta 200 unidades UTF-16 antes de recortar espacios exteriores y entre 1 y 100 después; rechaza controles ASCII, incluidos tabulaciones y saltos de línea. Conserva espacios interiores, acentos y representación Unicode. No ofrece búsqueda difusa ni normalización de acentos. `limit` es una cadena decimal canónica de 1 a 100; por defecto 20, igual que las consultas existentes. No se convierte automáticamente desde números o arrays.

Se buscan subcadenas por nombre del asistente O correo normalizado de la inscripción. ILIKE aplica las reglas de mayúsculas/minúsculas de la configuración regional de PostgreSQL; no se instala unaccent ni se promete equivalencia de representaciones Unicode. Por ejemplo, `Search` coincide con `SEARCH`; `Jose` no sustituye a `José` bajo la configuración local probada. `%`, `_` y `!` se escapan con `!` explícito; la barra inversa es literal. El término se pasa como parámetro SQL.

## Autorización

El actor proviene del verificador existente: tenantId y objectId UUID normalizados determinan la identidad local. subject libre no se usa. Se requiere usuario activo, evento existente y una pareja exacta entre rol global y asignación:

| Rol global | event_staff.role compatible |
|---|---|
| organizer | organizer |
| checkin_operator | checkin_operator |

Si posee ambos roles, cualquiera de esas asignaciones compatibles permite consultar. admin solo no permite acceso. No se provisiona un usuario desconocido ni se administra personal. Identidad mal formada produce AuthenticationError; rol no admitido o usuario deshabilitado, AuthorizationError; usuario desconocido, asignación incompatible/ausente o evento inaccesible, EventNotFoundError. Las respuestas del adaptador HTTP se describen más abajo.

La transacción toma bloqueos SHARE en orden usuario, asignación, evento, como las lecturas existentes. Mantiene la autorización durante esa lectura y la comprueba de nuevo para cada página. Esto no reserva páginas futuras. No modifica el contrato ni los permisos de listado/detalle existentes.

## Paginación

Orden `registration.id ASC` y condición `id > afterId`, con lectura de limit + 1. No es orden de fecha ni relevancia. No requiere que la fila del cursor siga existiendo. Devuelve null cuando no hay otra página observada.

Cursor base64url canónico y versionado con evento, SHA-256 del término recortado y último UUID. Rechaza otra versión, otro evento o término diferente. El cambio de mayúsculas en q exige reiniciar la paginación, aunque pueda devolver coincidencias equivalentes. Cambiar limit no invalida la posición. El cursor no contiene el término en claro, pero la huella no es cifrado ni protección frente a adivinación; no debe registrarse como dato inocuo. No está firmado y no concede permisos: una posición construida por un cliente sigue requiriendo autorización y no evade el filtro.

No hay snapshot entre páginas. Inserciones, eliminaciones o cambios de nombre pueden cambiar los resultados durante el recorrido. La búsqueda incluye inscripciones canceladas con su estado y permite eventos draft, active, closed y cancelled; no habilita altas ni check-in.

## Validación y límites

27 pruebas nuevas de entrada/cursor y 32 PostgreSQL. Las 77 regresiones existentes verifican que no se amplía el acceso de organizadores. Total focalizado: 136. Validación global confirmada por la salida del mantenedor del 21 de septiembre de 2026: 1.654 pruebas aprobadas (629 API, 698 web y 327 de integración PostgreSQL), typecheck, lint y build correctos. Las 136 focalizadas están incluidas en el total y no se suman nuevamente. git diff --check sin errores de espacios; solo avisos CRLF a LF. Integrado mediante PR #54: implementación 3d57461, merge 8e03111; CI 35628691770 completed / success verificado. Main local sincronizado y limpio, rama local y remota eliminada según el mantenedor. Datos de prueba transaccionales con rollback. Typecheck, lint y build aprobados en copia aislada.

Incluye coincidencias, literales especiales, entradas inválidas, aislamiento de eventos/tenant, matriz de roles, revocación entre páginas, canceladas y ausencia de escrituras. No añade pruebas de rendimiento ni garantiza latencia a escala del piloto. ILIKE con comodín inicial puede escanear filas: medir con carga representativa antes de añadir índices o extensiones. No hay conteo total ni búsqueda por código.


### Búsqueda HTTP - OE-03-003B (Issue #55)

`GET /api/v1/events/:eventId/registrations/search` expone la operación interna con Bearer, rol global organizer o checkin_operator y autorización vigente por evento. Admite q, limit y cursor; devuelve items y nextCursor, fechas UTC y Cache-Control: no-store. Parámetros inválidos, repetidos o desconocidos se rechazan. No acepta cuerpo. No amplía listado/detalle existentes ni incorpora web, QR o check-in.

Privacidad: se desactivan los logs automáticos de solicitudes de Fastify en buildApp mediante LogController. Se conservan logs explícitos con códigos fijos; el endpoint no registra consulta, cursor, token, resultados ni excepción original. Esto elimina los mensajes automáticos de entrada/finalización y sus tiempos para toda la aplicación. No elimina URL del historial del cliente ni de proxies externos: evitar registrar query strings allí antes de desplegar. La respuesta usa no-store, pero ese encabezado no borra logs ni historial.

Validación del agente en copia aislada: typecheck, lint y build correctos; 164 pruebas focalizadas (27 HTTP nuevas, 11 PostgreSQL nuevas y 126 regresiones). Validación global confirmada por la salida del mantenedor del 21 de septiembre de 2026: 1.692 pruebas aprobadas (656 API, 698 web y 338 de integración PostgreSQL), typecheck, lint y build correctos. Las 164 focalizadas están incluidas en el total y no se suman nuevamente. git diff --check sin errores de espacios; solo avisos CRLF a LF. Integrado mediante PR #56: implementación ae48c49, merge 9b55ae5. CI aprobado según el mantenedor; main local sincronizado y limpio y rama local/remota eliminada, según la salida compartida. Sin migraciones ni dependencias nuevas. Decisiones ADR-041 a ADR-043. RF-ATT-003 sigue parcial.


#### Contrato de transporte de búsqueda

- Método GET; ruta estática /api/v1/events/:eventId/registrations/search. El segmento search no se interpreta como registrationId. Sin alias HEAD de esta ruta.
- Authorization: Bearer con token verificado; el guard corre en onRequest antes de validar entrada. No se acepta identidad aportada en query. El servicio revalida usuario activo y pareja de rol/asignación en cada página.
- q obligatorio; limit y cursor opcionales. Se conserva exactamente el contrato de entrada interno: q recortado de 1 a 100 unidades UTF-16, controles ASCII rechazados; limit decimal canónico 1..100, por defecto 20; cursor vinculado a evento y término. Los parámetros repetidos producen arrays y se rechazan por el esquema estricto. Campos desconocidos se rechazan.
- Sin cuerpo: Content-Length no cero o Transfer-Encoding se rechazan con 400. No se redefine el parser de otras rutas.
- 200: { items, nextCursor }; cada item contiene id, eventId, status, source, createdAt ISO UTC y attendee con id, fullName, email. Sin coincidencias: items vacío y nextCursor null. Incluye canceladas con su estado.
- 400 INVALID_REGISTRATION_SEARCH: UUID, query, cursor o cuerpo inválidos. 401 UNAUTHORIZED con WWW-Authenticate: Bearer. 403 FORBIDDEN: rol no permitido o usuario inactivo. 404 EVENT_NOT_FOUND: usuario local desconocido, evento no encontrado o asignación incompatible/ausente. 500 INTERNAL_SERVER_ERROR: fallo inesperado genérico. No se serializan detalles de Zod, SQL ni excepciones.
- Cache-Control: no-store en éxitos y errores del recorrido protegido. CORS conserva el origen local existente y permite preflight para GET con Authorization.
- No hay cambios en los permisos de las rutas previas. La búsqueda no otorga permisos para detalle, alta, importación o check-in.

Se elige GET para una consulta sin efectos de escritura, reutilizando el contrato existente q/limit/cursor y su validación de parámetros repetidos. No usar URL de búsqueda como enlace compartido ni registrar la query en infraestructura. El control de logs aquí cubre la aplicación; el despliegue debe configurar su propio acceso/proxy. El control de logs usa la API LogController disponible en Fastify 5.12.4 del lockfile actual; no se modifica package.json ni el lockfile.


### Búsqueda web para organizadores - OE-03-003C (Issue #57)

Desde el detalle de un evento, «Ver inscripciones» permite buscar por nombre o correo mediante «Buscar» o Enter, repetir la consulta y limpiar para volver al listado general. El texto en edición y el término ejecutado son estados distintos: cada página usa el término ejecutado y su cursor; una búsqueda nueva reinicia resultados y paginación.

La web usa la cuenta verificada, el scope configurado y el evento seleccionado. Cancela peticiones y descarta respuestas tardías al cambiar búsqueda, cuenta, evento, acceso o cerrar sesión. Conserva listado/detalle y restauración de foco. La consulta y los resultados quedan solo en memoria de esta vista. No se escriben en storage, URL de navegación ni logs propios. La petición GET sí contiene q y cursor: herramientas de red e infraestructura pueden observarlos.

Verificación del agente en copia aislada: typecheck, lint y build aprobados; 240 pruebas focalizadas aprobadas, incluidas 49 nuevas (25 del cliente, 19 de la vista y 5 de sesión). Validación global confirmada por la salida del mantenedor del 21 de septiembre de 2026: 1.741 pruebas aprobadas (656 API, 747 web y 338 de integración PostgreSQL), typecheck, lint y build correctos. Las 240 focalizadas están incluidas en el total y no se suman nuevamente. git diff --check sin errores. Evidencia manual aportada: búsqueda por nombre y correo, apertura del detalle, retorno conservando el término ejecutado, estado sin coincidencias y limpieza del campo que devuelve la vista al listado general. Las capturas finales de limpieza no muestran las tarjetas inferiores; no acreditan paginación de más de 20 resultados, cambio de cuenta ni respuestas tardías en navegador. Estos escenarios cuentan con cobertura automatizada. Pendientes commit, PR, CI y merge. Rama feat/57-registration-search-web. Sin cambios de API, esquema ni dependencias. ADR-044 a ADR-046. RF-ATT-003 sigue parcial: interfaz de operadores y búsqueda por código quedan fuera de esta entrega.

#### Consumo web de búsqueda

- GET a la ruta existente con q recortado (1..100 unidades UTF-16, máximo original 200, sin controles ASCII), limit=20 y cursor opaco opcional de hasta 240 caracteres base64url. URLSearchParams codifica los literales una sola vez. El listado normal mantiene su límite anterior de cursor, 150.
- Coincidencias parciales según la API; acentos conservados. Orden por UUID, sin total ni snapshot. El cursor se reutiliza únicamente con el término ejecutado exacto. Cambiar mayúsculas exige buscar de nuevo.
- Token silencioso de la cuenta verificada y scope configurado. Sin cookies, redirecciones ni caché; timeout de 15 segundos para fetch/JSON. No hay reintentos automáticos.
- Valida proyección, evento, UUID, estados, fechas, nombres/correos, cantidad, IDs únicos/ordenados y cursores; no muestra datos de una respuesta inválida. Comprueba vigencia y abort antes/después de token, fetch y JSON. La vista añade secuencia para descartar respuestas fuera de orden.
- 400 o respuesta inválida: mensaje seguro y reinicio desde «Repetir búsqueda»; 401/403 y fallo de autenticación: elimina datos e invalida acceso; 404: elimina el evento inaccesible sin invalidar toda la sesión. Fallos temporales permiten repetir la búsqueda ejecutada. Mensajes nunca incorporan cuerpos de error ni excepción original.
- La vuelta desde detalle conserva la búsqueda y el borrador; el detalle puede actualizar una fila. Repetir búsqueda recupera coincidencias actuales. Cambiar de evento o cuenta destruye el estado de la vista.

### Selección y búsqueda web del operador — OE-03-003E (Issue #61)

Tras comprobar acceso, checkin_operator dispone de «Eventos asignados al operador». El listado es explícito y paginado; seleccionar un evento consulta su detalle operativo actualizado. La búsqueda por nombre o correo usa la ruta compartida existente y presenta nombre, correo y estado, incluidas inscripciones canceladas. No añade detalle de inscripción, altas, edición, CSV ni check-in al recorrido del operador. Organizer y checkin_operator pueden coexistir con vistas independientes; admin no recibe acceso implícito.

El término en edición y el ejecutado son distintos. Buscar o Enter reinicia la paginación; las siguientes páginas y Repetir búsqueda usan el término ejecutado. Limpiar búsqueda cancela la espera y elimina término, resultados y cursor sin consultar el listado general de organizadores. Volver a eventos descarta la búsqueda; seleccionar nuevamente obtiene detalle fresco. Las consultas se cancelan y sus respuestas tardías se descartan al cambiar de cuenta, acceso, evento o búsqueda y al cerrar sesión. Un 404 retira el evento y obliga a recargar el listado; 401/403 y fallos de autorización requieren comprobar acceso nuevamente.

Los datos quedan en memoria de la vista, sin almacenamiento, URL de navegación ni logs propios. La petición GET de búsqueda sí incluye q y cursor en la URL HTTP, visible para herramientas de red e infraestructura. El servidor sigue siendo responsable de autorizar cada llamada. No se promete borrar retrospectivamente datos ya recibidos al revocar una asignación.

Validación del agente en copia aislada: 824 pruebas web aprobadas (77 nuevas: 47 cliente, 23 vista y 7 sesión), typecheck, lint y build correctos. Este incremento no cambia API, esquema, migraciones ni dependencias. Validación web del mantenedor confirmada: 824 pruebas, typecheck, lint, build y git diff --check correctos. Evidencia manual con una cuenta Entra checkin_operator: listado vacío antes de asignación local, evento asignado visible después, selección y detalle operativo, validación de búsqueda vacía, coincidencia parcial por nombre, coincidencia por correo, limpieza de campo/resultados y búsqueda sin coincidencias. El mantenedor confirmó por texto que volver al listado y seleccionar nuevamente el evento deja el campo de búsqueda vacío. No se acredita paginación, revocación ni cambio de cuenta en navegador; esos escenarios no deben darse por probados manualmente. Validación global confirmada por la salida del mantenedor del 21 de septiembre de 2026: 1.889 pruebas aprobadas (702 API, 824 web y 363 de integración PostgreSQL), typecheck, lint y build correctos. Las pruebas web anteriores están incluidas en este total y no se suman nuevamente. git diff --check sin errores. Pendientes commit, PR, CI y merge. RF-ATT-003 sigue parcial; búsqueda por código, QR y check-in quedan fuera. Decisiones ADR-050 a ADR-052.
