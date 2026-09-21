# ADR-035: Recuperación CSV web por cuenta y evento

Estado: propuesto en issue #51; pendiente de integración.

## Contexto

Un envío incierto puede sobrevivir a una recarga o nueva autorización. Persistir el CSV o el comprobante conserva datos personales innecesarios.

## Decisión

Guardar solo clave UUID y SHA-256 en sessionStorage por cuenta/evento antes del POST; bloquear si no es posible. Conservar bytes solo en memoria. Consultar sin archivo o exigir la misma huella para reenviar.

## Consecuencias

La misma pestaña recupera la clave; cerrar la pestaña o borrar sus datos pierde la recuperación local. No se implementa continuidad entre dispositivos. Metadata corrupta no se descarta automáticamente.
