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
- 56 pruebas del validador y 46 de alta manual aprobadas por el mantenedor: 102 en total. Tipos y lint API aprobados. Validación global posterior confirmada mediante salida del mantenedor: 558 pruebas API, 635 web y 211 de integración PostgreSQL, **1.404 aprobadas**. Typecheck, lint y build globales aprobados; git diff --check sin errores. Las 102 focalizadas no se suman nuevamente. Integrado mediante PR #50, merge 514ae9b; CI confirmado en success. Main local sincronizado y rama eliminada según salida del mantenedor.
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

Validación del agente en copia aislada: 824 pruebas web aprobadas (77 nuevas: 47 cliente, 23 vista y 7 sesión), typecheck, lint y build correctos. Este incremento no cambia API, esquema, migraciones ni dependencias. Validación web del mantenedor confirmada: 824 pruebas, typecheck, lint, build y git diff --check correctos. Evidencia manual con una cuenta Entra checkin_operator: listado vacío antes de asignación local, evento asignado visible después, selección y detalle operativo, validación de búsqueda vacía, coincidencia parcial por nombre, coincidencia por correo, limpieza de campo/resultados y búsqueda sin coincidencias. El mantenedor confirmó por texto que volver al listado y seleccionar nuevamente el evento deja el campo de búsqueda vacío. No se acredita paginación, revocación ni cambio de cuenta en navegador; esos escenarios no deben darse por probados manualmente. Validación global confirmada por la salida del mantenedor del 21 de septiembre de 2026: 1.889 pruebas aprobadas (702 API, 824 web y 363 de integración PostgreSQL), typecheck, lint y build correctos. Las pruebas web anteriores están incluidas en este total y no se suman nuevamente. git diff --check sin errores. Integrado mediante PR #62: implementación 7bfb1ad, merge 8320362. CI de main 35672020144 aprobado. Main local sincronizado y limpio y ramas eliminadas según la evidencia del mantenedor del 22 de septiembre de 2026. RF-ATT-003 sigue parcial; búsqueda por código, QR y check-in quedan fuera. Decisiones ADR-050 a ADR-052.


### Emisión interna de credenciales — OE-04-001A (Issue #63)

`issueRegistrationCredentialForOrganizer` emite una credencial opaca para una inscripción confirmada de un evento en borrador o activo. Exige identidad autenticada, rol global organizer, usuario local activo y asignación organizer al evento. Guarda exclusivamente el hash SHA-256 del token y devuelve el token al emisor. La autorización y la escritura se realizan en una transacción; las emisiones simultáneas de la misma inscripción se serializan. Una credencial existente, incluso revocada o expirada, no se reemplaza.

Verificación del agente en copia aislada: typecheck, lint y build aprobados; 131 pruebas focalizadas distintas aprobadas, incluidas 34 nuevas (2 del generador, 25 de integración y 7 de concurrencia) y 97 regresiones. Validación global del mantenedor del 22 de septiembre de 2026: typecheck, lint y build aprobados; 704 pruebas API y 395 de integración PostgreSQL aprobadas. La primera ejecución web obtuvo 822 aprobadas y 2 fallidas (foco del error al registrar y conservación de edición tras resultado incierto). Ambas pasaron aisladamente. Se corrigió la lectura diferida de checked en EditEventForm capturando su valor durante el evento, se reforzó la prueba de marcar/desmarcar y se esperó el efecto de foco con waitFor en RegisterAttendeeForm.test.tsx. Tras el ajuste, las 824 pruebas web, typecheck, lint y build pasaron en copia aislada. Validación web del mantenedor confirmada tras la corrección: 824 pruebas, typecheck, lint y build aprobados. En conjunto quedan verificadas 1.923 pruebas distintas (704 API, 824 web y 395 PostgreSQL), incluidas las 34 nuevas de #63. La API y PostgreSQL no se repitieron después del ajuste exclusivamente web. git diff --check sin errores de espacios; solo avisos CRLF a LF. Las 131 pruebas focalizadas están incluidas en las suites respectivas y no deben sumarse otra vez. Integrado mediante PR #64: implementación 1080257, merge 30aad88. CI de main 35793409546 completed / success verificado. Main local sincronizado y limpio, ramas local y remota eliminadas según la evidencia del mantenedor. No requiere migraciones ni dependencias nuevas. No incorpora ruta HTTP, interfaz, imagen QR, correo, recuperación, reemisión ni check-in. OE-04-001 y RF-ATT-003 siguen parciales. Contrato: docs/architecture/registration-credentials.md. Decisiones ADR-053 a ADR-055.

### Emisión HTTP de credenciales - OE-04-001B (Issue #65)

POST /api/v1/events/:eventId/registrations/:registrationId/qr expone la operación interna de #63 con Bearer, rol global organizer y autorización local por evento. Acepta únicamente una petición sin cuerpo, sin Content-Type y sin parámetros de consulta. Devuelve 201 con id, eventId, registrationId, status, issuedAt UTC y token opaco; no devuelve hash ni datos personales. La ruta no genera una imagen QR.

