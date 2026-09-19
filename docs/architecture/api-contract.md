# Contrato inicial de API

Este documento describe la API objetivo del MVP. No todas las rutas ni convenciones aquí propuestas están implementadas.

## Estado implementado — OE-01-002A y OE-02-001B

- `GET /health` es público.
- `GET /api/v1/auth/me` requiere un access token válido para la API, la aplicación cliente permitida y el scope `access_as_user`. Devuelve la identidad y los roles reconocidos; no exige un rol específico.
- `GET /api/events/current` y `POST /api/check-ins` son rutas demo que siguen abiertas.
- `POST /api/v1/events` exige autenticación válida y el rol `organizer`, y crea un evento persistido en estado `draft`.
- La autorización por evento mediante `event_staff` sigue pendiente.

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
  "createdAt": "2026-09-18T18:00:00.000Z"
}
```

Se devuelve directamente el evento. Esta entrega no implementa GET de eventos ni devuelve un encabezado `Location`.

### Errores controlados

| HTTP | Código | Situación |
|---|---|---|
| 400 | `INVALID_EVENT_INPUT` | El cuerpo JSON no cumple el esquema; no se inserta. |
| 401 | `UNAUTHORIZED` | Falta Bearer, está mal formado o el token es inválido. |
| 403 | `FORBIDDEN` | Cliente, scope o rol no permitido. |
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

La ruta no asigna al creador a `event_staff` ni registra una auditoría completa. El formulario web se incorpora en OE-02-001C (Issue #23); las demás operaciones de eventos siguen pendientes.

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

No se incorporan GET de eventos, edición, activación, cierre, asignación event_staff ni auditoría completa. La protección de las demás funciones web sigue pendiente.

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
