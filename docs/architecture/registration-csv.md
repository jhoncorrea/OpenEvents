# Contrato interno de validación CSV — OE-03-002A

## Alcance

Issue #43. Función síncrona pura `validateRegistrationCsv(bytes: Uint8Array)` en el módulo de inscripciones. Buffer también es válido. Sin endpoint HTTP, escrituras, conexión a base de datos, autorización ni logs. Validar no importa, reserva correos ni confirma permisos.

## Formato y límites

- Máximo 1.048.576 bytes, comprobado antes de decodificar; se cuenta el BOM si existe.
- UTF-8 estricto. Se admite un BOM UTF-8 al inicio, retirado por TextDecoder. UTF-16 y secuencias UTF-8 inválidas se rechazan. Un segundo BOM no se elimina.
- Separador coma. LF y CRLF, incluso combinados; CR aislado es un error también dentro de comillas.
- Encabezado con exactamente dos campos: fullName,email, en ese orden y sin espacios añadidos. Se compara el valor CSV decodificado, por lo que `"fullName","email"` también es válido.
- Comillas dobles al inicio del campo, comas y saltos dentro de campos citados y `""` para una comilla literal. No se admiten caracteres o espacios entre el cierre de comillas y el delimitador/final del registro.
- Máximo 500 registros de datos; el encabezado no cuenta. Registros vacíos o inválidos sí cuentan. Se detiene al detectar el registro 501 completo, o antes si aparece un fallo estructural.
- Archivo vacío o solo encabezado es inválido. Un salto final termina el último registro; no crea uno vacío. Otro salto adicional sí crea un registro vacío y se rechaza. Los registros vacíos intermedios no se omiten.
- Los campos multilínea se analizan como un solo registro. Luego se aplican las reglas de dominio: por ejemplo, un salto interno en un nombre es inválido. El trim existente puede retirar espacios/saltos exteriores, igual que en el alta manual.

No se usa split por coma o salto de línea: una máquina de estados distingue campos sin comillas, dentro de comillas y después del cierre. El trabajo y memoria están acotados por el archivo completo de 1 MiB; no es un parser de streaming ni una prueba de rendimiento.

## Reglas de dominio y duplicados

Se reutilizan los esquemas de campo de registerAttendeeInputSchema: nombre trim, entre 1 y 200 caracteres según el esquema JS, sin Cc/Cf; correo ASCII trim, máximo 254, parte local máximo 64 y sintaxis del alta manual. Se convierte a minúsculas sin quitar puntos ni etiquetas +.

Los correos sintácticamente válidos se registran en un mapa de primera aparición, incluso si el nombre de esa fila es inválido. Las repeticiones señalan firstRecord. Los correos inválidos solo generan INVALID_EMAIL, no se usan para comparar duplicados. No se detectan correos existentes en el evento: eso corresponde a la futura operación persistida.

## Resultado

Válido: `{ valid: true, rows: [{ fullName, email }], count }`. Las filas mantienen el orden de entrada y contienen datos personales normalizados para uso interno; no deben registrarse en logs ni exponerse sin autorización.

Inválido: `{ valid: false, errors: [...], truncated: boolean }`. Nunca contiene rows ni count, aunque algunas filas sean válidas. `truncated` significa que se omitió al menos un diagnóstico por superar 100; no significa que el archivo se recorrió completo. Se sigue validando dentro de los límites para detectar truncamiento; un fallo estructural puede detener el análisis.

Cada error tiene code y message propios, sin valores de celdas ni excepciones del parser. Puede incluir record (registro de datos desde 1), line (línea física inicial desde 1, incluyendo encabezado), field y firstRecord. En el encabezado solo hay line; errores generales de tamaño/codificación/vacío no inventan localización. En CSV multilínea, record y line pueden ser distintos.

| Código | Significado |
|---|---|
| FILE_TOO_LARGE | Más de 1 MiB; comprobado antes de UTF-8. |
| INVALID_UTF8 | Decodificación estricta fallida. |
| EMPTY_FILE | Texto vacío tras retirar BOM inicial. |
| INVALID_HEADER | Campos del encabezado distintos del contrato. |
| NO_RECORDS | Encabezado válido sin datos. |
| TOO_MANY_RECORDS | Se detectó un registro de datos por encima de 500. |
| MALFORMED_CSV | Comillas o saltos incompatibles con el formato. |
| EMPTY_RECORD | Registro con un solo campo vacío. |
| INVALID_COLUMNS | Cantidad de columnas diferente de dos. |
| INVALID_NAME | Campo fullName inválido. |
| INVALID_EMAIL | Campo email inválido. |
| DUPLICATE_EMAIL | Correo normalizado repetido; referencia firstRecord. |

