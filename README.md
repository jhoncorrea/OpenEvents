# OpenEvents

OpenEvents es una plataforma open source para gestionar la operación de eventos: asistentes, códigos QR, check-in y métricas de asistencia.

## Estado

La web incorpora inicio y cierre de sesión con Microsoft Entra External ID mediante MSAL. La API valida access tokens y dispone de controles reutilizables de roles. La ruta protegida `GET /api/v1/auth/me` devuelve la identidad y los roles del usuario. El botón «Comprobar acceso» solicita un access token para la API y consulta esa ruta; se verificó manualmente el rol `organizer` con un token real.

`GET /health` sigue público. Las rutas demo `GET /api/events/current` y `POST /api/check-ins`, así como la interfaz demo, siguen disponibles sin autenticación. La autorización por evento mediante `event_staff` está pendiente.

Desarrollo incremental del MVP. La interfaz web y las rutas de demostración mantienen el flujo inicial de check-in. Ya están implementados el esquema PostgreSQL, las migraciones versionadas y la operación interna de creación de eventos con persistencia, verificada mediante pruebas de integración.

La creación de eventos todavía no está expuesta mediante una ruta HTTP ni un formulario web. Su publicación requiere incorporar autenticación y autorización.

## Arquitectura inicial

- `apps/web`: aplicación web mobile-first con React y Vite.
- `apps/api`: API REST modular con Fastify.
- `docs/adr`: decisiones de arquitectura.
- `docs/project-management`: planificación y registro de sesiones.

PostgreSQL local, el esquema inicial con migraciones versionadas, la sesión web y la autenticación de la API ya están disponibles. La conexión de los endpoints de negocio con la persistencia, sus políticas de autorización y el despliegue en Azure se incorporarán en incrementos posteriores. No se usarán microservicios en el MVP.

## Requisitos

- Node.js 22 o superior.
- pnpm 11.
- Docker Desktop con Docker Compose.

## Ejecutar localmente

Antes del primer arranque, configura las variables de autenticación de la API y de la web siguiendo la sección «Variables de entorno». Para iniciar sesión y comprobar el acceso real necesitas acceso al tenant de Microsoft Entra External ID configurado y conexión a internet.

```bash
pnpm install
pnpm dev
```

- Web: `http://localhost:5173`
- API: `http://localhost:3001`
- Salud de API: `http://localhost:3001/health`

Código QR de demostración: `OE-2027-001`.

### Variables de entorno

La API exige las cinco variables `ENTRA_*` indicadas en la tabla y valida su formato antes de escuchar solicitudes. El archivo `.env` es opcional si las variables ya están proporcionadas por el entorno. `PORT` y `HOST` conservan sus valores predeterminados.

La web requiere las cinco variables `VITE_ENTRA_*`, incluido el scope de la API. Pueden proporcionarse mediante `apps/web/.env` o mediante el entorno al ejecutar Vite. Configura también `VITE_API_URL`: la consulta de identidad no aplica un valor predeterminado.

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
| Web | `VITE_API_URL` | Sin valor predeterminado para la consulta de identidad | URL base de la API; en desarrollo, `http://localhost:3001`. Para consultar identidad admite HTTPS o HTTP en localhost. |
| API / herramientas de base de datos | `DATABASE_URL` | Sin valor predeterminado | URL de PostgreSQL requerida para aplicar migraciones y ejecutar pruebas de integración. |
| Web | `VITE_ENTRA_CLIENT_ID` | Sin valor predeterminado | Identificador de la aplicación web registrada como SPA en Entra. |
| Web | `VITE_ENTRA_TENANT_ID` | Sin valor predeterminado | Identificador del tenant externo de Entra. |
| Web | `VITE_ENTRA_TENANT_SUBDOMAIN` | Sin valor predeterminado | Subdominio del tenant, sin protocolo ni sufijo; por ejemplo, `openeventsdevjhon`. |
| Web | `VITE_ENTRA_REDIRECT_URI` | Sin valor predeterminado | URL de retorno registrada para la SPA; en desarrollo, `http://localhost:5173/`. |
| Web | `VITE_ENTRA_API_SCOPE` | Sin valor predeterminado | Scope completo de la API con formato `api://<API client ID>/access_as_user`. |

La API carga opcionalmente `apps/api/.env` y valida la configuración antes de iniciar. Vite carga `apps/web/.env`; la web comprueba las variables de autenticación al iniciar en el navegador. La consulta de identidad valida `VITE_API_URL` antes de solicitar un token.

Si falta una variable de autenticación o su formato es inválido, la API rechaza el arranque o la web muestra un error de configuración, según la aplicación afectada. Después de modificar un `.env`, reinicia el servidor correspondiente.

Los identificadores de aplicación y tenant son configuración pública. La aplicación web no utiliza un secreto de cliente.

`DATABASE_URL` se valida cuando se ejecutan las operaciones de base de datos. La API de demostración todavía puede iniciar sin esta variable. La generación de migraciones tampoco requiere conexión a PostgreSQL.

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

Los botones de sesión y comprobación de acceso comparten un bloqueo para evitar operaciones simultáneas. Los fallos muestran mensajes controlados sin presentar tokens ni errores originales de Entra o de la API al usuario.

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

La sesión web y la consulta protegida de identidad están implementadas. La interfaz de demostración sigue visible sin iniciar sesión y sus endpoints continúan abiertos. La protección de rutas web y la autorización de las operaciones de negocio están pendientes.

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

Estas pruebas no verifican todavía la autorización HTTP ni las solicitudes simultáneas del flujo de check-in. Esas comprobaciones se incorporarán con las implementaciones correspondientes.

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

La función es interna: no autentica usuarios ni comprueba roles. Antes de exponerla mediante `POST /api/v1/events`, deberá integrarse con la autenticación y autorización de Organizador. No debe publicarse como una ruta sin protección.

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
