# ADR-005 — Edición parcial solo de borradores

Fecha: 2026-09-19. Seguimiento: OE-02-002C, Issue #31.
Estado: implementado en rama; pendiente de integración.

## Contexto

Los organizadores pueden crear y consultar eventos, pero necesitan corregir datos. Editar un evento operativo requiere reglas adicionales sobre inscripciones y check-in.

## Decisión

Implementar PATCH de seis campos exclusivamente en draft. Rechazar campos desconocidos y null; conservar omitidos. Validar el resultado completo, especialmente el intervalo. Cambiar solo timezone conserva instantes UTC. Mantener activación/cierre fuera de esta entrega.

## Consecuencias

Permite correcciones con alcance acotado y evita cambios de identidad o estado por asignación masiva. Sacrifica edición de eventos activos y requiere enviar fechas explícitas para cambiar instantes. La UI llegará en una entrega posterior.
