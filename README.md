# OpenEvents

OpenEvents es una plataforma open source para gestionar la operación de eventos: asistentes, códigos QR, check-in y métricas de asistencia.

## Estado

La web incorpora inicio y cierre de sesión con Microsoft Entra External ID mediante MSAL. La API valida access tokens y dispone de controles reutilizables de roles. La ruta protegida `GET /api/v1/auth/me` devuelve la identidad y los roles del usuario. El botón «Comprobar acceso» solicita un access token para la API y consulta esa ruta; se verificó manualmente el rol `organizer` con un token real.

`GET /health` sigue público. Las rutas demo `GET /api/events/current` y `POST /api/check-ins`, así como la interfaz demo, siguen disponibles sin autenticación. La asignación del creador en `event_staff` está implementada; las consultas y la edición de borradores en API utilizan esa asignación. La web permite editar borradores y revisar conflictos de versión.

Desarrollo incremental del MVP. La interfaz web y las rutas de demostración mantienen el flujo inicial de check-in. Ya están implementados el esquema PostgreSQL, las migraciones versionadas y la operación interna de creación de eventos con persistencia, verificada mediante pruebas de integración.

`POST /api/v1/events` crea eventos persistidos con un token válido y el rol `organizer`. El servidor asigna el estado `draft`. La web permite crear eventos mediante un formulario habilitado después de comprobar el rol `organizer`. La creación asigna al organizador en `event_staff`; la API permite listar y consultar los eventos asignados. La web permite listar y consultar esos eventos. La API permite editar borradores con control de versión; la web incorpora el formulario y la recuperación explícita de conflictos.

La web también permite registrar asistentes en eventos asignados en estado `draft` o `active`, con confirmación, rechazo de duplicados y bloqueo de reenvíos de resultado incierto. La autorización definitiva permanece en la API.

La API también permite listar y consultar inscripciones de eventos asignados, con paginación por cursor y autorización por evento (OE-03-001C). La pantalla web de consulta sigue pendiente.

## Arquitectura inicial

- `apps/web`: aplicación web mobile-first con React y Vite.
- `apps/api`: API REST modular con Fastify.
- `docs/adr`: decisiones de arquitectura.
- `docs/project-management`: planificación y registro de sesiones.

PostgreSQL local, el esquema inicial con migraciones versionadas, la sesión web y la autenticación de la API ya están disponibles. La creación HTTP de eventos ya está conectada a la persistencia y exige autorización de Organizador. Los demás endpoints de negocio, sus políticas de acceso por evento y el despliegue en Azure se incorporarán en incrementos posteriores. No se usarán microservicios en el MVP.

## Requisitos

- Node.js 22 o superior.
- pnpm 11.
- Docker Desktop con Docker Compose.

## Ejecutar localmente

Antes del primer arranque, configura las variables de autenticación de la API y de la web siguiendo la sección «Variables de entorno». Configura también `DATABASE_URL`, inicia PostgreSQL y aplica las migraciones siguiendo las secciones correspondientes antes de ejecutar `pnpm dev`. Para iniciar sesión y comprobar el acceso real necesitas acceso al tenant de Microsoft Entra External ID configurado y conexión a internet.

```bash
pnpm install
pnpm dev
```

- Web: `http://localhost:5173`
- API: `http://localhost:3001`
- Salud de API: `http://localhost:3001/health`

Código QR de demostración: `OE-2027-001`.

### Variables de entorno

La API exige las cinco variables `ENTRA_*` y `DATABASE_URL` indicadas en la tabla. Valida la configuración y comprueba la conexión a PostgreSQL antes de escuchar solicitudes. El archivo `.env` es opcional si las variables ya están proporcionadas por el entorno. `PORT` y `HOST` conservan sus valores predeterminados.

La web requiere las cinco variables `VITE_ENTRA_*`, incluido el scope de la API. Pueden proporcionarse mediante `apps/web/.env` o mediante el entorno al ejecutar Vite. Configura también `VITE_API_URL`: los clientes de identidad, creación, consulta y edición no aplican un valor predeterminado.

Para crear los archivos locales en PowerShell, ejecuta los siguientes comandos solamente si los archivos de destino todavía no existen. Si ya existen, edítalos conservando su configuración:

```powershell
Copy-Item .\apps\api\.env.example .\apps\api\.env
Copy-Item .\apps\web\.env.example .\apps\web\.env
```

El primer comando crea la configuración local de la API a partir de su ejemplo. El segundo hace lo mismo para la aplicación web. Los archivos `.env` resultantes están excluidos de Git y no deben versionarse.

| Aplicación | Variable | Valor predeterminado | Descripción |
|---|---|---|---|
| API | `PORT` | `3001` | Puerto TCP utilizado por Fastify. Debe ser un entero entre 1 y 65535. |
| API | `HOST` | `127.0.0.1` | Dirección en la que escucha la API. |
| API | `ENTRA_TENANT_ID` | Sin valor predeterminado | UUID del tenant permitido. |
| API | `ENTRA_API_CLIENT_ID` | Sin valor predeterminado | UUID de la API, usado como audiencia esperada. |
| API | `ENTRA_WEB_CLIENT_ID` | Sin valor predeterminado | UUID de la aplicación cliente permitida. |
| API | `ENTRA_ISSUER` | Sin valor predeterminado | Emisor esperado; URL HTTPS sin credenciales, query ni fragmento. |
| API | `ENTRA_JWKS_URI` | Sin valor predeterminado | URL HTTPS de las claves públicas de Entra. |
| Web | `VITE_API_URL` | Sin valor predeterminado para identidad, creación, consulta y edición | URL base de la API; en desarrollo, `http://localhost:3001`. Para consultar identidad, crear, consultar y editar eventos admite HTTPS o HTTP en localhost, sin credenciales, consulta ni fragmento. |
| API / herramientas de base de datos | `DATABASE_URL` | Sin valor predeterminado | URL de PostgreSQL requerida para arrancar la API, aplicar migraciones y ejecutar pruebas de integración. |
| Web | `VITE_ENTRA_CLIENT_ID` | Sin valor predeterminado | Identificador de la aplicación web registrada como SPA en Entra. |
| Web | `VITE_ENTRA_TENANT_ID` | Sin valor predeterminado | Identificador del tenant externo de Entra. |
| Web | `VITE_ENTRA_TENANT_SUBDOMAIN` | Sin valor predeterminado | Subdominio del tenant, sin protocolo ni sufijo; por ejemplo, `openeventsdevjhon`. |
| Web | `VITE_ENTRA_REDIRECT_URI` | Sin valor predeterminado | URL de retorno registrada para la SPA; en desarrollo, `http://localhost:5173/`. |
| Web | `VITE_ENTRA_API_SCOPE` | Sin valor predeterminado | Scope completo de la API con formato `api://<API client ID>/access_as_user`. |

La API carga opcionalmente `apps/api/.env` y valida la configuración antes de iniciar. Vite carga `apps/web/.env`; la web comprueba las variables de autenticación al iniciar en el navegador. La consulta de identidad valida `VITE_API_URL` antes de solicitar un token.

Si falta una variable de autenticación o su formato es inválido, la API rechaza el arranque o la web muestra un error de configuración, según la aplicación afectada. Después de modificar un `.env`, reinicia el servidor correspondiente.

Los identificadores de aplicación y tenant son configuración pública. La aplicación web no utiliza un secreto de cliente.

`DATABASE_URL` se valida al arrancar la API. El servidor ejecuta `SELECT 1` antes de escuchar; si PostgreSQL no está disponible, el arranque falla y se intenta cerrar el pool. La generación de migraciones no requiere conexión a PostgreSQL.

El pool admite hasta 5 conexiones, con espera de conexión y consulta de 5 segundos, `statement_timeout` de 5 segundos y descarte de conexiones inactivas tras 30 segundos. SIGINT y SIGTERM inician el cierre de Fastify; su hook `onClose` libera el pool. Solicitar varias veces el cierre del pool reutiliza la misma operación.

`/health` permanece público y no consulta PostgreSQL en cada solicitud. La comprobación de conectividad al arrancar no verifica que las migraciones estén aplicadas.

Las variables con prefijo `VITE_` son públicas y quedan incluidas en el código enviado al navegador. Nunca deben contener contraseñas, tokens ni otros secretos.

En producción, las variables deben ser proporcionadas por la plataforma de ejecución. Las variables del entorno del sistema tienen prioridad sobre el archivo `.env`.

