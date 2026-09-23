# ADR-057: Privacidad HTTP del token

Estado: aceptado e integrado mediante PR #66 (merge 2f73568).

## Contexto

El transporte puede exponer el secreto mediante caché, logs o errores.

## Decisión

Aplicar no-store a cada respuesta del POST reconocido, reutilizar logs automáticos desactivados, proyectar el resultado y reemplazar errores por mensajes fijos. No registrar token, hash, Bearer, cuerpo, respuesta ni excepción original.

## Consecuencias

Se prueba logging real habilitado en éxito y error. No-store no borra copias del cliente ni controla proxies. La infraestructura externa y futuros clientes necesitan la misma disciplina de privacidad.
