# Registro de sesiones

## Sesión 001 — 15 de septiembre de 2026

**Tiempo planificado:** 1 hora
**Objetivo:** convertir OpenEvents en un proyecto ejecutable y versionado desde cero.

### Alcance

- Inicializar repositorio Git.
- Definir el stack inicial mediante ADR.
- Crear monorepo con web y API.
- Implementar el primer vertical slice de check-in.
- Ejecutar validaciones.
- Crear el primer commit.

### Resultado

- Repositorio Git local inicializado con rama `main`.
- ADR-001 registra TypeScript, React, Fastify y PostgreSQL como stack inicial.
- Primer vertical slice: la web envía un código y la API devuelve aceptación, duplicado o inválido.
- Pipeline CI preparado para type-check, lint, pruebas y build.
- Type-check y lint completados sin errores.
- Dos pruebas automatizadas del check-in aprobadas.
- Build de producción de web y API completado.
- API verificada: salud `200`, check-in aceptado `200`, duplicado `200` e inválido `404`.

## Sesión 002 — 18 de septiembre de 2026

**Objetivo:** implementar OE-01-002A, validación de access tokens y roles de aplicación.
**Issue:** #19.
**Rama:** `feat/19-api-authentication`.

### Resultado

- Separación de la construcción de Fastify en `app.ts` y el arranque en `server.ts`.
- Validación de la configuración de autenticación antes de iniciar la API.
- Verificación de access tokens con `jose`: firma RS256, emisor, audiencia, claims obligatorios, tenant, aplicación cliente y scope.
- Roles reconocidos: `admin`, `organizer` y `checkin_operator`, sin jerarquía implícita.
- Control HTTP reutilizable con respuestas 401, 403 y 500.
- Ruta protegida `GET /api/v1/auth/me`.
- Solicitud del access token mediante MSAL y consulta desde el botón «Comprobar acceso».
- Manejo de errores sin mostrar tokens ni errores originales del verificador.
- Documentación del comportamiento implementado y sus límites.

### Validación realizada

- Validaciones globales completadas: 134 pruebas de API y 59 de web aprobadas; typecheck, lint, build y revisión de espacios correctos.
- API: 23 pruebas de configuración, 35 del verificador, 16 HTTP y 1 de salud aprobadas en las ejecuciones correspondientes.
- Web: 33 pruebas de configuración y 22 del cliente de autenticación aprobadas.
- Typecheck y lint de API y web completados sin errores después de las correcciones.
- Comprobación manual con Microsoft Entra External ID: la API aceptó un access token real y devolvió el rol `organizer`.

### Límites conservados

- `/health` permanece público.
- Las rutas demo `/api/events/current` y `/api/check-ins` siguen abiertas.
- La interfaz demo no requiere iniciar sesión.
- No se implementó `POST /api/v1/events`.
- No se implementó autorización por evento mediante `event_staff`.
- No se añadieron recursos de Azure.

### Pendiente al registrar esta sesión

- Revisar el diff final y los archivos que se incluirán en el commit.
- Crear commit y pull request, comprobar CI y completar el merge.

## Sesión 003 — 18 de septiembre de 2026

**Objetivo:** implementar OE-02-001B, creación de eventos mediante una ruta API protegida.
**Issue:** #21.
**Rama:** `feat/21-create-event-api`.

### Resultado

- Ruta `POST /api/v1/events` conectada a la operación interna existente.
- Autenticación y autorización con el rol explícito `organizer`.
- Respuesta 201 con el evento en estado `draft` y fechas ISO 8601 UTC.
- Respuestas controladas 400, 401, 403, 409 y 500.
- Manejo de fallos inesperados sin exponer el error original de persistencia.
- Pool PostgreSQL de hasta 5 conexiones, con límites de tiempo.
- Validación de DATABASE_URL y comprobación de conectividad antes de escuchar solicitudes.
- Cierre del pool al cerrar Fastify y manejo de SIGINT y SIGTERM.
- Actualización del README, contrato de API y documentación de autenticación.

### Validación realizada

