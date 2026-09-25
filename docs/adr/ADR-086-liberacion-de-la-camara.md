# ADR-086: Liberación de la cámara

Estado: propuesto en issue #85; pendiente de integración.

## Contexto

Los permisos pueden resolverse tarde y la vista o cuenta puede cambiar.

## Decisión

Detener tracks, ciclos y listeners al cancelar, leer, ocultar o desmontar. Liberar también streams tardíos sin reinstalar la vista.

## Consecuencias

La cámara requiere inicio explícito al volver. Cancelar captura no revierte ingresos; los permisos se revalidan al enviar.
