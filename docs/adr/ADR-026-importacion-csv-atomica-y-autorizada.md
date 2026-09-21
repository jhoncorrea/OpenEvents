# ADR-026: Importación CSV atómica y autorizada

- Estado: Aceptado para Issue #45; pendiente de merge.
- Fecha: 2026-09-20

## Contexto

Validar un CSV no comprueba permisos ni evita que altas individuales dejen un lote parcial.

## Decisión

Reutilizar el validador y autorizar usuario, asignación y evento con SHARE en ese orden. Insertar perfiles e inscripciones confirmed/csv dentro de una transacción para draft/active.

## Consecuencias

Un fallo revierte todo el lote; no se comparten perfiles entre eventos. Los bloqueos duran hasta finalizar la transacción. No hay endpoint ni cambios de esquema.
