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


## 2026-09-20 — OE-03-001B: inscripción desde la web (Issue #37)

### Punto de partida

OE-03-001A quedó integrado mediante PR #36, merge 4d6d14c. El mantenedor confirmó CI aprobado en main, sincronizó el repositorio y eliminó la rama. Esta entrada actualiza los pendientes de integración de la sesión anterior. OE-03-001B se desarrolla en feat/37-attendee-registration-web y todavía no tiene PR ni merge declarados.

### Resultado y evidencia

- Cliente POST con validación de entradas y respuesta 201, token de la cuenta seleccionada, timeout y errores controlados sin reintento automático.
- Formulario de nombre/correo desde el detalle, con lectura reciente del evento, estados draft/active, confirmación accesible y alta siguiente explícita.
- Duplicado conserva datos corregibles. Resultado incierto bloquea reenvíos durante la cuenta montada; navegar o comprobar acceso no elimina ese bloqueo. Recarga/cambio de cuenta sí lo elimina; no hay idempotencia ni reconciliación por GET de inscripciones.
- Datos personales solo en memoria; cancelación y descarte de respuestas tardías al salir o cambiar de cuenta. La autorización sigue en API.
- Validación global aportada por el mantenedor: 397 API + 523 web + 171 PostgreSQL = 1.091 pruebas, typecheck, lint y build aprobados. Incluye 75 pruebas del cliente, 28 del formulario, 34 de MyEvents y 38 de SessionControls; estos grupos forman parte del total web, no se suman otra vez.
- Capturas manuales: dos inscripciones confirmadas con IDs distintos; correo repetido rechazado aunque cambie el nombre. No se reproducen nombres ni correos de las capturas en la documentación.
- git diff --check detectó retornos extra en cuatro archivos generados. Se normalizaron a UTF-8/LF sin cambios de lógica; el mantenedor confirmó diff limpio después de copiarlos nuevamente.

### Threat modeling antes del cierre

| Categoría | Escenario | Mitigación comprobada | Pendiente |
|---|---|---|---|
| Seguridad | Se cambia de cuenta durante un POST y llega información del asistente anterior, o se altera el UUID para inscribir en otro evento. | Estado por cuenta, cancelación y descarte de respuesta tardía; autorización por evento mantenida en API. Pruebas automáticas de sesión y API. | Prueba manual con dos cuentas reales y auditoría operativa. |
| Concurrencia/carga | Doble clic o dos pestañas intentan inscribir el mismo correo. | Bloqueo de envío en formulario/sesión; UNIQUE por evento/correo y transacción existentes en API. | Rate limiting, métricas y pruebas de carga. El bloqueo local no coordina otras pestañas ni clientes. |
| Experiencia | El servidor confirma pero la respuesta se pierde. | Sin reintento automático; aviso y bloqueo conservado al navegar o comprobar acceso. Cobertura automática, no ensayo manual de corte de red. | Consulta autorizada para reconciliar e idempotencia si se habilitan reintentos. Recargar elimina el bloqueo local; no prueba que el envío falló. |

### Decisiones y próximos pasos

ADR-014: resultados inciertos sin reenvío automático. ADR-015: aislamiento por cuenta y datos solo en memoria. ADR-016: confirmación validada y contrato mínimo. No se modifican API, migraciones ni infraestructura. Consulta/listado de inscripciones, CSV, QR y notificaciones quedan fuera de esta entrega; no se cierra la historia principal RF-ATT-001 por completar el formulario.

Pendientes revisión documental, commit, PR, CI y merge. Después del merge: PDF con tres preguntas senior y respuestas ideales, escenarios, párrafo ejecutivo, dos ejemplos documentados por decisión y resumen visual. Nombre base: OpenEvents_OE-03-001B_Registro_asistentes_web_PR<número>.


## 2026-09-20 — OE-03-001C: consultas de inscripciones por API (Issue #39)

### Punto de partida y evidencia

OE-03-001B quedó integrado mediante PR #38, merge 6fdd8b0. El mantenedor confirmó CI verde, sincronizó main y eliminó la rama local. Issue #39 se desarrolla en feat/39-registration-query-api; todavía no se declara commit, PR ni merge de esta entrega.

