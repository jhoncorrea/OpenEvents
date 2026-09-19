# OpenEvents

OpenEvents es una plataforma open source para gestionar la operación de eventos: asistentes, códigos QR, check-in y métricas de asistencia.

## Estado

La web incorpora inicio y cierre de sesión con Microsoft Entra External ID mediante MSAL. La API valida access tokens y dispone de controles reutilizables de roles. La ruta protegida `GET /api/v1/auth/me` devuelve la identidad y los roles del usuario. El botón «Comprobar acceso» solicita un access token para la API y consulta esa ruta; se verificó manualmente el rol `organizer` con un token real.

`GET /health` sigue público. Las rutas demo `GET /api/events/current` y `POST /api/check-ins`, así como la interfaz demo, siguen disponibles sin autenticación. La asignación del creador en `event_staff` está implementada; las consultas de organizadores ya utilizan esa asignación. La edición sigue pendiente.

Desarrollo incremental del MVP. La interfaz web y las rutas de demostración mantienen el flujo inicial de check-in. Ya están implementados el esquema PostgreSQL, las migraciones versionadas y la operación interna de creación de eventos con persistencia, verificada mediante pruebas de integración.

`POST /api/v1/events` crea eventos persistidos con un token válido y el rol `organizer`. El servidor asigna el estado `draft`. La web permite crear eventos mediante un formulario habilitado después de comprobar el rol `organizer`. La creación asigna al organizador en `event_staff`; la API permite listar y consultar los eventos asignados. La edición y la pantalla web de consulta siguen pendientes.

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

La web requiere las cinco variables `VITE_ENTRA_*`, incluido el scope de la API. Pueden proporcionarse mediante `apps/web/.env` o mediante el entorno al ejecutar Vite. Configura también `VITE_API_URL`: los clientes de identidad y creación no aplican un valor predeterminado.

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
| Web | `VITE_API_URL` | Sin valor predeterminado para identidad y creación | URL base de la API; en desarrollo, `http://localhost:3001`. Para consultar identidad y crear eventos admite HTTPS o HTTP en localhost, sin credenciales, consulta ni fragmento. |
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

Esta entrega no añade pantalla web de consulta, edición, migraciones ni recursos Azure. Validación global aprobada: 250 pruebas de API, 194 de web y 68 de integración PostgreSQL (512 en total), además de typecheck, lint y build. El cierre del PR sigue pendiente. Consulta el [contrato de API](docs/architecture/api-contract.md) para los errores y límites de paginación.

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
