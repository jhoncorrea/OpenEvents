# ADR-081: Check-in manual web

Estado: aceptado e integrado mediante PR #84 (issue #83), merge 1abee74.

## Contexto

El operador ya consulta sus eventos y existe una API persistente de ingreso.

## Decisión

Añadir un formulario explícito al detalle activo, con código exacto y source manual. Reutilizar sesión y autorización, sin conectar el demo.

## Consecuencias

Permite accepted/duplicate/invalid reales mediante la API. No incluye cámara ni convierte la búsqueda por nombre en ingreso.
