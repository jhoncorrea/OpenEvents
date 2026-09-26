# ADR-087: Asistencia separada del estado de inscripción

Estado: aceptado e integrado mediante PR #88, merge 56893b3.

## Contexto

Confirmada describe la inscripción, no demuestra ingreso. El registro único check_in ya contiene la fecha original y debe conservarse aunque la inscripción se cancele.

## Decisión

Ampliar las consultas autorizadas existentes con checkedInAt (Date o null internamente; UTC canónico o null en HTTP). LEFT JOIN por registration_id conserva inscripciones sin ingreso y la unicidad existente evita multiplicar páginas. No añadir un estado al enum de inscripción ni almacenar una copia de la asistencia.

Mostrar texto y color mediante un componente compartido: Pendiente de ingreso y Ya ingresó, con fecha en la zona del evento. La actualización es explícita mediante las consultas existentes. Un campo ausente o inválido produce error de respuesta, no un estado pendiente.

## Consecuencias

No requiere migración. Preserva el historial y los permisos actuales. API y web deben actualizarse juntas; clientes anteriores pueden ignorar el nuevo campo. No se publican identidad del operador, credenciales ni un nuevo endpoint de escritura. No hay sondeo ni éxito optimista; el listado refleja la última consulta completada.
