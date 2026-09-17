# ADR-004 — Adoptar Drizzle ORM y migraciones SQL versionadas

- Estado: Aceptada para el MVP
- Fecha: 17 de septiembre de 2026

## Contexto

OpenEvents utilizará PostgreSQL como fuente de verdad y necesita mantener integridad relacional, trazabilidad y comportamiento correcto ante solicitudes concurrentes.

El modelo inicial requiere:

- claves UUID;
- claves primarias compuestas;
- relaciones entre eventos, usuarios, asistentes e inscripciones;
- restricciones únicas;
- fechas con `timestamptz`;
- columnas JSON para auditoría;
- transacciones;
- migraciones repetibles y versionadas.

El flujo de check-in tiene un requisito especialmente importante: si dos solicitudes simultáneas intentan registrar el ingreso de la misma inscripción, solamente una debe crear el registro y la otra debe recibir el resultado `duplicate`.

La protección no puede depender únicamente de una consulta previa en la aplicación porque dos solicitudes podrían comprobar al mismo tiempo que el registro todavía no existe. PostgreSQL debe garantizar la unicidad mediante constraints.

La herramienta seleccionada debe integrarse con TypeScript, Fastify, pnpm, GitHub Actions y el futuro despliegue en Azure Database for PostgreSQL Flexible Server.

## Decisión

Adoptar para el MVP:

- Drizzle ORM para definir el esquema y realizar consultas tipadas desde TypeScript;
- Drizzle Kit para generar y aplicar migraciones;
- `pg` como driver de PostgreSQL;
- migraciones SQL versionadas y almacenadas en Git;
- versiones estables fijadas mediante `pnpm-lock.yaml`.

No se utilizarán versiones beta, release candidate ni otras versiones preliminares para la persistencia del MVP.

## Fuente de verdad del esquema

El esquema declarado en TypeScript mediante Drizzle será la fuente de verdad de la estructura de PostgreSQL.

Las tablas, columnas, claves, relaciones, índices y restricciones esenciales deberán expresarse explícitamente en el esquema.

Las reglas críticas de integridad permanecerán en PostgreSQL. Entre ellas:

- `UNIQUE(event_id, attendee_id)` en `registration`;
- `UNIQUE(registration_id)` en `qr_credential`;
- `UNIQUE(token_hash)` en `qr_credential`;
- `UNIQUE(registration_id)` en `check_in`;
- `PRIMARY KEY(event_id, user_id)` en `event_staff`.

Los tipos TypeScript ayudan durante el desarrollo, pero no reemplazan las restricciones de la base de datos.

## Estrategia de migraciones

El flujo será:

1. Modificar el esquema TypeScript.
2. Ejecutar `drizzle-kit generate`.
3. Revisar manualmente el SQL generado.
4. Versionar la migración y sus metadatos en Git.
5. Aplicar la migración localmente mediante `drizzle-kit migrate`.
6. Validar el cambio mediante pruebas.
7. Aplicar las migraciones pendientes como un paso explícito y único del despliegue.

`drizzle-kit push` podrá utilizarse solamente en experimentos o bases de datos desechables. No se utilizará en ambientes compartidos, CI, Development de Azure ni Production porque modifica directamente el esquema sin conservar el mismo flujo de revisión de una migración versionada.

Las migraciones no se ejecutarán automáticamente al iniciar la API. Ejecutarlas desde cada instancia de la aplicación podría generar carreras durante despliegues con múltiples instancias.

## Estrategia para producción

El pipeline de despliegue ejecutará las migraciones como una etapa controlada antes de actualizar la aplicación o durante una fase compatible del despliegue.

Las migraciones deberán favorecer cambios progresivos y compatibles:

1. Expandir: añadir estructuras compatibles sin eliminar inmediatamente las anteriores.
2. Desplegar el código que utiliza la nueva estructura.
3. Migrar o completar datos cuando corresponda.
4. Contraer: eliminar estructuras antiguas en una migración posterior.

No se dependerá de un rollback automático de DDL. Ante un problema se priorizará una migración correctiva hacia adelante y se mantendrán procedimientos de respaldo y recuperación para incidentes que lo requieran.

## Transacciones y concurrencia

Drizzle proporcionará transacciones para operaciones que necesiten varias escrituras atómicas.

Para el primer check-in:

