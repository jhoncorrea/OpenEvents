# ADR-082: Resultado incierto del ingreso web

Estado: aceptado e integrado mediante PR #84 (issue #83), merge 1abee74.

## Contexto

La respuesta de un ingreso puede perderse después del commit.

## Decisión

No reintentar automáticamente ni prometer rollback por aborto. Explicar incertidumbre y permitir un nuevo envío explícito sujeto a permisos y estados actuales.

## Consecuencias

Un duplicado conserva la fecha del registro original; no demuestra qué solicitud previa lo creó. Consultar el evento no confirma por sí solo el ingreso.
