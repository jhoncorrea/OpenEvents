# Autenticación de API — OE-01-002A

Implementación del Issue #19: validación de access tokens y roles de aplicación con Microsoft Entra External ID. Actualizado en OE-02-001B (Issue #21) y OE-02-001C (Issue #23) para documentar la creación de eventos desde la API y la web.

## Estado y alcance

Implementado:

- Validación de configuración de autenticación al arrancar la API.
- Validación de access tokens mediante `jose`.
- Control reutilizable de autenticación y autorización para Fastify.
- Ruta protegida `GET /api/v1/auth/me`.
- Ruta `POST /api/v1/events` protegida con el rol `organizer` (OE-02-001B).
- Solicitud de un access token desde la web mediante MSAL.
- Consulta de identidad y roles mediante el botón «Comprobar acceso».
- Formulario web de creación habilitado únicamente tras comprobar `organizer`, con carga diferida y borradores por cuenta (OE-02-001C).
- Pruebas automatizadas de configuración, verificación de tokens, controles HTTP y cliente web.
- Comprobación manual satisfactoria con un token real y el rol `organizer`.

Límites actuales:

- `GET /health` continúa público.
- `GET /api/events/current` y `POST /api/check-ins` son rutas demo sin autenticación.
- La interfaz demo sigue visible sin iniciar sesión.
- Las demás operaciones HTTP de eventos y la protección de las demás funciones web siguen pendientes.
- Se guarda la asignación del creador en `event_staff`; la autorización de futuras consultas y ediciones por evento sigue pendiente.
- Los roles de aplicación no conceden automáticamente acceso a un evento concreto.

## Configuración de la API

Estas variables de autenticación son obligatorias al arrancar:

| Variable | Propósito |
|---|---|
| `ENTRA_TENANT_ID` | Tenant permitido; se compara con `tid`. |
| `ENTRA_API_CLIENT_ID` | Audiencia esperada del access token. |
| `ENTRA_WEB_CLIENT_ID` | Aplicación cliente permitida; se compara con `azp`. |
| `ENTRA_ISSUER` | Emisor esperado del token. |
| `ENTRA_JWKS_URI` | Dirección HTTPS de las claves públicas de Entra. |

La API carga `apps/api/.env` si existe. Las variables también pueden proporcionarse mediante el entorno.

Desde OE-02-001B, el servidor también exige `DATABASE_URL` y comprueba PostgreSQL antes de escuchar. Esta comprobación es independiente de la autenticación; las migraciones deben aplicarse por separado.

Si falta una variable obligatoria o su formato es inválido, el arranque falla antes de escuchar solicitudes.

El archivo `.env.example` contiene la configuración pública de referencia. Los archivos `.env` privados no se versionan.

El verificador se crea una vez al arrancar y reutiliza el conjunto remoto de claves. Validar la configuración no implica comprobar la disponibilidad de Entra durante el arranque.

## Validación del access token

El verificador:

- Comprueba la firma con las claves públicas de Entra.
- Permite únicamente el algoritmo `RS256`.
- Valida el emisor y la audiencia configurados.
- Exige los claims `exp`, `iat`, `nbf`, `sub`, `oid`, `tid`, `azp` y `ver`.
- Valida expiración y momento de inicio de validez con 5 segundos de tolerancia.
- Exige `ver` igual a `2.0`.
- Comprueba el tenant permitido.
- Comprueba la aplicación cliente permitida.
- Exige `access_as_user` como un scope completo dentro de `scp`.
- Devuelve únicamente la identidad y los roles reconocidos.

El scope requerido por la API es fijo: `access_as_user`.

Los fallos operativos del servicio de claves se propagan desde el verificador y el control HTTP responde con un error 500 genérico.

## Roles de aplicación

Roles reconocidos:

- `admin`
- `organizer`
- `checkin_operator`

Los roles desconocidos se ignoran y los duplicados se eliminan. Un token sin roles produce una lista vacía.

