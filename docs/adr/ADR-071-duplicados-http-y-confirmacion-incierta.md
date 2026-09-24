# ADR-071: Duplicados HTTP y confirmación incierta

Estado: aceptado mediante PR #76, merge 6f87944; CI aprobado.

## Contexto

Un cliente puede perder la respuesta de un ingreso confirmado y repetir la solicitud.

## Decisión

Retornar duplicate con el ingreso original solo tras revalidar permisos/estados. No añadir reintentos automáticos ni una transacción HTTP exterior.

## Consecuencias

Un timeout no acredita rollback. No se crea otro ingreso, ni se sobrescriben operador/fecha/origen. Los fallos técnicos son 500, no resultados invalid/duplicate.
