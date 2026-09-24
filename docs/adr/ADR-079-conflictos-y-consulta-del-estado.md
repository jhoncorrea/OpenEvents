# ADR-079: Conflictos y consulta del estado

Estado: propuesto en issue #81; pendiente de integración.

## Contexto

Una versión obsoleta o una respuesta perdida impiden confiar en la instantánea visible.

## Decisión

Bloquear acciones tras conflicto/incertidumbre hasta consulta exitosa del detalle. No reintentar automáticamente ni atribuir la consulta al envío previo.

## Consecuencias

Salir cancela la espera pero no revierte la operación; reabrir requiere lectura nueva. No se persiste incertidumbre en storage.
