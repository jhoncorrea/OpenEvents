# ADR-017 — Paginación de inscripciones por posición

Seguimiento: OE-03-001C, Issue #39.
Estado: implementado y validado localmente; pendiente de integración.

## Contexto

Un evento puede acumular muchas inscripciones. Necesitamos respuestas acotadas y una forma de continuar sin mezclar eventos.

## Decisión

Ordenar por registration.id ASC y filtrar por evento y posición id > afterId. Usar límite 20 por defecto, máximo 100, y leer limit + 1. Codificar un cursor canónico y versionado con evento y último UUID; autorizar de nuevo cada página. No exigir que la fila del cursor exista.

## Consecuencias

Se limita el tamaño de respuesta y se evita depender de offsets. El cursor no es una credencial ni está firmado; manipular una posición no concede acceso. El orden no es cronológico y no hay snapshot: altas concurrentes anteriores al cursor pueden no aparecer. No se prometen rendimiento ni capacidad sin medir consultas e índices.