### Sesión web — OE-01-003A

La sesión utiliza `@azure/msal-browser` y `@azure/msal-react` para integrar la web con Microsoft Entra External ID.

#### Configuración de identidad en Development

- Tenant externo: `OpenEvents Development`.
- Dominio inicial: `openeventsdevjhon.onmicrosoft.com`.
- Aplicación web: `openevents-web-dev`.
- Plataforma de la aplicación web: Single-page application (SPA).
- URI de redirección local: `http://localhost:5173/`.
- Flujo de registro e inicio de sesión: `openevents-signin-dev`, asociado a la aplicación web.
- Método configurado: correo electrónico y contraseña.

La aplicación `openevents-api-dev` expone el permiso delegado `access_as_user`, concedido a la aplicación web mediante consentimiento administrativo. El inicio de sesión declara `openid` y `profile`. El botón «Comprobar acceso» solicita por separado el scope completo de la API:

```text
api://cd81b6dc-e10f-4240-bf69-7df9a49c514a/access_as_user
```

La configuración de Entra se realizó manualmente en el portal; todavía no está automatizada mediante infraestructura como código.

#### Funcionamiento local

Abre la web desde `http://localhost:5173/`. Vite utiliza el puerto `5173` con `strictPort`, de modo que falla si el puerto está ocupado en lugar de cambiar automáticamente a otro.

El botón «Iniciar sesión» redirige a Microsoft Entra. Al regresar, la web procesa la respuesta y muestra el nombre de la cuenta conectada.

El botón «Cerrar sesión» inicia la salida mediante Entra y utiliza la URL configurada para volver a la aplicación.

MSAL utiliza `sessionStorage` como caché. La aplicación recupera la cuenta disponible al recargar la misma pestaña.

Los botones de sesión, comprobación de acceso y creación comparten un bloqueo para evitar operaciones simultáneas. Los fallos muestran mensajes controlados sin presentar tokens ni errores originales de Entra o de la API al usuario.

#### Validación

Las pruebas de `auth-config.test.ts` comprueban la configuración válida y el rechazo de variables ausentes, identificadores inválidos, subdominios incorrectos, URI de retorno no permitidas y scopes mal formados. Las pruebas de `api-auth.test.ts` comprueban la solicitud del token, el envío a la API, la redirección cuando se requiere interacción y el manejo de errores. No se conectan a Entra.

La comprobación manual del flujo incluye:

1. Iniciar sesión desde la web y comprobar el nombre de la cuenta.
2. Recargar la página y comprobar que se conserva la sesión.
3. Cerrar sesión y comprobar que vuelve a mostrarse «Iniciar sesión».
4. Iniciar sesión nuevamente.
5. Pulsar «Comprobar acceso». Si se requiere una redirección a Microsoft, completarla y volver a pulsar el botón al regresar.
6. Comprobar «Acceso a la API verificado» y los roles devueltos. En Development se verificó manualmente `organizer`.

Las pruebas y la compilación no necesitan iniciar sesión en Azure. Para utilizar la web compilada, las variables `VITE_ENTRA_*` deben proporcionarse durante la compilación, porque Vite las incorpora al código del navegador.

#### Alcance pendiente

La sesión web y la consulta protegida de identidad están implementadas. La interfaz de demostración sigue visible sin iniciar sesión y sus endpoints continúan abiertos. El formulario de creación está restringido en la web; la protección de las demás funciones operativas y su autorización siguen pendientes. La creación HTTP de eventos ya exige el rol `organizer`.

### Autenticación de API — OE-01-002A

`GET /api/v1/auth/me` valida el access token y devuelve `tenantId`, `objectId`, `subject` y `roles`. No exige un rol específico.

- `401`: falta el encabezado Bearer, está mal formado o el token es inválido.
- `403`: la aplicación cliente no está permitida o falta el scope requerido.
- `500`: ocurre un fallo operativo o inesperado durante la verificación.

Los errores actuales tienen formato plano `{ code, message }`. Las respuestas del control incluyen `Cache-Control: no-store`; las respuestas 401 incluyen `WWW-Authenticate: Bearer`.

Se reconocen `admin`, `organizer` y `checkin_operator`. Cada ruta con restricción de roles debe declarar los permitidos. `admin` no hereda permisos de otros roles y una lista vacía de roles permitidos deniega el acceso.

El verificador usa `jose`, claves públicas de Entra, `RS256`, emisor y audiencia configurados, y comprobaciones de claims, tenant, aplicación cliente y scope. El token no se devuelve en la respuesta ni se registra deliberadamente. El control registra los fallos inesperados mediante mensajes genéricos y el logger redacta `req.headers.authorization`.

Consulta [Autenticación de API](docs/architecture/authentication.md) para ver la configuración, el contrato implementado y sus límites.

### PostgreSQL local

PostgreSQL 17 se ejecuta mediante Docker Compose y publica el puerto `5432` únicamente en `127.0.0.1`. Sus datos se almacenan en el volumen persistente `openevents_postgres_data`.

Antes de iniciarlo por primera vez, crea la configuración local:

```powershell
Copy-Item .\infra\postgres\.env.example .\infra\postgres\.env
```

Este comando crea el archivo local con el usuario, la contraseña y el nombre de la base de datos. El archivo resultante está excluido de Git y sus valores son exclusivos del desarrollo local.

Para crear e iniciar PostgreSQL en segundo plano:

```powershell
docker compose up -d
```

El comando descarga la imagen cuando sea necesario, crea la red y el volumen, y deja PostgreSQL ejecutándose en segundo plano.

Para comprobar su estado:

```powershell
docker compose ps
```

PostgreSQL está disponible cuando el servicio muestra el estado `healthy`.

Para comprobar la conexión mediante una consulta:

```powershell
docker compose exec postgres psql -U openevents -d openevents -c "SELECT current_database(), current_user, version();"
```

El comando ejecuta `psql` dentro del contenedor y muestra la base de datos, el usuario y la versión del servidor.

Para detener PostgreSQL conservando los datos:

```powershell
docker compose down
```

Este comando elimina el contenedor y la red, pero conserva el volumen persistente.

Para eliminar también todos los datos locales:

```powershell
docker compose down -v
```

Este último comando elimina deliberadamente el volumen de PostgreSQL y debe utilizarse solamente cuando se quiera reiniciar completamente la base local.

### Esquema y migraciones

El esquema se define en `apps/api/src/db/schema.ts`. Las migraciones SQL y sus metadatos se guardan en `apps/api/drizzle` y deben versionarse juntos.

La estrategia se documenta en [ADR-004](docs/adr/ADR-004-orm-y-migraciones.md).

Todos los comandos siguientes se ejecutan desde la raíz del repositorio.

#### Configurar la conexión

Las migraciones y las pruebas de integración cargan `apps/api/.env` si existe. También aceptan variables proporcionadas directamente por el entorno, que tienen prioridad sobre el archivo.

Si todavía no existe `apps/api/.env`, créalo:

```powershell
Copy-Item .\apps\api\.env.example .\apps\api\.env
```

Este comando copia el ejemplo a la configuración privada de la API. Si el archivo ya existe, edítalo conservando sus variables.

Configura `DATABASE_URL` para que coincida con el usuario, la contraseña y la base de PostgreSQL local. Con los valores de ejemplo:

```dotenv
DATABASE_URL=postgresql://openevents:openevents_local_password@127.0.0.1:5432/openevents
```

Esta contraseña es exclusivamente de ejemplo para desarrollo local. El archivo `.env` permanece excluido de Git.

#### Aplicar las migraciones existentes

Con PostgreSQL en estado `healthy`, ejecuta:

```powershell
pnpm --filter @openevents/api run db:migrate
```

Este comando valida `DATABASE_URL`, se conecta a PostgreSQL y aplica las migraciones pendientes. Drizzle registra las migraciones aplicadas en `drizzle.__drizzle_migrations`.

Al repetir el comando sin nuevas migraciones, las ya registradas no se aplican nuevamente.

Para preparar una instalación nueva basta con aplicar las migraciones versionadas; no es necesario regenerarlas.

Las migraciones se ejecutan explícitamente y no forman parte del inicio de la API.

#### Generar una migración después de cambiar el esquema

Primero modifica `apps/api/src/db/schema.ts`. Después ejecuta:

```powershell
pnpm --filter @openevents/api run db:generate --name=describe_change
```