- 6 pruebas del módulo de conexión aprobadas.
- 20 pruebas HTTP de creación de eventos aprobadas.
- 7 pruebas HTTP con PostgreSQL real aprobadas.
- Las pruebas de integración verifican creación, conflicto de slug, entradas inválidas, rechazo sin token o sin rol y fallo real de escritura.
- Las pruebas HTTP simulan la verificación del token; no se conectan a Entra.
- Las pruebas existentes de salud y autenticación HTTP siguen aprobadas.
- Typecheck y lint de la API completados sin errores.
- Comprobación manual: arranque correcto, GET /health con 200 y POST /api/v1/events sin token con 401.
- Al detener la API con Ctrl+C, la terminal regresó al prompt.
- Validaciones globales aprobadas: 160 pruebas de API, 59 de web y 22 de integración con PostgreSQL; 241 pruebas en total.
- Typecheck, lint, build y git diff --check completados sin errores.

### Límites conservados

- No se modifica el esquema ni se añaden migraciones.
- No se implementa el formulario web.
- No se implementan consulta, edición, activación o cierre de eventos.
- No se asigna personal mediante event_staff.
- No se implementa auditoría completa de acciones sensibles.
- Las rutas demo siguen abiertas y /health permanece público.
- No se añaden recursos de Azure.

### Pendiente al registrar esta sesión

- Ejecutar las validaciones globales y la suite completa de integración.
- Revisar el diff final y los archivos del commit.
- Crear commit y PR, comprobar CI y completar el merge.

## Sesión 004 — 18 de septiembre de 2026

**Objetivo:** implementar OE-02-001C, creación de eventos desde la web.
**Issue:** #23.
**Rama:** `feat/23-create-event-web`.

### Resultado

- Formulario con nombre, slug, inicio, fin, zona horaria y ubicación.
- Validación de campos y conversión a UTC con Temporal; rechazo de horas inexistentes o ambiguas.
- Acceso condicionado a la sesión y a `organizer` comprobado mediante la API.
- Cliente de POST con token de MSAL, confirmación y mensajes controlados.
- Bloqueo de envíos simultáneos y ausencia de reintentos automáticos ante resultados inciertos.
- Borradores en sessionStorage por cuenta, recuperados al recargar y eliminados tras confirmación o antes de salir.
- Etiquetas, foco en el primer campo inválido, estados accesibles y estilos adaptables.
- Carga diferida del formulario después de comprobar organizer.
- Nuevas dependencias: @js-temporal/polyfill 0.5.1; para pruebas, @testing-library/react 16.3.0, @testing-library/dom 10.4.1 y jsdom 26.1.0.

### Validación realizada

- 39 pruebas de validación y conversión horaria.
- 39 pruebas del cliente de creación.
- 18 pruebas de almacenamiento de borradores.
- 23 pruebas del formulario y 16 de sesión: 135 pruebas nuevas, aprobadas en las ejecuciones específicas.
- Typecheck y lint de la web aprobados.
- Build de web aprobado sin aviso de fragmentos mayores de 500 kB: principal de 498,06 kB y formulario de 160,74 kB.
- Comprobación manual con cuenta organizer y token real: creación confirmada en draft, horas de Lima convertidas correctamente a UTC.
- Slug duplicado rechazado, conservando los campos.
- Borrador recuperado tras recargar y comprobar acceso.
- Formulario vacío, salvo America/Lima predeterminado, después de cerrar e iniciar sesión.
- Tras introducir la carga diferida, las 39 pruebas de formulario/sesión, typecheck, lint y build volvieron a pasar.
- Validación global final aprobada: 160 pruebas de API, 194 de web y 22 de integración con PostgreSQL; 376 pruebas en total.
- Typecheck, lint y build globales aprobados.
- Se confirmó en navegador que el formulario aparece con sus estilos después del cambio de carga diferida.

Las pruebas de interfaz simulan MSAL y llamadas de API. Las comprobaciones manuales de creación y borradores se realizaron antes del último cambio de carga diferida. No se ha forzado manualmente una renovación interactiva ni un fallo de red durante el envío.

### Límites conservados

- API, esquema y migraciones sin cambios.
- Sin consulta, edición, activación o cierre de eventos.
- Sin asignaciones event_staff, auditoría completa ni recursos Azure.
- Interfaz y rutas demo abiertas; health público.
- Avance parcial de OE-01-003B, limitado a la creación de eventos.

### Seguimiento de entregas anteriores

- OE-01-002A: Issue #19 cerrado mediante PR #20; merge afd5946.
- OE-02-001B: Issue #21 cerrado mediante PR #22; merge fd07d89 y CI aprobado. Las validaciones globales que figuraban como pendientes en la sesión anterior fueron realizadas antes del cierre.

