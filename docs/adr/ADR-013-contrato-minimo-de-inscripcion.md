# ADR-013 — Contrato mínimo de inscripción y privacidad

Seguimiento: OE-03-001A, Issue #35.
Estado: implementado y validado localmente; pendiente de integración.

## Contexto

El cliente puede enviar identidades o estados arbitrarios; errores de parser o SQL pueden incluir datos personales.

## Decisión

Aceptar solo fullName/email; fijar confirmed/manual en servidor. Limitar cuerpo a 4096 bytes, devolver campos explícitos y no-store, errores planos controlados y logs genéricos. Mantener 404 equivalente para eventos ajenos/inexistentes.

## Consecuencias

Se reduce asignación indebida de campos y exposición de datos. El diagnóstico pierde detalle sensible y requiere observabilidad segura futura. No se incorpora formulario, búsqueda, QR, correo ni recuperación de respuesta perdida; el límite de cuerpo no sustituye rate limiting.