`requireAnyRole` exige al menos uno de los roles expresamente permitidos por la ruta:

- Una lista vacía de roles permitidos deniega el acceso.
- `admin` no hereda permisos de otros roles.
- Omitir la restricción de roles en `createAuthGuard` exige autenticación válida, pero no un rol específico.

Las pruebas de autenticación utilizan una ruta temporal para comprobar estas restricciones. Esa ruta no se registra en la aplicación normal.

La ruta real `POST /api/v1/events` utiliza `createAuthGuard` con `["organizer"]`. Una identidad válida sin ese rol recibe 403, aunque tenga `admin` o `checkin_operator`. Esta comprobación precede al procesamiento del cuerpo y a la creación del evento. Consulta el [contrato de la API](api-contract.md) para conocer OE-02-001B.

## GET /api/v1/auth/me

Requiere un access token enviado mediante:

```http
Authorization: Bearer <access-token>
```

La ruta aplica las validaciones de firma, claims, aplicación cliente y scope. No exige un rol específico.

Respuesta `200 OK`, con valores de identidad ilustrativos:

```json
{
  "tenantId": "22222222-2222-4222-8222-222222222222",
  "objectId": "11111111-1111-4111-8111-111111111111",
  "subject": "example-subject",
  "roles": ["organizer"]
}
```

El token no forma parte de la respuesta.

### Errores actuales

| HTTP | Código | Situación |
|---|---|---|
| 401 | `UNAUTHORIZED` | Encabezado Bearer ausente o mal formado, o token inválido. |
| 403 | `FORBIDDEN` | Aplicación cliente no permitida o scope insuficiente. |
| 500 | `INTERNAL_SERVER_ERROR` | Fallo operativo o inesperado durante la verificación. |

Cuando una ruta utiliza además restricciones de roles, no cumplirlas produce 403.

El formato implementado es plano:

```json
{
  "code": "UNAUTHORIZED",
  "message": "Se requiere un token de acceso válido."
}
```

Las respuestas del control incluyen `Cache-Control: no-store`. Las respuestas 401 incluyen `WWW-Authenticate: Bearer`.

El contenedor `error` y el campo `correlationId` descritos en el contrato objetivo del MVP no forman parte todavía de estas respuestas.

El control no devuelve ni registra el error original del verificador. Los fallos inesperados generan un registro con código y mensaje genéricos. La configuración del logger redacta `req.headers.authorization`.

## Configuración y comportamiento de la web

La web conserva las variables de sesión existentes y requiere:

```dotenv
VITE_API_URL=http://localhost:3001
VITE_ENTRA_API_SCOPE=api://cd81b6dc-e10f-4240-bf69-7df9a49c514a/access_as_user
```

El scope anterior corresponde a la API de Development. Otros entornos deben utilizar su propio identificador.

El validador actual del scope admite el formato `api://<UUID>/access_as_user`.

Los clientes de identidad y creación requieren `VITE_API_URL`; no aplican un valor predeterminado. Admite HTTPS o HTTP en localhost, sin credenciales, query ni fragmento.

El inicio de sesión solicita `openid` y `profile`. El botón «Comprobar acceso» solicita por separado el scope de la API:

1. MSAL intenta obtener el access token mediante `acquireTokenSilent`.
2. Si se necesita interacción, utiliza `acquireTokenRedirect`.
3. Al regresar de la redirección, el usuario vuelve a pulsar «Comprobar acceso».
4. La web envía el access token a `/api/v1/auth/me`.
5. Muestra los roles devueltos por la API.

La solicitud HTTP tiene un tiempo límite de 15 segundos y rechaza redirecciones. La web valida el formato de la respuesta y muestra mensajes controlados ante errores.

MSAL administra su caché en `sessionStorage`. La aplicación no imprime el token, no lo muestra en pantalla y no crea almacenamiento adicional para él.

