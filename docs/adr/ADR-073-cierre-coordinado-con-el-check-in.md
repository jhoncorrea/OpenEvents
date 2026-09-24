# ADR-073: Cierre coordinado con el check-in

Estado: propuesto en issue #77; pendiente de integración.

## Contexto

Cerrar puede coincidir con un ingreso o una edición.

## Decisión

READ COMMITTED y orden usuario SHARE, asignación SHARE, evento UPDATE. Compartir el orden existente y revalidar después de esperas.

## Consecuencias

El primer bloqueo determina el orden: ingreso primero puede confirmar, cierre confirmado primero impide ingreso. Solo una transición concurrente; aislamiento externo incompatible se rechaza.
