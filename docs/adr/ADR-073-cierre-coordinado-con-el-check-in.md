# ADR-073: Cierre coordinado con el check-in

Estado: aceptado mediante PR #78, merge d7d1be6; CI aprobado.

## Contexto

Cerrar puede coincidir con un ingreso o una edición.

## Decisión

READ COMMITTED y orden usuario SHARE, asignación SHARE, evento UPDATE. Compartir el orden existente y revalidar después de esperas.

## Consecuencias

El primer bloqueo determina el orden: ingreso primero puede confirmar, cierre confirmado primero impide ingreso. Solo una transición concurrente; aislamiento externo incompatible se rechaza.
