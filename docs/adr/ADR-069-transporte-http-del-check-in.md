# ADR-069: Transporte HTTP del check-in

Estado: aceptado mediante PR #76, merge 6f87944; CI aprobado.

## Contexto

La operación persistente necesita un contrato HTTP que no duplique sus reglas de negocio.

## Decisión

Exponer POST por evento con Bearer y checkin_operator. Delegar en la conexión raíz y proyectar accepted/duplicate con fecha UTC y sin actor ni datos personales. Usar source manual/qr.

## Consecuencias

Conservar 201/409/404 y separar errores de permisos/estado. Actualizar ejemplos provisionales. La UI y la cámara permanecen pendientes.