Todas las respuestas del POST reconocido, incluidos errores de autenticación y entrada, usan Cache-Control: no-store. Los errores mantienen mensajes fijos y los logs propios no incluyen secretos ni excepciones originales. Una credencial existente en cualquier estado produce conflicto; perder la respuesta después del commit no permite recuperar el token ni habilita reintento automático. Continúan vigentes los límites transaccionales y de concurrencia de #63.

Validación del agente en copia aislada: typecheck, lint y build aprobados; 148 pruebas focalizadas distintas, incluidas 59 nuevas (44 HTTP y 15 PostgreSQL) y 89 regresiones. El verificador de identidad está simulado en las pruebas; no acreditan una emisión manual con Entra. La integración usa datos sintéticos y conexiones independientes para probar solicitudes concurrentes; limpia exclusivamente sus fixtures. Validación global del mantenedor confirmada el 22 de septiembre de 2026: 1.982 pruebas distintas aprobadas (748 API, 824 web y 410 PostgreSQL), typecheck, lint y build correctos. Las 148 focalizadas están incluidas en el total y no se suman nuevamente. git diff --check sin errores de espacios; solo avisos CRLF a LF. Integrado mediante PR #66: implementación 1273a44, merge 2f73568. CI de main 35796812981 completed / success verificado. Main local limpio y sincronizado, ramas local y remota eliminadas según la evidencia del mantenedor. Sin migraciones ni dependencias nuevas. No incluye web de emisión, imagen QR, correo, reemisión, recuperación, revocación, caducidad automática ni check-in. OE-04-001 sigue parcial. ADR-056 a ADR-058.

### Emisión web de credenciales - OE-04-001C (Issue #67)

Desde el detalle de una inscripción confirmed, un organizador con acceso verificado puede emitir una credencial de un evento draft/active mediante una acción explícita. El código y sus metadatos se muestran solo en memoria de la vista. Copiar código requiere un clic; si el portapapeles falla, se ofrece selección y copia manual sin repetir la emisión.

El cliente consume el POST de #65 sin cuerpo, Content-Type ni query, valida la respuesta y no sigue redirecciones. La API conserva la autoridad sobre permisos y estados. La web impide envíos repetidos mientras espera y tras éxito/conflicto/resultado incierto en ese detalle. Una respuesta perdida no demuestra rollback y no permite recuperar el secreto desde el hash. Volver al detalle tampoco recupera una credencial anterior.

Al salir voluntariamente con código visible o emisión pendiente se advierte de la posible pérdida; se protege también el cierre de sesión y beforeunload cuando el navegador lo permite. Cambios de cuenta, pérdida de acceso y desmontaje cancelan la espera, retiran el secreto y descartan respuestas tardías sin pedir confirmación de seguridad. La copia voluntaria al portapapeles queda bajo control del usuario; no se promete borrado de memoria ni de copias externas.

Validación del agente en copia aislada: 897 pruebas web aprobadas, incluidas 73 nuevas (43 cliente, 23 vista y 7 sesión), typecheck, lint y build correctos. Pruebas automatizadas de MSAL/API simuladas. Validación web del mantenedor confirmada: 897 pruebas aprobadas, typecheck, lint y build correctos; git diff --check sin errores de espacios, solo avisos CRLF a LF. Captura manual aportada con inscripción de prueba: credencial emitida, código y metadatos visibles y confirmación de copia al portapapeles. Capturas adicionales muestran la advertencia de salida con el código visible y, posteriormente, el conflicto por credencial existente con el botón deshabilitado y sin el código anterior. El mantenedor confirmó además por texto y capturas, usando otra inscripción de prueba, que Cancelar mantiene el detalle y el código visibles. El cierre de sesión con código visible no se ha acreditado manualmente; cuenta con cobertura automatizada. Validación global del mantenedor confirmada el 22 de septiembre de 2026: 2.055 pruebas distintas aprobadas (748 API, 897 web y 410 PostgreSQL), typecheck, lint y build correctos. Las 897 pruebas web, incluidas las 73 nuevas, están incluidas en el total y no se suman nuevamente. git diff --check sin errores de espacios; solo avisos CRLF a LF. Integrado mediante PR #68: implementación e584d61, merge e9c2f85. CI de main 35805213093 completed / success verificado. Issue #67 cerrado; main local limpio y sincronizado y ramas eliminadas según la evidencia del mantenedor. No cambia API, esquema ni dependencias. No incluye imagen QR, descarga, correo, recuperación/reemisión, revocación ni check-in. OE-04-001 permanece parcial. ADR-059 a ADR-061.

### QR web de la credencial - OE-04-001D (Issue #69)

Tras emitir una credencial válida, el detalle del organizador muestra un QR generado localmente que codifica exactamente el token opaco. Conserva texto, metadatos, copia explícita y protecciones de #67. El SVG usa negro sobre blanco y margen de cuatro módulos; no transmite el secreto a un servicio de imágenes ni lo añade a etiquetas accesibles. Un fallo gráfico mantiene disponible el código, muestra un mensaje fijo y no repite la emisión.

La geometría se calcula de forma síncrona y permanece solo en la vista. Se retira con el código al salir o cambiar de cuenta/acceso/contexto. Las respuestas tardías de emisión siguen descartándose mediante las protecciones existentes. No hay recuperación del QR al volver al detalle, almacenamiento persistente, descarga dedicada, correo, reemisión ni check-in.

