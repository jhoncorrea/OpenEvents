# ADR-008 — Recuperación explícita de edición

Fecha: 2026-09-19. Seguimiento: OE-02-002D, Issue #33.
Estado: implementado y validado localmente; pendiente de integración.

## Contexto

Una versión obsoleta o una respuesta perdida no permiten asumir que sea seguro reenviar los cambios.

## Decisión

Conservar la propuesta en memoria, bloquear el guardado y consultar el estado actual. Comparar anterior/propuesta/actual, seleccionar los campos que se conservan y requerir un nuevo guardado con la versión consultada. No reintentar automáticamente.

## Consecuencias

Se evita la sobrescritura silenciosa y la repetición ciega. Hay más pasos para el usuario y puede surgir otro conflicto. La consulta no identifica con certeza qué petición produjo el estado; no se ofrece idempotencia.
