# ADR-014 — Resultados inciertos de inscripción web

Seguimiento: OE-03-001B, Issue #37.
Estado: implementado y validado localmente; pendiente de integración.

## Contexto

Un POST puede confirmarse en PostgreSQL y perder su respuesta. La API evita duplicados, pero no permite recuperar la respuesta original mediante idempotencia ni consultar inscripciones.

## Decisión

No reintentar automáticamente. Bloquear el envío pendiente y, ante incertidumbre, conservar un bloqueo por evento en memoria durante la cuenta montada, incluso al navegar o comprobar acceso. Advertir que cancelar la espera no revierte la escritura y que se debe verificar el resultado antes de repetir.

## Consecuencias

Se reducen reenvíos accidentales y confirmaciones falsas. Se sacrifica disponibilidad del formulario para ese evento mientras persiste el bloqueo. Recargar o cambiar de cuenta lo elimina; no coordina pestañas ni sustituye la unicidad en API. Quedan pendientes consulta autorizada de reconciliación e idempotencia.
