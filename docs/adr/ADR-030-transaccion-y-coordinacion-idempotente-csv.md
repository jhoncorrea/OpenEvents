# ADR-030: Transacción y coordinación idempotente CSV

- Estado: Aceptado para Issue #47; pendiente de merge.
- Fecha: 2026-09-20

## Contexto

Dos reintentos pueden llegar antes de que exista un comprobante confirmado.

## Decisión

READ COMMITTED, autorización con SHARE, bloqueo asesor transaccional por ámbito y comprobante en la misma transacción que el lote. Mantener unicidad exacta en PostgreSQL.

## Consecuencias

El segundo observa el resultado tras esperar o importa si el primero revierte. Un fallo al guardar comprobante revierte todo; un savepoint depende del commit padre. No hay reintentos automáticos ni garantía universal contra deadlocks.
