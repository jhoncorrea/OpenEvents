# ADR-088: Resumen persistido de asistencia por evento

Estado: aceptado e integrado mediante PR #90, merge aaa8c7e.

## Contexto

El panel demo no acredita asistencia real. La inscripción y el ingreso son hechos diferentes y una cancelación puede conservar un ingreso anterior. Contar una página o restar ingresos a todas las inscripciones produce resultados engañosos.

## Decisión

Exponer una consulta autenticada por evento con registered, confirmed, cancelled, checkedIn, cancelledCheckedIn, pending y observedAt. Pendientes son confirmadas sin ingreso; los ingresos históricos cancelados se conservan y desglosan. Agregar en una sola sentencia PostgreSQL con LEFT JOIN y unicidad por inscripción, usando los permisos globales/locales existentes y bloqueos de autorización durante la lectura.

Validar y proyectar los contadores, devolver no-store y errores sin información sensible. Consultar cualquier estado de evento sin modificar datos. Mantener la integración web como incremento posterior.

## Consecuencias

No requiere migración ni contador duplicado que sincronizar. La respuesta es una instantánea de consulta, no tiempo real. Las cancelaciones hacen que pending difiera de registered - checkedIn; el cliente debe respetar el contrato y decidir explícitamente cualquier porcentaje futuro. La agregación y los bloqueos deben medirse con carga representativa; este incremento no acredita rendimiento ni implementa microservicios.