Sustituye `describe_change` por un nombre descriptivo del cambio.

El comando compara el esquema con sus metadatos anteriores y genera los archivos necesarios. No se conecta a PostgreSQL ni modifica la base de datos.

Revisa el SQL antes de aplicarlo y versiona la migración junto con sus metadatos. No edites migraciones ya aplicadas en entornos compartidos; genera una nueva migración para los cambios posteriores.

#### Ejecutar pruebas

Para ejecutar las pruebas unitarias de la API:

```powershell
pnpm --filter @openevents/api test
```

Este comando no requiere PostgreSQL y excluye los archivos `*.integration.test.ts`.

Para ejecutar las pruebas de integración:

```powershell
pnpm --filter @openevents/api run test:integration
```

Este comando requiere PostgreSQL disponible, `DATABASE_URL` configurada y las migraciones aplicadas.

Las pruebas de integración verifican restricciones únicas, claves foráneas, estados y fechas. También comprueban la creación y recuperación de eventos, el rechazo de slugs duplicados y entradas inválidas, y la propagación de errores de base de datos distintos del conflicto de slug.

Cada prueba utiliza una transacción que se revierte al terminar para descartar sus datos.

Las pruebas de `event-routes.integration.test.ts` comprueban HTTP con PostgreSQL real: creación, conflicto de slug, entrada inválida, rechazo sin token o sin rol y fallo real de escritura. Simulan el verificador de tokens y no se conectan a Entra.

Las solicitudes simultáneas del flujo de check-in siguen fuera de esta entrega.

#### Validación en CI

El job `Database integration` crea un PostgreSQL temporal, aplica las migraciones versionadas sobre una base vacía, repite el comando de migración y ejecuta las pruebas de integración.

La comprobación requerida `Validate monorepo` exige que este job también termine correctamente.

### Creación interna de eventos — OE-02-001A

El módulo `apps/api/src/modules/events` implementa la validación y persistencia de nuevos eventos.

- `create-event-input.ts` valida los datos de entrada.
- `create-event.ts` recibe una conexión Drizzle, valida la entrada e inserta el evento en PostgreSQL.
- Los archivos de pruebas verifican la validación y el comportamiento contra PostgreSQL real.

La entrada requiere:

| Campo | Regla |
|---|---|
| `name` | Texto obligatorio, hasta 200 caracteres. |
| `slug` | Hasta 120 caracteres; letras minúsculas, números y guiones simples entre palabras. |
| `startsAt` | Fecha y hora ISO 8601 en UTC, terminada en `Z`. |
| `endsAt` | Fecha y hora UTC posterior al inicio. |
| `timezone` | Nombre de zona horaria reconocido por el runtime, hasta 100 caracteres; por ejemplo, `America/Lima`. |
| `location` | Texto obligatorio, hasta 500 caracteres. |

Se eliminan espacios exteriores de los campos de texto. Se rechazan campos adicionales, incluidos `id` y `status`.

La operación crea el evento con estado `draft`. PostgreSQL genera su UUID y fecha de creación. La función devuelve el registro insertado.

Si el `slug` ya existe, la operación produce `EventSlugConflictError`, con código `EVENT_SLUG_CONFLICT`, sin modificar el evento existente. Otros errores de base de datos se propagan y no se convierten en conflictos de slug.

Esta entrega utiliza la tabla `event` existente y no añade migraciones.

La función de persistencia sigue siendo interna y no autentica usuarios ni comprueba roles por sí misma. La ruta `POST /api/v1/events`, incorporada en OE-02-001B, aplica esas comprobaciones antes de invocarla.

### Creación HTTP de eventos — OE-02-001B

Seguimiento: Issue #21. `POST /api/v1/events` reutiliza la operación interna existente y exige token válido, cliente y scope permitidos, y el rol `organizer`. `admin` o `checkin_operator` por sí solos no conceden acceso.

La solicitud utiliza los seis campos descritos en la sección anterior. La respuesta `201` contiene el registro creado, con fechas ISO 8601 UTC y estado `draft`.

Los errores controlados son `400 INVALID_EVENT_INPUT`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `409 EVENT_SLUG_CONFLICT` y `500 INTERNAL_SERVER_ERROR`. Los fallos inesperados de persistencia se registran con código y mensaje genéricos, sin el error original ni los datos de conexión.

Un JSON mal formado es rechazado por Fastify con 400 antes de ejecutar la operación y utiliza el formato de error del framework.

Consulta el [contrato de la API](docs/architecture/api-contract.md) para ver los ejemplos de solicitud y respuesta de OE-02-001B.

`buildApp` recibe la creación como dependencia. El servidor la conecta a Drizzle y PostgreSQL; las pruebas HTTP aisladas simulan persistencia.

Validación específica realizada: 6 pruebas de conexiones, 20 HTTP y 7 HTTP con PostgreSQL real. Se comprobó manualmente el arranque, `/health` con 200, la creación sin token con 401 y el retorno al prompt tras Ctrl+C.

No se añaden migraciones, formulario web, autorización con `event_staff`, auditoría completa ni recursos de Azure. Listar, consultar, editar, activar y cerrar eventos queda fuera de esta entrega.

### Creación de eventos desde la web — OE-02-001C

Seguimiento: Issue #23, rama `feat/23-create-event-web`. Requisitos: RF-EVT-001, RF-AUT-001 y RF-AUT-002. Integrado mediante PR #24, merge `9abbb99`, con CI aprobado.

1. Inicia sesión y pulsa «Comprobar acceso».
2. La web consulta `/api/v1/auth/me`. Solo habilita el formulario si la identidad incluye `organizer`.
3. Completa nombre, slug, inicio, fin, zona horaria y ubicación.
4. Pulsa «Crear evento». La web obtiene un access token mediante MSAL y envía los seis campos a `POST /api/v1/events`.
5. Una respuesta 201 válida muestra el identificador, estado `draft` y datos devueltos por la API.

Las horas del formulario corresponden a la zona seleccionada, no a la zona del navegador. `@js-temporal/polyfill` 0.5.1 convierte a UTC y rechaza fechas inválidas y horas inexistentes o ambiguas por cambios de horario. El fin debe ser posterior al inicio.

La comprobación de permisos en la web mejora el recorrido del usuario; la API autoriza cada creación. `admin` y `checkin_operator` no conceden por sí solos el permiso. Al cambiar de cuenta se reinicia el estado de permisos y del formulario.

Los borradores se guardan en `sessionStorage`, separados por cuenta, con los seis campos y una marca de resultado incierto. No contienen tokens. Se recuperan al recargar la misma pestaña, y se eliminan tras una creación confirmada o antes del cierre de sesión. No constituyen un respaldo permanente. Si falla el guardado, se bloquean el envío y la comprobación de acceso que podría redirigir. Si falla la eliminación previa al cierre de sesión, se informa y no se inicia la redirección.

La creación usa adquisición silenciosa del token. Si Microsoft requiere interacción, no se envía el POST y se pide comprobar nuevamente el acceso; ese flujo puede redirigir a Microsoft conservando el borrador guardado.

Un conflicto de slug conserva los campos y señala el identificador utilizado. Los errores muestran mensajes controlados. Ante un fallo de red, 500 o respuesta inesperada, la web advierte que el evento podría haberse guardado y no reintenta automáticamente. El bloqueo de envíos repetidos en la interfaz no equivale a idempotencia de la API.

El formulario y su conversión horaria se cargan por separado al confirmar `organizer`. El build local produjo 498,06 kB de JavaScript principal y 160,74 kB para el formulario, sin el aviso de fragmentos mayores de 500 kB. Son medidas del build local, no un presupuesto de rendimiento garantizado.

Validación global local aprobada: 160 pruebas de API, 194 de web y 22 de integración PostgreSQL (376 en total), además de typecheck, lint y build. Se confirmó en navegador que el formulario aparece con sus estilos después del cambio de carga diferida.

Pruebas específicas aprobadas: 39 de validación, 39 del cliente HTTP, 18 de borradores, 23 del formulario y 16 de sesión: 135 pruebas nuevas. Las pruebas de interfaz utilizan React Testing Library y jsdom, con MSAL y llamadas de API simulados. No sustituyen la comprobación en navegador.

