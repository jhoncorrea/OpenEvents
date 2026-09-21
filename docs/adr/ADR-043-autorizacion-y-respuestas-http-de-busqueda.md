# ADR-043: Autorización y respuestas HTTP de búsqueda

Estado: aceptado; integrado mediante PR #56, merge 9b55ae5.

## Contexto

El adaptador no debe aceptar identidad del cliente ni ampliar otras rutas.

## Decisión

Guard Bearer para organizer/checkin_operator; servicio con permisos por evento; proyección explícita, fechas UTC, errores fijos y no-store.

## Consecuencias

Cada página reautoriza; el operador no obtiene acceso al detalle anterior. Tests HTTP sustituyen el verificador: no equivalen a validar Entra real.
