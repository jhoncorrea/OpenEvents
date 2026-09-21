# ADR-032: Transporte HTTP de CSV

Estado: propuesto en issue #49; pendiente de integración.

## Contexto

Se necesita exponer bytes CSV sin alterar su huella ni el parser JSON existente.

## Decisión

POST text/csv con parser Buffer encapsulado y límite 1 MiB; GET sin cuerpo. Clave UUID en Idempotency-Key para ambas rutas, fuera de la URL.

## Consecuencias

No se admite multipart ni compresión. El cliente conserva los bytes y la clave. CORS se verifica para el encabezado.
