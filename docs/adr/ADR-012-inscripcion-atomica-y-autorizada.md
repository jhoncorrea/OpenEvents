# ADR-012 — Inscripción atómica y autorizada

Seguimiento: OE-03-001A, Issue #35.
Estado: implementado y validado localmente; pendiente de integración.

## Contexto

La validación de permisos puede quedar obsoleta antes de escribir; un conflicto o fallo podría dejar asistentes sin inscripción.

## Decisión

Dentro de una transacción, bloquear con FOR SHARE usuario, asignación y evento en ese orden, comprobar permisos y estado, insertar ambas filas. Traducir únicamente la restricción de correo tras rollback.

## Consecuencias

Se preservan autorización e integridad mientras se mantienen bloqueos y se permiten inscripciones paralelas compatibles. Revocaciones/cierres pueden esperar y no son retroactivos. Se deben medir contención y tratar deadlocks; la unicidad no ofrece idempotencia de respuesta.