Validación del agente en copia aislada: 911 pruebas web aprobadas, incluidas 14 nuevas (9 de QR y 5 de integración en el detalle); regresiones de sesión reforzadas. Typecheck, lint y build correctos. Un decodificador independiente recupera exactamente tres tokens sintéticos desde la geometría SVG renderizada a dos escalas. Dependencias fijadas: qrcode 1.5.4 (MIT), @types/qrcode 1.5.6 (MIT) y jsqr 1.4.0 (Apache-2.0, solo pruebas). Lockfile actualizado sin cambios de versiones anteriores. No modifica API ni esquema. Validación del mantenedor confirmada el 23 de septiembre de 2026: instalación con lockfile congelado, typecheck, lint, 911 pruebas web y build aprobados. git diff --check sin errores de espacios; solo avisos de normalización CRLF a LF. Capturas manuales de una inscripción de prueba muestran emisión con QR, código y metadatos, advertencia de salida y permanencia del QR/código tras cancelar. El lector del teléfono reconoce el QR como texto y muestra el código de la vista. No se reproduce el token en la documentación. No se acredita todavía copia mediante el botón web, salida aceptada, cierre de sesión ni vista móvil estrecha como pruebas manuales; los escenarios de ciclo de vida y copia cuentan con cobertura automatizada. Integrado mediante PR #70: implementación b4e42a8, merge 72d7190. CI de main 35891348032 completed / success verificado. Issue #69 cerrado; main local limpio y sincronizado y ramas eliminadas según la evidencia del mantenedor. OE-04-001 sigue parcial. ADR-062 y ADR-063.

### Descarga PNG de credenciales - OE-04-001E (Issue #71)

La vista de una credencial recién emitida permite Descargar QR (PNG) mediante clic explícito. Reutiliza qrcode y el token validado; no emite otra credencial ni envía el secreto a un servicio externo. El PNG contiene exactamente el código, con negro sobre blanco, corrección M, margen de cuatro módulos y escala ocho. El nombre sugerido openevents-credencial.png no contiene token ni datos personales.

Mientras se prepara el archivo se bloquean descargas repetidas. Un fallo conserva el QR y el código, muestra un mensaje fijo y permite reintentar solo el archivo. Salir/cambiar de cuenta, acceso, evento, inscripción o token descarta resultados pendientes. La copia ya entregada al navegador queda bajo control del usuario: la interfaz informa Descarga solicitada, sin asegurar guardado en disco. Se retira el enlace temporal inmediatamente y se revoca la URL de objeto a los 60 segundos tras el inicio, o inmediatamente si el inicio falla. Se conservan los avisos de salida de #67.

Validación del agente en copia aislada: 936 pruebas web aprobadas, incluidas 25 nuevas (10 PNG, 9 descarga, 5 detalle y 1 sesión), typecheck, lint y build correctos. Pruebas PNG con qrcode en Node, decodificación independiente y verificación de dimensiones, colores, margen y ausencia de chunks de texto. La integración DOM simula la preparación/descarga; no acredita por sí sola un guardado en navegador. No se añaden dependencias de producto: pngjs 5.0.0 (ya transitiva) y @types/pngjs 6.0.5 se declaran para pruebas, ambas MIT. Lockfile actualizado sin cambiar versiones anteriores. No modifica API ni esquema. Validación del mantenedor confirmada el 23 de septiembre de 2026: instalación con lockfile congelado, typecheck, lint, 936 pruebas web y build aprobados. git diff --check sin errores de espacios; solo avisos CRLF a LF. Evidencia manual con inscripción de prueba: emisión, QR y botón de descarga visibles, navegador indicando openevents-credencial.png descargado, archivo abierto desde el disco y lectura del PNG con el teléfono. El mantenedor confirmó expresamente que el texto leído coincide exactamente con el código de la web. No se reproduce el token en la documentación. No se acreditan manualmente en esta entrega los fallos, reintentos, cambios de cuenta o salida durante generación; cuentan con cobertura automatizada. Integrado mediante PR #72: implementación 4475cb9, merge ac3c01b. CI de main 35895246424 completed / success verificado. Issue #71 cerrado; main local limpio y sincronizado y ramas eliminadas según evidencia del mantenedor. RF-QR-002 y OE-04-001 deben contrastarse al cierre; descarga no equivale a check-in. ADR-064 y ADR-065.

### Check-in interno persistente - OE-04-002A (Issue #73)

registerCheckInForOperator registra un ingreso y su auditoría en PostgreSQL mediante una sola transacción. Exige usuario activo, rol global checkin_operator y asignación del mismo rol al evento. Solo admite eventos active, inscripciones confirmed y credenciales active sin revoked_at. Los tokens se validan y se comparan por SHA-256, sin cambiar mayúsculas, recortar espacios ni almacenar el secreto.

