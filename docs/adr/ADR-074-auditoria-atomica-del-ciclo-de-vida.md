# ADR-074: Auditoría atómica del ciclo de vida

Estado: propuesto en issue #77; pendiente de integración.

## Contexto

El estado y su auditoría deben coincidir sin perder datos anteriores.

## Decisión

Actualizar estado/version e insertar event.activated/event.closed en una transacción, con actor, evento y metadata mínima, usando clock_timestamp.

## Consecuencias

Un fallo revierte ambas escrituras. Conservar inscripciones, credenciales e ingresos. Fallos técnicos sanitizados y sin reintentos; savepoint depende del commit externo y una respuesta perdida puede dejar resultado incierto.
