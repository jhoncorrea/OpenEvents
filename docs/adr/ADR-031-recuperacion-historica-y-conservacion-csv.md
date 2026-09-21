# ADR-031: Recuperación histórica y conservación CSV

- Estado: Aceptado para Issue #47; pendiente de merge.
- Fecha: 2026-09-20

## Contexto

Una respuesta perdida exige recuperar el resultado original sin confundirlo con el estado actual.

## Decisión

Snapshot versionado con permisos actuales. Consulta completed/not_observed; recuperación permitida en eventos cerrados. Sin CSV original, tokens, TTL ni purga automática.

## Consecuencias

not_observed no prueba fracaso. El snapshot contiene datos personales; una futura política de borrado debe preservar o redefinir garantías de replay. No existe endpoint ni gestión de retención en este incremento.
