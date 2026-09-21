# ADR-037: Validación y aislamiento del cliente CSV

Estado: propuesto en issue #51; pendiente de integración.

## Contexto

Una respuesta incorrecta o tardía puede confirmar una importación equivocada o mostrar datos de otra cuenta.

## Decisión

Validar el contrato, evento, fechas, IDs, cantidad y normalización; proyectar datos y traducir diagnósticos conocidos. Cancelar y descartar al cambiar el contexto, comprobando la cuenta también después de MSAL.

## Consecuencias

Los tests sustituyen la identidad y verifican el cliente y la pantalla; no prueban Entra real ni accesibilidad completa. La API sigue siendo autoridad de permisos y validez CSV.
