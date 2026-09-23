# Contrato inicial de API

Este documento describe la API objetivo del MVP. No todas las rutas ni convenciones aquí propuestas están implementadas.

## Estado implementado — OE-01-002A/B, OE-02-001B/C, OE-02-002A/B/C/D y OE-03-001A/B/C

- Los dos GET de inscripciones están implementados en OE-03-001C, solo para organizer autorizado por evento; contrato detallado al final.
- `POST /api/v1/events/{eventId}/registrations` registra un asistente con autorización por evento; contrato detallado al final.
- `GET /health` es público.
- `GET /api/v1/auth/me` requiere un access token válido para la API, la aplicación cliente permitida y el scope `access_as_user`. Devuelve la identidad y los roles reconocidos; no exige un rol específico.
- `GET /api/events/current` y `POST /api/check-ins` son rutas demo que siguen abiertas.
- `POST /api/v1/events` exige autenticación válida y el rol `organizer`, y crea un evento persistido en estado `draft`.
- Se asigna al creador en `event_staff`. `GET /api/v1/events` y `GET /api/v1/events/{eventId}` exigen organizer global y asignación organizer por evento. PATCH permite editar borradores con los mismos permisos y control de versión.

La autenticación implementada responde con errores planos `{ code, message }` y estados 401, 403 o 500. El contenedor `error`, el campo `correlationId` y la convención `X-Correlation-Id` descritos más abajo siguen siendo parte del contrato objetivo.

Los roles reconocidos son `admin`, `organizer` y `checkin_operator`. No existe una jerarquía implícita entre ellos. Las referencias a «Rol mínimo», «Organizer» y «Operator» en las tablas siguientes describen perfiles funcionales previstos; cada ruta de negocio deberá definir expresamente los roles permitidos y las restricciones por evento.

Consulta [Autenticación de API — OE-01-002A](authentication.md) para conocer el contrato y la configuración implementados.

## Creación de eventos implementada — OE-02-001B

Seguimiento: Issue #21. Requisitos principales: RF-EVT-001, RF-AUT-001 y RF-AUT-002.

### Solicitud

`POST /api/v1/events`

```http
Authorization: Bearer <access-token>
Content-Type: application/json
```

El token debe cumplir las validaciones existentes de la API y contener `organizer`. Un usuario que solo tenga `admin` o `checkin_operator` recibe 403. La autenticación y la autorización se ejecutan antes del procesamiento del cuerpo.

Ejemplo:

```json
{
  "name": "DevOpsDays Lima 2027",
  "slug": "devopsdays-lima-2027",
  "startsAt": "2027-08-27T14:00:00Z",
  "endsAt": "2027-08-27T22:00:00Z",
  "timezone": "America/Lima",
  "location": "Centro de Convenciones de Lima"
}
```

| Campo | Regla |
|---|---|
| `name` | Obligatorio, hasta 200 caracteres; se eliminan espacios exteriores. |
| `slug` | Obligatorio, único, hasta 120 caracteres; minúsculas, números y guiones simples entre palabras. |
| `startsAt` | Fecha y hora ISO 8601 UTC terminada en `Z`. |
| `endsAt` | Fecha y hora ISO 8601 UTC posterior a `startsAt`. |
| `timezone` | Zona reconocida por el runtime, hasta 100 caracteres; no admite desplazamientos como `-05:00`. |
| `location` | Obligatoria, hasta 500 caracteres; se eliminan espacios exteriores. |

Se rechazan campos adicionales, incluidos `id`, `status` y `createdAt`.

### Respuesta 201 Created

Ejemplo ilustrativo; PostgreSQL genera `id` y `createdAt`:

```json
{
  "id": "33333333-3333-4333-8333-333333333333",
  "name": "DevOpsDays Lima 2027",
  "slug": "devopsdays-lima-2027",
  "startsAt": "2027-08-27T14:00:00.000Z",
  "endsAt": "2027-08-27T22:00:00.000Z",
  "timezone": "America/Lima",
  "location": "Centro de Convenciones de Lima",
  "status": "draft",
  "createdAt": "2026-09-18T18:00:00.000Z",
  "version": 1
}
```

Se devuelve directamente el evento. Esta entrega no implementa GET de eventos ni devuelve un encabezado `Location`.

### Errores controlados

| HTTP | Código | Situación |
|---|---|---|
| 400 | `INVALID_EVENT_INPUT` | El cuerpo JSON no cumple el esquema; no se inserta. |
| 401 | `UNAUTHORIZED` | Falta Bearer, está mal formado o el token es inválido. |
| 403 | `FORBIDDEN` | Cliente, scope o rol no permitido, o usuario local deshabilitado. |
| 409 | `EVENT_SLUG_CONFLICT` | El slug ya existe; se conserva el evento original. |
| 500 | `INTERNAL_SERVER_ERROR` | Fallo operativo de autenticación o fallo inesperado al crear el evento. |

Ejemplo de conflicto:

```json
{
  "code": "EVENT_SLUG_CONFLICT",
  "message": "Ya existe un evento con ese slug."
}
```

Los errores controlados usan `{ code, message }`, sin `correlationId`. Un JSON mal formado se rechaza con 400 antes de la operación y utiliza el formato de Fastify; otros errores del procesamiento HTTP también pueden usar el formato del framework.

El control de autenticación añade `Cache-Control: no-store` y, en respuestas 401, `WWW-Authenticate: Bearer`. La ruta no devuelve ni registra el error original de persistencia; registra un código `EVENT_CREATION_FAILED` y un mensaje genérico.

### Persistencia y límites

Se utiliza la tabla `event` y las migraciones existentes. La operación interna valida antes de insertar. La restricción única de slug evita duplicados.

`DATABASE_URL` es obligatoria en el servidor. Antes de escuchar se comprueba PostgreSQL con `SELECT 1`; las migraciones se aplican por separado. El pool se libera al cerrar Fastify.