Las variables `VITE_*` son públicas. La SPA no utiliza secretos de cliente.

## Creación desde la web — OE-02-001C

`SessionControls` utiliza los roles devueltos por la API para habilitar el formulario con `organizer`. No se infieren permisos a partir del nombre de la cuenta o del rol `admin`. Mientras se comprueban permisos, o si falla la comprobación, no se permite crear. La API conserva la autorización definitiva de cada POST.

Al cambiar de cuenta se reinician los permisos y el estado del formulario; las respuestas de comprobación de acceso de una cuenta anterior no habilitan el formulario de la nueva. Después de abrirse, el formulario permanece montado, oculto y deshabilitado durante nuevas comprobaciones para conservar sus campos.

El cliente de creación obtiene un token con `acquireTokenSilent`. Si se requiere interacción, no envía la creación ni inicia una redirección automáticamente: invalida el permiso comprobado y solicita volver a «Comprobar acceso». Esta comprobación puede usar `acquireTokenRedirect`.

Los borradores usan un espacio propio de `sessionStorage`, separado por identificadores de cuenta. Contienen únicamente los seis campos del formulario, la versión y una marca de resultado incierto. No almacenan tokens adicionales. La marca se guarda antes de intentar la creación para conservar la advertencia si se interrumpe la página. Una confirmación válida elimina el borrador; el cierre de sesión intenta eliminarlo antes de redirigir.

Si falla el guardado se bloquean la creación y la comprobación que podría redirigir. Si falla la eliminación del borrador antes de salir, el cierre de sesión no se inicia y se muestra un mensaje. Los borradores son almacenamiento temporal del navegador y no una garantía de recuperación.

Los errores 401/403 o de adquisición del token invalidan el permiso comprobado en la interfaz. Un 409 conserva los campos. Los fallos de red, 500 y respuestas inesperadas se consideran resultados inciertos; no hay reintentos automáticos ni garantía de idempotencia. El usuario debe verificar el resultado antes de reenviar.

La carga diferida del formulario reduce el JavaScript inicial y muestra un estado de carga o un mensaje para recargar si falla su descarga. La carga diferida no amplía el alcance de las rutas demo. La asignación del creador en la API se incorpora en OE-01-002B.

## Validación

Pruebas relevantes:

- API: `auth-config.test.ts`.
- API: `auth/verify-access-token.test.ts`.
- API: `auth/http-auth.test.ts`.
- API: `app.test.ts`.
- Web: `auth-config.test.ts`.
- Web: `api-auth.test.ts`.
- Web: `event-form.test.ts`, `api-events.test.ts`, `event-draft.test.ts`, `CreateEventForm.test.tsx` y `SessionControls.test.tsx` (135 pruebas nuevas de OE-02-001C).

Estas pruebas no necesitan conectarse a Entra. El verificador se prueba con claves y tokens locales; las pruebas HTTP y del cliente web utilizan dependencias simuladas.

Comprobación manual realizada:

1. Arrancar la API y la web con la configuración de Development.
2. Iniciar sesión con la cuenta de prueba.
3. Pulsar «Comprobar acceso».
4. Verificar los mensajes «Acceso a la API verificado» y «Roles: organizer».

Esta comprobación confirma el acceso a `/api/v1/auth/me` con un token real. No demuestra autorización por evento ni protección de las rutas demo.

En OE-02-001C se comprobó además la creación desde el formulario con token real y rol `organizer`, el conflicto de slug conservando los campos, la recuperación del borrador tras recarga y su limpieza al cerrar sesión. No se realizó una prueba manual de renovación interactiva forzada ni de fallo de red durante el POST.

## Identidad local y asignación del creador — OE-01-002B

Seguimiento: Issue #25, rama `feat/25-event-organizer-assignment`.

La creación HTTP utiliza `createEventForOrganizer`. La identidad procede del access token verificado, no del cuerpo de la solicitud. Se exige el rol global `organizer`, sin jerarquía implícita para `admin`.

