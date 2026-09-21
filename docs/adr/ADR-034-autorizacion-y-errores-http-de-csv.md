# ADR-034: Autorización y errores HTTP de CSV

Estado: propuesto en issue #49; pendiente de integración.

## Contexto

El adaptador recibe entrada no confiable y debe conservar autorización e idempotencia existentes.

## Decisión

Guard Bearer/cliente/scope/organizer antes del cuerpo, luego validación HTTP y servicio idempotente con permisos vigentes. Errores controlados, diagnósticos acotados, no-store y logs de error fijos.

## Consecuencias

No se exponen SQL, tokens ni CSV. Fallos de transporte/500 mantienen incertidumbre. La pantalla y políticas operativas quedan fuera del incremento.
