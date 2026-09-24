# ADR-072: Transiciones explícitas del evento

Estado: aceptado mediante PR #78, merge d7d1be6; CI aprobado.

## Contexto

Check-in requiere active y el organizador necesita controlar el ciclo de vida.

## Decisión

Crear operaciones internas separadas para draft -> active y active -> closed, con organizer global y asignado, usuario activo y expectedVersion estricto. No habilitar status en PATCH.

## Consecuencias

Repetición, reapertura y cancelled se rechazan. Estado precede a versión. No se imponen condiciones de fecha; HTTP/web quedan pendientes.