### Pendiente al registrar esta sesión

- Revisar el diff completo, la documentación y los archivos que se incluirán en el commit.
- Ejecutar git diff --check sobre la documentación final.
- Crear commit y PR, comprobar CI y completar el merge.

## Sesión 005 — 19 de septiembre de 2026

**Objetivo:** OE-01-002B, vincular al organizador con los eventos que crea.
**Issue:** #25.
**Rama:** `feat/25-event-organizer-assignment`.

### Cierre de la entrega anterior

OE-02-001C se integró mediante PR #24, merge `9abbb99`; CI de PR y main aprobado. La copia local se actualizó a main y se eliminó la rama anterior antes de crear la rama de esta sesión.

### Resultado

- Migración para permitir correo y nombre nulos en el usuario, sin inventar datos de perfil.
- Identidad local basada en tenant y objeto de Entra; no se utiliza el correo para asociar permisos.
- Creación de evento y asignación organizer en una transacción, junto con el usuario nuevo si corresponde.
- Reutilización de usuarios y bloqueo de cuentas locales deshabilitadas, sin reactivación automática.
- Conexión de la ruta HTTP a la nueva operación; identidad tomada del token verificado.
- Tratamiento documentado de eventos e identidades anteriores sin asociación automática.

### Validación realizada

- Migración aplicada y 10 pruebas del esquema aprobadas.
- 12 pruebas de la operación y 3 de concurrencia aprobadas.
- 24 pruebas HTTP aisladas de eventos, 16 de autenticación y 1 de salud aprobadas.
- 10 pruebas HTTP con PostgreSQL aprobadas, incluidos usuario deshabilitado y reversión por fallo de asignación.
- Typecheck y lint de API aprobados en las ejecuciones específicas.
- Comprobación manual con sesión real: evento `prueba-organizador-001` creado desde la web; ID coincidente y una asignación organizer confirmados en PostgreSQL.

### Límites y pendientes

- No se añaden consulta, edición ni administración de personal; la autorización de esas operaciones por evento sigue pendiente.
- auth/me no consulta el estado local; el usuario deshabilitado queda bloqueado al crear eventos.
- No hay asignación retroactiva de eventos, auditoría completa ni recursos Azure nuevos.
- Validación global aprobada: 164 pruebas de API, 194 de web y 40 de integración PostgreSQL; 398 en total. Typecheck, lint, build y git diff --check aprobados.
- Pendientes revisión de los archivos preparados para commit, commit, PR, CI y merge.

## Sesión 006 — 19 de septiembre de 2026

**Objetivo:** OE-02-002A, consultar eventos con autorización por evento.
**Issue:** #27.
**Rama:** `feat/27-event-query-api`.

### Cierre anterior

Issue #25 integrado mediante PR #26, commit de merge `9fab3f8`. El mantenedor confirmó CI verde en PR y main; copia local sincronizada y rama anterior eliminada.

### Resultado

- GET de listado y detalle conectado a PostgreSQL.
- Organizer global y por evento, identidad local activa, aislamiento por tenant/objeto.
- Lista vacía para identidad no aprovisionada; sin escrituras de usuarios o asignaciones.
- Paginación por UUID ascendente, 20 elementos predeterminados y máximo 100, cursor versionado.
- Respuestas genéricas controladas y 404 indistinguible para evento ajeno o inexistente.
- Sin nueva migración ni pantalla web de consulta.

### Validación realizada

- 45 pruebas de entradas y cursores aprobadas.
- 16 pruebas de operación PostgreSQL aprobadas.
- 41 pruebas HTTP de consulta aprobadas; 82 junto con creación, autenticación y salud.
- 12 pruebas HTTP PostgreSQL aprobadas, incluido fallo real de lectura sin exposición de detalles.
- Typecheck y lint de API aprobados en las ejecuciones específicas.
- Comprobación manual con sesión real: listado y detalle 200 para `prueba-organizador-001`, ID `a4f7de46-61b4-4fb0-955f-cccbf6774705`; ausencia de token 401, evento inexistente 404 y límite 101 rechazado con 400.
- No había segunda página en la cuenta manual. Paginación y acceso entre cuentas cubiertos por pruebas automatizadas con verificador simulado.

### Límites y pendientes