Comprobaciones manuales realizadas: creación con una cuenta `organizer` y token real, conversión de 09:00–17:00 en Lima a 14:00–22:00 UTC, rechazo de slug repetido conservando los campos, recuperación tras recarga y limpieza tras cerrar e iniciar sesión. No se ha comprobado manualmente una renovación interactiva forzada de Microsoft ni un fallo de red durante la creación.

Esta entrega no modifica la API, el esquema o las migraciones. No añade consulta, edición, activación o cierre de eventos, asignaciones `event_staff`, auditoría completa ni recursos Azure. Las rutas y la interfaz demo permanecen abiertas. OE-01-003B recibe un avance parcial limitado a la creación de eventos.

### Asignación del organizador — OE-01-002B

Issue #25. La API vincula al creador autenticado con el evento mediante una identidad local `entra:<tenantId>:<objectId>`. Usuario nuevo, evento y asignación se guardan en una transacción; un usuario local deshabilitado recibe 403. Los datos de perfil ausentes quedan nulos.

Antes de arrancar con este cambio, aplica las migraciones con `pnpm --filter @openevents/api db:migrate`. La migración nueva conserva los datos existentes y permite nulos en el perfil del usuario.

La creación y asignación se verificaron manualmente desde la web y PostgreSQL. Los eventos anteriores no se asignan automáticamente. La consulta con permisos por evento se incorpora en OE-02-002A; la edición y la administración del personal siguen pendientes. Véase [autenticación](docs/architecture/authentication.md).

### Consulta de eventos — OE-02-002A

Issue #27. `GET /api/v1/events` devuelve `{ items, nextCursor }`; `GET /api/v1/events/{eventId}` devuelve el detalle con el mismo formato de evento de la creación. Ambas rutas requieren token válido, rol de aplicación `organizer`, usuario local activo y asignación `organizer` en `event_staff` para cada evento devuelto.

La lista usa `limit` (20 por defecto, máximo 100) y un `cursor` opcional. Se ordena por UUID ascendente, no por fecha. Un usuario sin identidad local o sin asignaciones obtiene una lista vacía; consultar un evento ajeno o inexistente devuelve el mismo 404. Las consultas no crean identidades ni asignaciones. Un usuario deshabilitado recibe 403.

Se comprobaron 45 pruebas de validación, 41 HTTP aisladas, 16 de consulta con PostgreSQL y 12 HTTP con PostgreSQL. La comprobación manual con sesión real confirmó listado y detalle 200, falta de token 401, evento inexistente 404 y límite inválido 400. No había segunda página en esa cuenta; la paginación se verificó mediante pruebas automatizadas.

Esta entrega no añade pantalla web de consulta, edición, migraciones ni recursos Azure. Validación global aprobada: 250 pruebas de API, 194 de web y 68 de integración PostgreSQL (512 en total), además de typecheck, lint y build. PR #28 integrado en `main`, merge `bf74848`; CI aprobado según comprobación del mantenedor. Consulta el [contrato de API](docs/architecture/api-contract.md) para los errores y límites de paginación.

### Consulta desde la web — OE-02-002B

Issue #29. Después de iniciar sesión y comprobar el rol `organizer`, «Mis eventos» permite cargar los eventos asignados, consultar su detalle, volver al listado, actualizar desde la primera página y cargar más resultados. La carga inicial requiere pulsar «Cargar eventos». Las fechas se muestran en la zona horaria de cada evento; el orden de la API es por UUID, no cronológico.

El cliente valida las respuestas y muestra mensajes controlados para lista vacía, errores y eventos que ya no están disponibles. Las consultas obtienen el token silenciosamente, no redirigen ni reintentan automáticamente. Un error de autenticación o autorización limpia los datos y pide comprobar nuevamente el acceso. Al cambiar de cuenta, perder acceso, iniciar la salida o una interacción de sesión, se descartan los datos y se cancelan las consultas pendientes; las respuestas tardías no se muestran.

La creación conserva su formulario y sus borradores. Tras una creación confirmada, se indica cargar nuevamente el listado; no se refresca automáticamente. El listado no se persiste en almacenamiento del navegador.

El formulario, «Mis eventos» y el cliente de consultas usan carga diferida. La autenticación se distribuye en un archivo separado. Build local final: principal 240,51 kB y autenticación 259,39 kB, sin aviso de archivos mayores de 500 kB. La separación no implica por sí sola una reducción del total descargado.

Validación global local: 250 pruebas de API, 263 de web y 68 de integración PostgreSQL (581 en total), typecheck, lint y build aprobados. Después del ajuste de carga se repitieron 108 pruebas relacionadas, typecheck y lint web; el build final y `git diff --check` también pasaron. Se comprobó manualmente el listado, detalle, fechas de Lima y vuelta al listado con una sesión real. Paginación, cambios de cuenta, cancelaciones y recarga tras creación están cubiertos por pruebas automatizadas; no se declara su comprobación manual.

La entrega no añade edición, migraciones ni endpoints. Las rutas demo conservan su alcance público. Issue #29 integrado mediante PR #30, merge `d91995d`; CI aprobado según comprobación del mantenedor.

### Edición de borradores en API — OE-02-002C

Issue #31. `PATCH /api/v1/events/{eventId}` permite cambiar parcialmente nombre, slug, inicio, fin, zona horaria y ubicación. Exige token válido, organizer global, usuario local activo y asignación organizer al evento. Solo admite eventos `draft`; no permite cambiar estado, identidad ni asignaciones.

El cliente envía `expectedVersion` y al menos un campo editable. Las respuestas de creación, listado, detalle y edición incluyen ahora `version`. Los eventos nuevos y existentes comienzan en 1; cada PATCH aceptado incrementa la versión, incluso si los valores enviados coinciden con los actuales. Una versión antigua devuelve 409 sin sobrescribir cambios. Cambiar solo la zona horaria conserva los instantes UTC; para cambiar la hora del evento deben enviarse las fechas correspondientes.

Antes de arrancar el código actualizado, aplica `pnpm --filter @openevents/api db:migrate`. La migración `0002_brief_jocasta.sql` añade la versión obligatoria y positiva sin eliminar eventos. Desde OE-02-002D, la web valida y conserva la versión para editar.

Validación local: 321 pruebas API, 263 web y 109 de integración PostgreSQL (693 en total), typecheck, lint, build y revisión de espacios aprobados. La comprobación manual con token real confirmó 401 sin token, creación 201, edición 200, rechazo de versión antigua 409, intervalo inválido 400 y consulta final 200 con versión 2. El comprobador temporal fue retirado. Los conflictos simultáneos se probaron con conexiones independientes.

La actualización bloquea usuario y asignación en modo compartido y el evento para escritura durante la transacción. Se conserva el mismo 404 para evento ajeno e inexistente. Los tres conflictos de negocio usan códigos 409 distintos. Véase el [contrato](docs/architecture/api-contract.md) y los ADR [005](docs/adr/ADR-005-edicion-parcial-de-borradores.md), [006](docs/adr/ADR-006-version-y-concurrencia-de-eventos.md) y [007](docs/adr/ADR-007-autorizacion-transaccional-de-edicion.md).

Esta entrega API no añadió formulario web, activación/cierre, auditoría de cambios ni recursos Azure. Integrada mediante PR #32, merge `5a1aa30`; CI aprobado antes y después del merge según el mantenedor.

### Edición de borradores desde la web — OE-02-002D

Issue #33, rama `feat/33-event-edit-web`. Desde «Mis eventos», abre el detalle de un borrador y pulsa «Editar evento». Se consulta de nuevo el evento antes de abrir el formulario. Al guardar se envían únicamente los campos modificados y `expectedVersion`; una respuesta confirmada actualiza detalle y listado.

Si otro organizador guardó primero, el formulario conserva la propuesta y bloquea el guardado. «Consultar estado actual» muestra los valores anteriores, propuestos y actuales. Selecciona qué cambios conservar y pulsa «Continuar con la selección»; esta acción no guarda. El siguiente guardado utiliza la versión consultada y puede volver a encontrar un conflicto. Tampoco se reintenta automáticamente un guardado cuyo resultado sea incierto.

Aplicar una zona horaria convierte la presentación manteniendo los mismos instantes. Después pueden ajustarse las horas. La comparación de conflictos muestra fechas UTC. Los cambios de edición permanecen solo en memoria y se descartan al cambiar de cuenta, cerrar sesión o perder acceso; cancelar una edición con cambios solicita confirmación. Cancelar una petición no garantiza revertir una escritura del servidor.