El primer ingreso devuelve accepted; un intento válido repetido devuelve duplicate con el registro original. Los códigos mal formados, inexistentes, inactivos o de otro evento devuelven invalid sin escritura. Autorización y estado de evento tienen errores separados. Los bloqueos y UNIQUE(registration_id) impiden duplicados; un fallo de auditoría revierte el ingreso. No hay ruta HTTP nueva, pantalla, cámara ni activación/cierre de eventos en este incremento; el demo permanece separado.

Validación del agente en copia aislada: 769 pruebas unitarias de API y 453 de integración PostgreSQL aprobadas (1.222 distintas, incluidas 64 nuevas: 21 de entrada y 43 de persistencia/concurrencia). La primera ejecución amplia encontró migraciones ausentes en la copia aislada; tras copiar la carpeta, las tres suites afectadas pasaron. Los totales cuentan cada caso una sola vez. Typecheck, lint y build de API aprobados. No se repiten las pruebas web sin cambios. Validación global confirmada por la salida del mantenedor del 23 de septiembre de 2026: 2.158 pruebas aprobadas (769 API, 936 web y 453 PostgreSQL), typecheck, lint y build correctos. Las pruebas anteriores están incluidas y no se suman nuevamente. git diff --check sin errores de espacios; solo avisos de normalización CRLF a LF. Integrado mediante PR #74: implementación 983d327, merge 6360e7a. CI de main 35909350092 completed / success verificado. Issue #73 cerrado; main local limpio y sincronizado, rama local y referencia remota eliminadas según evidencia del mantenedor. Sin migraciones ni dependencias nuevas. Contrato en docs/architecture/check-in.md; ADR-066 a ADR-068.

### Check-in HTTP autenticado - OE-04-002B (Issue #75)

POST /api/v1/events/:eventId/check-ins recibe JSON estricto con code y source manual/qr. Autentica Bearer y exige checkin_operator antes del parser; delega permisos locales, estados, unicidad y auditoría a la operación persistente. Devuelve 201 accepted, 409 duplicate o 404 invalid; las dos primeras respuestas proyectan el ingreso original con fecha UTC, sin performedBy ni datos personales. Autorización y estado de evento mantienen errores separados.

Sin query ni campos extra, con límite de cuerpo 1 KiB y code string hasta 256 caracteres, sin normalizar el secreto. Cache-Control: no-store en respuestas de la ruta, incluidos errores. Logs de códigos fijos sin cuerpo, URL, token ni errores originales. No añade reintentos, web, cámara, activación/cierre de eventos, migraciones o dependencias; mantiene separado el demo.

Validación del agente en copia aislada: 827 pruebas unitarias API y 61 PostgreSQL focalizadas aprobadas (888 casos distintos), incluidas 76 nuevas (58 HTTP y 18 integración) y 43 regresiones del check-in interno dentro de las 61. Typecheck, lint y build API correctos. Las pruebas HTTP usan verificador simulado; no acreditan un recorrido manual con Entra. Validación global confirmada por la salida del mantenedor del 23 de septiembre de 2026: 2.234 pruebas aprobadas (827 API, 936 web y 471 PostgreSQL), typecheck, lint y build correctos. Las pruebas anteriores están incluidas y no se suman nuevamente. git diff --check sin errores de espacios; solo avisos de normalización CRLF a LF. Integrado mediante PR #76: implementación 0b85038, merge 6f87944. CI de main 35912048005 aprobado según evidencia verificada del cierre. Issue #75 cerrado; main local limpio y sincronizado y ramas eliminadas según salida del mantenedor. Contrato HTTP y límites en docs/architecture/api-contract.md y docs/architecture/check-in.md. ADR-069 a ADR-071.

### Ciclo de vida interno del evento - OE-02-003A (Issue #77)

activateEventForOrganizer y closeEventForOrganizer permiten exclusivamente draft -> active y active -> closed. Exigen organizer global, identidad válida, usuario activo y asignación organizer al evento. La entrada estricta contiene expectedVersion; se comprueban estado y versión bajo bloqueo, se incrementa version una vez y se audita la transición atómicamente. Se conservan los demás datos del evento, inscripciones, credenciales e ingresos.

READ COMMITTED y bloqueos usuario SHARE, asignación SHARE, evento UPDATE coordinan edición y check-in. Un ingreso que obtiene primero el bloqueo puede confirmarse antes del cierre; un cierre confirmado primero impide el ingreso pendiente. Fallar la auditoría revierte todo. Repetir una transición no produce éxito silencioso. No hay activación por fecha, reapertura, cancelación, HTTP o web nuevos, migraciones ni dependencias.

Validación del agente en copia aislada: 845 pruebas unitarias API y 120 PostgreSQL focalizadas aprobadas (965 casos distintos). Incluyen 77 nuevas (18 de entrada y 59 de integración) y 61 regresiones (18 edición y 43 check-in). Typecheck, lint y build API correctos. No se repiten pruebas web sin cambios. Validación global confirmada por la salida del mantenedor del 24 de septiembre de 2026: 2.311 pruebas aprobadas (845 API, 936 web y 530 PostgreSQL), typecheck, lint y build correctos. Las pruebas anteriores están incluidas y no se suman nuevamente. git diff --check sin errores de espacios; solo avisos de normalización CRLF a LF. Integrado mediante PR #78: implementación 4f5228f, merge d7d1be6. Issue #77 cerrado y CI de main 36030450886 completed / success verificados. Main local limpio y sincronizado y rama local/referencia remota eliminadas según evidencia del mantenedor. Contrato: docs/architecture/event-lifecycle.md; ADR-072 a ADR-074.