- GET de listado y detalle con autorización por evento, sin aprovisionamiento ni escrituras. Lectura en todos los estados, incluidos eventos e inscripciones cancelados.
- Paginación por UUID ascendente, límite 20/100, cursor canónico vinculado al evento y consulta limit + 1. No hay orden cronológico ni instantánea entre páginas.
- Proyección explícita de inscripción/asistente, fechas UTC, no-store y errores controlados. Filtro conjunto de inscripción y evento contra acceso cruzado.
- Resultados enviados por el mantenedor: 502 API + 523 web + 211 PostgreSQL = **1.236 pruebas aprobadas**. Typecheck, lint, build y git diff --check aprobados. Se eliminó apps/web/src/issue39-smoke.ts antes de la suite global.
- Nuevas pruebas: 55 de entrada, 50 de rutas, 22 de servicio PostgreSQL y 18 HTTP con PostgreSQL. Son parte de los totales anteriores.
- Smoke manual con cuenta real: listado sin token 401, primera página 200, detalle 200, segunda página 200, cursor de otro evento 400, límite inválido 400, evento inexistente 404 e inscripción inexistente 404. Solo lecturas; no imprime tokens ni datos del asistente. No se probó otra cuenta real.
- Práctica adicional Postman: OAuth con PKCE, callback correcto tras AADSTS50011 y desbloqueo de ventana emergente. Identidad organizer 200, dos inscripciones diferentes en dos páginas, nextCursor null al final, cursor literal inválido 400 y detalle 200. No se incorporan capturas con credenciales ni datos personales al repositorio.
- La configuración manual de Entra reutilizó el registro web de Development con callbacks de escritorio; se documenta el alcance en authentication.md. No se alteró el verificador ni se añadieron secretos.

### Threat modeling antes del cierre

| Categoría | Escenario | Mitigación implementada y evidencia | Pendiente |
|---|---|---|---|
| Seguridad | Un organizer cambia evento o inscripción para leer asistentes ajenos. | Rol global, usuario activo, asignación por evento y filtro conjunto; 404 homogéneos. Pruebas automáticas de actores y eventos cruzados. | Prueba manual con dos identidades reales y auditoría de acceso. |
| Concurrencia/carga | Altas durante la paginación o muchas lecturas mantienen bloqueos. | Páginas acotadas, UUID estable, limit + 1 y transacciones breves con SHARE. Pruebas funcionales de paginación; no se declara ensayo concurrente específico de estas lecturas. | Medir consultas/índices, esperas y carga; rate limiting. No hay snapshot: altas anteriores al cursor pueden quedar fuera del recorrido. |
| Experiencia | El cliente reutiliza un cursor de otro evento o interpreta el fin del listado como error. | Cursor vinculado al evento, 400 controlado, página vacía válida y nextCursor null al final; smoke y Postman. | Pantalla web de listado con reinicio de cursor por evento y mensajes accesibles. Reconciliación de altas inciertas aún no integrada. |

### Decisiones y siguientes pasos

ADR-017: paginación por posición vinculada al evento. ADR-018: autorización transaccional y filtro de pertenencia. ADR-019: contrato mínimo de lectura y estados históricos. No hay migraciones, búsqueda, CSV, QR, notificaciones ni UI nueva. La historia principal OE-03-001 y todo RF-ATT-001 no se declaran completos; queda la consulta web.

Preferencia acordada: usar el archivo temporal de prueba para comprobaciones repetibles y Postman para explorar/aprender. Retirar el archivo antes de commit. Las suites automatizadas siguen siendo la validación de regresión.

Pendientes revisión documental, commit, PR, CI y merge. Después del merge: PDF con tres preguntas senior y respuestas, amenazas, resumen ejecutivo, dos ejemplos documentados por decisión y resumen visual. Nombre base: OpenEvents_OE-03-001C_Consulta_inscripciones_API_PR<número>. Las tres infografías educativas de Postman son material de práctica, no evidencia de cierre del PR.


## 2026-09-20 — Cierre de OE-03-001C y desarrollo de OE-03-001D (Issue #41)

### Punto de partida

El mantenedor confirmó PR #40 integrado, CI verde, main sincronizado en 72a91f4 y eliminación local/remota de feat/39-registration-query-api. Se entregaron PDF e imagen de cierre fuera del repositorio. Se creó Issue #41 y la rama feat/41-registration-query-web desde main limpio.

### Implementación y evidencia

