# ADR-082: Resultado incierto del ingreso web

Estado: propuesto en issue #83; pendiente de integración.

## Contexto

La respuesta de un ingreso puede perderse después del commit.

## Decisión

No reintentar automáticamente ni prometer rollback por aborto. Explicar incertidumbre y permitir un nuevo envío explícito sujeto a permisos y estados actuales.

## Consecuencias

Un duplicado conserva la fecha del registro original; no demuestra qué solicitud previa lo creó. Consultar el evento no confirma por sí solo el ingreso.
