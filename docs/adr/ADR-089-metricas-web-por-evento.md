# ADR-089: Métricas web por evento y consulta explícita

Estado: propuesto en issue #91; pendiente de integración.

## Contexto

Las cifras fijas del panel no representan los eventos persistidos. Las cancelaciones hacen incorrecto derivar pendientes de la resta simple de registrados e ingresos. La navegación y los cambios de cuenta pueden resolver consultas de contextos anteriores.

## Decisión

Mostrar un resumen compartido dentro del detalle seleccionado de cada rol. Consultar attendance-summary al abrirlo y por Actualizar métricas, mostrando los tres contadores y sus desgloses sin porcentajes. Mostrar observedAt en la zona del evento. Retirar los contadores fijos globales y etiquetar el contenido de ejemplo restante como demostración.

Validar el contrato en el cliente y proyectar solo sus campos; cada consulta usa la cuenta actual y cancela o descarta resultados fuera de contexto. Vaciar las cifras durante actualización y ante error; cero solo procede de una respuesta válida. Propagar pérdida de autorización y retirar un evento inaccesible. No almacenar contadores ni actualizar optimistamente por un ingreso aceptado o duplicado.

## Consecuencias

La persona debe actualizar para observar cambios posteriores a la consulta. No hay polling ni nuevos permisos. El mismo contrato funciona en eventos cerrados o cancelados y conserva ingresos históricos. Sin cambios de API o dependencias. Actividad reciente y rediseño completo del demo quedan fuera del incremento.