### Ciclo de vida HTTP - OE-02-003B (Issue #79)

POST /api/v1/events/:eventId/activate y /close exponen las operaciones internas de #77. Bearer y organizer global se validan antes del parser; usuario activo, asignación organizer, transición, versión y auditoría se delegan a la operación con conexión raíz. JSON estricto con expectedVersion, UUID normalizado, query prohibida y cuerpo hasta 1 KiB. Solo JSON UTF-8.

Respuesta 200 con la proyección existente del evento y fechas ISO UTC. Errores separados de autenticación, autorización, evento inaccesible, transición incompatible y versión obsoleta. no-store también en fallos; errores/logs fijos sin cuerpo, Bearer, URL ni detalles originales. Sin reintentos ni transacción HTTP exterior. Una respuesta perdida puede dejar resultado incierto.

Validación del agente en copia aislada: 959 pruebas unitarias API y 84 PostgreSQL focalizadas aprobadas (1.043 casos distintos). Incluyen 139 nuevas (114 HTTP y 25 PostgreSQL) y 59 regresiones del ciclo de vida interno. Typecheck, lint y build API correctos. Validación global confirmada por la salida del mantenedor del 24 de septiembre de 2026: 2.450 pruebas aprobadas (959 API, 936 web y 555 PostgreSQL), typecheck, lint y build correctos. Las pruebas anteriores están incluidas y no se suman nuevamente. git diff --check sin errores de espacios; solo avisos de normalización CRLF a LF. Integrado mediante PR #80: implementación 3b9ea6f, merge a4bce65. Issue #79 cerrado y CI de main 36033784013 completed / success verificados. Main local limpio y sincronizado y rama anterior eliminada según evidencia del mantenedor. Las pruebas PostgreSQL comprueban commits visibles desde una segunda conexión; el verificador de identidad es simulado. No equivalen a un recorrido manual con Entra. Sin web, cámara, migraciones ni dependencias nuevas. ADR-075 a ADR-077; contrato en docs/architecture/api-contract.md. RF-EVT-002 conserva pendiente el recorrido web.

### Ciclo de vida web - OE-02-003C (Issue #81)

Mis eventos permite activar un borrador y cerrar un evento activo desde el detalle, mediante confirmación explícita que identifica el evento y explica las consecuencias. Usa POST activate/close con cuenta MSAL, scope y expectedVersion vigentes. No ofrece acciones para closed/cancelled ni modifica PATCH de edición.

Una respuesta 200 validada actualiza estado y versión en detalle/listado. Se bloquean doble envío y acciones incompatibles mientras se espera. Conflictos y resultados inciertos requieren consultar el detalle antes de otra transición; no se reintenta ni se atribuye al envío el resultado de la consulta posterior. La salida, cambio de cuenta, pérdida de acceso o sesión descartan respuestas tardías. Cada reapertura del detalle hace una consulta nueva. La incertidumbre no se guarda en storage; reentrar requiere esa consulta.

Validación del agente en copia aislada: 1.019 pruebas web aprobadas, incluidas 83 nuevas (62 cliente, 17 detalle y 4 sesión). Typecheck, lint y build web correctos. No cambia la API, el esquema ni las dependencias. Validación global confirmada por la salida del mantenedor del 24 de septiembre de 2026: 2.533 pruebas aprobadas (959 API, 1.019 web y 555 PostgreSQL), typecheck, lint y build correctos. Las pruebas anteriores están incluidas y no se suman nuevamente. git diff --check sin errores; avisos CRLF/LF de normalización. Capturas del evento sintético «Evento 24 de setiembre» muestran creación en borrador, confirmación de activación, estado activo sin edición, confirmación de cierre, estado cerrado sin activar/cerrar/registrar y fila del listado cerrada. Evidencia manual complementaria del evento sintético «Evento 24 setiembre test2»: la secuencia de capturas anotadas muestra Cancelar activación seguido de Borrador con Activar/Editar disponibles; Aceptar activación seguido de Activo; Cancelar cierre seguido de Activo con Cerrar disponible; Aceptar cierre seguido de Cerrado; listado Cerrado y detalle nuevamente abierto que conserva Cerrado sin acciones de activar/cerrar/editar/registrar. Queda acreditado el recorrido manual solicitado. Conflictos, resultados inciertos y aislamiento conservan cobertura automatizada, sin atribuirles verificación manual. Integrado mediante PR #82: implementación bcfe6d9, merge dd6ddc9. Issue #81 cerrado y CI de main 36050619681 aprobado según evidencia del cierre. Main local limpio y sincronizado y ramas eliminadas según salida del mantenedor. ADR-078 a ADR-080. El check-in web y la cámara siguen pendientes; RF-EVT-002 se contrastará al cierre del recorrido manual.

### Check-in manual web - OE-04-002C (Issue #83)

