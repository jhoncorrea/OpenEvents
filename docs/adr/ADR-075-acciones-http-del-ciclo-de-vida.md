# ADR-075: Acciones HTTP del ciclo de vida

Estado: aceptado mediante PR #80, merge a4bce65; CI aprobado.

## Contexto

El organizador necesita invocar las transiciones internas mediante API.

## Decisión

Exponer dos POST explícitos activate/close, con Bearer y organizer previo al parser; delegar a las operaciones de #77 con conexión raíz.

## Consecuencias

200 con proyección de evento y fechas UTC; PATCH no acepta status. Mantener versión y errores de transición separados. Web pendiente.
