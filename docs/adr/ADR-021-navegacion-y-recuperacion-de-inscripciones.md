# ADR-021: Navegación y recuperación de inscripciones

- Estado: Aceptado para la implementación de Issue #41; pendiente de merge.
- Fecha: 2026-09-20

## Contexto

El organizador necesita recorrer las inscripciones sin conocer el cursor ni confundir errores con final de listado.

## Decisión

Cargar páginas de 20 bajo acción explícita, tratar el cursor como opaco y usar null como fin. Deduplicar filas y detectar ciclos. Actualizar reinicia; un fallo de red permite reintentar la misma página y una respuesta inválida exige reiniciar. Conservar lista y foco al volver del detalle; consultar el evento al salir.

## Consecuencias

El contador muestra lo cargado, no el total. No hay orden cronológico ni snapshot; las altas concurrentes pueden exigir actualizar. No hay búsqueda ni exportación. Consultar no elimina bloqueos de altas inciertas.
