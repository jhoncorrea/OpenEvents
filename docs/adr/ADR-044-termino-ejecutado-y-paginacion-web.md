# ADR-044: Termino ejecutado y paginacion web

Estado: aceptado; integrado mediante PR #58, merge 7295b77.

## Contexto

El usuario puede editar el campo mientras recorre páginas de una búsqueda previa.

## Decisión

Separar borrador y término ejecutado. Buscar/Enter valida y reinicia; cargar más y repetir usan el ejecutado. Limpiar cancela y vuelve a listado general.

## Consecuencias

No se mezclan cursores ni resultados de términos distintos. Sin búsquedas automáticas al teclear; los acentos se conservan.
