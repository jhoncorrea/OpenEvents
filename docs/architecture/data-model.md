# Modelo de datos inicial

## 1. Diagrama lógico

```mermaid
erDiagram
    USER ||--o{ EVENT_STAFF : receives
    EVENT ||--o{ EVENT_STAFF : assigns
    EVENT ||--o{ REGISTRATION : contains
    ATTENDEE ||--o{ REGISTRATION : owns
    REGISTRATION ||--|| QR_CREDENTIAL : has
    REGISTRATION ||--o| CHECK_IN : produces
    USER ||--o{ CHECK_IN : performs
    USER ||--o{ AUDIT_LOG : creates
    EVENT ||--o{ AUDIT_LOG : scopes

    USER {
        uuid id PK
        string external_subject UK
        string email
        string display_name
        string status
        timestamptz created_at
    }

    EVENT {
        uuid id PK
        string name
        string slug UK
        timestamptz starts_at
        timestamptz ends_at
        string timezone
        string location
        string status
        timestamptz created_at
    }

    EVENT_STAFF {
        uuid event_id FK
        uuid user_id FK
        string role
        timestamptz created_at
    }

    ATTENDEE {
        uuid id PK
        string full_name
        string email
        timestamptz created_at
    }

    REGISTRATION {
        uuid id PK
        uuid event_id FK
        uuid attendee_id FK
        string status
        string source
        timestamptz created_at
    }

    QR_CREDENTIAL {
        uuid id PK
        uuid registration_id FK
        string token_hash UK
        string status
        timestamptz issued_at
        timestamptz revoked_at
    }

    CHECK_IN {
        uuid id PK
        uuid registration_id FK
        uuid performed_by FK
        timestamptz checked_in_at
        string source
    }

    AUDIT_LOG {
        uuid id PK
        uuid event_id FK
        uuid actor_id FK
        string action
        string entity_type
        uuid entity_id
        json metadata
        timestamptz occurred_at
    }
```

## 2. Restricciones esenciales

| Restricción | Propósito |
|---|---|
| `UNIQUE(event_id, attendee_id)` en `registration` | Evitar doble inscripción accidental al mismo evento |
| `UNIQUE(registration_id)` en `qr_credential` | Un QR activo base por inscripción |
| `UNIQUE(token_hash)` en `qr_credential` | Evitar credenciales repetidas |
| `UNIQUE(registration_id)` en `check_in` | Garantizar un solo ingreso en el MVP |
| `PRIMARY KEY(event_id, user_id)` en `event_staff` | Evitar asignaciones duplicadas |
| Fechas en `timestamptz` y UTC | Consistencia entre zonas horarias |

## 3. Decisiones

- `attendee` representa a la persona; `registration` representa su participación en un evento.
- El QR apunta a la inscripción, no directamente a la persona.
- Se guarda el hash del token, no necesariamente el token en claro.
- El check-in es una entidad separada para conservar trazabilidad.
- `audit_log` no reemplaza los logs técnicos; registra eventos de negocio sensibles.
- Las estadísticas se calculan desde `registration` y `check_in`; no son contadores manuales.

## 4. Estados iniciales

| Entidad | Estados |
|---|---|
| Event | `draft`, `active`, `closed`, `cancelled` |
| User | `active`, `disabled` |
| Registration | `confirmed`, `cancelled` |
| QR Credential | `active`, `revoked`, `expired` |

## 5. Migraciones

El esquema se administrará mediante Drizzle ORM, Drizzle Kit y migraciones SQL versionadas. La decisión, las alternativas y la estrategia de aplicación se documentan en [ADR-004](../adr/ADR-004-orm-y-migraciones.md).

