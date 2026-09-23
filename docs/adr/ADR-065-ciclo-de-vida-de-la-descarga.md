# ADR-065: Ciclo de vida de la descarga

Estado: propuesto en issue #71; pendiente de integración.

## Contexto

Preparar un archivo puede terminar después de abandonar la vista; iniciar una descarga no demuestra que el navegador lo haya guardado.

## Decisión

Bloquear doble clic y descartar resultados si el contexto dejó de estar montado. Mantener código/QR ante errores y permitir solo reintento gráfico. Retirar enlaces temporales y revocar URLs de objeto inmediatamente al fallar o a los 60 segundos tras iniciar.

## Consecuencias

El mensaje confirma solicitud, no guardado en disco. Una descarga iniciada puede continuar al salir. El plazo de revocación evita invalidación inmediata, pero no garantiza que todo navegador termine antes. Se mantienen los avisos de salida y no se promete borrar archivos externos.