Validación local: **839 pruebas aprobadas** (321 API, 409 web y 109 PostgreSQL), tipos, lint y build. Revisión de espacios sin errores; avisos de normalización CRLF/LF. Prueba manual confirmada: modificación de ubicación, conflicto entre dos pestañas, comparación y guardado explícito de la propuesta seleccionada. Aislamiento entre cuentas y errores de red se cubren automáticamente, sin declarar comprobación manual de esos casos. No añade endpoints ni migraciones. Integrada mediante PR #34, merge `9651330`; CI aprobado antes y después del merge según el mantenedor.

#### Resumen ejecutivo

OpenEvents permite a los organizadores corregir sus eventos en borrador desde la web.<br>
La interfaz recupera datos recientes y envía cambios parciales con la versión consultada.<br>
Si existe una edición concurrente, conserva la propuesta y exige revisar los valores actuales.<br>
La decisión de seguridad principal es mantener la autorización por evento en el servidor y retirar los datos locales al perder acceso.<br>
El flujo se validó con pruebas automatizadas y una comprobación manual de conflicto entre pestañas.

### Registro de asistentes mediante API — OE-03-001A

Issue #35, rama `feat/35-attendee-registration-api`. `POST /api/v1/events/{eventId}/registrations` recibe `fullName` y `email`. Exige token válido, organizer global, usuario local activo y asignación organizer al evento. Admite eventos draft y active; rechaza closed y cancelled. El servidor fija estado confirmed y origen manual.

El nombre se recorta y valida; el correo ASCII se recorta y convierte a minúsculas, sin eliminar puntos ni sufijos con +. Esta normalización es una política del producto, no una verificación de propiedad del correo. Cada inscripción crea un perfil independiente; no se buscan ni actualizan asistentes de otros eventos por su correo.

Aplica `pnpm --filter @openevents/api db:migrate` antes de iniciar la API actualizada. La migración `0003_registration_event_email.sql` completa `registration.email_normalized` y exige unicidad por evento. Si detecta datos históricos incompatibles o duplicados, se detiene para revisión, sin fusionar ni borrar perfiles automáticamente. Las inscripciones canceladas conservan la reserva del correo.

Una transacción crea asistente e inscripción; un conflicto devuelve 409 y revierte el perfil recién insertado. Bloqueos compartidos sobre usuario, asignación y evento coordinan cambios concurrentes de permisos o estado. No hay idempotencia de respuesta: si se pierde una respuesta, un reenvío puede devolver 409 aunque el primer envío haya tenido éxito.

Validación global aportada por el mantenedor: **977 pruebas aprobadas** (397 API, 409 web y 171 PostgreSQL), tipos, lint y build; diff sin errores de espacios, con avisos CRLF/LF. Prueba manual: siete comprobaciones correctas y una consulta SQL con una sola inscripción confirmed/manual y correo normalizado. Comprobador temporal eliminado. Integrada mediante PR #36, merge `4d6d14c`; CI de main aprobado según el mantenedor. Main sincronizado y rama eliminada.

Esta entrega no incorpora formulario web, listado de inscripciones, importación CSV, QR ni envío de correos. RF-ATT-001 y la historia OE-03-001 requieren contrastar el recorrido completo antes de cerrarse. Véanse el [contrato](docs/architecture/api-contract.md) y los ADR [011](docs/adr/ADR-011-identidad-y-unicidad-de-inscripciones.md), [012](docs/adr/ADR-012-inscripcion-atomica-y-autorizada.md) y [013](docs/adr/ADR-013-contrato-minimo-de-inscripcion.md).

#### Resumen ejecutivo

OpenEvents permite registrar asistentes mediante una API restringida a los organizadores del evento.<br>
La operación crea el perfil y su inscripción en una transacción de PostgreSQL.<br>
Una restricción por evento y correo normalizado impide duplicados incluso ante solicitudes simultáneas.<br>
La decisión principal de seguridad es verificar permisos dentro de la transacción y no reutilizar perfiles de otros eventos por correo.<br>
La entrega se validó con pruebas automatizadas, una sesión real y una consulta directa de persistencia.

### Registro de asistentes desde la web — OE-03-001B

Issue #37, rama `feat/37-attendee-registration-web`. Tras comprobar acceso como organizer, abre «Mis eventos», consulta el detalle y pulsa «Registrar asistente». Antes de abrir el formulario se vuelve a consultar el evento; solo se ofrece para draft/active. Cada POST sigue sujeto a autorización y estado en el servidor.

El formulario solicita nombre completo y correo, normaliza los valores y valida antes de enviar. Una respuesta 201 validada muestra nombre, correo, identificador de inscripción, estado confirmed y origen manual. «Registrar otro asistente» abre un formulario vacío mediante acción explícita. Un correo duplicado presenta un aviso y conserva los campos para corregirlos, sin mostrar otra confirmación ni recuperar el perfil existente.

Los datos del asistente permanecen en memoria, sin guardarse en localStorage/sessionStorage. Cambiar de cuenta, cerrar sesión o perder acceso retira los datos; se cancelan solicitudes y se ignoran respuestas tardías. Mientras está abierto se oculta la creación de eventos y se deshabilita Comprobar acceso. Cancelar con datos solicita confirmación. Cerrar sesión sigue disponible.

No hay reintentos automáticos. Un resultado incierto bloquea el reenvío; el bloqueo por evento se conserva en memoria para la cuenta montada incluso al volver al listado o comprobar acceso. Recargar la página o cambiar de cuenta elimina ese estado: no es una garantía de idempotencia. Abortar la espera no revierte una inscripción confirmada en el servidor. Todavía no existe consulta/listado de inscripciones para reconciliar el resultado desde esta pantalla.

Validación del mantenedor: **1.091 pruebas aprobadas** (397 API, 523 web y 171 PostgreSQL), typecheck, lint y build. `git diff --check` limpio tras normalizar los saltos de línea. Prueba manual: dos confirmaciones con identificadores distintos y rechazo de un correo repetido en el mismo evento aunque cambie el nombre. No se declara prueba manual entre cuentas ni de pérdida de respuesta; esos comportamientos tienen cobertura automatizada. Sin endpoints, migraciones, QR ni correos nuevos. Pendientes revisión documental, commit, PR, CI y merge.

Decisiones: [ADR-014](docs/adr/ADR-014-resultados-inciertos-de-inscripcion-web.md), [ADR-015](docs/adr/ADR-015-aislamiento-de-inscripcion-por-cuenta.md) y [ADR-016](docs/adr/ADR-016-confirmacion-validada-de-inscripcion.md). El formulario avanza OE-03-001; no completa la consulta/listado requerida para contrastar todo RF-ATT-001.

#### Resumen ejecutivo

OpenEvents permite a los organizadores registrar asistentes desde el detalle de sus eventos.<br>
La web consulta el estado actual y envía nombre y correo a la API existente, que aplica los permisos por evento.<br>
Una respuesta validada confirma la inscripción; los duplicados se rechazan sin revelar perfiles previos.<br>
La decisión de seguridad principal es mantener la autorización en el servidor y retirar los datos del asistente al cambiar de cuenta o perder acceso.<br>
El flujo evita reenvíos automáticos ante resultados inciertos y fue validado con pruebas automatizadas y comprobación manual.

### Consulta de inscripciones por API — OE-03-001C (Issue #39)

Integrada mediante PR #40, merge `72a91f4`. El mantenedor confirmó CI verde, main sincronizado y rama eliminada en remoto y local.

- `GET /api/v1/events/{eventId}/registrations`: devuelve `{ items, nextCursor }`, con `limit` 20 por defecto y máximo 100.
- `GET /api/v1/events/{eventId}/registrations/{registrationId}`: devuelve una inscripción del evento indicado.
- Ambas exigen token válido, scope `access_as_user`, rol global `organizer`, usuario local activo y asignación `organizer` al evento. `admin` y `checkin_operator` no heredan acceso.
- Se consultan eventos draft, active, closed y cancelled; también se devuelven inscripciones canceladas con su estado y origen persistidos. Leer un evento cerrado no habilita nuevas inscripciones.
- Cursor por UUID ascendente, vinculado al evento. No ordena por fecha ni conserva una instantánea entre páginas. Cada página vuelve a autorizarse.
- Respuestas con `Cache-Control: no-store`, campos explícitos y errores controlados. No se crean usuarios ni se modifican inscripciones al consultar.

