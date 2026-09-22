# ADR-051: Búsqueda web del operador y paginación

Estado: aceptado e integrado mediante PR #62 (merge 8320362).

## Contexto

El operador no puede usar el listado general de inscripciones exclusivo de organizadores.

## Decisión

Reutilizar searchApiRegistrations con cuenta, evento, término ejecutado y cursor. Buscar y Enter ejecutan; editar no consulta. Limpiar elimina la búsqueda sin consultar otro endpoint. Conservar por separado el texto en edición y el término ejecutado.

## Consecuencias

Los resultados viven solo en memoria. Volver a eventos elimina la búsqueda. Los cursores repetidos se rechazan y una nueva búsqueda reinicia el recorrido. GET transmite q/cursor en su URL HTTP.