- Cliente GET con token de cuenta seleccionada, validación de respuesta/pertenencia, páginas acotadas, timeout de transporte de 15 segundos y cancelación. El timeout no limita la espera previa de MSAL. Sin reintentos automáticos.
- Pantalla con listado, cargar más, actualizar, detalle y navegación accesible mediante botones, mensajes y gestión de foco. Estado efímero por cuenta/evento y descarte de respuestas tardías.
- Integración en Mis eventos y SessionControls; nueva consulta del evento antes de abrir y al volver. Permite todos los estados para lectura; mantiene las restricciones de alta y edición.
- Tipos y lint web aprobados por el mantenedor. Bloques focalizados aprobados: 189 (cliente y regresiones), 95 (cliente y pantalla), 149 (pantalla, eventos, sesión y alta). Son conjuntos solapados; no representan un total global sumable.
- Nuevos casos: 63 cliente, 32 pantalla, 8 integración en MyEvents y 9 en SessionControls; total de 112 casos nuevos. Los tests simulan API/MSAL; no sustituyen las pruebas de PostgreSQL.
- Capturas: listado con dos inscripciones confirmadas, detalle con origen manual, fecha America/Lima e identificador, regreso al listado y al evento. No se incorporan nombres/correos ni las capturas al repositorio. Una captura del listado no demuestra por sí sola la solicitud de actualización.
- Validación global enviada por el mantenedor: **1.348 pruebas aprobadas**, desglosadas en 502 API, 635 web y 211 PostgreSQL. Typecheck, lint y build aprobados. git diff --check no reporta errores de espacios; aparecen avisos de normalización CRLF a LF en cuatro archivos web. No se declara commit, PR, CI o merge de #41. No se hizo prueba manual con segunda cuenta, paginación web superior a 20, carga o evaluación completa de accesibilidad.

### Threat modeling

| Categoría | Escenario | Mitigación y evidencia | Pendiente |
|---|---|---|---|
| Seguridad | Una respuesta tardía muestra asistentes de otra cuenta/evento, o se pierde la asignación. | Clave por cuenta/evento, abort y secuencia; validación de pertenencia; limpieza en 401/403/404. Pruebas focalizadas. La API conserva autorización. | Segunda cuenta real, auditoría y controles operativos. |
| Concurrencia/carga | Doble clic, páginas repetidas o altas durante el recorrido. | Una solicitud activa, deduplicación, detección de ciclos y páginas de 20; actualizar reinicia. | No hay snapshot; faltan pruebas de carga y rate limiting. |
| Experiencia | Un fallo de página se interpreta como fin o una consulta desbloquea un alta incierta. | Error recuperable, reinicio explícito, sin falso fin tras respuesta inválida; bloqueo de altas inciertas conservado. Pruebas de navegación y regresión. | Reconciliación específica, paginación manual extensa y revisión accesible completa. |

### Decisiones y próximos pasos

ADR-020: aislamiento por cuenta/evento y retiro conservador en 404. ADR-021: navegación con cursor opaco y recuperación explícita. ADR-022: contrato de lectura validado, separado del alta. No se modifican API, migraciones ni infraestructura. La historia principal no se cierra automáticamente por esta implementación; contrastar sus criterios después del merge.

Siguiente: copiar la evidencia final, revisar el diff preparado y crear commit/PR. No repetir la suite global por este ajuste documental. Después de CI y merge, documentar el cierre con PDF y resumen visual siguiendo OpenEvents_OE-03-001D_Consulta_inscripciones_web_PR<número>.


## 2026-09-20 — Cierre de OE-03-001D e inicio de OE-03-002A (Issue #43)

PR #42 integrado en 2d40ac2, implementación c2bd2fb. El mantenedor aportó CI de main con estado Success, ejecución #43, duración 1 min 22 s, y confirmó main limpio/sincronizado y rama eliminada. El número 43 de ese workflow no era el número del PR. El nuevo Issue #43 corresponde a la validación CSV. Se creó feat/43-registration-csv-validation desde main actualizado.

- Validador puro de Uint8Array: UTF-8 estricto, BOM opcional, coma, comillas, LF/CRLF y localización de registros lógicos frente a líneas físicas.
- Límites de 1 MiB, 500 registros de datos y 100 errores. Reporte truncado solo cuando se omite algún error; un fallo estructural puede detener el análisis antes del final.
- Reutiliza reglas de alta manual; detecta duplicados internos del correo normalizado incluso si el primer registro tiene nombre inválido. No consulta PostgreSQL, permisos ni correos persistidos.
- 56 pruebas del validador y 46 de alta manual aprobadas por el mantenedor: 102 en total. Tipos y lint API aprobados. Validación global posterior confirmada mediante salida del mantenedor: 558 pruebas API, 635 web y 211 de integración PostgreSQL, **1.404 aprobadas**. Typecheck, lint y build globales aprobados; git diff --check sin errores. Las 102 focalizadas no se suman nuevamente. Pendientes commit, PR, CI y merge.
- Ejemplos sintéticos válido/inválido ejecutados por el mantenedor tras compilar la API: dos registros normalizados en el válido; DUPLICATE_EMAIL, INVALID_NAME e INVALID_EMAIL en el inválido, sin lote importable ni escrituras. El comprobador no inicia el servidor ni accede a la base de datos.

