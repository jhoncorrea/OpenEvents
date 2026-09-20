# Contrato inicial de API

Este documento describe la API objetivo del MVP. No todas las rutas ni convenciones aquí propuestas están implementadas.

## Estado implementado — OE-01-002A/B, OE-02-001B/C y OE-02-002A/B/C

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

| Método | Ruta | Rol mínimo | Propósito |
|---|---|---|---|
| POST | `/api/v1/events/{eventId}/registrations` | Organizer | Crear inscripción |
| POST | `/api/v1/events/{eventId}/registrations/imports` | Organizer | Importar CSV |
| GET | `/api/v1/events/{eventId}/registrations` | Operator | Buscar/listar |
| GET | `/api/v1/events/{eventId}/registrations/{id}` | Operator | Consultar inscripción |
| POST | `/api/v1/events/{eventId}/registrations/{id}/qr` | Organizer | Emitir/reemitir QR |

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
- definir límites y formato exacto del CSV;
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
