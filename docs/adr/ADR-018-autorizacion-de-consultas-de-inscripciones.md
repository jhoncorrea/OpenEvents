# ADR-018 — Autorización por evento durante la lectura

Seguimiento: OE-03-001C, Issue #39.
Estado: implementado y validado localmente; pendiente de integración.

## Contexto

Conocer un UUID o tener el rol organizer no debe permitir leer asistentes de otros eventos. Una asignación puede retirarse mientras se procesa una petición.

## Decisión

Validar token y rol global; resolver usuario local activo y asignación organizer. En una transacción, bloquear SHARE usuario, asignación y evento en ese orden. Filtrar siempre por evento; el detalle combina evento e inscripción. No aprovisionar actores y usar 404 indistinguibles para recursos ajenos o ausentes.

## Consecuencias

Los controles se mantienen durante la lectura y la respuesta respeta la pertenencia al evento, incluso cuando se administran varios. Hay transacciones y posibles esperas con cambios de usuario/asignación/evento. No se reservan permisos para futuras páginas ni se prueba ausencia de toda filtración lateral. Faltan carga, auditoría y prueba manual con dos identidades.
