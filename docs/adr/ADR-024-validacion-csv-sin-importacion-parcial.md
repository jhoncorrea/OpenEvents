# ADR-024: Validación CSV sin lote parcialmente importable

- Estado: Aceptado para Issue #43; pendiente de merge.
- Fecha: 2026-09-20

## Contexto

Un archivo mezcla filas válidas, inválidas y duplicadas. Devolver las válidas como lote facilita importaciones accidentales.

## Decisión

Resultado discriminado: filas normalizadas solo si no hay errores. Reutilizar las reglas del alta y detectar duplicados internos después de normalizar, referenciando la primera aparición.

## Consecuencias

No se guardan datos ni se comparan correos persistidos. La futura importación necesita autorización, restricciones, transacción e idempotencia; esta decisión no garantiza por sí sola atomicidad de escritura.