Validación aportada por el mantenedor: **1.236 pruebas aprobadas** (502 API, 523 web y 211 PostgreSQL), typecheck, lint, build y diff sin errores. Comprobación de ocho casos mediante archivo temporal, eliminado después; Postman confirmó identidad organizer, dos páginas, fin de listado, rechazo de cursor inválido y detalle. No se probó manualmente una segunda cuenta real.

No incluye pantalla web de listado, búsqueda por correo/nombre, CSV, QR, notificaciones ni idempotencia. No requiere migraciones nuevas. Consulta el [contrato](docs/architecture/api-contract.md) y [ADR-017](docs/adr/ADR-017-paginacion-de-inscripciones.md), [ADR-018](docs/adr/ADR-018-autorizacion-de-consultas-de-inscripciones.md) y [ADR-019](docs/adr/ADR-019-contrato-de-lectura-de-inscripciones.md).

#### Resumen ejecutivo

OpenEvents permite consultar las inscripciones de cada evento mediante una API protegida.<br>
El organizador obtiene páginas acotadas y el detalle de una inscripción con datos persistidos en PostgreSQL.<br>
Cada consulta valida la identidad, el rol y la asignación vigente al evento antes de devolver información.<br>
La decisión de seguridad principal es vincular tanto la autorización como la búsqueda de la inscripción al evento solicitado.<br>
La entrega incorpora pruebas automatizadas y verificaciones reales en consola y Postman; la pantalla web de consulta queda pendiente.

### Consulta de inscripciones desde la web — OE-03-001D (Issue #41)

Integrada mediante PR #42, merge `2d40ac2`. CI de main ejecución #43: Success según el mantenedor; main sincronizado y rama eliminada localmente y en remoto.

Recorrido: **Comprobar acceso → Cargar eventos → Ver detalle → Ver inscripciones → Cargar inscripciones → Ver inscripción**. Al abrir y al volver se consulta de nuevo el evento. Se permite consultar en draft, active, closed y cancelled; los permisos siguen aplicándose en cada GET de la API.

El listado muestra nombre, correo y estado, incluye canceladas y carga páginas de 20 mediante «Cargar más inscripciones». El contador indica elementos cargados, no el total del evento. «Actualizar inscripciones» reinicia el recorrido; nextCursor null indica fin. El cursor se trata como opaco y no se guarda entre eventos. No existe orden cronológico ni instantánea entre páginas; las altas concurrentes pueden requerir actualizar desde el inicio.

«Ver inscripción» recupera un detalle reciente con estado y origen persistidos, fecha en la zona horaria del evento e identificador. «Volver a inscripciones» conserva el listado y devuelve el foco al botón de origen. La pantalla ofrece mensajes de carga, vacío, errores y reintentos explícitos; un cursor inválido exige reiniciar sin presentar falsamente el fin del listado.

Los datos permanecen en memoria. Cambio de cuenta/evento, cierre de sesión, nueva comprobación de acceso o interacción de MSAL desmontan las consultas afectadas; se abortan solicitudes y se descartan resultados tardíos. 401/403 o fallos de autenticación invalidan el acceso comprobado. Un 404 limpia las inscripciones y retira el evento del listado local hasta consultar de nuevo, porque no permite distinguir una inscripción ausente de pérdida de acceso al evento. No invalida por sí solo toda la sesión.

El cliente valida estructura, UUID, pertenencia al evento, detalle solicitado, estado, fecha, campos del asistente y coherencia de las páginas. Envía GET con token para la cuenta seleccionada, no-store, sin cookies y rechazando redirecciones. No hay reintentos automáticos. Consultar inscripciones no elimina el bloqueo de un alta con resultado incierto.

Validación global confirmada por el mantenedor: **1.348 pruebas aprobadas** (502 API, 635 web y 211 PostgreSQL), typecheck, lint y build. git diff --check sin errores de espacios, con avisos de conversión CRLF a LF. Validación focalizada previa: bloques de 189, 95 y 149 pruebas aprobados (se solapan y no deben sumarse). La entrega añade 112 casos: 63 del cliente, 32 de pantalla y 17 de integración con eventos/sesión. Capturas de una cuenta real muestran listado de dos inscripciones, detalle con fecha local y regreso al evento. No acreditan paginación manual de más de 20 elementos, segunda cuenta real, carga ni comprobación manual completa de accesibilidad.

Sin cambios de API o esquema. Fuera de alcance: búsqueda, CSV, QR, edición/cancelación de inscripciones y reconciliación automática de altas inciertas. Decisiones: [ADR-020](docs/adr/ADR-020-consulta-web-aislada-por-cuenta-y-evento.md), [ADR-021](docs/adr/ADR-021-navegacion-y-recuperacion-de-inscripciones.md), [ADR-022](docs/adr/ADR-022-validacion-de-lecturas-de-inscripciones.md).

#### Resumen ejecutivo

OpenEvents permite consultar asistentes inscritos desde el detalle de cada evento.<br>
El organizador carga páginas y consulta detalles mediante la API existente.<br>
La pantalla comunica carga, ausencia de resultados, errores y fin del recorrido.<br>
La decisión de seguridad principal es aislar los datos por cuenta y evento y retirarlos al perder acceso.<br>
La entrega cuenta con pruebas focalizadas y capturas del recorrido real; la validación global y el CI posterior al merge están aprobados.

### Validación interna de CSV — OE-03-002A (Issue #43)

Integrada mediante PR #44, merge `4fd3e88`. CI posterior al merge aprobado; main local sincronizado y rama eliminada según evidencia del mantenedor. `validateRegistrationCsv(bytes)` recibe Uint8Array (incluido Buffer), valida el archivo y devuelve filas normalizadas únicamente si todo es válido. No importa inscripciones, no accede a PostgreSQL ni ofrece endpoint HTTP o pantalla nueva.

Contrato: UTF-8 estricto con BOM inicial opcional, coma, LF/CRLF, encabezados fullName,email en orden; máximo 1 MiB y 500 registros de datos. Admite campos entre comillas y comillas escapadas. Reutiliza las reglas del alta manual y detecta correos repetidos dentro del archivo después de normalizarlos. Los errores incluyen código y localización cuando existe; se acotan a 100 con indicador de truncamiento, sin copiar datos personales.

Validación focalizada aportada por el mantenedor: 56 pruebas del CSV y 46 del alta manual, **102 aprobadas**, tipos y lint API aprobados. Validación global posterior confirmada por la salida del mantenedor: **1.404 pruebas aprobadas** (558 API, 635 web y 211 de integración PostgreSQL), typecheck, lint y build. Las 102 focalizadas se solapan con la suite y no se suman. La práctica local confirmó dos registros normalizados para el archivo válido y tres errores esperados para el inválido, sin escrituras. git diff --check sin errores. Esto no acredita una importación persistida.

Consulta el [contrato CSV](docs/architecture/registration-csv.md), los [ejemplos de práctica](docs/examples/registration-csv/README.md) y los ADR [023](docs/adr/ADR-023-formato-y-limites-de-csv.md), [024](docs/adr/ADR-024-validacion-csv-sin-importacion-parcial.md) y [025](docs/adr/ADR-025-diagnosticos-acotados-de-csv.md). RF-ATT-002 sigue pendiente. OE-03-002B incorpora la operación interna autorizada y transaccional descrita a continuación; OE-03-002C añade recuperación/idempotencia interna; faltan endpoint y recorrido web.

### Importación interna de CSV — OE-03-002B (Issue #45)

Integrada mediante PR #46, merge `3c716ea`; CI del merge aprobado. Main local sincronizado y rama eliminada según evidencia del mantenedor. `importRegistrationCsvForOrganizer(db, eventId, bytes, actor)` reutiliza el validador y autoriza al organizador local activo y asignado al evento. Admite draft/active; crea inscripciones confirmed/csv y perfiles independientes por evento en una sola transacción.

Un conflicto de correo, incluso con una inscripción cancelada, revierte todo el lote sin asistentes huérfanos. La restricción única de PostgreSQL decide también bajo concurrencia. Inserta inscripciones en orden ASCII de correo y devuelve los elementos en el orden original del CSV. No modifica la versión del evento, no reintenta y no incorpora rutas HTTP, pantalla, migraciones ni dependencias.

