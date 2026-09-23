# ADR-061: Emisión web y resultado incierto

Estado: aceptado e integrado mediante PR #68 (merge e9c2f85).

## Contexto

Un fallo de transporte o una cancelación no demuestra que el servidor haya revertido la emisión.

## Decisión

Distinguir cancelación anterior al envío de resultados inciertos tras POST. Tratar 5xx, JSON/respuesta inválida y fallo de red como incertidumbre; no reintentar automáticamente ni ofrecer recuperación por repetición.

## Consecuencias

Tras incertidumbre o conflicto se bloquea una repetición directa en el detalle. Reabrir no recupera el token; la unicidad del servidor sigue vigente. Pruebas simuladas se complementarán con comprobación manual real.
