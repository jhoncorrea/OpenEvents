# ADR-023: Formato y límites del CSV

- Estado: Aceptado para Issue #43; pendiente de merge.
- Fecha: 2026-09-20

## Contexto

Los archivos pueden variar en codificación, separadores y tamaño. Se necesita un contrato reproducible y acotado.

## Decisión

UTF-8 estricto con BOM inicial opcional, coma, LF/CRLF y dos campos de encabezado exactos. Parser por estados para comillas y multilínea; máximo 1 MiB y 500 registros de datos.

## Consecuencias

Otros formatos requieren conversión explícita. Los límites no acreditan rendimiento productivo; deben revisarse al diseñar transporte y persistencia. Las comillas del encabezado son válidas si sus valores coinciden.
