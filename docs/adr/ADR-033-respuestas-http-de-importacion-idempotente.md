# ADR-033: Respuestas HTTP de importación idempotente

Estado: propuesto en issue #49; pendiente de integración.

## Contexto

La operación devuelve el comprobante original sin indicador fiable de primera ejecución. Una consulta sin resultado visible no prueba fallo.

## Decisión

200 para POST confirmado o repetido y para GET completed/not_observed; comprobante histórico con proyección explícita y fechas ISO.

## Consecuencias

No se inventa 201 ni replayed. Los clientes no deben cambiar automáticamente de clave ni presentar not_observed como fracaso.