## Garantías pendientes

Rechazar el lote de validación no equivale a garantizar atomicidad en PostgreSQL. OE-03-002B añade autorización, estado, conflictos persistidos y transacción según el contrato siguiente. La idempotencia y recuperación permanecen pendientes. No se puede declarar completa RF-ATT-002 con este validador.


## Operación interna de importación — OE-03-002B (Issue #45)

`importRegistrationCsvForOrganizer(db: NodePgDatabase, eventIdInput: unknown, bytes: Uint8Array, actor: AuthenticatedUser): Promise<RegistrationCsvImportResult>`.

1. Exige rol organizer, valida identidad tenantId/objectId y UUID del evento. Reutiliza el validador síncrono antes del primer await: no conserva una referencia mutable al contenido para interpretarla después. Un CSV inválido lanza RegistrationCsvValidationError con code INVALID_REGISTRATION_CSV y result igual al resultado inválido del validador, sin filas.
2. Abre una transacción. Lee y bloquea con SHARE usuario local, asignación organizer y evento, en ese orden. Rechaza usuarios deshabilitados, asignaciones ajenas/ausentes y eventos fuera de draft/active. No aprovisiona identidad ni personal.
3. Crea perfiles nuevos con UUID propios y campos normalizados mediante una inserción de lote. No consulta ni reutiliza perfiles por correo de otros eventos.
4. Inserta las inscripciones en orden ascendente de correo normalizado usando comparación ASCII, con status confirmed y source csv. La restricción registration_event_email_unique decide los conflictos, incluidas inscripciones canceladas. Ordenar reduce ciclos entre lotes inversos; no promete ausencia universal de deadlocks con otras operaciones.
5. Relaciona RETURNING por attendeeId, reconstruye el orden original y solo resuelve tras completar la transacción. Si se invoca dentro de una transacción externa, el resultado queda sujeto al commit de esa transacción: un savepoint no es un commit independiente.

Éxito: `{ eventId, count, items }`, cada item contiene id, eventId, status confirmed, source csv, createdAt como Date y attendee `{ id, fullName, email }`. No incluye un identificador persistido de importación. Estos datos son personales; no registrarlos indiscriminadamente.

### Errores internos y reversión

| Error | Condición |
|---|---|
| AuthenticationError | Identidad tenantId/objectId mal formada. |
| AuthorizationError | Rol global insuficiente o usuario local disabled. |
| ZodError | Identificador de evento inválido. |
| RegistrationCsvValidationError | CSV inválido; conserva errores y truncated del validador. |
| EventNotFoundError | Usuario local ausente, asignación no organizer/ausente o evento ajeno/inexistente. |
| EventRegistrationNotAllowedError | Evento closed/cancelled. |
| RegistrationEmailConflictError | Violación de registration_event_email_unique, traducida después del rollback. |
| Otros errores | Se propagan tras el manejo transaccional; no se traducen erróneamente como duplicados. |

No hay escrituras antes de autorizar. Ante un conflicto o fallo de base de datos se revierte todo el lote, incluyendo los perfiles. No se devuelven filas parcialmente importadas ni se omiten duplicados. Los fallos ajenos a la restricción específica conservan su naturaleza interna. No se definen respuestas HTTP en esta entrega.

### Concurrencia y reintentos

Dos importaciones que comparten correos no pueden confirmar ambos lotes completos; la restricción única y el rollback impiden duplicados y asistentes huérfanos. El alta manual comparte la misma restricción. Eventos distintos permiten el mismo correo con perfiles independientes. No se cambia versión ni asignaciones del evento.

No hay reintentos automáticos ni idempotencia. Reenviar un lote ya confirmado devuelve conflicto y no demuestra si una solicitud anterior fue la que lo creó. Una pérdida de conexión durante el commit puede dejar al llamador sin conocer el resultado; no se promete que todo rechazo de la promesa equivalga a ausencia de escrituras. Antes del endpoint deben definirse clave/registro de importación y reconciliación o una política explícita equivalente.

### Evidencia del incremento

37 pruebas nuevas con PostgreSQL: 27 de persistencia/autorización y 10 de concurrencia. El bloque del mantenedor incluye además 27 de alta manual, 64 aprobadas en total, con tipos y lint API correctos. Cubre límite de 500, orden devuelto, conflictos cancelled/confirmed, errores SQL reales, rollback, lotes superpuestos inversos y carrera con alta manual. Validación global posterior confirmada por el mantenedor: 1.441 pruebas aprobadas (558 API, 635 web y 248 de integración), typecheck, lint y build correctos, git diff --check limpio. Las 64 focalizadas no se suman al total global. Sin pruebas de carga, endpoint, pantalla ni simulación de caída durante commit.
