# ADR-038: Semántica de búsqueda de inscripciones

Estado: propuesto en issue #53; pendiente de integración.

## Contexto

Se necesita buscar nombres/correos sin convertir texto del usuario en patrones SQL.

## Decisión

Subcadena mediante ILIKE parametrizado; escape explícito de %, _ y !. Recortar solo extremos y acotar q.

## Consecuencias

La configuración regional de PostgreSQL gobierna mayúsculas; acentos y espacios interiores se conservan. No hay búsqueda difusa ni garantía de rendimiento sin medir.