- Comprobador temporal `apps/web/src/issue27-smoke.ts` retirado tras la validación manual.
- Validación global aprobada: 250 pruebas de API, 194 de web y 68 de integración PostgreSQL; 512 en total. Typecheck, lint y build aprobados.
- Pendientes comprobación final de espacios, revisión del diff, commit/PR, CI y merge.
- Consulta web, edición, acceso de operadores, administración de personal, auditoría y Azure pendientes.
- La paginación no es una instantánea y no tiene orden cronológico. auth/me y rutas demo conservan su comportamiento.

## Sesión 007 — 19 de septiembre de 2026

**Objetivo:** OE-02-002B, listar y consultar eventos desde la web.
**Issue:** #29.
**Rama:** `feat/29-event-query-web`.

### Cierre anterior

Issue #27 integrado mediante PR #28, merge `bf74848`. El mantenedor confirmó CI verde tras el merge, sincronizó main y eliminó la rama anterior.

### Resultado

- Cliente web para listado paginado y detalle, validación de respuestas y errores controlados.
- «Mis eventos» con carga explícita, actualización, más resultados, detalle y regreso al listado.
- Fechas en la zona horaria del evento y etiquetas de estado.
- Cancelación y descarte de respuestas tardías al cambiar de cuenta o perder acceso; limpieza de datos consultados.
- Integración con sesión y creación, conservando borradores y permitiendo recargar el listado tras crear.
- Carga diferida de consultas e interfaz; autenticación separada en el build sin aumentar el umbral de aviso.

### Validación realizada

- 43 pruebas del cliente y 18 del componente; 8 nuevas de sesión (24 de sesión en total).
- Validación global: 250 pruebas API, 263 web y 68 de integración PostgreSQL, 581 en total. Typecheck, lint y build aprobados.
- Después de separar la carga del cliente se repitieron las 108 pruebas relacionadas, typecheck y lint web, todos aprobados.
- Build final con configuración local: principal 240,51 kB, autenticación 259,39 kB; sin aviso de tamaño. `git diff --check` aprobado antes de actualizar documentación.
- Comprobación manual con sesión real: listado y detalle de `prueba-organizador-001`, fechas 09:00–17:00 de Lima y vuelta al listado.
- Paginación, aislamiento entre cuentas, cancelaciones y recarga después de crear cubiertos automáticamente; no se declara su comprobación manual.

### Límites y pendientes

- Sin edición, migraciones, endpoints nuevos ni recursos Azure. La demo sigue pública.
- Listado por UUID, sin orden cronológico ni instantánea entre páginas. Carga y actualización explícitas.
- Pendientes revisión de documentación y diff, commit, PR, CI y merge.

## Sesión 008 — 19 de septiembre de 2026

**Objetivo:** OE-02-002C, editar eventos en borrador con autorización por evento.
**Issue:** #31. **Rama:** `feat/31-event-edit-api`.

### Cierre anterior

Issue #29 integrado mediante PR #30, merge `d91995d`. El mantenedor confirmó CI verde, sincronizó main y eliminó la rama anterior. Los informes usan el formato `OpenEvents_<código-OE>_<descripción>_PR<número>`.

### Resultado y validación

- PATCH parcial de seis campos, sin cambios de estado ni identidad; validación del evento combinado.
- Migración 0002 para version positiva y obligatoria, inicializada a 1. POST y GET devuelven version.
- Usuario y asignación protegidos con SHARE; evento con UPDATE. Versión esperada obligatoria y actualización atómica.
- Errores controlados 400/401/403/404/409/500; CORS permite PATCH desde la web configurada.
- 44 pruebas de entrada, 18 de operación, 3 de concurrencia, 27 HTTP aisladas, 16 HTTP PostgreSQL y 4 nuevas del esquema: 112 pruebas nuevas.
- Validación global: 321 API + 263 web + 109 integración = 693 pruebas aprobadas. Typecheck, lint, build y git diff --check aprobados antes de documentación.
- Manual con sesión real: 401 sin token, creación 201, edición 200, versión antigua 409, intervalo inválido 400 y GET final 200. El evento quedó draft, versión 2, sin modificación por los rechazos.
- Evento manual: `19507afb-5cb9-420e-bf70-781fe9a898b0`; slug `prueba-edicion-88515823-db88-437b-a0b6-2505fe02cbe9`. Permanece como dato local de prueba.
- Comprobador temporal issue31-smoke.ts retirado. No se modificaron eventos anteriores en la prueba manual.

