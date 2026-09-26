# Resumen persistido de asistencia

Issue #89 — OE-05-001A / RF-DAS-001. Incremento de API; las tarjetas web se conectarán por separado.

## Consulta y permisos

GET /api/v1/events/:eventId/attendance-summary, Bearer obligatorio. No admite parámetros de consulta ni cuerpo. eventId es UUID y se normaliza a minúsculas. Requiere organizer o checkin_operator global, usuario local activo y asignación compatible en event_staff. Admin por sí solo no concede acceso. Usuario no provisionado, evento inexistente o no asignado devuelven 404 sin distinguir existencia. Usuario deshabilitado o rol global insuficiente: 403; token inválido: 401. Parámetros inválidos: 400. Fallo interno o respuesta incoherente: 500, nunca contadores en cero por defecto.

La transacción captura identidad y roles antes de esperar y mantiene bloqueos SHARE en usuario, asignación y evento, en ese orden. Consulta draft, active, closed y cancelled. No aprovisiona usuarios ni produce auditoría de escritura.

## Respuesta 200

```json
{
  "eventId": "33f82177-3ac6-4969-8be2-de9710100103",
  "registered": 6,
  "confirmed": 4,
  "cancelled": 2,
  "checkedIn": 3,
  "cancelledCheckedIn": 1,
  "pending": 2,
  "observedAt": "2026-09-26T20:00:00.000Z"
}
```

Ejemplo ilustrativo, no lectura de los datos actuales. registered incluye todas las inscripciones; confirmed y cancelled las desglosan. checkedIn cuenta ingresos persistidos únicos, incluso si después se canceló la inscripción. cancelledCheckedIn identifica ese historial. pending cuenta únicamente confirmadas sin ingreso. Emitir una credencial no cambia la asistencia y reenviar un ingreso duplicado no aumenta el contador.

Invariantes: registered = confirmed + cancelled; confirmed - pending = checkedIn - cancelledCheckedIn; cancelledCheckedIn no supera cancelled ni checkedIn. Todos los contadores son enteros seguros no negativos. No calcular pending como registered - checkedIn: incluiría canceladas sin ingreso.

## Coherencia y privacidad

Una sola sentencia agrega registrations con LEFT JOIN a check_ins por registration_id. La restricción única existente evita duplicar inscripciones; no se unen credenciales. Todos los contadores comparten la instantánea de esa sentencia bajo READ COMMITTED. observedAt procede de statement_timestamp() y se serializa a UTC canónico; representa el momento de consulta, no promete actualización en tiempo real. Cambios confirmados después se verán al consultar nuevamente.

Cache-Control: no-store también en errores de la ruta. La proyección permite solo los campos documentados. No expone identidad del operador, asistentes, correos, credenciales ni detalles de base de datos. Logs de error con código fijo, sin excepción original. HEAD y escrituras no están habilitados; OPTIONS conserva CORS existente.

Sin migraciones, dependencias, cambios de admisión ni interfaz web. Esta entrega no incluye porcentajes, polling, actividad reciente, optimizaciones de rendimiento ni pruebas de estrés. La consulta debe medirse con carga representativa antes de afirmar capacidad.

## Validación

47 casos nuevos unitarios/HTTP y 23 PostgreSQL: evento vacío, todos sus estados, combinaciones de inscripción/asistencia, ingreso real manual/QR, duplicado, historial cancelado, aislamiento entre eventos, roles y revocación, identidad normalizada, HTTP con datos persistidos, proyección, errores y caché. PostgreSQL usa transacciones con rollback. Suites API completas: 1.010 unitarias/HTTP y 581 PostgreSQL; typecheck, lint y build aprobados. Validación global del mantenedor confirmada el 26 de septiembre de 2026: 17 archivos copiados y verificados con SHA-256, git diff --check sin errores, typecheck, lint y build aprobados en ambas aplicaciones y 2.743 pruebas aprobadas (1.010 API, 1.152 web y 581 PostgreSQL). Prueba manual con sesiones del organizador y del operador asignado en el evento sintético Prueba de inscripción API 035: ambas consultas devolvieron HTTP 200, Cache-Control: no-store y registered=4, confirmed=4, cancelled=0, checkedIn=4, cancelledCheckedIn=0, pending=0. observedAt se mostró en PowerShell como 26/09/2026 21:21:09 y 21:30:17, respectivamente; la salida formateada no acredita por sí sola la representación ISO UTC del JSON, cubierta por las pruebas automatizadas. Los intentos intermedios con token recortado fallaron localmente antes de enviar la petición. No se atribuye prueba manual de 401, evento ajeno, revocación, cancelación ni carga; conservan la cobertura automatizada aplicable. No se guardan tokens ni capturas de encabezados. Integrado mediante PR #90: implementación f62e453, merge aaa8c7e. Issue #89 cerrado y CI de main 36273664833 completed / success verificados. Main local limpio y sincronizado y rama anterior eliminada según salida del mantenedor.


La integración web se documenta por separado en [attendance-summary-web.md](attendance-summary-web.md), issue #91. El contrato de API no cambia.
