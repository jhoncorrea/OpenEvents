# ADR-077: Confirmación HTTP de transiciones

Estado: aceptado mediante PR #80, merge a4bce65; CI aprobado.

## Contexto

Una transición puede confirmar y perderse su respuesta al cliente.

## Decisión

Retornar éxito después de la operación con conexión raíz, sin transacción HTTP adicional ni reintentos. Verificar commit con otra conexión en pruebas.

## Consecuencias

Repetir no es éxito idempotente. Un corte exige consultar el evento; conservar auditoría y bloqueos internos. Identidad simulada en tests no acredita Entra manual.
