# ADR-063: Ciclo de vida y fallo del QR

Estado: propuesto en issue #69; pendiente de integración.

## Contexto

El QR no debe sobrevivir al contexto de emisión ni impedir copiar el token si falla su representación.

## Decisión

Derivar la geometría de forma síncrona del token validado, en memoria de la vista. Retirarla con el detalle, conservar los avisos de #67 y mantener código/copia ante un fallo gráfico con mensaje fijo.

## Consecuencias

No hay respuestas gráficas tardías ni reemisión para dibujar. Las respuestas tardías HTTP siguen descartándose. No se recupera el QR de credenciales previas ni se controlan capturas o copias externas.