- `user.external_subject` guarda `entra:<tenantId>:<objectId>` con ambos UUID en minúsculas. El correo y `sub` no se utilizan para asociar permisos. Un cambio de `sub` no crea otro usuario si se mantienen tenant y objeto.
- La restricción única de identidad y `ON CONFLICT DO NOTHING` permiten reutilizar al usuario sin modificar su perfil ni reactivar una cuenta deshabilitada.
- Se bloquea la fila del usuario mediante `SELECT ... FOR UPDATE` y se comprueba su estado. Un usuario `disabled` recibe 403 `FORBIDDEN` al crear.
- El usuario nuevo, el evento en `draft` y su asignación `organizer` en `event_staff` se guardan dentro de una transacción. Un fallo o conflicto revierte las escrituras de esa operación; las filas anteriores se conservan.
- Los usuarios nuevos tienen correo y nombre nulos. La migración `0001_absent_tigra.sql` permite esos nulos y conserva los datos existentes. No cambia el correo obligatorio de los asistentes.
- El cuerpo y la respuesta de creación conservan su formato; no se acepta un creador elegido por el cliente. No se devuelve el perfil local en la respuesta.

### Datos anteriores y límites

Los eventos existentes sin `event_staff` permanecen sin asignación. No se atribuyen al siguiente usuario que inicia sesión o crea un evento. Antes de habilitar su gestión deberán asignarse mediante un procedimiento explícito que verifique al responsable. Esta entrega no implementa ese procedimiento.

Los valores antiguos de `external_subject` no se convierten ni se relacionan automáticamente por correo. Cualquier identidad anterior con otro formato requiere una revisión explícita antes de asociarla a una identidad de Entra.

`GET /api/v1/auth/me` continúa devolviendo los claims y roles verificados; no consulta el estado del usuario local. Por ello puede mostrar `organizer` aunque la creación responda 403 por usuario deshabilitado. El bloqueo local de esta entrega se aplica a la creación de eventos, no a todas las rutas.

Guardar la asignación prepara la autorización por evento, pero todavía no implementa consultas o ediciones que la apliquen. No se añaden pantallas de administración de personal, auditoría completa ni recursos Azure. Las rutas demo conservan su comportamiento.

### Evidencia

Pasaron 12 pruebas de la operación, 3 de concurrencia con conexiones independientes y 10 HTTP con PostgreSQL. También pasaron 24 pruebas HTTP aisladas de eventos, 16 del control de autenticación y 1 de salud; typecheck y lint aprobados en las ejecuciones correspondientes.

La comprobación manual creó `prueba-organizador-001` desde la web con una sesión real. El identificador mostrado coincidió con PostgreSQL y la consulta devolvió una asignación `organizer` para el evento en estado `draft`.

Las pruebas HTTP de integración utilizan tokens simulados y PostgreSQL real. Las pruebas con una conexión revierten una transacción exterior de Drizzle; las de concurrencia hacen commits y eliminan únicamente sus registros de prueba.

## Consulta autorizada por evento — OE-02-002A

Issue #27 añade GET de listado y detalle. Se exige `organizer` en el token y en `event_staff`, junto con usuario local activo. Admin y operador no tienen acceso implícito. La identidad se resuelve con `entra:<tenantId>:<objectId>` normalizado, nunca con parámetros del cliente, correo o sub.

Las consultas no crean usuarios ni asignaciones. Sin usuario local, la lista está vacía y el detalle devuelve 404. Con usuario deshabilitado, ambas operaciones devuelven 403. La fila local se bloquea con FOR SHARE durante la transacción de lectura; cada consulta filtra las asignaciones autorizadas en SQL.

Detalle ajeno e inexistente tienen idéntica respuesta 404. El cursor de listado solo define una posición; no concede permisos. La API no devuelve perfiles ni asignaciones. Los eventos antiguos sin asignación continúan fuera del listado.

