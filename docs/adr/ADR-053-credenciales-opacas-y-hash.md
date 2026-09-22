# ADR-053: Credenciales opacas y hash

Estado: propuesto en issue #63; pendiente de integración.

## Contexto

La credencial no debe revelar datos de la inscripción ni quedar recuperable en claro desde la base.

## Decisión

Usar oe1_ más 32 bytes criptográficamente aleatorios en base64url y persistir solo SHA-256 del token completo. Devolver el secreto únicamente junto con id, eventId, registrationId, status e issuedAt al emitir.

## Consecuencias

Se reutiliza qr_credential sin migraciones. La entrega debe evitar logs del secreto. Generar el token no genera todavía una imagen QR ni habilita check-in.
