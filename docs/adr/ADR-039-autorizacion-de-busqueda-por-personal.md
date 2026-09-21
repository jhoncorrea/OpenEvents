# ADR-039: Autorización de búsqueda por personal

Estado: propuesto en issue #53; pendiente de integración.

## Contexto

La operación nueva admite operadores; las lecturas existentes son exclusivas de organizadores.

## Decisión

Exigir usuario activo y pareja de rol global/asignación compatible. Verificar permisos bajo SHARE en cada página.

## Consecuencias

No se amplían rutas previas ni se heredan permisos de admin. Se necesita asignación previa; administrar personal queda fuera.