El bloqueo local ahora cubre creación y estas consultas. `/api/v1/auth/me` sigue devolviendo claims sin consultar el estado local; las rutas demo conservan su comportamiento. La edición y administración de personal siguen pendientes.

Validación: 41 pruebas HTTP aisladas, 16 de operaciones PostgreSQL y 12 HTTP con PostgreSQL. Estas últimas simulan el verificador de Entra. La prueba manual con token real recuperó `prueba-organizador-001` y confirmó respuestas 200, 401, 404 y 400. No se probó manualmente otra cuenta ni una segunda página; el aislamiento y la paginación están cubiertos automáticamente.

## Consultas desde la web — OE-02-002B

Issue #29 añade «Mis eventos» únicamente tras comprobar `organizer`. La API conserva la autorización definitiva por evento; ni la visibilidad del componente ni un cursor conceden permisos.

El cliente usa la cuenta seleccionada y `acquireTokenSilent`. Si se requiere interacción, no redirige automáticamente y solicita comprobar nuevamente el acceso. Los errores de autenticación, 401 y 403 invalidan el acceso comprobado y limpian listado y detalle. `/api/v1/auth/me` sigue sin consultar el estado del usuario local.

El componente se desmonta cuando pierde acceso o la sesión está ocupada. Cancela las solicitudes pendientes y descarta respuestas tardías, también al cambiar de cuenta. Volver desde un detalle pendiente cancela esa consulta. Los eventos consultados permanecen solo en memoria; los borradores del formulario mantienen su mecanismo separado por cuenta.

Las pruebas del cliente (43), de «Mis eventos» (18) y de sesión (24, con 8 nuevas) cubren errores, aislamiento, cancelación y recarga tras creación. Las pruebas web simulan MSAL y la API. La comprobación manual confirmó listado y detalle con la cuenta organizer real; no se declara una prueba manual entre dos cuentas.

## Edición autorizada — OE-02-002C

Issue #31 añade PATCH con organizer global, identidad local activa y asignación organizer. No se aprovisionan usuarios al editar y no se admiten identidades del cuerpo. Usuario desconocido y evento ajeno/inexistente producen el mismo 404; usuario deshabilitado produce 403. Admin no hereda permisos de organizer.

La transacción bloquea primero el usuario con FOR SHARE, después su asignación con FOR SHARE y finalmente el evento con FOR UPDATE. Las actualizaciones o eliminaciones incompatibles de esas filas esperan: una edición ya autorizada puede completar antes de una revocación concurrente. Una revocación confirmada antes de adquirir el bloqueo impide editar. Las futuras operaciones de administración deben coordinar el orden de bloqueos y gestionar posibles deadlocks.

Solo se editan borradores y expectedVersion debe coincidir. Los bloqueos son breves, limitados a la transacción; no se mantienen durante el tiempo que una persona completa un formulario. La versión detecta cambios entre lectura y escritura y no es una credencial.

Evidencia: 18 pruebas de persistencia, 3 de concurrencia, 27 HTTP aisladas y 16 HTTP con PostgreSQL. Las HTTP de integración simulan Entra; la prueba manual usa sesión real y verifica creación, edición, versión obsoleta, intervalo inválido y ausencia de token. No se declara una comprobación manual entre cuentas ni una prueba automatizada específica de revocación simultánea. La auditoría completa y el rate limiting quedan pendientes.

## Edición desde la web — OE-02-002D

Issue #33 muestra el editor después de comprobar organizer y consultar un borrador. Este control de interfaz no concede autorización: cada PATCH aplica los controles de OE-02-002C en el servidor. Version es una precondición de concurrencia, nunca una credencial.