El detalle activo de Eventos asignados al operador permite pegar/escribir una credencial y registrar un ingreso mediante envío explícito a la API persistente, con source manual. No conecta el demo ni ofrece cámara. Mantiene permisos checkin_operator globales y locales en el servidor; organizer/admin no reciben acceso implícito.

Se distinguen accepted, duplicate e invalid de errores de acceso, evento inaccesible y evento no activo. Duplicado muestra la fecha original, sin atribuirlo al envío actual. Las respuestas deben cumplir el contrato; no hay éxito optimista ni reintentos automáticos. Ante resultado incierto se avisa que pudo registrarse y se permite reenviar explícitamente sujeto a permisos/estados vigentes. El código exacto queda solo en memoria mientras se resuelve; se borra tras resultado definitivo, salida o pérdida de contexto.

Validación del agente en copia aislada: 1.085 pruebas web aprobadas, incluidas 66 nuevas (42 cliente, 20 vista y 4 sesión). Typecheck, lint y build web correctos. La prueba de foco detectó y permitió corregir un intento de enfocar el campo aún deshabilitado: ahora se enfoca después del render que lo habilita. No cambia API, esquema, migraciones ni dependencias. Las pruebas automatizadas web usan simulaciones. Validación web del mantenedor confirmada por la salida compartida: 1.085 pruebas, typecheck, lint y build correctos; copia de 20 archivos verificada con SHA-256 y git diff --check sin errores, solo avisos CRLF/LF. Evidencia manual del mantenedor del 24 de septiembre de 2026, en el evento de prueba «Prueba de edición API 031 - actualizada»: acceso con cuenta operadora en Firefox, evento asignado activo y formulario disponible; emisión de credencial desde la cuenta organizadora; ingreso aceptado con fecha visible 24 de septiembre, 17:02 America/Lima y campo vacío; repetición con aviso de ingreso existente sin crear otro y campo vacío; código inválido rechazado; tras cerrar el evento, listado y detalle muestran Cerrado sin formulario de ingreso y conservan la búsqueda. La captura recortada del duplicado no permite verificar visualmente su fecha original; esa conservación mantiene cobertura automatizada. No se atribuye prueba manual de timeout, revocación, concurrencia o cambio de cuenta. Validación global del mantenedor confirmada el 24 de septiembre de 2026: 2.599 pruebas distintas aprobadas (959 API, 1.085 web y 555 PostgreSQL), typecheck, lint y build correctos. Las pruebas focalizadas ya están incluidas en ese total. La primera revisión git diff --check detectó retornos de carro adicionales en la actualización documental; el paquete se normalizó a LF y el mantenedor confirmó la revisión local y staged de formato sin errores. Integrado mediante PR #84: implementación 7866434, merge 1abee74. Issue #83 cerrado y CI de main 36066119836 completed / success verificados. Main local limpio y sincronizado y ramas eliminadas según salida del mantenedor. Revisión local y staged de git diff --check confirmadas sin errores tras normalizar el paquete a LF. ADR-081 a ADR-083. RF-QR-002 y las historias principales de check-in conservan pendientes fuera de este incremento, incluida cámara.

### Lectura de QR mediante cámara - OE-04-006 (Issue #85)

El operador puede iniciar la cámara en el detalle de un evento asignado y activo, capturar una credencial y confirmar el ingreso con el botón existente. Detectar un QR detiene la cámara y prepara el código, sin enviar por fotograma. La alternativa manual permanece disponible. Una edición del código leído cambia el origen a manual; una confirmación sin editar usa qr. source sigue siendo una declaración del cliente, no una prueba de cámara.

Solo se solicita vídeo mediante acción explícita. Se detienen tracks, temporizadores y vista previa al cancelar, leer, ocultar la página, salir, cambiar cuenta o perder sesión. Los permisos resueltos después de cancelar también liberan el stream. Los frames se decodifican localmente con jsQR; no se suben ni guardan. Se rechazan localmente QR que no tienen formato de credencial, sin abrir URLs. Los permisos, estados y validez real siguen comprobándose en el servidor.

Validación del agente en copia aislada: 1.139 pruebas web aprobadas, incluidas 54 nuevas (27 ciclo de cámara, 4 decodificación real sintética, 10 vista, 8 cliente HTTP y 5 sesión). Typecheck, lint y build web aprobados. jsQR 1.4.0, licencia Apache-2.0, pasa de devDependencies a dependencies; se reutiliza la versión resuelta, se actualiza su clasificación en el lockfile y se incluye su licencia distribuible. Sin API, esquema ni migraciones nuevas. Las pruebas de cámara usan streams/permisos simulados y no acreditan hardware real. Validación web del mantenedor confirmada: instalación con lockfile congelado, 1.139 pruebas, typecheck, lint y build aprobados; copia de 27 archivos verificada con SHA-256 y git diff --check sin errores. Evidencia manual del mantenedor del 25 de septiembre de 2026, en Firefox con webcam del equipo y QR mostrado desde el teléfono: evento de prueba «Prueba de inscripción API 035» activo y accesible al operador; vista previa de cámara; lectura que prepara el código y muestra la confirmación pendiente sin vista previa; ingreso aceptado a las 14:52 America/Lima y campo vacío; nueva lectura y envío con aviso de duplicado que conserva esa misma fecha y limpia el campo. El mantenedor confirmó por texto que probó y detuvo la cámara; la captura posterior muestra el modo manual y el rechazo de un código inválido con campo vacío. No se atribuye prueba manual de permisos denegados, permisos tardíos, ocultación de página, revocación o cambio de cuenta; mantienen cobertura automatizada. No se reproducen credenciales ni capturas con secretos en la documentación. Validación global del mantenedor confirmada por la salida del 25 de septiembre de 2026: 2.653 pruebas distintas aprobadas (959 API, 1.139 web y 555 PostgreSQL), typecheck, lint y build correctos. Las 54 nuevas ya están incluidas en ese total. git diff --check sin errores. Integrado mediante PR #86: implementación a72d9ff, merge 1c9afd5. Issue #85 cerrado y CI de main 36184252122 correcto. Main local limpio y sincronizado; ramas eliminadas según salida del mantenedor. ADR-084 a ADR-086. El demo y sus métricas no quedan conectados por este incremento.

