# ADR-050: Selección web de eventos del operador

Estado: aceptado e integrado mediante PR #62 (merge 8320362).

## Contexto

El operador necesita seleccionar eventos sin recibir acciones reservadas al organizador.

## Decisión

Crear una vista independiente, visible tras verificar checkin_operator, con cliente para las dos rutas operator/events. Seleccionar requiere detalle actualizado; mostrar solo la proyección operativa. Con doble rol se mantienen ambos recorridos.

## Consecuencias

La visibilidad no sustituye autorización del servidor. Admin no hereda permisos. No se amplía el detalle de inscripciones ni se permite check-in.
