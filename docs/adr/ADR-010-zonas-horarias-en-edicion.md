# ADR-010 — Zonas horarias e instantes durante la edición

Fecha: 2026-09-19. Seguimiento: OE-02-002D, Issue #33.
Estado: implementado y validado localmente; pendiente de integración.

## Contexto

Las horas locales pueden ser ambiguas y cambiar de zona no debe desplazar accidentalmente el horario real del evento.

## Decisión

Mostrar horas en la zona del evento. Aplicar una nueva zona preserva los instantes; los ajustes horarios se hacen después. Validar el intervalo completo, rechazar horas ambiguas o inexistentes y enviar diferencias UTC. Comparar conflictos en UTC.

## Consecuencias

Se distingue cambio de presentación y cambio de horario real. El usuario debe aplicar la zona explícitamente y comprender UTC al comparar. Se conserva el instante persistido cuando el campo permanece intacto, incluso si su representación local corresponde a una hora repetida.
