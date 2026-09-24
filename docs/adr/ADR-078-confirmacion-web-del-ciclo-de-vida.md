# ADR-078: Confirmación web del ciclo de vida

Estado: aceptado e integrado mediante PR #82 (issue #81), merge dd6ddc9.

## Contexto

Activar y cerrar cambian qué acciones admite un evento.

## Decisión

Ofrecer acciones solo en el detalle y según estado, con confirmación nativa que identifica evento y consecuencias. Enviar expectedVersion.

## Consecuencias

Cancelar no envía. Éxito actualiza listado/detalle; no hay cambios optimistas, reapertura ni status genérico en edición.
