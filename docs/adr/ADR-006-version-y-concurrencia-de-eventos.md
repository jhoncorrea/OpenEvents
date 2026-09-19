# ADR-006 — Versión persistida y control de concurrencia

Fecha: 2026-09-19. Seguimiento: OE-02-002C, Issue #31.
Estado: implementado en rama; pendiente de integración.

## Contexto

Un bloqueo durante el UPDATE no detecta que el cliente editó una copia antigua. La última escritura podría sobrescribir cambios de otra persona.

## Decisión

Añadir version integer positiva con valor inicial 1. Exigir expectedVersion en PATCH; bloquear el evento, comparar y actualizar atómicamente con condición de ID, versión y draft. Incrementar en cada PATCH aceptado, incluso sin cambios efectivos. Exponer version en POST, GET y PATCH; responder 409 ante versión obsoleta. Usar el cuerpo en lugar de ETag/If-Match para este contrato inicial.

## Consecuencias

Evita sobrescritura silenciosa sin mantener bloqueos durante la interacción humana. Requiere que el cliente consulte y gestione conflictos y que todos los escritores incrementen version. Introduce migración y amplía respuestas. No ofrece fusión, historial ni idempotencia. El máximo integer exige evolución futura; expectedVersion se limita a 2147483646.