Validación focalizada confirmada por el mantenedor: **64 pruebas de integración aprobadas** (27 de persistencia/autorización CSV, 10 de concurrencia CSV y 27 existentes del alta manual), tipos y lint API. Son 37 casos nuevos. Validación global posterior confirmada por el mantenedor: **1.441 pruebas aprobadas** (558 API, 635 web y 248 de integración PostgreSQL), typecheck, lint y build aprobados; git diff --check sin errores. Las 64 focalizadas se solapan con la suite global y no se suman. No se acredita carga ni recuperación ante pérdida de conexión durante el commit.

En esta operación sin clave, repetir un lote confirmado produce conflicto; la nueva operación de OE-03-002C incorpora idempotencia explícita. El contrato, errores y límites están en [registration-csv.md](docs/architecture/registration-csv.md); decisiones [ADR-026](docs/adr/ADR-026-importacion-csv-atomica-y-autorizada.md), [ADR-027](docs/adr/ADR-027-conflictos-y-orden-de-importacion-csv.md) y [ADR-028](docs/adr/ADR-028-resultado-interno-y-reintentos-de-csv.md).

### Recuperación interna de importaciones CSV — OE-03-002C (Issue #47)

Integrada mediante PR #48, merge `223d55b`; CI aprobado. Main local sincronizado y rama eliminada según evidencia del mantenedor del 21 de septiembre de 2026. `importRegistrationCsvIdempotently(db, eventId, key, bytes, actor)` vincula una clave UUID al evento y organizador. La misma clave y los mismos bytes recuperan un comprobante histórico con los mismos identificadores; otro contenido acotado produce un conflicto de clave. `queryRegistrationCsvImport` devuelve completed o not_observed, que no prueba fallo ni ausencia de una operación en curso.

La migración 0004 añade registration_csv_import. Comprobante e inscripciones confirman juntos; READ COMMITTED y un bloqueo transaccional por ámbito coordinan solicitudes concurrentes. Se comprueban permisos actuales para importar, repetir y consultar. Recuperar historial admite eventos cerrados/cancelados; una nueva importación mantiene draft/active. No hay endpoint, pantalla ni reintentos automáticos.

Se conserva un snapshot versionado del resultado, sin archivo CSV original ni token. Contiene datos personales y no representa el estado actual de las inscripciones. No hay caducidad ni purga automática; la futura política de conservación debe coordinar privacidad, borrado y garantías de recuperación.

El mantenedor aplicó la migración y volvió a ejecutarla correctamente. Tipos y lint API aprobados; **72 pruebas focalizadas de integración aprobadas** (35 nuevas y 37 existentes). Validación global confirmada por la salida del mantenedor: **1.476 pruebas aprobadas** (558 API, 635 web y 283 de integración PostgreSQL), typecheck, lint y build globales correctos. git diff --check sin errores de espacios, con aviso de normalización CRLF a LF en schema.ts. Las 72 pruebas focalizadas se solapan con la suite global y no se suman nuevamente. No se simuló corte físico de red durante COMMIT ni carga de producción. Contrato: [registration-csv.md](docs/architecture/registration-csv.md); decisiones ADR-029, ADR-030 y ADR-031.

## Comandos

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

## Roadmap inmediato

1. Crear la base del repositorio y el primer vertical slice.
2. Añadir pruebas y pipeline de pull requests.
3. Modelar eventos, asistentes e inscripciones.
4. Incorporar persistencia y autenticación.
5. Desplegar el MVP en Azure.

## Licencia

MIT.


### CSV mediante HTTP - OE-03-002D (Issue #49)

POST y GET `/api/v1/events/{eventId}/registrations/imports` requieren Bearer e Idempotency-Key UUID. POST recibe text/csv hasta 1 MiB como bytes originales y llama a la operación idempotente. GET consulta el comprobante con permisos actuales. Ambos expresan resultado confirmado con 200; GET también admite not_observed, que no significa fallo.

Rama feat/49-registration-csv-http. Verificación del agente en copia aislada: typecheck y lint aprobados; 44 pruebas HTTP nuevas y 12 nuevas de integración PostgreSQL aprobadas. Regresión: 80 pruebas de rutas existentes y 35 de idempotencia aprobadas (171 casos distintos en total). Validación global confirmada por la salida del mantenedor del 21 de septiembre de 2026: **1.532 pruebas aprobadas** (602 API, 635 web y 295 de integración PostgreSQL), typecheck, lint y build correctos. Las 171 focalizadas están incluidas y no se suman de nuevo. git diff --check sin errores de espacios, con avisos de normalización CRLF a LF. Integrado mediante PR #50, merge 514ae9b; CI confirmado en success. Main local sincronizado y rama eliminada según salida del mantenedor. Las pruebas HTTP sustituyen el verificador JWT; no equivalen a una prueba manual con Entra real.

Sin pantalla CSV ni cambios de esquema. RF-ATT-002 continúa pendiente del recorrido web. Contrato completo en docs/architecture/api-contract.md; decisiones ADR-032, ADR-033 y ADR-034.


### CSV web - OE-03-002E (Issue #51)

La pantalla de importación y recuperación consume la API de OE-03-002D. Conserva clave y huella por cuenta/evento en sessionStorage antes de enviar; el CSV queda en memoria. Tras recarga o nueva autorización en la misma pestaña, permite consultar el comprobante y exige volver a seleccionar los mismos bytes para reenviar. not_observed mantiene incertidumbre. El comprobante histórico se distingue del estado actual.

Verificación del agente en copia aislada: typecheck y lint correctos, 152 pruebas focalizadas aprobadas, con 63 casos nuevos. Validación global confirmada por la salida del mantenedor del 21 de septiembre de 2026: 1.595 pruebas aprobadas (602 API, 698 web y 295 de integración PostgreSQL), typecheck, lint y build correctos. Las 152 focalizadas están incluidas y no se suman de nuevo. git diff --check sin errores; solo avisos CRLF a LF. Evidencia manual: importación confirmada de dos inscripciones y recuperación del mismo comprobante, con igual identificador, fecha y cantidad, siguiendo el recorrido de recarga en la misma pestaña, cuenta y evento. Esta comprobación no cubre un corte de red real ni un cambio de cuenta. Integrado mediante PR #52: implementación 88a0cb0, merge 69685f3. CI de main 35622349694 verificado completed / success. El mantenedor confirmó main/origin/main sincronizados y limpios, y la eliminación de la rama local y remota. Sin cambios de API, esquema ni dependencias. Detalles y límites en docs/architecture/registration-csv.md y ADR-035 a ADR-037. RF-ATT-002 no se declara completo automáticamente.


### Búsqueda interna de inscripciones - OE-03-003A (Issue #53)

Operación `searchRegistrationsForStaff` por evento, con coincidencia parcial de nombre o correo, paginación por UUID y cursor vinculado al término. Exige usuario activo y pareja compatible entre rol global y event_staff: organizer/organizer o checkin_operator/checkin_operator. Admin no hereda esos permisos. Cada página revalida la autorización.

La búsqueda es de solo lectura, incluye canceladas con su estado y permite consultar todos los estados de evento. No amplía las rutas existentes, que siguen siendo exclusivas de organizadores. Sin HTTP, interfaz de búsqueda, QR, check-in, migraciones ni dependencias nuevas. RF-ATT-003 permanece parcial.

Validación del agente en copia aislada: typecheck, lint y build correctos; 136 pruebas focalizadas aprobadas (27 nuevas de entrada, 32 nuevas PostgreSQL y 77 de regresión). Validación global confirmada por la salida del mantenedor del 21 de septiembre de 2026: 1.654 pruebas aprobadas (629 API, 698 web y 327 de integración PostgreSQL), typecheck, lint y build correctos. Las 136 focalizadas están incluidas en el total y no se suman nuevamente. git diff --check sin errores de espacios; solo avisos CRLF a LF. Integrado mediante PR #54: implementación 3d57461, merge 8e03111; CI 35628691770 completed / success verificado. Main local sincronizado y limpio, rama local y remota eliminada según el mantenedor. Contrato en docs/architecture/registration-search.md y decisiones ADR-038 a ADR-040.


### Búsqueda HTTP - OE-03-003B (Issue #55)

`GET /api/v1/events/:eventId/registrations/search` expone la operación interna con Bearer, rol global organizer o checkin_operator y autorización vigente por evento. Admite q, limit y cursor; devuelve items y nextCursor, fechas UTC y Cache-Control: no-store. Parámetros inválidos, repetidos o desconocidos se rechazan. No acepta cuerpo. No amplía listado/detalle existentes ni incorpora web, QR o check-in.

