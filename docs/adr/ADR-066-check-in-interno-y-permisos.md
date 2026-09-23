# ADR-066: Check-in interno y permisos

Estado: propuesto en issue #73; pendiente de integración.

## Contexto

El QR real existe, pero el check-in demo no conserva ingresos ni comprueba permisos.

## Decisión

Crear una operación interna exclusiva de checkin_operator global y asignado, con usuario activo y evento active. Comparar token canónico por hash y rechazar códigos ajenos o inactivos sin revelar la inscripción.

## Consecuencias

No conecta HTTP/web ni activa eventos. Los roles organizer/admin no conceden ingreso implícitamente y el formato opaco no admite normalización del demo.
