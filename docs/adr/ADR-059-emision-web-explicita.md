# ADR-059: Emisión web explícita

Estado: propuesto en issue #67; pendiente de integración.

## Contexto

La emisión crea un secreto no recuperable y debe evitarse al cargar o renderizar una vista.

## Decisión

Emitir desde el detalle del organizador solo por clic explícito, con estados elegibles y acceso verificado. Mostrar advertencia previa y bloquear doble envío. Consumir el POST existente y validar estrictamente su respuesta.

## Consecuencias

El servidor conserva la autorización y unicidad. La vista no conoce de antemano si ya existe una credencial. Imagen QR y distribución se separan del incremento.
