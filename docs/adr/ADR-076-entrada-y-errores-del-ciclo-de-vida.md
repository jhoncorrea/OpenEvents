# ADR-076: Entrada y errores del ciclo de vida

Estado: aceptado mediante PR #80, merge a4bce65; CI aprobado.

## Contexto

El transporte debe rechazar entradas ambiguas sin reflejar detalles sensibles.

## Decisión

JSON UTF-8 estricto expectedVersion, máximo 1 KiB, UUID válido y sin query. Errores fijos, no-store y logs de códigos sin datos originales.

## Consecuencias

400/401/403/404/409/413/415 separados de 500. No confiar en statusCode arbitrario de errores de operación. No hay privilegios implícitos.
