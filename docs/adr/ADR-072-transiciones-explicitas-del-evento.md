# ADR-072: Transiciones explícitas del evento

Estado: propuesto en issue #77; pendiente de integración.

## Contexto

Check-in requiere active y el organizador necesita controlar el ciclo de vida.

## Decisión

Crear operaciones internas separadas para draft -> active y active -> closed, con organizer global y asignado, usuario activo y expectedVersion estricto. No habilitar status en PATCH.

## Consecuencias

Repetición, reapertura y cancelled se rechazan. Estado precede a versión. No se imponen condiciones de fecha; HTTP/web quedan pendientes.