### Estado y fecha de ingreso en inscripciones (Issue #87)

Inscripción y asistencia se muestran por separado: Confirmada/Cancelada permanece y se añade Pendiente de ingreso o Ya ingresó con fecha en la zona horaria del evento. Disponible en listado, búsqueda y detalle del organizador y búsqueda del operador asignado. Texto y color distinguen los estados sin depender solo del color.

Las consultas existentes incorporan checkedInAt: UTC canónico o null, derivado de check_in por registration_id. No se exponen performedBy ni secretos. Se preservan autorización, paginación y consulta histórica de inscripciones canceladas. Repetir búsqueda o actualizar inscripciones consulta el estado persistido; no hay actualización optimista ni sondeo. Una respuesta sin el nuevo campo es inválida, nunca equivale a pendiente. API y web deben actualizarse juntas; reiniciar la API después de copiar.

Validación del agente en copia aislada: 2.673 pruebas distintas aprobadas (963 API, 1.152 web y 558 PostgreSQL), incluidas 20 nuevas: 4 HTTP, 13 web y 3 PostgreSQL. Typecheck, lint y build aprobados en ambas aplicaciones. Se verificaron ingreso manual/QR, duplicado conservando fecha, cancelación con historial, aislamiento entre eventos, revocación del operador, serialización y consultas de actualización. Las pruebas nuevas PostgreSQL usan transacciones con rollback. Sin migraciones, dependencias nuevas ni cambios en las reglas de admisión. Validación local del mantenedor confirmada por la salida compartida: copia de 34 archivos verificada con SHA-256, git diff --check sin errores, typecheck, lint y build correctos y 2.673 pruebas aprobadas (963 API, 1.152 web, 558 PostgreSQL). Evidencia manual del 25 de septiembre de 2026: listado del organizador y búsqueda del operador muestran Confirmada y asistencia por separado; ingresos previos a las 14:52 y 14:55 America/Lima. Pedro pasa de pendiente a Ya ingresó a las 16:21 tras repetir búsqueda; su detalle de organizador confirma esa fecha, distinta de la inscripción a las 14:56. Una nueva inscripción de prueba, Pato lucas, aparece pendiente; el primer ingreso es aceptado a las 16:31 y un segundo envío muestra que ya existe un ingreso y no se creó otro. Los listados posteriores de ambos roles conservan las 16:31. La captura recortada del aviso de duplicado no muestra su fecha, pero los listados posteriores sí. No se atribuye prueba manual de cancelación, revocación ni recarga completa del navegador; esos aspectos conservan la cobertura automatizada aplicable. Integrado mediante PR #88: implementación be80f95, merge 56893b3. Issue #87 cerrado y CI de main 36193567368 aprobado. Main local limpio y sincronizado y rama anterior eliminada según salida del mantenedor. ADR-087. El panel demo y sus métricas siguen fuera de alcance.

### Métricas persistidas de asistencia en API — OE-05-001A (Issue #89)

GET /api/v1/events/:eventId/attendance-summary devuelve registered, confirmed, cancelled, checkedIn, cancelledCheckedIn, pending y observedAt. Cuenta todas las inscripciones del evento mediante una única agregación PostgreSQL, sin depender de páginas. Pendientes son exclusivamente las confirmadas sin ingreso. Los ingresos anteriores a una cancelación se conservan y tienen desglose propio.

Exige Bearer, rol global organizer o checkin_operator, usuario local activo y asignación compatible al evento. Mantiene los bloqueos de autorización durante la lectura. Respuesta sin datos personales ni credenciales, con no-store y errores seguros. Admite consulta histórica en todos los estados del evento. No escribe ni modifica admisión, esquema, dependencias o web.

