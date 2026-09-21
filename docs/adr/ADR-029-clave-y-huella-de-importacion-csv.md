# ADR-029: Clave y huella de importación CSV

- Estado: Aceptado para Issue #47; pendiente de merge.
- Fecha: 2026-09-20

## Contexto

Un correo duplicado no permite identificar qué solicitud creó un lote.

## Decisión

Clave UUID normalizada por evento y usuario local, con SHA-256 de bytes exactos. Igual clave/huella recupera el resultado; contenido distinto acotado entra en conflicto.

## Consecuencias

Variaciones de formato cambian la huella. La clave no es credencial. Un intento revertido no reserva clave; una clave confirmada no se recicla.
