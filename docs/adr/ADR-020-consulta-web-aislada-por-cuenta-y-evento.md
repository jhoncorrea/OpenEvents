# ADR-020: Consulta web aislada por cuenta y evento

- Estado: Aceptado para la implementación de Issue #41; pendiente de merge.
- Fecha: 2026-09-20

## Contexto

Las consultas contienen datos personales y pueden terminar después de cambiar la sesión o el evento. Un 404 del detalle no distingue una inscripción ausente de un evento inaccesible.

## Decisión

Mantener datos solo en memoria en un componente con clave por cuenta y evento. Abortar solicitudes y descartar resultados tardíos por secuencia y cuenta vigente. En 401/403 invalidar acceso; en 404 limpiar consultas y retirar el evento local hasta nueva lectura. Autorizar siempre en API.

## Consecuencias

Se evita reutilizar datos entre contextos. Un 404 de inscripción ausente puede retirar un evento aún autorizado: es una decisión conservadora recuperable actualizando los eventos. No se garantiza revocación instantánea ni auditoría; no-store no evita copias autorizadas.
