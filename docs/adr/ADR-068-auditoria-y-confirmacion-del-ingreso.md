# ADR-068: Auditoría y confirmación del ingreso

Estado: aceptado mediante PR #74, merge 6360e7a; CI aprobado.

## Contexto

El primer ingreso debe conservar actor y fecha sin exponer secretos ni sobrevivir a un fallo de auditoría.

## Decisión

Insertar check_in y audit_log check_in.accepted juntos, con fecha de servidor y metadata vacío. Sanitizar errores técnicos como CheckInFailedError; nunca como invalid/duplicate.

## Consecuencias

Rollback ante fallo de auditoría, sin otra auditoría al duplicar. Un error de entrega puede ser incierto; no equivale a ausencia de registro. No incorpora notificaciones ni recuperación web.
