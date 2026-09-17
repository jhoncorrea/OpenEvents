# OpenEvents

OpenEvents es una plataforma open source para gestionar la operación de eventos: asistentes, códigos QR, check-in y métricas de asistencia.

## Estado

Desarrollo incremental del MVP. La interfaz web y las rutas de demostración mantienen el flujo inicial de check-in. Ya están implementados el esquema PostgreSQL, las migraciones versionadas y la operación interna de creación de eventos con persistencia, verificada mediante pruebas de integración.

La creación de eventos todavía no está expuesta mediante una ruta HTTP ni un formulario web. Su publicación requiere incorporar autenticación y autorización.

## Arquitectura inicial

- `apps/web`: aplicación web mobile-first con React y Vite.
- `apps/api`: API REST modular con Fastify.
- `docs/adr`: decisiones de arquitectura.
- `docs/project-management`: planificación y registro de sesiones.

PostgreSQL local y el esquema inicial con migraciones versionadas ya están disponibles. La conexión de los endpoints con la persistencia, la autenticación y los servicios Azure se incorporarán en incrementos posteriores. No se usarán microservicios en el MVP.

## Requisitos

- Node.js 22 o superior.
- pnpm 11.
- Docker Desktop con Docker Compose.

## Ejecutar localmente

```bash
pnpm install
pnpm dev
```

- Web: `http://localhost:5173`
- API: `http://localhost:3001`
- Salud de API: `http://localhost:3001/health`

Código QR de demostración: `OE-2027-001`.

### Variables de entorno

Los archivos `.env` de la API y la web son opcionales para el desarrollo local. Si no existen, ambas aplicaciones utilizan valores predeterminados.

Para personalizar la configuración en PowerShell:

```powershell
Copy-Item .\apps\api\.env.example .\apps\api\.env
Copy-Item .\apps\web\.env.example .\apps\web\.env
```

El primer comando crea la configuración local de la API a partir de su ejemplo. El segundo hace lo mismo para la aplicación web. Los archivos `.env` resultantes están excluidos de Git y no deben versionarse.

| Aplicación | Variable | Valor predeterminado | Descripción |
|---|---|---|---|
| API | `PORT` | `3001` | Puerto TCP utilizado por Fastify. Debe ser un entero entre 1 y 65535. |
| API | `HOST` | `127.0.0.1` | Dirección en la que escucha la API. |
| Web | `VITE_API_URL` | `http://localhost:3001` | URL HTTP o HTTPS utilizada por la web para comunicarse con la API. |
| API / herramientas de base de datos | `DATABASE_URL` | Sin valor predeterminado | URL de PostgreSQL requerida para aplicar migraciones y ejecutar pruebas de integración. |

La API carga opcionalmente `apps/api/.env` y valida la configuración antes de iniciar. La web carga `apps/web/.env` mediante Vite y valida `VITE_API_URL`.

`DATABASE_URL` se valida cuando se ejecutan las operaciones de base de datos. La API de demostración todavía puede iniciar sin esta variable. La generación de migraciones tampoco requiere conexión a PostgreSQL.

Las variables con prefijo `VITE_` son públicas y quedan incluidas en el código enviado al navegador. Nunca deben contener contraseñas, tokens ni otros secretos.

En producción, las variables deben ser proporcionadas por la plataforma de ejecución. Las variables del entorno del sistema tienen prioridad sobre el archivo `.env`.

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
