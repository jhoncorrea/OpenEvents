# ADR-007 — Autorización estable durante la edición

Fecha: 2026-09-19. Seguimiento: OE-02-002C, Issue #31.
Estado: implementado en rama; pendiente de integración.

## Contexto

El rol global no concede acceso a todos los eventos. Además, usuario o asignación podrían cambiar entre verificar permisos y escribir.

## Decisión

Resolver tenant/objeto desde el token verificado, exigir organizer global y bloquear dentro de la transacción en este orden: usuario FOR SHARE, asignación FOR SHARE, evento FOR UPDATE. Exigir usuario activo y asignación organizer. No aprovisionar al editar. Responder con el mismo 404 para recurso ajeno o inexistente; no registrar errores internos de persistencia.

## Consecuencias

La autorización local permanece estable durante la escritura y las ediciones del evento se serializan. Una revocación que llegue después de los bloqueos espera; no es retroactiva. Hay coste de bloqueos y potenciales deadlocks con futuros flujos que adopten otro orden. Deben medirse las esperas y probarse revocaciones concurrentes. CORS es compatibilidad del navegador, no una barrera de autorización.
