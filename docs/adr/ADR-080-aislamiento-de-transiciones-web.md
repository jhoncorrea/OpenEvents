# ADR-080: Aislamiento de transiciones web

Estado: propuesto en issue #81; pendiente de integración.

## Contexto

La sesión o el evento pueden cambiar mientras una petición espera.

## Decisión

Combinar aborto, secuencia de solicitud y comprobación de cuenta antes/después de MSAL y HTTP. Invalidar acceso ante errores de autorización.

## Consecuencias

Descartar respuestas tardías y evitar envíos con otra cuenta. Conservar protección de edición, CSV y credenciales; pruebas de sesión y detalle.
