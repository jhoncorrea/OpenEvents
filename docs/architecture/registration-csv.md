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

Rechazar el lote de validación no equivale a garantizar atomicidad en PostgreSQL. La futura importación debe autorizar por evento, verificar estado, tratar duplicados persistidos y carreras, y definir transacción e idempotencia. No se puede declarar completa RF-ATT-002 con este validador.
