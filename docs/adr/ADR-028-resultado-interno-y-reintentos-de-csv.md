# ADR-028: Resultado interno y reintentos de CSV

- Estado: Aceptado para Issue #45; pendiente de merge.
- Fecha: 2026-09-20

## Contexto

Una respuesta de éxito debe permitir verificar lo persistido, pero una desconexión durante commit puede dejar resultado incierto.

## Decisión

Devolver eventId, count e items con identificadores y campos persistidos. Mantener errores de validación acotados. No reintentar automáticamente ni afirmar idempotencia; resolver recuperación antes del endpoint.

## Consecuencias

Repetir un lote confirmado produce conflicto. No existe registro persistido de importación ni reconciliación; los datos del resultado son personales. Dentro de una transacción externa, el éxito del savepoint queda sujeto a su commit.
