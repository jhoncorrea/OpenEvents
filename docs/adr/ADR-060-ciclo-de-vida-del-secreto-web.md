# ADR-060: Ciclo de vida del secreto web

Estado: aceptado e integrado mediante PR #68 (merge e9c2f85).

## Contexto

Persistir el token en el navegador o mezclar cuentas puede exponer una credencial portadora.

## Decisión

Mantener código y respuesta solo en memoria de la vista. Copiar únicamente mediante acción explícita; proporcionar selección manual si falla. Limpiar al desmontar o perder acceso, abortar y descartar respuestas tardías.

## Consecuencias

Se advierte antes de abandonar voluntariamente un código visible o emisión pendiente. La pérdida de acceso no pide confirmación. No se promete borrar memoria, DOM previo, portapapeles o copias externas.