Desde OE-01-002B, la ruta asigna al creador a `event_staff` dentro de la transacción de creación; la auditoría completa sigue pendiente. El formulario web se incorpora en OE-02-001C (Issue #23); la consulta se incorpora en OE-02-002A/B y la edición API de borradores en OE-02-002C.

Las pruebas HTTP aisladas simulan persistencia. Las de integración utilizan PostgreSQL real y un verificador de tokens simulado, con una transacción que se revierte por prueba.

## Consumo desde la web — OE-02-001C

El Issue #23 incorpora el formulario sin modificar el contrato HTTP de OE-02-001B. La web comprueba `organizer` mediante `/api/v1/auth/me` antes de habilitarlo; la API sigue autorizando cada POST.

- El formulario recoge los seis campos permitidos. Convierte las horas de la zona seleccionada a UTC antes del envío y rechaza horas inexistentes o ambiguas.
- El cliente obtiene un access token mediante MSAL. Si requiere interacción, no envía la creación y solicita comprobar nuevamente el acceso.
- Una respuesta 201 con formato válido muestra el evento devuelto y su estado draft.
- Los errores 400, 401, 403 y 409 muestran mensajes controlados. Un 409 conserva los campos y señala el slug.
- Un fallo de red, 500 o respuesta inesperada se trata como resultado incierto: el evento podría haberse guardado. No se reintenta automáticamente.
- Bloquear envíos simultáneos en la interfaz no añade idempotencia a la API. El conflicto de slug no devuelve el evento existente ni demuestra por sí solo que corresponda al envío anterior.
- Los borradores por cuenta se guardan en sessionStorage, sin tokens, y se recuperan tras recarga. Se eliminan tras creación confirmada o antes del cierre de sesión.

OE-02-001C no incorporó GET de eventos, edición, activación, cierre, asignación event_staff ni auditoría completa. La asignación se incorpora posteriormente en OE-01-002B. La protección de las demás funciones web sigue pendiente.

## Asignación del organizador — OE-01-002B

El Issue #25 añade identidad local y asignación transaccional sin modificar los seis campos de entrada ni la respuesta 201. Los usuarios locales deshabilitados reciben 403. Los eventos anteriores sin asignación permanecen sin asignación automática. Consulta [la identidad local y sus límites](authentication.md#identidad-local-y-asignación-del-creador--oe-01-002b).

## Consulta de eventos implementada — OE-02-002A

Seguimiento: Issue #27. Las dos rutas GET exigen las validaciones existentes de Bearer, cliente y scope, además del rol de aplicación `organizer`. No hay privilegios implícitos para `admin` ni acceso de consulta para `checkin_operator` en esta entrega. La tabla del contrato objetivo más abajo describe capacidades futuras.

### Listado

`GET /api/v1/events?limit=20&cursor=<cursor>`

| Parámetro | Regla |
|---|---|
| `limit` | Opcional. Entero decimal de 1 a 100, predeterminado 20. No admite ceros iniciales, espacios, decimales, notación exponencial o valores repetidos. |
| `cursor` | Opcional. Cadena base64url canónica, sin relleno, máximo 100 caracteres. Se utiliza el `nextCursor` devuelto por la página anterior. |

No se admiten otros parámetros. Una respuesta 200 contiene `items` (eventos con los mismos campos de la respuesta de creación, incluida version desde OE-02-002C) y `nextCursor` (cadena o null). Una lista vacía devuelve `{ "items": [], "nextCursor": null }`.

El orden es `event.id ASC`, comparado como UUID en PostgreSQL. El cursor v1 codifica el último UUID; la siguiente página busca IDs mayores. No es un orden cronológico, una firma ni una credencial. Manipular o reutilizar un cursor nunca sustituye las comprobaciones de autorización. Se lee un elemento adicional para decidir si existe una página siguiente.

La paginación no conserva una instantánea entre solicitudes: altas, bajas o cambios de asignación pueden cambiar páginas posteriores. Un evento nuevo con UUID anterior al cursor no aparecerá hasta reiniciar el listado. El cursor no contiene fechas ni perfiles; no se devuelve un total.

### Detalle

`GET /api/v1/events/{eventId}`

El identificador debe ser UUID; se normaliza a minúsculas. No se admiten parámetros de consulta. Devuelve directamente el evento y fechas ISO UTC, sin perfil del usuario ni registros de asignación. Se permiten todos los estados persistidos del evento, no solo draft.

### Autorización y errores

La identidad local usa tenant y objeto del token verificado. La lectura no aprovisiona usuarios. Una identidad local inexistente obtiene lista vacía o 404 de detalle. Una identidad deshabilitada recibe 403. Las consultas filtran en SQL por el usuario local y el rol organizer de su asignación.

| HTTP | Código | Situación |
|---|---|---|
| 400 | `INVALID_EVENT_QUERY` | Identificador, límite, cursor o parámetros no válidos. |
| 401 | `UNAUTHORIZED` | Falta de token o identidad no válida. |
| 403 | `FORBIDDEN` | Cliente, scope, rol global no permitido o usuario local deshabilitado. |
| 404 | `EVENT_NOT_FOUND` | Detalle inexistente o no autorizado, con el mismo mensaje: «No se encontró el evento.» |
| 500 | `INTERNAL_SERVER_ERROR` | Fallo operativo de autenticación o consulta. |

Los errores usan `{ code, message }`. El control de acceso añade `Cache-Control: no-store`; las respuestas 401 añaden `WWW-Authenticate: Bearer`. La autenticación precede a la validación de parámetros. Los fallos de consulta se registran únicamente con `EVENT_QUERY_FAILED` y mensaje genérico, sin SQL ni error original.

Se usa una transacción y `FOR SHARE` sobre el usuario existente para mantener estable su estado durante la lectura. La asignación se comprueba al ejecutar cada SELECT; no se garantiza que permanezca después de completar la solicitud. No se añaden migraciones, edición ni interfaz web. El servidor conecta ambas operaciones a PostgreSQL; `buildApp` permite omitir conjuntamente las operaciones de consulta en pruebas aisladas de otras funciones.

## Edición de eventos implementada — OE-02-002C

Issue #31. `PATCH /api/v1/events/{eventId}` requiere Bearer y JSON. No admite query parameters. La autenticación y el rol global se comprueban antes de procesar la entrada; después se valida la entrada y se resuelve la autorización local dentro de la transacción.

```json
{
  "expectedVersion": 1,
  "name": "Evento corregido",
  "location": "Nueva ubicación"
}
```

`expectedVersion` es obligatorio: entero JSON entre 1 y 2147483646, sin conversión desde texto. Debe coincidir con la versión persistida. Se exige al menos uno de `name`, `slug`, `startsAt`, `endsAt`, `timezone` y `location`. Los campos omitidos se conservan; null no elimina campos. Se rechazan campos desconocidos, incluidos `version`, `status`, `id`, `createdAt` e identidades. Las reglas de los campos son las de creación y se valida el intervalo completo tras combinar con los valores persistidos.

Cambiar solo `timezone` no reinterpreta `startsAt` ni `endsAt`: son instantes UTC. Una edición aceptada, incluso sin cambios efectivos de valores, incrementa la versión en uno. Respuesta 200: evento completo con fechas UTC y `version` actualizada. POST y ambos GET también incluyen `version`, que empieza en 1. No se exige ETag ni If-Match en este contrato; la precondición viaja en el cuerpo. Desde OE-02-002D, el cliente web valida y conserva version para editar.

| HTTP | Código | Situación |
|---|---|---|
| 400 | `INVALID_EVENT_INPUT` | ID, query o cuerpo inválido, versión ausente o intervalo resultante inválido. |
| 401 | `UNAUTHORIZED` | Token o identidad no válido. |
| 403 | `FORBIDDEN` | Cliente, scope o rol global no permitido; usuario local deshabilitado. |
| 404 | `EVENT_NOT_FOUND` | Evento inexistente, identidad local desconocida o ausencia de asignación organizer; mismo cuerpo. |
| 409 | `EVENT_NOT_EDITABLE` | Evento fuera de draft. |
| 409 | `EVENT_VERSION_CONFLICT` | Versión persistida distinta de expectedVersion. |
| 409 | `EVENT_SLUG_CONFLICT` | Slug ocupado. |
| 500 | `INTERNAL_SERVER_ERROR` | Fallo inesperado, con mensaje genérico. |

Tras comprobar permisos, se verifica primero el estado y después la versión. El campo expectedVersion no concede permisos. Un cuerpo inválido puede recibir 400 antes de consultar si el evento existe. JSON mal formado y otros errores de procesamiento HTTP pueden utilizar el formato de Fastify.

Cada edición ejecuta una transacción: usuario FOR SHARE, asignación FOR SHARE, evento FOR UPDATE; luego combina, valida y actualiza con condición de ID, versión y estado. Un conflicto revierte la escritura completa. El 23505 se traduce a conflicto de slug únicamente si corresponde a `event_slug_unique`.

`Cache-Control: no-store` se conserva y los 401 incluyen `WWW-Authenticate: Bearer`. El logger de la ruta registra solo `EVENT_EDIT_FAILED` y un mensaje genérico. CORS permite PATCH desde el origen configurado, localhost:5173; CORS no sustituye autenticación ni autorización.

La protección de versión depende de que todas las futuras rutas de modificación la incrementen y respeten el protocolo. SQL directo no queda automáticamente cubierto. Al alcanzar el máximo de integer se requiere una evolución de esquema; se rechaza expectedVersion por encima del máximo indicado para evitar desbordamiento al sumar uno.

La versión evita sobrescritura silenciosa; no es una clave de idempotencia. Tras un fallo de red, consultar el evento antes de reenviar o elegir una versión nueva. No se fusionan cambios automáticamente. No se garantiza revocación retroactiva: si la edición obtiene primero los bloqueos, una deshabilitación o revocación concurrente espera a su finalización.

## Contrato objetivo del MVP

Base path propuesto: `/api/v1`

## 1. Convenciones

- JSON sobre HTTPS.
- Fechas en ISO 8601 UTC.
- Identificadores UUID.
- Autenticación Bearer token para rutas protegidas.
- `X-Correlation-Id` aceptado o generado por la API.
- Errores con estructura consistente.

```json
{
  "error": {
    "code": "CHECK_IN_DUPLICATE",
    "message": "La inscripción ya registró su ingreso.",
    "correlationId": "01J..."
  }
}
```

## 2. Salud

### `GET /health`

No requiere autenticación y no expone secretos.

```json
{
  "status": "ok",
  "service": "openevents-api",
  "timestamp": "2026-09-15T23:02:26.867Z"
}
```

## 3. Eventos

| Método | Ruta | Rol mínimo | Propósito |
|---|---|---|---|
| POST | `/api/v1/events` | Organizer | Crear evento |
| GET | `/api/v1/events` | Operator | Listar eventos autorizados |
| GET | `/api/v1/events/{eventId}` | Operator | Consultar evento |
| PATCH | `/api/v1/events/{eventId}` | Organizer | Editar evento |
| POST | `/api/v1/events/{eventId}/activate` | Organizer | Activar check-in |
| POST | `/api/v1/events/{eventId}/close` | Organizer | Cerrar check-in |

## 4. Asistentes e inscripciones

El POST está implementado en OE-03-001A y los GET en OE-03-001C. Los GET actuales solo admiten organizer global y asignado al evento; búsqueda y acceso de operadores siguen pendientes. Importación y emisión de QR son objetivos futuros.

| Método | Ruta | Rol mínimo | Propósito |
|---|---|---|---|
| POST | `/api/v1/events/{eventId}/registrations` | Organizer | Crear inscripción |
| POST | `/api/v1/events/{eventId}/registrations/imports` | Organizer | Importar CSV |
| GET | `/api/v1/events/{eventId}/registrations` | Organizer asignado | Listar con cursor (implementado) |
| GET | `/api/v1/events/{eventId}/registrations/{registrationId}` | Organizer asignado | Consultar inscripción (implementado) |
| POST | `/api/v1/events/{eventId}/registrations/{registrationId}/qr` | Organizer asignado | Emitir credencial opaca (JSON); reemisión e imagen QR pendientes |

## 5. Check-in

### `POST /api/v1/events/{eventId}/check-ins`

Solicitud:

```json
{
  "code": "token-opaco-del-qr",
  "source": "camera"
}
```

Primera validación correcta — `201 Created`:

```json
{
  "status": "accepted",
  "checkIn": {
    "id": "uuid",
    "registrationId": "uuid",
    "checkedInAt": "2026-09-15T23:02:26.867Z"
  },
  "attendee": {
    "displayName": "Ana María Torres"
  }
}
```

Duplicado — `409 Conflict`:

```json
{
  "status": "duplicate",
  "previousCheckInAt": "2026-09-15T23:02:26.867Z"
}
```

Inválido — `404 Not Found`:

```json
{
  "status": "invalid",
  "message": "El código no pertenece a este evento."
}
```

## 6. Dashboard

### `GET /api/v1/events/{eventId}/dashboard`

```json
{
  "registered": 240,
  "checkedIn": 168,
  "pending": 72,
  "attendanceRate": 70,
  "updatedAt": "2026-09-15T23:02:26.867Z"
}
```

### `GET /api/v1/events/{eventId}/check-ins?limit=20&cursor=...`

Devuelve los ingresos recientes con paginación por cursor.

## 7. Respuestas comunes

| HTTP | Uso |
|---:|---|
| 200 | Consulta correcta |
| 201 | Recurso creado/check-in aceptado |
| 400 | Formato o datos inválidos |
| 401 | No autenticado |
| 403 | Sin autorización |
| 404 | Recurso o código no encontrado |
| 409 | Conflicto, incluido check-in duplicado |
| 429 | Demasiadas solicitudes |
| 500 | Error inesperado con correlation ID |

## 8. Pendiente antes de implementación

- generar OpenAPI desde esquemas compartidos;
- formato y límites del validador CSV definidos en [registration-csv.md](registration-csv.md); quedan pendientes transporte HTTP y límites de la futura importación;
- definir paginación;
- definir rate limiting;
- definir estrategia de idempotencia para importaciones;
- revisar exposición mínima de datos del asistente en la respuesta.

## Cliente web de consultas — OE-02-002B

Issue #29 consume el listado y detalle de OE-02-002A sin modificar su contrato. Solicita páginas de 20 elementos y utiliza `nextCursor` para continuar; actualizar comienza por la primera página. El detalle se vuelve a solicitar a la API al abrirlo, en lugar de asumir que la copia del listado sigue vigente.

El cliente valida identificadores, fechas UTC, zona horaria, estados y estructura de páginas; descarta campos adicionales y rechaza respuestas incoherentes. Se muestran fechas en la zona horaria del evento. No se promete orden cronológico ni una instantánea entre páginas.

Las solicitudes utilizan Bearer, `cache: no-store`, `credentials: omit` y `redirect: error`. El fetch tiene un límite de 15 segundos y admite cancelación. No hay reintentos ni redirecciones de autenticación automáticas desde las consultas. Un 404 de detalle retira ese evento del listado; no distingue entre evento ajeno, eliminado o inexistente. Los errores no presentan el cuerpo original de la respuesta.

## Cliente web de edición — OE-02-002D

Issue #33 consume el PATCH existente sin modificar endpoints ni esquema. GET y PATCH requieren en el cliente una versión entera positiva dentro del rango integer; para editar debe permitir el siguiente incremento. El cliente valida el ID, los campos permitidos y la respuesta: mismo evento, estado draft y versión esperada más uno. Descarta datos adicionales. Usa la cuenta seleccionada, token silencioso, no-store, credentials omit y redirect error. El límite del fetch y lectura de respuesta es de 15 segundos; no cubre la espera del proveedor de identidad.

Solo se envían diferencias y expectedVersion. La validación del formulario considera el intervalo completo; la API sigue siendo la autoridad. Un cambio de zona conserva los instantes antes de permitir ajustes locales. Se rechazan horas locales ambiguas o inexistentes; los instantes previamente persistidos y no modificados se conservan.

Los errores 400, 401, 403, 404 y los códigos 409 conocidos se presentan mediante mensajes controlados. Un conflicto de versión conserva la propuesta y requiere consultar, comparar y seleccionar antes de volver a guardar. Una respuesta de escritura no confirmable se trata como resultado incierto: no hay reenvío automático. Consultar el estado no prueba por sí solo cuál petición produjo cada cambio. Abortar el cliente no revierte una transacción ya confirmada.

El éxito actualiza detalle y listado. Al cancelar se consulta otra vez el detalle; un 404 retira el evento de la lista. La consulta tras un conflicto no reserva la versión: otro escritor puede cambiarla antes del siguiente PATCH.


## Registro implementado — OE-03-001A (Issue #35)

`POST /api/v1/events/{eventId}/registrations`. UUID válido, sin parámetros de consulta. Autenticación antes de analizar el cuerpo; rol organizer global, usuario local activo y asignación organizer. El estado del evento debe ser draft o active. Se usa `Cache-Control: no-store`.

Cuerpo JSON estricto (no se admiten propiedades adicionales):

```json
{"fullName":"Ana Pérez","email":"ana@example.com"}
```

`fullName`: texto recortado, 1–200 caracteres según el validador, sin caracteres Unicode de control o formato. `email`: texto ASCII recortado, formato de correo válido, máximo 254 caracteres y parte local hasta 64; se convierte a minúsculas. Se conservan puntos y +. No verifica que la persona controle ese buzón. Límite de cuerpo: 4096 bytes.

Respuesta 201, sin exponer la clave interna email_normalized ni campos adicionales:

```json
{
  "id":"11111111-1111-4111-8111-111111111111",
  "eventId":"22222222-2222-4222-8222-222222222222",
  "status":"confirmed",
  "source":"manual",
  "createdAt":"2026-09-19T03:00:00.000Z",
  "attendee":{
    "id":"33333333-3333-4333-8333-333333333333",
    "fullName":"Ana Pérez",
    "email":"ana@example.com"
  }
}
```

Errores planos `{code,message}` sin cuerpo original, correo, SQL ni detalles del proveedor:

| HTTP | Código | Condición |
|---|---|---|
| 400 | INVALID_REGISTRATION_INPUT | UUID, consulta o cuerpo inválidos, incluido JSON mal formado. |
| 401 | UNAUTHORIZED | Token ausente/inválido o identidad inválida; WWW-Authenticate: Bearer. |
| 403 | FORBIDDEN | Falta organizer global o usuario local deshabilitado. |
| 404 | EVENT_NOT_FOUND | Usuario local desconocido, evento inexistente o sin asignación organizer; mismo mensaje. |
| 409 | REGISTRATION_EMAIL_CONFLICT | El evento ya tiene una inscripción para el correo normalizado, también si está cancelada. |
| 409 | EVENT_REGISTRATION_NOT_ALLOWED | Evento closed o cancelled. |
| 413 | PAYLOAD_TOO_LARGE | Cuerpo mayor que el límite. |
| 415 | UNSUPPORTED_MEDIA_TYPE | Tipo de contenido no admitido por el parser. |
| 500 | INTERNAL_SERVER_ERROR | Fallo interno, sin exponer datos personales. |

No se aprovisiona al organizador en esta ruta. Se crea un asistente nuevo por inscripción y se guardan ambas filas atómicamente; un fallo revierte ambas. No cambia la versión del evento. El mismo correo puede registrarse en otros eventos con perfiles independientes. No hay reintento automático, clave de idempotencia, envío de correo ni generación de QR. No se garantiza repetir la respuesta original tras perderla: la unicidad evita duplicados, pero el reenvío puede responder 409.


## Cliente web de inscripción — OE-03-001B (Issue #37)

Consume POST /api/v1/events/{eventId}/registrations sin modificar el contrato ni el esquema. Valida UUID y cuerpo estricto fullName/email antes de solicitar token; recorta nombre y correo y convierte el correo ASCII a minúsculas, conservando puntos y +. La URL debe ser HTTPS salvo HTTP local permitido, sin credenciales, query ni fragmento.

Usa la cuenta seleccionada, token silencioso, Bearer, cache no-store, credentials omit y redirect error. El límite de fetch y lectura JSON es de 15 segundos; no limita la espera del proveedor de identidad. No redirige ni reintenta automáticamente. Una cancelación antes de enviar evita el POST; después de enviarlo no garantiza rollback.

Solo se acepta 201 con UUID válidos, eventId correspondiente, estado confirmed, origen manual, fecha UTC canónica y nombre/correo normalizados correspondientes a la solicitud. Se descartan campos adicionales. Una respuesta de éxito incoherente se considera incierta, sin presentar confirmación.

400/413/415 permiten corregir datos; 401/403 y fallos de autenticación invalidan el acceso. 404 retira el evento disponible. Los 409 conocidos distinguen correo duplicado de estado no permitido; un 409 desconocido, fallo de red, timeout, respuesta ilegible o error inesperado no se interpreta como éxito. Se muestran mensajes controlados sin cuerpo remoto ni detalles internos.

El formulario bloquea envíos simultáneos y resultados inciertos. El bloqueo por evento vive en memoria durante la cuenta montada y sobrevive a una nueva comprobación de acceso, pero no a recarga o cambio de cuenta. No sustituye la unicidad del servidor ni recupera una respuesta perdida. GET del evento verifica acceso/estado, no la existencia de una inscripción; no hay endpoint nuevo de reconciliación.


## Consultas implementadas — OE-03-001C (Issue #39)

Autenticación y rol global `organizer` antes de validar ruta/query. Se exige usuario local activo y asignación `organizer` al evento. Las dos rutas responden con `Cache-Control: no-store`. `admin` y `checkin_operator` no heredan permisos. No se aprovisionan actores al leer.

### Listado

`GET /api/v1/events/{eventId}/registrations?limit=20&cursor=<cursor>`

- `eventId`: UUID; se normaliza a minúsculas.
- `limit`: opcional, entero decimal positivo de 1 a 100, sin ceros iniciales; predeterminado 20.
- `cursor`: opcional, cadena base64url canónica de hasta 150 caracteres, emitida para ese evento. Se rechazan otras propiedades, parámetros repetidos, límites fuera de rango y cursores inválidos o de otro evento.
- Solo se omite `cursor` en la primera página; no se envía la cadena literal `null`.

Respuesta `200` (valores ilustrativos):

```json
{
  "items": [{
    "id": "11111111-1111-4111-8111-111111111111",
    "eventId": "22222222-2222-4222-8222-222222222222",
    "status": "confirmed",
    "source": "manual",
    "createdAt": "2026-09-20T15:00:00.000Z",
    "attendee": {
      "id": "33333333-3333-4333-8333-333333333333",
      "fullName": "Asistente de ejemplo",
      "email": "asistente@example.com"
    }
  }],
  "nextCursor": null
}
```

Se ordena por `registration.id ASC`, filtra por evento y posición `id > afterId`, y solicita `limit + 1` filas para detectar si existe una página siguiente. Si existe, `nextCursor` contiene una cadena que el cliente debe devolver sin interpretarla; en otro caso es `null`, incluso si la última página contiene exactamente `limit` filas. Un evento autorizado sin inscripciones devuelve `{ "items": [], "nextCursor": null }`.

El formato interno versionado es `reg:v1:<eventId>:<registrationId>` codificado en base64url. No está cifrado ni firmado y no es una credencial: se autoriza cada solicitud independientemente. No exige que la fila de posición todavía exista. Los UUID no establecen orden cronológico; las inserciones concurrentes pueden quedar antes de una posición ya recorrida. No hay instantánea entre páginas ni garantía de incluir todas las altas concurrentes.

### Detalle

`GET /api/v1/events/{eventId}/registrations/{registrationId}`

Ambos identificadores deben ser UUID. No admite query adicional. Devuelve `200` con el objeto de inscripción mostrado dentro de `items`, directamente, sin contenedor ni cursor. La búsqueda combina evento e inscripción: un ID perteneciente a otro evento devuelve el mismo error que uno inexistente, incluso si el organizador tiene acceso a ambos eventos.

### Estados, privacidad y errores

Se permite lectura en draft, active, closed y cancelled. `status` y `source` corresponden a lo persistido; no se fuerza confirmed/manual. Se incluyen inscripciones canceladas. Se exponen únicamente `id`, `eventId`, `status`, `source`, `createdAt` UTC y `attendee.{id,fullName,email}`; no se expone `emailNormalized` ni información de otros eventos.

| HTTP | Código | Situación |
|---|---|---|
| 400 | INVALID_REGISTRATION_QUERY | UUID, límite, cursor o query inválidos. |
| 401 | UNAUTHORIZED | Token ausente, inválido o identidad mal formada. Incluye WWW-Authenticate: Bearer. |
| 403 | FORBIDDEN | Cliente/scope/rol insuficiente o usuario local deshabilitado. |
| 404 | EVENT_NOT_FOUND | Evento inexistente o ajeno, actor local desconocido o asignación ausente/no organizer; mismo cuerpo. |
| 404 | REGISTRATION_NOT_FOUND | Evento autorizado, pero inscripción inexistente o de otro evento. |
| 500 | INTERNAL_SERVER_ERROR | Fallo interno; respuesta y registro de error controlados. |

Formato de error `{ code, message }`, sin SQL, tokens ni datos de asistentes. La consulta usa transacción y bloqueos SHARE en orden usuario, asignación, evento. Conserva esos controles durante la lectura; no reserva permisos para otra petición ni bloquea todas las inserciones de inscripciones. No introduce escrituras ni incrementos de versión, migraciones, búsqueda, interfaz web de consulta, reconciliación automática o idempotencia.


### Consumidor web de consultas de inscripciones — OE-03-001D

Issue #41 reutiliza los GET de OE-03-001C sin modificar rutas, permisos, códigos HTTP ni persistencia. El listado web solicita páginas de 20 y usa nextCursor como valor opaco. Actualizar vuelve a la primera página. El contador representa filas cargadas; no se incorpora un total ni búsqueda.

El cliente diferencia el contrato de lectura (confirmed/cancelled y origen persistido) del contrato de alta (confirmed/manual). Valida el evento de todas las filas y el identificador del detalle solicitado, estructura y campos antes de mostrarlos. Rechaza páginas duplicadas/desordenadas, exceso de filas, cursores malformados o repetidos y continuación de una página incompleta. La pantalla detecta además ciclos entre páginas, conserva las filas anteriores ante fallos de red y exige reiniciar ante validación o respuesta inválida. No se decodifica el cursor en la web.

Un 404 del detalle puede corresponder a inscripción ausente o evento inaccesible; la interfaz limpia el listado de ese evento de forma conservadora y permite volver a consultar los eventos. No se añade reconciliación de resultados inciertos ni se considera que leer una inscripción pruebe cuál solicitud de alta la creó.


### Validador interno de CSV — OE-03-002A

Issue #43 implementa `validateRegistrationCsv(Uint8Array)` sin ruta HTTP. La ruta de importación planificada no se considera implementada. El [contrato interno](registration-csv.md) devuelve un resultado válido con filas normalizadas, o inválido con errores acotados y sin lote importable. No valida permisos ni consulta duplicados persistidos. La operación interna de OE-03-002B añade autorización y persistencia transaccional; la validación previa no sustituye esas garantías.


### Importación interna de CSV — OE-03-002B

Issue #45 añade `importRegistrationCsvForOrganizer(db, eventId, bytes, actor)` sin endpoint HTTP. Recibe un actor ya autenticado por un adaptador confiable; no verifica un JWT por sí misma. Reutiliza permisos por evento y estados draft/active del alta manual, crea confirmed/csv y devuelve `{ eventId, count, items }` en orden de entrada. El [contrato interno](registration-csv.md) detalla transacción, errores y límites.

No se asignan códigos HTTP ni se considera disponible una carga CSV desde Postman o la web. La futura ruta debe verificar token/cliente/scope, limitar el cuerpo y controlar la exposición de errores internos. OE-03-002C incorpora recuperación e idempotencia internas; la futura ruta debe conservar la clave y utilizar ese contrato al exponerla. La consulta existente puede recuperar las inscripciones persistidas; no acredita qué petición las creó.


### Idempotencia interna de importaciones CSV — OE-03-002C

Issue #47 añade `importRegistrationCsvIdempotently(db, eventId, key, bytes, actor)` y `queryRegistrationCsvImport(db, eventId, key, actor)`. No añade rutas ni códigos HTTP. El futuro adaptador debe verificar token, cliente y scope, limitar el cuerpo y usar la operación idempotente en lugar de la primitiva sin clave de OE-03-002B.

La importación devuelve `{ importId, completedAt, result }`; result conserva eventId, count e items del resultado original. La consulta devuelve `{ status: "completed", receipt }` o `{ status: "not_observed" }`. No se interpreta not_observed como operación fallida ni se genera otra clave automáticamente. El contrato completo, precedencia de errores y conservación se documentan en [registration-csv.md](registration-csv.md).

Los errores propios REGISTRATION_CSV_KEY_CONFLICT e INVALID_STORED_REGISTRATION_CSV_RESULT son internos. El adaptador futuro deberá mapearlos y proteger errores SQL, sin publicar claves, huellas, snapshots o mensajes internos indiscriminadamente. La idempotencia no evita la necesidad de autorización ni garantiza disponibilidad inmediata de la base.


## Importación y recuperación HTTP CSV - OE-03-002D (Issue #49)

Rutas: `POST /api/v1/events/{eventId}/registrations/imports` y `GET /api/v1/events/{eventId}/registrations/imports`.
Ambas requieren `Authorization: Bearer <access-token>` e `Idempotency-Key: <UUID>`. No admiten parámetros query. El GET no admite cuerpo.
La clave se normaliza a minúsculas y queda fuera de la URL. Su ámbito sigue siendo evento y organizador; conocerla no concede acceso.

El POST exige `Content-Type: text/csv`, opcionalmente `charset=utf-8` (con o sin comillas). Rechaza otros parámetros, JSON, multipart y cualquier Content-Encoding. Se reciben bytes originales, sin decodificar ni normalizar saltos de línea. Límite HTTP: 1.048.576 bytes. Permanecen 500 registros y 100 diagnósticos como límites de dominio.

Primero se comprueban token/cliente/scope y organizer global mediante el guard existente; después UUID, clave y query, formato HTTP y cuerpo. La operación interna aplica autorización local vigente y las reglas de precedencia de OE-03-002C. No se invoca la primitiva sin clave.

POST confirmado o repetido devuelve 200 con `{ status: "completed", receipt: { importId, completedAt, result: { eventId, count, items } } }`. No se distingue creación de replay ni se añade un campo replayed. Las fechas se serializan en UTC ISO. Los items contienen id, eventId, status, source, createdAt y attendee con id, fullName y email; no se publican otros campos internos.

GET devuelve 200 con el mismo comprobante cuando está visible, o `{ status: "not_observed" }`. No espera la finalización de una importación ni acredita rollback. Ante incertidumbre, conservar clave y bytes para consultar o reenviar. El comprobante es histórico, no el estado actual de las inscripciones.

| HTTP | Código | Significado |
|---|---|---|
| 400 | INVALID_REGISTRATION_CSV_REQUEST | UUID, clave, query o envoltura HTTP inválida. |
| 400 | INVALID_REGISTRATION_CSV | CSV inválido; añade errors y truncated. |
| 401 | UNAUTHORIZED | Token o identidad inválida; WWW-Authenticate: Bearer. |
| 403 | FORBIDDEN | Cliente/scope/rol insuficiente o usuario deshabilitado. |
| 404 | EVENT_NOT_FOUND | Evento inexistente o inaccesible; no revela pertenencia. |
| 409 | REGISTRATION_CSV_KEY_CONFLICT | Misma clave con otros bytes dentro del límite. |
| 409 | REGISTRATION_EMAIL_CONFLICT | Correo ya inscrito en el evento. |
| 409 | EVENT_REGISTRATION_NOT_ALLOWED | Nueva importación en estado no permitido. |
| 413 | PAYLOAD_TOO_LARGE | Cuerpo mayor que 1 MiB. |
| 415 | UNSUPPORTED_MEDIA_TYPE | Content-Type o Content-Encoding no admitido. |
| 500 | INTERNAL_SERVER_ERROR | Fallo inesperado o comprobante inválido; detalle interno oculto. |

Los errores usan `{ code, message }`; INVALID_REGISTRATION_CSV añade hasta 100 diagnósticos con code, message y localización disponible (record, line, field, firstRecord), además de truncated. No contienen valores del CSV. Las respuestas de estas rutas llevan Cache-Control: no-store. Logs de error con código fijo, sin excepción original, CSV, clave ni comprobante.

El parser está encapsulado y no altera JSON en otras rutas. CORS permite el encabezado solicitado desde el origen local ya configurado. No hay pantalla CSV, multipart, colas, nuevos reintentos, migraciones ni dependencias. Un error de transporte o 500 no demuestra ausencia de commit; la recuperación conserva las garantías internas.


### CSV web - OE-03-002E (Issue #51)

La pantalla de importación y recuperación consume la API de OE-03-002D. Conserva clave y huella por cuenta/evento en sessionStorage antes de enviar; el CSV queda en memoria. Tras recarga o nueva autorización en la misma pestaña, permite consultar el comprobante y exige volver a seleccionar los mismos bytes para reenviar. not_observed mantiene incertidumbre. El comprobante histórico se distingue del estado actual.

Verificación del agente en copia aislada: typecheck y lint correctos, 152 pruebas focalizadas aprobadas, con 63 casos nuevos. Validación global confirmada por la salida del mantenedor del 21 de septiembre de 2026: 1.595 pruebas aprobadas (602 API, 698 web y 295 de integración PostgreSQL), typecheck, lint y build correctos. Las 152 focalizadas están incluidas y no se suman de nuevo. git diff --check sin errores; solo avisos CRLF a LF. Evidencia manual: importación confirmada de dos inscripciones y recuperación del mismo comprobante, con igual identificador, fecha y cantidad, siguiendo el recorrido de recarga en la misma pestaña, cuenta y evento. Esta comprobación no cubre un corte de red real ni un cambio de cuenta. Integrado mediante PR #52: implementación 88a0cb0, merge 69685f3. CI de main 35622349694 verificado completed / success. El mantenedor confirmó main/origin/main sincronizados y limpios, y la eliminación de la rama local y remota. Sin cambios de API, esquema ni dependencias. Detalles y límites en docs/architecture/registration-csv.md y ADR-035 a ADR-037. RF-ATT-002 no se declara completo automáticamente.


### Búsqueda interna de inscripciones - OE-03-003A (Issue #53)

Operación `searchRegistrationsForStaff` por evento, con coincidencia parcial de nombre o correo, paginación por UUID y cursor vinculado al término. Exige usuario activo y pareja compatible entre rol global y event_staff: organizer/organizer o checkin_operator/checkin_operator. Admin no hereda esos permisos. Cada página revalida la autorización.

La búsqueda es de solo lectura, incluye canceladas con su estado y permite consultar todos los estados de evento. No amplía las rutas existentes, que siguen siendo exclusivas de organizadores. Sin HTTP, interfaz de búsqueda, QR, check-in, migraciones ni dependencias nuevas. RF-ATT-003 permanece parcial.

Validación del agente en copia aislada: typecheck, lint y build correctos; 136 pruebas focalizadas aprobadas (27 nuevas de entrada, 32 nuevas PostgreSQL y 77 de regresión). Validación global confirmada por la salida del mantenedor del 21 de septiembre de 2026: 1.654 pruebas aprobadas (629 API, 698 web y 327 de integración PostgreSQL), typecheck, lint y build correctos. Las 136 focalizadas están incluidas en el total y no se suman nuevamente. git diff --check sin errores de espacios; solo avisos CRLF a LF. Integrado mediante PR #54: implementación 3d57461, merge 8e03111; CI 35628691770 completed / success verificado. Main local sincronizado y limpio, rama local y remota eliminada según el mantenedor. Contrato en docs/architecture/registration-search.md y decisiones ADR-038 a ADR-040.


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

Verificación del agente en copia aislada: typecheck, lint y build aprobados; 240 pruebas focalizadas aprobadas, incluidas 49 nuevas (25 del cliente, 19 de la vista y 5 de sesión). Validación global confirmada por la salida del mantenedor del 21 de septiembre de 2026: 1.741 pruebas aprobadas (656 API, 747 web y 338 de integración PostgreSQL), typecheck, lint y build correctos. Las 240 focalizadas están incluidas en el total y no se suman nuevamente. git diff --check sin errores. Evidencia manual aportada: búsqueda por nombre y correo, apertura del detalle, retorno conservando el término ejecutado, estado sin coincidencias y limpieza del campo que devuelve la vista al listado general. Las capturas finales de limpieza no muestran las tarjetas inferiores; no acreditan paginación de más de 20 resultados, cambio de cuenta ni respuestas tardías en navegador. Estos escenarios cuentan con cobertura automatizada. Integrado mediante PR #58: implementación 3d39f30, merge 7295b77. CI de main 35658747443 completed / success verificado. Main local limpio y sincronizado, ramas local y remota eliminadas según evidencia del mantenedor. Rama feat/57-registration-search-web. Sin cambios de API, esquema ni dependencias. ADR-044 a ADR-046. RF-ATT-003 sigue parcial: interfaz de operadores y búsqueda por código quedan fuera de esta entrega.

#### Consumo web de búsqueda

- GET a la ruta existente con q recortado (1..100 unidades UTF-16, máximo original 200, sin controles ASCII), limit=20 y cursor opaco opcional de hasta 240 caracteres base64url. URLSearchParams codifica los literales una sola vez. El listado normal mantiene su límite anterior de cursor, 150.
- Coincidencias parciales según la API; acentos conservados. Orden por UUID, sin total ni snapshot. El cursor se reutiliza únicamente con el término ejecutado exacto. Cambiar mayúsculas exige buscar de nuevo.
- Token silencioso de la cuenta verificada y scope configurado. Sin cookies, redirecciones ni caché; timeout de 15 segundos para fetch/JSON. No hay reintentos automáticos.
- Valida proyección, evento, UUID, estados, fechas, nombres/correos, cantidad, IDs únicos/ordenados y cursores; no muestra datos de una respuesta inválida. Comprueba vigencia y abort antes/después de token, fetch y JSON. La vista añade secuencia para descartar respuestas fuera de orden.
- 400 o respuesta inválida: mensaje seguro y reinicio desde «Repetir búsqueda»; 401/403 y fallo de autenticación: elimina datos e invalida acceso; 404: elimina el evento inaccesible sin invalidar toda la sesión. Fallos temporales permiten repetir la búsqueda ejecutada. Mensajes nunca incorporan cuerpos de error ni excepción original.
- La vuelta desde detalle conserva la búsqueda y el borrador; el detalle puede actualizar una fila. Repetir búsqueda recupera coincidencias actuales. Cambiar de evento o cuenta destruye el estado de la vista.


### Eventos asignados al operador - OE-03-003D (Issue #59)

GET /api/v1/operator/events y GET /api/v1/operator/events/:eventId permiten seleccionar eventos con identidad verificada. Exigen usuario local activo, rol global checkin_operator y asignación event_staff de ese mismo rol. Tener organizer o admin sin checkin_operator no concede acceso. Con ambos roles globales, este recorrido sigue devolviendo solo asignaciones de operador.

Listado paginado por UUID; detalle con proyección operativa (id, name, startsAt, endsAt, timezone, location, status). Sin slug, version, createdAt ni datos del personal. Un usuario desconocido obtiene lista vacía y detalle 404, sin provisionamiento. Los permisos se comprueban en cada solicitud; el cursor no concede acceso. Se conservan sin cambios los permisos de las rutas de organizadores.

Verificación del agente en copia aislada: typecheck, lint y build correctos; 185 pruebas focalizadas distintas aprobadas (71 nuevas: 46 HTTP y 25 PostgreSQL; 114 de regresión). Los fixtures de integración se revierten mediante rollback. El verificador HTTP es sustituido en pruebas: no acredita autenticación real con Entra. Validación global confirmada por la salida del mantenedor del 21 de septiembre de 2026: 1.812 pruebas aprobadas (702 API, 747 web y 363 de integración PostgreSQL), typecheck, lint y build correctos. Las 185 focalizadas están incluidas en ese total y no se suman nuevamente. git diff --check sin errores. Integrado mediante PR #60: implementación 4deca8c, merge 823c1de. CI de main 35667029136 aprobado; main local limpio y sincronizado y ramas eliminadas según la evidencia del mantenedor. Rama feat/59-operator-event-query-api. Sin migraciones, dependencias ni interfaz web nueva. ADR-047 a ADR-049; contrato en docs/architecture/operator-events.md. RF-ATT-003 sigue parcial.

### Selección y búsqueda web del operador — OE-03-003E (Issue #61)

Tras comprobar acceso, checkin_operator dispone de «Eventos asignados al operador». El listado es explícito y paginado; seleccionar un evento consulta su detalle operativo actualizado. La búsqueda por nombre o correo usa la ruta compartida existente y presenta nombre, correo y estado, incluidas inscripciones canceladas. No añade detalle de inscripción, altas, edición, CSV ni check-in al recorrido del operador. Organizer y checkin_operator pueden coexistir con vistas independientes; admin no recibe acceso implícito.

El término en edición y el ejecutado son distintos. Buscar o Enter reinicia la paginación; las siguientes páginas y Repetir búsqueda usan el término ejecutado. Limpiar búsqueda cancela la espera y elimina término, resultados y cursor sin consultar el listado general de organizadores. Volver a eventos descarta la búsqueda; seleccionar nuevamente obtiene detalle fresco. Las consultas se cancelan y sus respuestas tardías se descartan al cambiar de cuenta, acceso, evento o búsqueda y al cerrar sesión. Un 404 retira el evento y obliga a recargar el listado; 401/403 y fallos de autorización requieren comprobar acceso nuevamente.

Los datos quedan en memoria de la vista, sin almacenamiento, URL de navegación ni logs propios. La petición GET de búsqueda sí incluye q y cursor en la URL HTTP, visible para herramientas de red e infraestructura. El servidor sigue siendo responsable de autorizar cada llamada. No se promete borrar retrospectivamente datos ya recibidos al revocar una asignación.

Validación del agente en copia aislada: 824 pruebas web aprobadas (77 nuevas: 47 cliente, 23 vista y 7 sesión), typecheck, lint y build correctos. Este incremento no cambia API, esquema, migraciones ni dependencias. Validación web del mantenedor confirmada: 824 pruebas, typecheck, lint, build y git diff --check correctos. Evidencia manual con una cuenta Entra checkin_operator: listado vacío antes de asignación local, evento asignado visible después, selección y detalle operativo, validación de búsqueda vacía, coincidencia parcial por nombre, coincidencia por correo, limpieza de campo/resultados y búsqueda sin coincidencias. El mantenedor confirmó por texto que volver al listado y seleccionar nuevamente el evento deja el campo de búsqueda vacío. No se acredita paginación, revocación ni cambio de cuenta en navegador; esos escenarios no deben darse por probados manualmente. Validación global confirmada por la salida del mantenedor del 21 de septiembre de 2026: 1.889 pruebas aprobadas (702 API, 824 web y 363 de integración PostgreSQL), typecheck, lint y build correctos. Las pruebas web anteriores están incluidas en este total y no se suman nuevamente. git diff --check sin errores. Pendientes commit, PR, CI y merge. RF-ATT-003 sigue parcial; búsqueda por código, QR y check-in quedan fuera. Decisiones ADR-050 a ADR-052.

## Operación interna de credenciales (OE-04-001A, #63)

En #63 se implementó la función interna sin endpoint. #65 añade el adaptador HTTP descrito en la sección siguiente; imagen QR y reemisión siguen pendientes. `issueRegistrationCredentialForOrganizer(db, eventId, registrationId, actor)` recibe una identidad previamente autenticada; no verifica por sí misma un JWT. Devuelve id, eventId, registrationId, status active, issuedAt (Date) y token, únicamente al emitir. No devuelve hash ni datos del asistente. Véanse los errores, requisitos transaccionales y límites de entrega en [Credenciales de inscripción](registration-credentials.md).

## Emisión HTTP de credenciales (#65)

`POST /api/v1/events/{eventId}/registrations/{registrationId}/qr` invoca la operación de #63 con la identidad verificada. Se registra en buildApp mediante issueRegistrationCredential y el servidor la conecta a la conexión raíz de PostgreSQL. El nombre /qr sigue el contrato previsto, pero esta entrega produce JSON con el token; no una imagen.

### Petición y orden de validación

Bearer obligatorio y rol global organizer. La autorización local sigue exigiendo usuario activo y asignación organizer. El guard se ejecuta antes de comprobar cuerpo y parámetros. UUID de evento e inscripción se normalizan. No se aceptan parámetros de consulta, ni identidad, roles, token o datos de inscripción enviados por el cliente.

Enviar sin cuerpo y sin Content-Type; Content-Length: 0 explícito está permitido. Un Content-Length distinto de 0 o Transfer-Encoding se rechaza con 400 antes del parser, incluido cuerpo JSON {}, null, texto o cuerpo superior al límite. Si no hay cuerpo declarado pero se envía Content-Type, devuelve 415 incluso para application/json o text/plain. Así no se confunde un objeto vacío con ausencia de cuerpo. El límite defensivo del parser es 1.024 bytes. Si llegan errores del parser de tamaño o tipo, se traducen a 413/415 con mensajes fijos; no se devuelve su texto original.

### Respuesta

201: objeto con id, eventId, registrationId, status active, issuedAt UTC ISO 8601 y token. La proyección explícita excluye tokenHash y campos adicionales. La operación se espera hasta confirmar la transacción raíz. No hay Location ni token en encabezados o URL. El secreto se entrega en el JSON de esta emisión, sin replay.

| HTTP | Código | Condición |
| --- | --- | --- |
| 400 | INVALID_CREDENTIAL_INPUT | UUID, query o cuerpo inválidos |
| 401 | UNAUTHORIZED | Autenticación ausente/inválida; WWW-Authenticate: Bearer |
| 403 | FORBIDDEN | Falta rol global o usuario local deshabilitado |
| 404 | EVENT_NOT_FOUND | Usuario desconocido, evento inexistente o sin asignación organizer |
| 404 | REGISTRATION_NOT_FOUND | Inscripción inexistente o de otro evento autorizado |
| 409 | CREDENTIAL_ISSUANCE_NOT_ALLOWED | Evento o inscripción en estado no elegible |
| 409 | REGISTRATION_CREDENTIAL_EXISTS | Credencial existente en cualquier estado |
| 413 | PAYLOAD_TOO_LARGE | Defensa del parser de tamaño |
| 415 | UNSUPPORTED_MEDIA_TYPE | Content-Type no admitido o error de tipo del parser |
| 500 | INTERNAL_SERVER_ERROR | Fallo inesperado, sin excepción original |

La visibilidad del evento se comprueba antes de revelar datos de inscripción. Dos peticiones concurrentes autorizadas a la misma inscripción producen una respuesta 201 y otra 409; no se sobrescribe la credencial. Los conflictos de estado se evalúan antes de comprobar la credencial existente, siguiendo #63.

### Privacidad y límites

Todas las respuestas del POST reconocido usan Cache-Control: no-store, incluidas 401, 403 y errores de parser/entrada. No-store no borra datos ya recibidos ni evita que un consumidor conserve el token. No se añade una garantía para rutas inexistentes, métodos no registrados ni peticiones malformadas rechazadas antes del enrutador. GET/HEAD no emiten; OPTIONS conserva el preflight de CORS existente.

buildApp mantiene desactivados los logs automáticos de solicitudes. El adaptador registra solo un código fijo ante fallo inesperado; no registra Bearer, cuerpo, respuesta, hash, token ni excepción original. Las pruebas capturan logs reales habilitados en éxito y error. Proxies, observabilidad externa y futuros consumidores deben evitar registrar cuerpos y credenciales; el servidor no controla esas copias.

Una respuesta perdida tras commit puede dejar una credencial persistida cuyo token no se recibió. Repetir devuelve conflicto, no recupera el token. No se implementan idempotencia de respuesta, reemisión ni reintentos automáticos. El contrato no cambia los límites transaccionales de #63 ni completa la historia de QR/check-in.

## Cliente web de emisión (#67)

issueApiRegistrationCredential consume el POST de #65 sin modificar su contrato. Valida URL HTTPS (HTTP solo localhost), ausencia de credenciales/query/fragmento en la URL base, scope no vacío y UUID antes de adquirir token. Usa la cuenta seleccionada, Bearer, Accept: application/json, cache no-store, credentials omit y redirect error, sin body ni Content-Type. Tiempo de espera de red: 15 segundos. No hay reintentos ni login automático durante la emisión.

La respuesta 201 exige exactamente los campos previstos: UUID de credencial, eventId/registrationId coincidentes con los solicitados, status active, issuedAt canónico UTC con milisegundos y token oe1_ con base64url canónico de 32 bytes. Campos adicionales, fecha inválida, token inválido o JSON ilegible se descartan como resultado incierto sin exponer su contenido. La vista comprueba nuevamente el resultado antes de mostrarlo.

401/403 invalidan acceso; 404 se distingue por EVENT_NOT_FOUND o REGISTRATION_NOT_FOUND; 409 distingue credencial existente y estado no elegible. 400/413/415 se traducen a entrada inválida. Códigos desconocidos, 5xx, redirecciones, fallo de red, timeout y respuestas inválidas se consideran inciertos: no se afirma ausencia de escritura. Cancelación antes del envío se distingue de cancelación tras iniciar POST; la segunda tampoco implica rollback. Se comprueba vigencia antes/después de adquirir token y después de red y lectura de JSON.

## Operación interna de check-in (#73)

La persistencia se incorpora como registerCheckInForOperator(db, eventId, token, source, actor), no como endpoint. Devuelve invalid o accepted/duplicate con el ingreso original; checkedInAt es Date y el futuro adaptador serializará UTC. No incluye token, hash ni PII del asistente. La autorización, los errores y las condiciones de confirmación están en [Check-in](check-in.md). POST /api/check-ins continúa siendo demo en memoria; no usarlo como evidencia de check-in persistido. La futura ruta autenticada se abordará en otra entrega.
