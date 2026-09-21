# ADR-025: Diagnósticos acotados de CSV

- Estado: Aceptado para Issue #43; pendiente de merge.
- Fecha: 2026-09-20

## Contexto

Se necesitan errores corregibles sin exponer datos personales ni producir reportes ilimitados. Un registro citado puede abarcar varias líneas.

## Decisión

Usar códigos/mensajes propios y ubicación por registro lógico y línea inicial cuando exista. Hasta 100 errores; truncated indica diagnósticos omitidos. Los fallos estructurales pueden detener el análisis.

## Consecuencias

No se copian celdas ni excepciones en los errores. No se promete recorrer todo archivo inválido ni entregar todos sus errores. Las filas del resultado válido sí son datos personales internos y requieren protección en usos futuros.
