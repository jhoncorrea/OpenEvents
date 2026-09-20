# ADR-015 — Aislamiento de inscripción por cuenta

Seguimiento: OE-03-001B, Issue #37.
Estado: implementado y validado localmente; pendiente de integración.

## Contexto

El formulario contiene datos personales; una operación pendiente podría mostrar información después de cambiar de identidad o perder acceso.

## Decisión

Mantener los campos y la confirmación solo en memoria, con componentes asociados a cuenta/evento. Solicitar el token de la cuenta seleccionada, comprobarla antes/después del envío, abortar al desmontar e ignorar respuestas tardías. Invalidar acceso ante errores de autenticación o autorización. La API mantiene la autorización definitiva por evento.

## Consecuencias

Se evita persistir el formulario en localStorage/sessionStorage y reutilizar respuestas entre cuentas. Recarga, salida y cambio de cuenta descartan trabajo no guardado. Cancelar una solicitud no implica rollback. La protección no sustituye controles contra XSS, auditoría ni permisos en servidor.
