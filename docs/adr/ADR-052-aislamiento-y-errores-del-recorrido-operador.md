# ADR-052: Aislamiento y errores del recorrido operador

Estado: propuesto en issue #61; pendiente de integración.

## Contexto

Cambios de cuenta y respuestas tardías pueden mezclar datos de recorridos distintos.

## Decisión

Desmontar al perder acceso o cambiar cuenta; abortar solicitudes y comprobar vigencia antes/después del acceso a token y red. La vista usa una secuencia para descartar respuestas antiguas. 401/403 invalidan acceso; 404 elimina evento y listado; otros errores permiten repetir.

## Consecuencias

Se validan proyección, identidad del detalle, orden y límites de página en el cliente. No se guardan datos de consulta ni errores originales. Pruebas con MSAL/API simulados no sustituyen la comprobación manual con identidad real.
