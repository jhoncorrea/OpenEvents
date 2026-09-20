# ADR-009 — Aislamiento del editor por cuenta

Fecha: 2026-09-19. Seguimiento: OE-02-002D, Issue #33.
Estado: implementado y validado localmente; pendiente de integración.

## Contexto

Un cambio de identidad o una respuesta tardía podría mostrar datos de otra sesión; persistir propuestas aumenta su permanencia local.

## Decisión

Mantener la edición solo en memoria y asociarla a la cuenta. Cancelar peticiones y descartar respuestas tardías al desmontar; retirar datos al perder acceso. Mantener independiente el borrador de creación. Cargar el editor bajo demanda.

## Consecuencias

Se reduce la permanencia de datos y se preserva el aislamiento de la interfaz. Recargar o cerrar sesión pierde la propuesta. Abortar no revierte escrituras; la autorización definitiva sigue en la API. La carga diferida introduce una espera y puede fallar.
