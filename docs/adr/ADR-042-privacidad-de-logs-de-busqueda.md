# ADR-042: Privacidad de logs de búsqueda

Estado: propuesto en issue #55; pendiente de integración.

## Contexto

Fastify registra automáticamente URL completas que pueden contener nombres, correos y cursores.

## Decisión

Desactivar logs automáticos con LogController y conservar errores explícitos de códigos fijos. No registrar excepciones originales ni datos de búsqueda.

## Consecuencias

Se pierden mensajes automáticos de entrada/finalización y tiempos para toda la app. No protege historial ni proxies; observabilidad futura deberá proyectar campos seguros.