### Threat modeling antes del cierre

| Categoría | Escenario | Mitigación comprobada | Pendiente |
|---|---|---|---|
| Seguridad | Cambiar ID o inyectar status/identidad para editar un evento ajeno. | Lista estricta de campos, identidad del token, usuario activo y asignación; mismo 404 ajeno/inexistente. Pruebas de rol, tenant y asignación. | Prueba manual con dos cuentas; prueba concurrente de revocación; auditoría de cambios. |
| Concurrencia/carga | Dos organizadores guardan la misma versión o compiten por slug. | Versión esperada, bloqueos transaccionales y unicidad. Tres pruebas con conexiones independientes confirman un ganador y conservación del perdedor. | Pruebas de carga, métricas de espera/bloqueos, rate limiting y coordinación de futuros escritores. |
| Experiencia | Se pierde la respuesta tras guardar y el cliente intenta repetir. | GET expone versión; repetir con versión antigua produce conflicto en vez de sobrescribir. Pruebas de edición obsoleta y lectura posterior. | UI de edición, conservación de cambios locales y comparación/recuperación explícita; no hay idempotencia ni reintento automático. |

Los bloqueos evitan revocar a mitad de una escritura que ya los obtuvo, pero no cancelan retroactivamente esa escritura. Version requiere disciplina de todos los escritores; SQL directo no está cubierto automáticamente. El máximo integer requiere evolución si se alcanza.

### ADR y pendientes

ADR-005: edición parcial solo de borradores. ADR-006: versión persistida y control de concurrencia. ADR-007: autorización estable durante la escritura. Se registran contexto, decisión y consecuencias.

Pendientes revisión documental y diff, commit, PR, CI y merge. Sin formulario web, activación/cierre, auditoría completa ni Azure. Tras el merge se prepararán tres preguntas senior con respuestas, párrafo ejecutivo de cinco líneas, ejemplos documentados, PDF e imagen con código OE primero.

## Sesión 009 — 19 de septiembre de 2026

**Objetivo:** OE-02-002D, editar eventos en borrador desde la web.
**Issue:** #33. **Rama:** `feat/33-event-edit-web`.

### Cierre anterior

Issue #31 integrado mediante PR #32, merge `5a1aa30`. El mantenedor confirmó CI verde antes y después del merge, sincronizó main y eliminó la rama anterior.

### Resultado y evidencia

- Cliente PATCH con validación de versión, respuesta y errores controlados; sin reintentos automáticos.
- Editor de seis campos, diferencias parciales, fechas en zona del evento y conversión que conserva instantes.
- Recuperación explícita tras versión obsoleta o resultado incierto: consulta, comparación, selección y guardado separado.
- Integración con detalle/listado, sesión y borrador independiente de creación. Cancelación y descarte de respuestas tardías.
- 146 pruebas web adicionales: 409 web en total, 321 API y 109 PostgreSQL; 839 aprobadas en la validación completa aportada por el mantenedor. Tipos, lint y build aprobados. Diff sin errores de espacios, con avisos CRLF/LF.
- Manual: ubicación cambiada a Chile; dos pestañas provocaron conflicto. La captura muestra antes A, propuesta C y actual B, versión consultada 4. El mantenedor confirmó que la selección y el guardado posterior funcionan. No se afirma una versión final verificada por consulta independiente.
- La compilación genera archivos separados para editor y cliente PATCH, sin avisos de tamaño.

### Threat modeling antes del cierre

| Categoría | Escenario | Mitigación implementada y probada | Pendiente |
|---|---|---|---|
| Seguridad | Una respuesta tardía muestra datos de la cuenta anterior o el cliente intenta editar un evento ajeno. | Cancelación y descarte por cuenta; limpieza al perder acceso; la API mantiene autorización por evento. Pruebas automáticas de sesión y permisos. | Comprobación manual con dos identidades distintas; auditoría de cambios. |
| Concurrencia/carga | Dos pestañas guardan la misma versión o el usuario repite el envío. | Versionado del servidor, bloqueo de doble envío y revisión explícita sin autosave. Conflicto confirmado manualmente. | Medir carga y esperas; rate limiting. El bloqueo del formulario no limita solicitudes de clientes externos. |
| Experiencia | Se corta la red después de confirmar la escritura y el usuario desconoce si guardó. | Mensaje de resultado incierto, propuesta en memoria, consulta y comparación antes de reenviar. Pruebas automáticas; no se afirma prueba manual de corte de red. | Ensayo manual de pérdida de respuesta; una recarga descarta la propuesta y no hay garantía de idempotencia. |

