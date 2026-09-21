# ADR-045: Ciclo de vida de busqueda web

Estado: aceptado; integrado mediante PR #58, merge 7295b77.

## Contexto

Las respuestas pueden llegar después de cambiar de cuenta, evento o consulta.

## Decisión

AbortController y secuencia por vista, clave cuenta/evento, y comprobación de vigencia en sesión y cliente. Descartar respuestas tardías y eliminar datos ante pérdida de acceso.

## Consecuencias

La vista conserva detalle y foco al volver. Operadores no reciben una nueva interfaz; la API reautoriza cada página.
