# ADR-055: Conflicto y límites de recuperación

Estado: propuesto en issue #63; pendiente de integración.

## Contexto

El esquema permite una fila por inscripción en cualquier estado y el hash no permite reconstruir el token.

## Decisión

Rechazar una credencial existente incluso revoked/expired, sin reemplazarla ni devolver un token alternativo. No reintentar automáticamente colisiones. Sanitizar fallos inesperados sin conservar la excepción original.

## Consecuencias

La emisión no ofrece replay: perder la respuesta tras commit no permite recuperar el secreto. Recuperación, rotación, caducidad y entrega HTTP requieren incrementos posteriores; la incertidumbre del commit no se interpreta como ausencia de escritura.
