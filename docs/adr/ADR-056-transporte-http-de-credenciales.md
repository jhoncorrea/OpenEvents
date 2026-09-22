# ADR-056: Transporte HTTP de credenciales

Estado: propuesto en issue #65; pendiente de integración.

## Contexto

La operación de emisión interna necesita una entrada HTTP sin duplicar su autorización y atomicidad.

## Decisión

Usar POST en la ruta /qr prevista, con Bearer organizer y la operación existente sobre la conexión raíz. Admitir solo petición sin cuerpo, Content-Type ni query y devolver 201 con proyección explícita y fecha UTC.

## Consecuencias

La ruta devuelve un token JSON, no una imagen. Un Content-Type sin cuerpo devuelve 415; un cuerpo declarado devuelve 400 antes del parser. Estados, permisos y conflictos siguen perteneciendo a la operación interna.
