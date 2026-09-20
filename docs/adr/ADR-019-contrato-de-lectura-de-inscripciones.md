# ADR-019 — Contrato mínimo de lectura y estados históricos

Seguimiento: OE-03-001C, Issue #39.
Estado: implementado y validado localmente; pendiente de integración.

## Contexto

El organizador necesita consultar inscripciones persistidas también después de cerrar o cancelar el evento, sin confundir lectura con permiso de alta ni exponer columnas internas.

## Decisión

Permitir GET en todos los estados, incluyendo inscripciones canceladas con status/source persistidos. Proyectar identificadores, fecha UTC y perfil mínimo del asistente. Listado con items/nextCursor y detalle directo, no-store y errores planos controlados. Validar query estricta y no incluir búsqueda en esta entrega.

## Consecuencias

Se conserva acceso autorizado a información histórica y un contrato reducido. Nombre y correo siguen siendo datos personales y requieren autorización. No-store no impide que un consumidor autorizado copie datos. No hay interfaz web, exportación, búsqueda ni recuperación automática de altas inciertas; esas capacidades requieren incrementos propios.
