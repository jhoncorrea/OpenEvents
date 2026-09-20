# ADR-022: Validación del contrato de lectura de inscripciones

- Estado: Aceptado para la implementación de Issue #41; pendiente de merge.
- Fecha: 2026-09-20

## Contexto

El alta devuelve confirmed/manual, mientras las consultas admiten canceladas y el origen persistido. Mostrar una respuesta mal asociada puede revelar datos de otro evento.

## Decisión

Crear tipos y cliente de consulta separados del alta. Validar estructura, UUID, eventId de cada fila, registrationId del detalle, estado, fecha y perfil, y coherencia de páginas. Proyectar campos conocidos, mostrar texto React y errores controlados. Usar token de cuenta seleccionada, GET no-store, omit y redirect error.

## Consecuencias

La lectura no altera la validación de confirmaciones del alta ni revela cuerpos de error. Una respuesta inesperada se rechaza aunque el HTTP sea 200. Esta defensa de interfaz no reemplaza autorización en API. Debe evolucionar con el contrato y conservar pruebas de compatibilidad.
