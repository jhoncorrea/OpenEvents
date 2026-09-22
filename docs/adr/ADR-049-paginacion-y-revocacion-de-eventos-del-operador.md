# ADR-049: Paginacion y revocacion de eventos del operador

Estado: aceptado e integrado mediante PR #60 (merge 823c1de).

## Contexto

La selección debe funcionar por páginas sin convertir el cursor en un permiso.

## Decisión

Reutilizar cursor de posición por UUID. Revalidar usuario y asignación en cada consulta, sin snapshot entre páginas ni escrituras.

## Consecuencias

Revocaciones confirmadas se aplican a lecturas posteriores. Se bloquea usuario para comprobar estado; asignaciones/eventos se leen mediante join con visibilidad de sentencia, sin garantía retroactiva.