- PostgreSQL intentará insertar el registro protegido por `UNIQUE(registration_id)`;
- el primer intento válido finalizará como `accepted`;
- un intento simultáneo o posterior producirá una violación de unicidad;
- la API reconocerá la constraint correspondiente y traducirá ese caso a `duplicate`;
- otros errores de base de datos no se convertirán incorrectamente en duplicados.

Cuando una operación incluya check-in, auditoría u otras escrituras relacionadas, se ejecutará dentro de una transacción cuando sea necesario mantenerlas consistentes.

## Gestión de configuración

La conexión se proporcionará posteriormente mediante una variable `DATABASE_URL` validada por la configuración de la API.

Los secretos y credenciales:

- no se guardarán en el repositorio;
- se proporcionarán mediante archivos `.env` ignorados durante el desarrollo local;
- se inyectarán mediante la plataforma y Azure Key Vault en ambientes desplegados.

## Consecuencias positivas

- El esquema y las consultas permanecen en TypeScript.
- El SQL generado puede revisarse antes de aplicarse.
- Las migraciones forman parte del historial de Git.
- Se mantiene proximidad con PostgreSQL y sus capacidades nativas.
- Las consultas conservan tipado estático.
- No se requiere un proceso adicional de generación de cliente.
- Las restricciones de base de datos protegen la concurrencia.
- La solución es compatible con el monolito modular y el monorepo actuales.

## Consecuencias negativas

- El equipo debe comprender SQL y revisar las migraciones generadas.
- Drizzle tiene un ecosistema más joven que alternativas como Prisma y TypeORM.
- Algunos cambios complejos requerirán editar o escribir SQL manualmente.
- Las migraciones destructivas necesitarán planificación especial.
- Se deberá mantener disciplina para no utilizar `drizzle-kit push` fuera de entornos desechables.
- La aplicación deberá traducir explícitamente errores relevantes de PostgreSQL a resultados del dominio.

## Alternativas consideradas

### Prisma ORM

Ofrece una experiencia de desarrollo madura, un esquema declarativo, cliente generado y herramientas de migración.

No se selecciona porque introduce un lenguaje de esquema adicional y una capa de abstracción mayor sobre PostgreSQL. Para OpenEvents se prioriza mantener el SQL visible y aprender directamente las capacidades de PostgreSQL.

### TypeORM

Ofrece entidades, decoradores, repositorios, migraciones y soporte transaccional.

No se selecciona porque añade más abstracción, patrones y comportamiento implícito del necesario para el MVP. El proyecto busca un acceso a datos más explícito y cercano a SQL.

### Kysely

Proporciona un query builder SQL fuertemente tipado y buen control sobre las consultas.

No se selecciona porque requiere administrar más manualmente la definición del esquema y las migraciones. Drizzle ofrece una solución más integrada para esquema TypeScript, consultas y generación de migraciones.

### SQL directo con `pg`

Proporcionaría control total y la menor abstracción posible.

No se selecciona como estrategia principal porque exigiría mantener manualmente tipos, consultas y una herramienta separada de migraciones. Se permitirá SQL explícito cuando una consulta o capacidad específica de PostgreSQL lo justifique.

## Consecuencias para las siguientes historias

- OE-006 creará PostgreSQL local mediante Docker Compose.
- OE-007 instalará las dependencias seleccionadas, definirá el esquema inicial y generará la primera migración.
- OE-04-002 implementará el check-in atómico persistido.
- La automatización de migraciones en Azure se definirá junto con el pipeline de despliegue.

## Revisión

Revisar esta decisión si:

- Drizzle deja de mantenerse o presenta incompatibilidades relevantes;
- las migraciones no cubren necesidades operativas del proyecto;
- se requiere una capacidad de PostgreSQL difícil de representar;
- el proyecto incorpora varios equipos o servicios con necesidades diferentes;
- aparecen requisitos comprobados que justifiquen Prisma, Kysely, SQL directo u otra alternativa.

Un cambio de herramienta deberá documentarse mediante un nuevo ADR que reemplace esta decisión sin eliminar su historial.

## Referencias

- Drizzle ORM — Migrations: https://orm.drizzle.team/docs/migrations
- Drizzle ORM — Transactions: https://orm.drizzle.team/docs/transactions
- Prisma ORM — Prisma Migrate: https://www.prisma.io/docs/orm/prisma-migrate
- TypeORM — Migrations: https://typeorm.io/docs/advanced-topics/migrations/
- TypeORM — Transactions: https://typeorm.io/docs/advanced-topics/transactions/
- Kysely — Migrations: https://www.kysely.dev/docs/migrations