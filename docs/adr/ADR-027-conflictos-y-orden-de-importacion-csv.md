# ADR-027: Conflictos y orden de importación CSV

- Estado: Aceptado para Issue #45; pendiente de merge.
- Fecha: 2026-09-20

## Contexto

Lotes simultáneos y altas manuales pueden compartir correos; un prechequeo no resuelve carreras.

## Decisión

Usar registration_event_email_unique como autoridad final, incluso para inscripciones canceladas. Insertar registros por correo ASCII y reconstruir el orden original en el resultado. Traducir solo ese conflicto tras rollback.

## Consecuencias

No hay omisión de duplicados ni importación parcial. El orden reduce ciclos entre lotes inversos, sin prometer ausencia universal de deadlocks; otros fallos se propagan y no se reintentan.
