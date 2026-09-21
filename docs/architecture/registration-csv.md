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

Rechazar el lote de validación no equivale a garantizar atomicidad en PostgreSQL. OE-03-002B añade autorización, estado, conflictos persistidos y transacción según el contrato siguiente. OE-03-002C incorpora idempotencia y recuperación internas según el contrato posterior. No se puede declarar completa RF-ATT-002 con este validador.


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

La primitiva de OE-03-002B no tiene reintentos automáticos ni idempotencia. Reenviar un lote ya confirmado mediante esa primitiva devuelve conflicto y no demuestra si una solicitud anterior fue la que lo creó. Una pérdida de conexión durante el commit puede dejar al llamador sin conocer el resultado; no se promete que todo rechazo de la promesa equivalga a ausencia de escrituras. OE-03-002C añade una operación con clave y comprobante; el endpoint futuro deberá usarla y conservar su semántica de recuperación.

### Evidencia del incremento

37 pruebas nuevas con PostgreSQL: 27 de persistencia/autorización y 10 de concurrencia. El bloque del mantenedor incluye además 27 de alta manual, 64 aprobadas en total, con tipos y lint API correctos. Cubre límite de 500, orden devuelto, conflictos cancelled/confirmed, errores SQL reales, rollback, lotes superpuestos inversos y carrera con alta manual. Validación global posterior confirmada por el mantenedor: 1.441 pruebas aprobadas (558 API, 635 web y 248 de integración), typecheck, lint y build correctos, git diff --check limpio. Las 64 focalizadas no se suman al total global. Sin pruebas de carga, endpoint, pantalla ni simulación de caída durante commit.


## Idempotencia y recuperación internas — OE-03-002C (Issue #47)

### Interfaces y resultados

`importRegistrationCsvIdempotently(db, eventId, key, bytes, actor)` devuelve `RegistrationCsvReceipt`: `{ importId, completedAt: Date, result: RegistrationCsvImportResult }`. La primitiva anterior sigue disponible para compatibilidad; no se convierte automáticamente en idempotente.

`queryRegistrationCsvImport(db, eventId, key, actor)` devuelve `{ status: "completed", receipt }` o `{ status: "not_observed" }`. No espera el bloqueo asesor de una importación en curso, aunque puede esperar los bloqueos de autorización. not_observed significa únicamente que esa consulta no observó un comprobante confirmado. No acredita rollback ni autoriza cambiar de clave. Tras un fallo de comunicación se conserva la misma clave para consultar o reenviar cuando la base vuelva a responder; no hay reintentos automáticos.

### Clave, contenido y precedencia

- La clave debe ser UUID textual válido; se normaliza a minúsculas, sin aceptar cadenas arbitrarias. Ámbito: eventId + usuario local derivado de tenantId/objectId + clave. Dos eventos u organizadores tienen ámbitos independientes.
- SHA-256 de los bytes exactos, no de filas normalizadas. Cambiar BOM, saltos, orden o mayúsculas cambia la huella aunque el contenido de negocio sea equivalente. La huella es identificación de contenido, no firma ni secreto.
- Rol, identidad, eventId y clave se validan primero. El validador limita a 1 MiB antes de hash/copia; un exceso se rechaza sin consultar el registro. Se calcula huella y se copia el archivo antes del primer await, evitando cambios posteriores del llamador.
- Dentro de la transacción se comprueban permisos y se coordina la clave. Si existe: misma huella recupera el snapshot; otra huella da REGISTRATION_CSV_KEY_CONFLICT, incluso si el nuevo contenido acotado es CSV inválido.
- Sin comprobante, un CSV inválido produce RegistrationCsvValidationError con los diagnósticos originales y no reserva la clave. Un intento revertido puede usar esa clave de nuevo, incluso con contenido corregido; una clave confirmada no se reutiliza para otro contenido.

### Transacción y concurrencia

READ COMMITTED y bloqueos SHARE en orden usuario, asignación, evento. La importación idempotente rechaza una transacción externa con otro aislamiento. La consulta usa READ COMMITTED al abrir su propia transacción; si se anida, conserva la visibilidad del padre y not_observed sigue sin probar ausencia de trabajo.

Un bloqueo asesor transaccional usa hashtextextended del prefijo versionado y del ámbito completo. Tras esperar, una sentencia nueva consulta el comprobante confirmado del ganador. Una colisión de hash solo serializa ámbitos adicionales: las consultas y la restricción única utilizan las columnas exactas, sin compartir resultados.

Si no hay comprobante, se llama a la importación anterior dentro de un savepoint, se serializa el resultado y se inserta registration_csv_import en la transacción externa. Todo confirma junto; un fallo del comprobante revierte también perfiles e inscripciones. El resultado de una llamada anidada sigue sujeto al commit de su transacción padre.

Dos solicitudes de igual clave/contenido recuperan un solo lote; si la primera revierte, la que esperaba puede importar. Igual clave y contenido distinto no confirma dos resultados incompatibles. Claves distintas siguen sujetas a la unicidad de correo por evento. No se prometen ausencia universal de deadlocks, espera ilimitada ni disponibilidad; un timeout o una desconexión dejan recuperación posterior con la misma clave.

### Autorización, estados e historial

Importar, consultar y repetir exigen permisos actuales. Usuario deshabilitado se rechaza; ausencia de usuario/asignación organizer/evento se trata como EventNotFoundError. No se recupera información ajena por conocer una clave.

Un evento closed/cancelled admite recuperación de una operación ya confirmada si permanecen los permisos. Una clave nueva mantiene la regla draft/active de la importación anterior. Sin comprobante en un evento cerrado, la consulta devuelve not_observed, mientras que una nueva importación falla por estado.

El JSON guarda versión 1, eventId, count e items con fechas ISO. Se recuperan Date, IDs, orden y datos del resultado original. Si una inscripción se cancela o un perfil cambia después, el comprobante no cambia: consultar el estado actual corresponde a los GET existentes. Un snapshot mal formado genera INVALID_STORED_REGISTRATION_CSV_RESULT sin exponer su contenido y sin insertar otro lote.

### Conservación y seguridad

No se guardan archivo original ni token. El snapshot sí contiene datos personales; no debe registrarse ni exponerse sin autorización. No hay TTL ni purga automática, y las claves confirmadas se conservan con el historial. La futura política de eliminación debe coordinar privacidad y garantías de replay: borrar solo la clave no es una limpieza inocua. Las FK a evento/usuario son restrictivas. Este incremento no implementa gestión de retención o borrado.

### Evidencia y límites

35 pruebas nuevas: persistencia de comprobante, recuperación entre conexiones, snapshot histórico, estados, aislamiento por evento/organizador, permisos actuales y revocación concurrente, contenido diferente, rollback, espera de commit/rollback, bytes mutables, límites y restricciones SQL. El bloque del mantenedor suma 72 con las 37 existentes de importación; se solapan y no deben sumarse a la futura suite global.

Migración aplicada y segunda ejecución correcta; tipos y lint API aprobados. Validación global confirmada por la salida del mantenedor: **1.476 pruebas aprobadas** (558 API, 635 web y 283 de integración PostgreSQL), typecheck, lint y build globales correctos. git diff --check sin errores de espacios, con aviso de normalización CRLF a LF en schema.ts. Las 72 pruebas focalizadas se solapan con la suite global y no se suman nuevamente. Pendientes commit, PR, CI y merge. La pérdida de respuesta se simula descartando el resultado confirmado y recuperándolo desde otra conexión; no se cortó físicamente la red durante COMMIT. No hay endpoint HTTP, interfaz CSV, polling ni pruebas de carga.