El cliente obtiene el token para la cuenta seleccionada y comprueba que sigue siendo la misma antes y después del envío. El desmontaje cancela solicitudes y descarta respuestas tardías. Cambiar de cuenta, iniciar la salida o una interacción de sesión retira el editor. Un error de autenticación, 401 o 403 invalida el acceso comprobado y elimina los datos de consulta y edición. Un conflicto 409 conserva el editor y no invalida la sesión.

Los datos del editor no se escriben en almacenamiento del navegador. El borrador de creación mantiene su mecanismo independiente por cuenta. Mientras se edita se oculta y deshabilita la creación, y se deshabilita Comprobar acceso para evitar descartar la edición por esa acción. Cerrar sesión sigue disponible; cancelar la espera no implica deshacer un PATCH enviado.

Pruebas web con MSAL/API simulados verifican cuenta, scope, cancelación, respuestas tardías y recuperación de acceso. La comprobación manual utilizó una cuenta real en dos pestañas; no constituye una prueba manual de aislamiento entre dos identidades. Auditoría completa, rate limiting y pruebas de carga siguen pendientes.

## Inscripción autorizada — OE-03-001A

Issue #35 utiliza el guard de access token y rol organizer. La identidad local se deriva de tenantId y objectId verificados, normalizados; nunca de campos del cuerpo. Admin y checkin_operator no heredan organizer. Un usuario desconocido no se crea durante la inscripción.

En la transacción se bloquean con FOR SHARE, en orden, usuario, asignación event_staff y evento. Se verifica usuario activo, rol organizer de la asignación y estado draft/active. Una revocación o cierre confirmado antes de obtener el bloqueo impide la operación; una inscripción que ya mantiene los bloqueos puede terminar antes del cambio incompatible. No existe revocación retroactiva. Las futuras operaciones de administración deben coordinar este orden y tratar esperas/deadlocks.

El correo no es una identidad global ni prueba de propiedad. No se consultan ni reutilizan perfiles de otros eventos. Solo un organizador autorizado puede recibir el conflicto por correo de su evento. Respuestas ajenas/inexistentes comparten 404. Los errores del parser y de persistencia se reducen a mensajes controlados; el log de error de inscripción registra un código genérico, no el cuerpo ni el error SQL.

Las pruebas incluyen duplicados concurrentes y operaciones esperando un cierre, una deshabilitación o una eliminación de asignación. La prueba manual utilizó una identidad real y un evento ficticio propio; aislamiento entre organizadores se verificó automáticamente, no con dos cuentas reales. Rate limiting, auditoría operativa, pruebas de carga y recuperación de resultados inciertos siguen pendientes.


## Inscripción desde la web — OE-03-001B

Issue #37 habilita el formulario después de comprobar organizer y consultar el evento asignado. La lectura previa y los controles visuales son ayudas de interfaz; cada POST revalida identidad, permisos y estado en la API. Ni eventId ni correo aportados por el cliente conceden permisos.

El envío usa la cuenta seleccionada y el scope configurado. Se comprueba la cuenta antes y después de la llamada; el desmontaje aborta la espera e ignora respuestas tardías. Cambio de cuenta, cierre de sesión, interacción de MSAL o pérdida de acceso retiran los datos del asistente. No se guardan esos datos en almacenamiento del navegador; el borrador de creación de eventos conserva su mecanismo separado.

El formulario no muestra perfiles asociados a un correo duplicado. 401/403 invalidan el acceso comprobado y 404 retira el evento. Durante la inscripción se oculta la creación y se deshabilita Comprobar acceso, manteniendo disponible cerrar sesión. Abortar no deshace una escritura ya aceptada.

Las pruebas automatizadas de web simulan API/MSAL y verifican selección de cuenta, scope, cancelación y respuestas tardías. La comprobación manual mostró altas y duplicado con una cuenta real; no acredita aislamiento manual entre dos cuentas. El bloqueo de resultados inciertos es local y temporal; quedan pendientes reconciliación autorizada, auditoría, rate limiting y pruebas de carga.