Validación del agente en copia aislada sobre 56893b3: 1.591 pruebas API aprobadas (1.010 unitarias/HTTP y 581 PostgreSQL), incluidas 70 nuevas (47 unitarias/HTTP y 23 PostgreSQL). Typecheck, lint y build API aprobados. Las pruebas PostgreSQL usan rollback; las HTTP simulan la identidad. No acreditan prueba manual con Entra, carga ni concurrencia nueva. Web sin cambios y sin repetir su suite. Validación global del mantenedor confirmada el 26 de septiembre de 2026: 17 archivos copiados y verificados con SHA-256, git diff --check sin errores, typecheck, lint y build aprobados en ambas aplicaciones y 2.743 pruebas aprobadas (1.010 API, 1.152 web y 581 PostgreSQL). Prueba manual con sesiones del organizador y del operador asignado en el evento sintético Prueba de inscripción API 035: ambas consultas devolvieron HTTP 200, Cache-Control: no-store y registered=4, confirmed=4, cancelled=0, checkedIn=4, cancelledCheckedIn=0, pending=0. observedAt se mostró en PowerShell como 26/09/2026 21:21:09 y 21:30:17, respectivamente; la salida formateada no acredita por sí sola la representación ISO UTC del JSON, cubierta por las pruebas automatizadas. Los intentos intermedios con token recortado fallaron localmente antes de enviar la petición. No se atribuye prueba manual de 401, evento ajeno, revocación, cancelación ni carga; conservan la cobertura automatizada aplicable. No se guardan tokens ni capturas de encabezados. Integrado mediante PR #90: implementación f62e453, merge aaa8c7e. Issue #89 cerrado y CI de main 36273664833 completed / success verificados. Main local limpio y sincronizado y rama anterior eliminada según salida del mantenedor. Contrato en docs/architecture/attendance-summary.md; ADR-088.

OE-05-001 y RF-DAS-001 siguen parciales: OE-05-001A entrega la API; OE-05-001B conectará las tarjetas de la web en otro incremento. El panel demo sigue sin conectar. Actividad reciente, porcentajes, sondeo y pruebas de carga quedan fuera de este issue.

### Tarjetas web con métricas persistidas - OE-05-001B (Issue #91)

El detalle de evento del organizador y del operador asignado muestra Registrados, Ingresaron y Pendientes mediante GET attendance-summary. Conserva el desglose de confirmadas/canceladas, los ingresos históricos de canceladas y la fecha de consulta en la zona del evento. Carga inicial y botón Actualizar métricas; sin polling ni actualización optimista después de registrar un ingreso. Se retiran los números globales de demostración y se identifica como demo el contenido de ejemplo restante.

El cliente usa cuenta y scope vigentes, valida identidad del evento, contadores enteros seguros, invariantes y fecha UTC, y configura no-store, credentials omit y redirect error. Cancela y descarta respuestas tardías al cambiar evento, cuenta, sesión o salir. Al actualizar o fallar desaparecen las cifras previas; nunca se inventan ceros por un error. Los fallos de autorización invalidan el contexto y un evento inaccesible se retira del detalle. No guarda métricas ni tokens en storage.

Validación del agente en copia aislada sobre aaa8c7e: 1.216 pruebas web aprobadas, incluidas 64 nuevas (40 cliente, 10 componente, 7 integración de vistas, 6 sesión y 1 separación del demo). Typecheck, lint y build web aprobados. Sin cambios en API, esquema, migraciones ni dependencias; no se repitieron las suites API/PostgreSQL. Las pruebas usan respuestas simuladas y no acreditan recorrido manual de navegador ni Entra. Validación del mantenedor del 26 de septiembre de 2026: copia de 21 archivos verificada con SHA-256 y git diff --check sin errores. Typecheck y lint aprobados. La primera ejecución de pruebas falló en una espera de carga inicial del componente real de Mis eventos dentro de la prueba CSV; se precargan los módulos reales en beforeAll sin quitar aserciones ni modificar producción. Tras copiar esa corrección, pnpm test aprobó 2.226 pruebas (1.216 web y 1.010 API) y build aprobó ambas aplicaciones. No se atribuye una nueva ejecución de PostgreSQL.

Evidencia manual: organizador y operador asignado muestran 4 registrados, 4 ingresos y 0 pendientes en API 035, con fecha de consulta America/Lima. Una nueva inscripción produce 5/4/1 en ambas vistas. Tras aceptar el ingreso a las 17:10, el operador conserva 5/4/1 hasta actualizar; luego muestra 5/5/0 a las 17:10:51. El organizador confirma 5/5/0 a las 17:11:23 y el detalle de inscripción muestra Ya ingresó. El segundo envío avisa que ya existe ingreso y no creó otro; la consulta posterior conserva 5/5/0 a las 17:13:12. La captura estrecha del operador muestra las tres tarjetas apiladas, con números, desgloses y fecha legibles sin recortes visibles. No se atribuye prueba manual de cancelación, revocación, cambio de cuenta ni fallo de red; conservan cobertura automatizada. No se incorporan capturas con credenciales ni códigos a la documentación. Pendientes commit, PR, CI y merge. ADR-089 y docs/architecture/attendance-summary-web.md.

OE-05-001B cubre la conexión de tarjetas; OE-05-002 (actividad reciente y actualización controlada) sigue pendiente. No se incorporan porcentajes, streaming, sondeo ni pruebas de carga. El recorrido manual de las tarjetas está acreditado; el cierre de integración queda pendiente de PR y CI.
