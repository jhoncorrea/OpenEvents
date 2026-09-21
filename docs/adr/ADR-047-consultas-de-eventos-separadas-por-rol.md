# ADR-047: Consultas de eventos separadas por rol

Estado: propuesto en issue #59; pendiente de integración.

## Contexto

La búsqueda API acepta operadores, pero estos no tienen un recorrido de selección de eventos.

## Decisión

Añadir listado y detalle propios bajo /api/v1/operator/events. Exigir checkin_operator global y local, usuario activo e identidad verificada.

## Consecuencias

No se amplían rutas de organizadores. Doble rol no convierte una asignación organizer en asignación operator. No se crea personal durante lecturas.
