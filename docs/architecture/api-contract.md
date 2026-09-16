# Contrato inicial de API

Este documento describe la API objetivo del MVP. El spike actual puede implementar solo una parte.

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