### Riesgos y límites

Seguridad: contenido mal formado y errores con datos personales. Se limita el archivo antes de decodificar, UTF-8 fatal y mensajes propios sin valores ni logs. Falta el control HTTP, autorización y observabilidad de la futura importación. Las filas válidas pueden contener texto que una futura exportación a hoja de cálculo deba tratar; esto no es una exportación segura de fórmulas.

Concurrencia/carga: se acotan bytes, registros y errores, pero no se promete capacidad de producción. El validador no detecta conflictos con PostgreSQL ni carreras entre importaciones; faltan transacción, restricciones, idempotencia y pruebas de carga del servicio futuro.

Experiencia: confundir registros con líneas o tomar filas parcialmente válidas como importables. El resultado inválido no contiene rows/count; la localización usa registro de datos desde 1 y línea inicial desde 1 incluyendo encabezado. El reporte no promete todos los errores tras un fallo estructural.

ADR-023: formato y límites explícitos. ADR-024: validación completa sin lote parcial. ADR-025: diagnósticos acotados sin valores personales. Próximo paso: copiar esta evidencia documental, revisar el diff preparado y crear commit/PR. No es necesario repetir las pruebas por este ajuste exclusivamente documental. Registrar el número real del PR y el resultado del CI antes del cierre.


## 2026-09-20 — Cierre de OE-03-002A e implementación interna de OE-03-002B

Issue #43 integrado por PR #44 (implementación 5b0f09b; merge 4fd3e88). CI de main 35555184478: Success, 2 min 27 s según la salida aportada; conclusion y SHA verificados en GitHub. El mantenedor confirmó main/origin/main limpios en 4fd3e88 y eliminación de la rama local y remota. Esto cierra los pendientes del registro anterior, sin declarar terminada RF-ATT-002.

Issue #45 creado mediante el formulario «Solicitar una funcionalidad»: problema, solución, beneficiario Organizador, área API, criterios, alternativas, contexto y validación de alcance. Rama feat/45-registration-csv-import creada desde main limpio.

Operación interna importRegistrationCsvForOrganizer: reutiliza CSV, verifica usuario/asignación/evento con SHARE, admite draft/active, inserta perfiles propios y confirmed/csv en una transacción. Inserciones ordenadas por correo ASCII y respuesta en orden original. Conflictos incluso con canceladas revierten todo; no reutiliza perfiles de otros eventos, no reintenta ni incorpora endpoint/migración/web.

Evidencia del mantenedor: typecheck y lint API correctos; 64 pruebas de integración aprobadas (27 nuevas de persistencia CSV, 10 nuevas de concurrencia CSV, 20 y 7 existentes del alta manual). Las 37 nuevas ya estaban aprobadas en la copia de verificación. Ambos resultados se solapan y no se suman. Validación global posterior aportada por el mantenedor: 558 pruebas API, 635 web y 248 de integración, **1.441 aprobadas**; typecheck, lint y build globales correctos, git diff --check sin errores. Pendientes commit, PR, CI y merge de #45.

Seguridad: autorización antes de escrituras/conflictos persistidos; respuestas con datos personales solo internas. Pendiente adaptador autenticado y tratamiento seguro de errores SQL inesperados.
Concurrencia: restricción única, transacción y orden de claves. Pruebas con conexiones independientes y espera de bloqueos reales; no hay garantía general de ausencia de deadlocks ni prueba de carga.
Experiencia: todo el lote o nada ante fallos transaccionales conocidos. Una desconexión durante commit puede dejar resultado incierto; hace falta reconciliación antes de exponer HTTP. Repetir y recibir conflicto no equivale a idempotencia.

Decisiones: ADR-026 atomicidad/autorización, ADR-027 conflictos/orden, ADR-028 resultado interno/reintentos. Siguiente: copiar la evidencia documental actualizada, revisar el diff preparado y crear el commit. No es necesario repetir las pruebas por este ajuste exclusivamente documental. El PDF y la imagen de cierre se generarán con el número real del PR y la evidencia del merge.


