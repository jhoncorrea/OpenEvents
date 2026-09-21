# ADR-046: Validacion y privacidad de busqueda web

Estado: propuesto en issue #57; pendiente de integración.

## Contexto

La web consume una búsqueda GET con datos personales y cursor específico.

## Decisión

Reutilizar el lector seguro, validar q y respuesta, cursor de búsqueda hasta 240, mensajes fijos y no-store. Guardar borrador/resultados solo en memoria; no crear URL de navegación ni logs.

## Consecuencias

No hay persistencia local de búsqueda ni reintentos automáticos. GET sigue siendo visible en red y proxies; no-store no elimina registros externos. Sin nuevas dependencias.
