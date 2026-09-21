# ADR-040: Cursor de búsqueda por evento y término

Estado: propuesto en issue #53; pendiente de integración.

## Contexto

Mezclar cursores entre filtros genera páginas incorrectas y puede confundir al usuario.

## Decisión

Cursor versionado canónico con evento, SHA-256 del término recortado y posición UUID ascendente.

## Consecuencias

Cambiar término requiere empezar de nuevo. La huella no es secreta; el cursor no autoriza ni ofrece snapshot frente a cambios concurrentes.