Privacidad: se desactivan los logs automáticos de solicitudes de Fastify en buildApp mediante LogController. Se conservan logs explícitos con códigos fijos; el endpoint no registra consulta, cursor, token, resultados ni excepción original. Esto elimina los mensajes automáticos de entrada/finalización y sus tiempos para toda la aplicación. No elimina URL del historial del cliente ni de proxies externos: evitar registrar query strings allí antes de desplegar. La respuesta usa no-store, pero ese encabezado no borra logs ni historial.

Validación del agente en copia aislada: typecheck, lint y build correctos; 164 pruebas focalizadas (27 HTTP nuevas, 11 PostgreSQL nuevas y 126 regresiones). Validación global confirmada por la salida del mantenedor del 21 de septiembre de 2026: 1.692 pruebas aprobadas (656 API, 698 web y 338 de integración PostgreSQL), typecheck, lint y build correctos. Las 164 focalizadas están incluidas en el total y no se suman nuevamente. git diff --check sin errores de espacios; solo avisos CRLF a LF. Integrado mediante PR #56: implementación ae48c49, merge 9b55ae5. CI aprobado según el mantenedor; main local sincronizado y limpio y rama local/remota eliminada, según la salida compartida. Sin migraciones ni dependencias nuevas. Decisiones ADR-041 a ADR-043. RF-ATT-003 sigue parcial.


### Búsqueda web para organizadores - OE-03-003C (Issue #57)

Desde el detalle de un evento, «Ver inscripciones» permite buscar por nombre o correo mediante «Buscar» o Enter, repetir la consulta y limpiar para volver al listado general. El texto en edición y el término ejecutado son estados distintos: cada página usa el término ejecutado y su cursor; una búsqueda nueva reinicia resultados y paginación.

La web usa la cuenta verificada, el scope configurado y el evento seleccionado. Cancela peticiones y descarta respuestas tardías al cambiar búsqueda, cuenta, evento, acceso o cerrar sesión. Conserva listado/detalle y restauración de foco. La consulta y los resultados quedan solo en memoria de esta vista. No se escriben en storage, URL de navegación ni logs propios. La petición GET sí contiene q y cursor: herramientas de red e infraestructura pueden observarlos.

Verificación del agente en copia aislada: typecheck, lint y build aprobados; 240 pruebas focalizadas aprobadas, incluidas 49 nuevas (25 del cliente, 19 de la vista y 5 de sesión). Validación global confirmada por la salida del mantenedor del 21 de septiembre de 2026: 1.741 pruebas aprobadas (656 API, 747 web y 338 de integración PostgreSQL), typecheck, lint y build correctos. Las 240 focalizadas están incluidas en el total y no se suman nuevamente. git diff --check sin errores. Evidencia manual aportada: búsqueda por nombre y correo, apertura del detalle, retorno conservando el término ejecutado, estado sin coincidencias y limpieza del campo que devuelve la vista al listado general. Las capturas finales de limpieza no muestran las tarjetas inferiores; no acreditan paginación de más de 20 resultados, cambio de cuenta ni respuestas tardías en navegador. Estos escenarios cuentan con cobertura automatizada. Integrado mediante PR #58: implementación 3d39f30, merge 7295b77. CI de main 35658747443 completed / success verificado. Main local limpio y sincronizado, ramas local y remota eliminadas según evidencia del mantenedor. Rama feat/57-registration-search-web. Sin cambios de API, esquema ni dependencias. ADR-044 a ADR-046. RF-ATT-003 sigue parcial: interfaz de operadores y búsqueda por código quedan fuera de esta entrega.


### Eventos asignados al operador - OE-03-003D (Issue #59)

GET /api/v1/operator/events y GET /api/v1/operator/events/:eventId permiten seleccionar eventos con identidad verificada. Exigen usuario local activo, rol global checkin_operator y asignación event_staff de ese mismo rol. Tener organizer o admin sin checkin_operator no concede acceso. Con ambos roles globales, este recorrido sigue devolviendo solo asignaciones de operador.

Listado paginado por UUID; detalle con proyección operativa (id, name, startsAt, endsAt, timezone, location, status). Sin slug, version, createdAt ni datos del personal. Un usuario desconocido obtiene lista vacía y detalle 404, sin provisionamiento. Los permisos se comprueban en cada solicitud; el cursor no concede acceso. Se conservan sin cambios los permisos de las rutas de organizadores.

Verificación del agente en copia aislada: typecheck, lint y build correctos; 185 pruebas focalizadas distintas aprobadas (71 nuevas: 46 HTTP y 25 PostgreSQL; 114 de regresión). Los fixtures de integración se revierten mediante rollback. El verificador HTTP es sustituido en pruebas: no acredita autenticación real con Entra. Validación global confirmada por la salida del mantenedor del 21 de septiembre de 2026: 1.812 pruebas aprobadas (702 API, 747 web y 363 de integración PostgreSQL), typecheck, lint y build correctos. Las 185 focalizadas están incluidas en ese total y no se suman nuevamente. git diff --check sin errores. Integrado mediante PR #60: implementación 4deca8c, merge 823c1de. CI de main 35667029136 aprobado; main local limpio y sincronizado y ramas eliminadas según la evidencia del mantenedor. Rama feat/59-operator-event-query-api. Sin migraciones, dependencias ni interfaz web nueva. ADR-047 a ADR-049; contrato en docs/architecture/operator-events.md. RF-ATT-003 sigue parcial.

### Selección y búsqueda web del operador — OE-03-003E (Issue #61)

Tras comprobar acceso, checkin_operator dispone de «Eventos asignados al operador». El listado es explícito y paginado; seleccionar un evento consulta su detalle operativo actualizado. La búsqueda por nombre o correo usa la ruta compartida existente y presenta nombre, correo y estado, incluidas inscripciones canceladas. No añade detalle de inscripción, altas, edición, CSV ni check-in al recorrido del operador. Organizer y checkin_operator pueden coexistir con vistas independientes; admin no recibe acceso implícito.

El término en edición y el ejecutado son distintos. Buscar o Enter reinicia la paginación; las siguientes páginas y Repetir búsqueda usan el término ejecutado. Limpiar búsqueda cancela la espera y elimina término, resultados y cursor sin consultar el listado general de organizadores. Volver a eventos descarta la búsqueda; seleccionar nuevamente obtiene detalle fresco. Las consultas se cancelan y sus respuestas tardías se descartan al cambiar de cuenta, acceso, evento o búsqueda y al cerrar sesión. Un 404 retira el evento y obliga a recargar el listado; 401/403 y fallos de autorización requieren comprobar acceso nuevamente.

Los datos quedan en memoria de la vista, sin almacenamiento, URL de navegación ni logs propios. La petición GET de búsqueda sí incluye q y cursor en la URL HTTP, visible para herramientas de red e infraestructura. El servidor sigue siendo responsable de autorizar cada llamada. No se promete borrar retrospectivamente datos ya recibidos al revocar una asignación.

Validación del agente en copia aislada: 824 pruebas web aprobadas (77 nuevas: 47 cliente, 23 vista y 7 sesión), typecheck, lint y build correctos. Este incremento no cambia API, esquema, migraciones ni dependencias. Validación web del mantenedor confirmada: 824 pruebas, typecheck, lint, build y git diff --check correctos. Evidencia manual con una cuenta Entra checkin_operator: listado vacío antes de asignación local, evento asignado visible después, selección y detalle operativo, validación de búsqueda vacía, coincidencia parcial por nombre, coincidencia por correo, limpieza de campo/resultados y búsqueda sin coincidencias. El mantenedor confirmó por texto que volver al listado y seleccionar nuevamente el evento deja el campo de búsqueda vacío. No se acredita paginación, revocación ni cambio de cuenta en navegador; esos escenarios no deben darse por probados manualmente. Validación global confirmada por la salida del mantenedor del 21 de septiembre de 2026: 1.889 pruebas aprobadas (702 API, 824 web y 363 de integración PostgreSQL), typecheck, lint y build correctos. Las pruebas web anteriores están incluidas en este total y no se suman nuevamente. git diff --check sin errores. Pendientes commit, PR, CI y merge. RF-ATT-003 sigue parcial; búsqueda por código, QR y check-in quedan fuera. Decisiones ADR-050 a ADR-052.