### Decisiones y pendientes

ADR-008: recuperación explícita de conflictos y resultados inciertos. ADR-009: aislamiento de edición por cuenta y estado solo en memoria. ADR-010: conversión horaria que conserva instantes. Pendientes revisión documental y diff, commit, PR, CI y merge. No se añaden migraciones, endpoints, cambios de estado, administración de organizadores ni recursos Azure.

Después del merge: informe con tres preguntas senior y respuestas, resumen ejecutivo, dos ejemplos documentados por decisión y resumen visual. Nombre de entrega con código OE primero: `OpenEvents_OE-02-002D_Edicion_web_borradores_PR<número>`; el número se completará cuando exista el PR.

## OE-03-001A — Registro de asistentes por API (Issue #35)

### Punto de partida y estado

OE-02-002D se integró mediante PR #34, merge 9651330. El mantenedor confirmó CI verde antes y después, sincronizó main y eliminó la rama local. Issue #35 se desarrolla en feat/35-attendee-registration-api. Implementación validada localmente; no se declara PR, CI ni merge de esta entrega todavía.

### Resultado y evidencia

- POST protegido por organizer global, identidad local activa y asignación organizer al evento; admite draft/active.
- Cuerpo estricto fullName/email, normalización explícita; status confirmed y source manual fijados por servidor.
- Migración 0003, unicidad por evento/correo y perfiles independientes. Transacción sin asistentes huérfanos ante conflicto o fallo.
- Bloqueos compartidos coordinan autorización y estado; siete pruebas de concurrencia con conexiones independientes.
- Validación global enviada por el mantenedor: 397 API + 409 web + 171 integración PostgreSQL = 977 pruebas aprobadas. Typecheck, lint y build aprobados. Diff sin errores de espacios; avisos CRLF/LF.
- Manual con sesión real: 401 sin token, evento 201, inscripción 201, duplicado 409, estado e identidad suministrados por cliente 400, evento inexistente 404. Al inicio la API antigua respondió 404; reiniciarla recompiló y habilitó la ruta. Esos intentos iniciales se detuvieron antes de crear datos.
- SQL confirmó una sola inscripción 1a79eced-c195-44ae-b006-5bbe15189556 para el evento 33f82177-3ac6-4969-8be2-de9710100103: confirmed/manual, nombre original y correo normalizado. Son datos ficticios locales; no se enviaron correos ni QR. El comprobador temporal fue eliminado.

### Threat modeling antes del cierre

| Categoría | Escenario | Mitigación comprobada | Falta agregar |
|---|---|---|---|
| Seguridad | Un organizer cambia el UUID para inscribir en un evento ajeno o conocer perfiles de otro evento. | Autorización por evento dentro de la transacción, mismo 404 ajeno/inexistente, sin perfiles globales por correo; pruebas de permisos y aislamiento. | Prueba manual con dos cuentas reales, auditoría y límites de peticiones. |
| Concurrencia/carga | Dos solicitudes inscriben el mismo correo o coinciden con revocación/cierre. | UNIQUE por evento/correo, rollback de ambas inserciones y bloqueos compartidos; pruebas concurrentes deterministas. | Pruebas de carga, métricas de espera y política operativa de timeouts/deadlocks; las pruebas funcionales no acreditan capacidad. |
| Experiencia | Se confirma la inscripción pero se pierde la respuesta; repetir devuelve 409. | Unicidad impide otra inscripción y el error no expone el perfil anterior. Mitigación parcial: no recupera la respuesta perdida. | Consulta autorizada y flujo web de recuperación; evaluar clave de idempotencia antes de habilitar reintentos automáticos. |

### Decisiones y próximos pasos

ADR-011: identidad y unicidad por evento. ADR-012: autorización y creación atómicas. ADR-013: contrato mínimo y errores sin datos personales. Pendientes revisión documental y diff, commit, PR, CI y merge. Después del merge se generará el informe con tres preguntas senior, respuestas ideales, dos ejemplos documentados por decisión y resumen visual. Nombre base: OpenEvents_OE-03-001A_Registro_asistentes_API_PR<número>.
