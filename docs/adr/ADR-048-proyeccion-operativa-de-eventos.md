# ADR-048: Proyeccion operativa de eventos

Estado: aceptado e integrado mediante PR #60 (merge 823c1de).

## Contexto

El operador necesita identificar su evento sin recibir metadatos de administración.

## Decisión

Proyectar id, name, startsAt, endsAt, timezone, location y status tanto en SQL como en HTTP. Errores seguros, no-store y sin alias HEAD.

## Consecuencias

El futuro cliente debe usar este contrato reducido. No hay slug, version, createdAt ni datos de personal; todos los estados de evento son consultables.
