# ADR-041: Transporte HTTP de búsqueda

Estado: propuesto en issue #55; pendiente de integración.

## Contexto

La operación interna necesita un contrato HTTP sin modificar listado y detalle.

## Decisión

GET en ruta estática /registrations/search con q, limit y cursor; entrada estricta y sin cuerpo.

## Consecuencias

La URL puede contener PII: se requieren controles de logs e historial. HTTP no completa la experiencia web.