## 2026-09-20 — Cierre de OE-03-002B y recuperación interna OE-03-002C

Issue #45 integrado mediante PR #46, implementación 0436906 y merge 3c716ea. CI 35557710086 confirmado completed/success para ese merge. El mantenedor confirmó main/origin/main limpios en 3c716ea y eliminación de la rama local/remota. PDF e imagen de cierre entregados. Quedan resueltos los pendientes de merge del registro anterior.

Issue #47 creado con el formulario «Solicitar una funcionalidad», siguiendo problema, solución, beneficiario Organizador, área API, criterios, alternativas y contexto. Rama feat/47-registration-csv-idempotency creada desde main limpio.

Se añadió registration_csv_import y la migración 0004 con snapshot y journal. Nueva operación idempotente y consulta interna, sin cambiar la primitiva anterior. Clave UUID por evento/organizador, SHA-256 de bytes exactos, snapshot versionado e histórico. Comprobante y lote confirman juntos. READ COMMITTED más bloqueo asesor transaccional serializan la clave; permisos actuales preceden lectura/replay. Recuperar un evento cerrado no inicia nuevas inscripciones.

El mantenedor aplicó db:migrate y lo repitió correctamente; tipos/lint API aprobados y 72 pruebas focalizadas (35 nuevas, 27 y 10 existentes). git diff --check sin errores de espacios; aviso CRLF a LF en schema.ts. La copia de verificación comprobó los mismos 72 casos y correspondencia de esquema/snapshot sin cambios adicionales. No sumar ambos resultados. Validación global confirmada por la salida del mantenedor: **1.476 pruebas aprobadas** (558 API, 635 web y 283 de integración PostgreSQL), typecheck, lint y build globales correctos. git diff --check sin errores de espacios, con aviso de normalización CRLF a LF en schema.ts. Las 72 pruebas focalizadas se solapan con la suite global y no se suman nuevamente. Pendientes commit, PR, CI y merge de #47.

Seguridad: clave no concede permisos; snapshot personal requiere autorización y conservación responsable. Concurrencia: espera real observada en PostgreSQL, commit/rollback del ganador y restricción única; no hay promesa de ausencia universal de deadlocks ni prueba de carga. Experiencia: not_observed no significa fracaso, y el comprobante refleja el resultado histórico, no el estado actual. Se simuló respuesta descartada tras confirmar, no una caída física durante COMMIT.

ADR-029: ámbito de clave y huella de bytes. ADR-030: transacción y coordinación de reintentos. ADR-031: recuperación histórica, autorización y conservación sin purga automática. Siguiente: copiar la evidencia documental actualizada, revisar el diff preparado y crear el commit. No repetir la suite por este ajuste exclusivamente documental. Endpoint/web quedan para próximas entregas; no hay issue siguiente confirmado.


### CSV mediante HTTP - OE-03-002D (Issue #49)

POST y GET `/api/v1/events/{eventId}/registrations/imports` requieren Bearer e Idempotency-Key UUID. POST recibe text/csv hasta 1 MiB como bytes originales y llama a la operación idempotente. GET consulta el comprobante con permisos actuales. Ambos expresan resultado confirmado con 200; GET también admite not_observed, que no significa fallo.

Rama feat/49-registration-csv-http. Verificación del agente en copia aislada: typecheck y lint aprobados; 44 pruebas HTTP nuevas y 12 nuevas de integración PostgreSQL aprobadas. Regresión: 80 pruebas de rutas existentes y 35 de idempotencia aprobadas (171 casos distintos en total). Validación global confirmada por la salida del mantenedor del 21 de septiembre de 2026: **1.532 pruebas aprobadas** (602 API, 635 web y 295 de integración PostgreSQL), typecheck, lint y build correctos. Las 171 focalizadas están incluidas y no se suman de nuevo. git diff --check sin errores de espacios, con avisos de normalización CRLF a LF. Pendientes commit, PR, CI y merge. Las pruebas HTTP sustituyen el verificador JWT; no equivalen a una prueba manual con Entra real.

Sin pantalla CSV ni cambios de esquema. RF-ATT-002 continúa pendiente del recorrido web. Contrato completo en docs/architecture/api-contract.md; decisiones ADR-032, ADR-033 y ADR-034.
