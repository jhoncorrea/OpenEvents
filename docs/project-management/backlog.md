# Épicas y backlog inicial

Escala de estimación: **1, 2, 3, 5, 8 puntos**. Los puntos expresan complejidad relativa, no horas.

## Épicas

| ID | Épica | Resultado |
|---|---|---|
| EP-00 | Fundación | Repositorio, documentación y calidad base |
| EP-01 | Identidad y acceso | Personal autenticado y autorizado |
| EP-02 | Eventos | Ciclo básico de configuración del evento |
| EP-03 | Asistentes e inscripciones | Lista confiable y operable |
| EP-04 | QR y check-in | Ingreso rápido, seguro y sin duplicados |
| EP-05 | Dashboard | Visibilidad operativa en tiempo casi real |
| EP-06 | Plataforma Azure | IaC, CI/CD, seguridad y observabilidad |
| EP-07 | Piloto | Validación completa con usuarios |

## Backlog priorizado

| Orden | ID | Épica | Historia / tarea | Prioridad | Puntos | Dependencia |
|---:|---|---|---|---|---:|---|
| 1 | OE-001 | EP-00 | Como mantenedor quiero documentación base para desarrollar con dirección. | Must | 3 | — |
| 2 | OE-002 | EP-00 | Configurar protección de `main`, plantilla de Issue y Pull Request. | Must | 2 | OE-001 |
| 3 | OE-003 | EP-00 | Ampliar CI con lint, typecheck, test y build separados. | Must | 3 | — |
| 4 | OE-004 | EP-00 | Definir estrategia de configuración y validar variables de entorno. | Must | 2 | — |
| 5 | OE-005 | EP-03 | Seleccionar ORM/migraciones mediante ADR. | Must | 2 | OE-001 |
| 6 | OE-006 | EP-03 | Crear PostgreSQL local con Docker Compose. | Must | 3 | OE-005 |
| 7 | OE-007 | EP-03 | Implementar esquema inicial y primera migración. | Must | 5 | OE-006 |
| 8 | OE-02-001 | EP-02 | Como Organizador quiero crear un evento para preparar su operación. | Must | 5 | OE-007 |
| 9 | OE-02-002 | EP-02 | Como Organizador quiero editar y consultar un evento. | Must | 3 | OE-02-001 |
| 10 | OE-03-001 | EP-03 | Como Organizador quiero registrar un asistente manualmente. | Must | 5 | OE-007 |
| 11 | OE-03-002 | EP-03 | Como Organizador quiero importar un CSV con validación y reporte. | Must | 8 | OE-03-001 |
| 12 | OE-03-003 | EP-03 | Como Operador quiero buscar una inscripción. | Should | 3 | OE-03-001 |
| 13 | OE-04-001 | EP-04 | Generar un token opaco y QR por inscripción. | Must | 5 | OE-03-001 |
| 14 | OE-04-002 | EP-04 | Persistir el primer check-in de forma atómica. | Must | 5 | OE-04-001 |
| 15 | OE-04-003 | EP-04 | Rechazar código inválido, inactivo o de otro evento. | Must | 3 | OE-04-002 |
| 16 | OE-04-004 | EP-04 | Bloquear solicitudes duplicadas incluso si son simultáneas. | Must | 5 | OE-04-002 |
| 17 | OE-04-005 | EP-04 | Conectar la interfaz actual a los datos persistidos. | Must | 5 | OE-04-002 |
| 18 | OE-04-006 | EP-04 | Escanear QR mediante cámara con alternativa manual. | Must | 5 | OE-04-005 |
| 19 | OE-05-001 | EP-05 | Calcular registrados, ingresaron y pendientes desde PostgreSQL. | Must | 3 | OE-04-002 |
| 20 | OE-05-002 | EP-05 | Mostrar últimos ingresos y actualización controlada. | Should | 3 | OE-05-001 |
| 21 | OE-01-001 | EP-01 | Registrar aplicaciones y configurar autenticación. | Must | 8 | OE-004 |
| 22 | OE-01-002 | EP-01 | Aplicar roles en la API y proteger rutas. | Must | 5 | OE-01-001 |
| 23 | OE-01-003 | EP-01 | Añadir flujo de sesión y rutas protegidas en la web. | Must | 5 | OE-01-001 |
| 24 | OE-06-001 | EP-06 | Definir recursos Azure con Bicep. | Must | 8 | OE-004 |
| 25 | OE-06-002 | EP-06 | Crear ambiente Development con presupuesto/alertas. | Must | 5 | OE-06-001 |
| 26 | OE-06-003 | EP-06 | Desplegar web y API mediante GitHub Actions con OIDC. | Must | 8 | OE-06-002 |
| 27 | OE-06-004 | EP-06 | Integrar Key Vault e identidad administrada. | Must | 5 | OE-06-002 |
| 28 | OE-06-005 | EP-06 | Añadir logs estructurados, trazas y alertas. | Must | 5 | OE-06-002 |
| 29 | OE-07-001 | EP-07 | Ejecutar pruebas de carga y simulación de ingreso. | Must | 5 | OE-06-003 |
| 30 | OE-07-002 | EP-07 | Preparar runbook y plan de contingencia del piloto. | Must | 5 | OE-07-001 |
| 31 | OE-07-003 | EP-07 | Ejecutar piloto, recoger métricas y retrospectiva. | Must | 8 | OE-07-002 |

## Primer incremento formal recomendado

Objetivo: reemplazar la memoria del spike por persistencia confiable sin cambiar todavía toda la interfaz.

Historias:

- OE-005 — ADR de ORM/migraciones;
- OE-006 — PostgreSQL local;
- OE-007 — esquema y migración;
- OE-04-002 — check-in atómico persistido;
- OE-04-003 — código inválido;
- OE-04-004 — duplicados concurrentes;
- pruebas unitarias e integración asociadas.

## Plantilla de historia

```markdown
## Historia
Como [rol], quiero [capacidad], para [beneficio].

## Requisito relacionado
RF-...

## Criterios de aceptación
- Dado...
- Cuando...
- Entonces...

## Pruebas previstas
- Unitarias:
- Integración:
- Manuales:

## Definition of Done
- [ ] CI verde
- [ ] Documentación actualizada
- [ ] Sin secretos
- [ ] Demo o evidencia
```

## Desglose de OE-02-001 — Creación de eventos

OE-02-001 conserva su identificador como historia principal. Se implementará mediante entregas parciales; completar la operación interna no completa por sí solo el recorrido del Organizador.

| Parte | Alcance | Seguimiento |
|---|---|---|
| OE-02-001A | Validación y operación interna de creación de eventos con persistencia PostgreSQL y pruebas. | Issue #15. |
| OE-02-001B | Exponer `POST /api/v1/events` con autenticación, autorización de Organizador y pruebas HTTP. | Issue #21 cerrado. PR #22 integrado en `main`, merge `fd07d89`, CI aprobado. Depende de OE-02-001A y de la autenticación y controles de roles de OE-01-002A (Issue #19, PR #20). |
| OE-02-001C | Formulario web de creación, acceso para organizer, conversión horaria a UTC, errores y borradores por cuenta. | Issue #23 cerrado; PR #24 integrado en main, merge `9abbb99`, CI aprobado. Validaciones previas: 376 pruebas, typecheck, lint y build. Depende de A, B y de la sesión web de OE-01-003A. |

La estimación de la fila principal se conserva como referencia original; este desglose no añade puntos ni estimaciones independientes.

OE-02-002 mantiene su referencia a OE-02-001. No debe interpretarse la finalización de OE-02-001A como cumplimiento de toda esa dependencia.

El formulario web se aborda en OE-02-001C. La entrega B no completa por sí sola el recorrido web del Organizador. Ninguna de estas entregas incorpora autorización por evento mediante `event_staff`, ni consulta o edición de eventos. El cierre de la historia principal deberá contrastarse con sus criterios y dependencias al integrar C.

## Desglose de OE-01-003 — Sesión y rutas protegidas en la web

OE-01-003 conserva su identificador como historia principal. Se implementará mediante entregas parciales; completar el inicio y cierre de sesión no completa por sí solo la protección de las funciones operativas.

| Parte | Alcance | Seguimiento |
|---|---|---|
| OE-01-003A | Integrar inicio y cierre de sesión con Microsoft Entra External ID, configuración validada, visualización de la cuenta y manejo de errores. | Issue #17. |
| OE-01-003B | Proteger las rutas web e integrar el acceso a las operaciones protegidas de la API. | Avance parcial en OE-02-001C (Issue #23) y OE-02-002B (Issue #29): creación y consulta de eventos. Sigue pendiente la protección de las demás funciones web y la planificación de su Issue. Depende de OE-01-003A y de las capacidades de protección de API de OE-01-002. |

La estimación de la historia principal se conserva como referencia original; este desglose no añade puntos ni estimaciones independientes.

La configuración manual del tenant, las aplicaciones y el flujo de usuario constituye avance de OE-01-001; no implica por sí sola la finalización de toda esa historia.

La autorización debe aplicarse en la API. Ocultar elementos o restringir navegación en la web no sustituye la comprobación de permisos en el servidor.

## Desglose de OE-01-002 — Autorización en la API

| Parte | Alcance | Seguimiento |
|---|---|---|
| OE-01-002A | Validar access tokens y roles de aplicación. | Issue #19, PR #20 integrado. |
| OE-01-002B | Identidad local y asignación transaccional del creador en event_staff. | Issue #25 cerrado; PR #26 integrado en main, merge `9fab3f8`. CI de PR y main aprobado según comprobación del mantenedor. Validación local previa: 398 pruebas, typecheck, lint y build. |

OE-01-002B prepara una dependencia de OE-02-002. La consulta y edición deberán aplicar expresamente los permisos por evento. La asignación automática del creador no completa la protección de las demás rutas ni la administración de personal.

OE-02-001C ya está integrado. RF-EVT-001 exige un evento persistido y recuperable: existe persistencia y confirmación de creación; la recuperación mediante API se integró en OE-02-002A y la pantalla de consulta se integró en OE-02-002B. La edición API de borradores está integrada en OE-02-002C; la edición web está integrada en OE-02-002D mediante PR #34, merge `9651330`.

## Desglose de OE-02-002 — Consulta y edición

| Parte | Alcance | Seguimiento |
|---|---|---|
| OE-02-002A | Listado paginado y detalle API para organizadores con autorización por evento. | Issue #27 cerrado; PR #28 integrado en `main`, merge `bf74848`. CI aprobado según comprobación del mantenedor. Validación local previa: 512 pruebas, typecheck, lint y build. |
| OE-02-002B | Listado y detalle web, paginación, estados y aislamiento por cuenta. | Issue #29 cerrado; PR #30 integrado en main, merge `d91995d`. CI aprobado según comprobación del mantenedor. Validación local previa: 581 pruebas, typecheck, lint y build. |
| OE-02-002C | PATCH de borradores con permisos por evento y control de versión. | Issue #31 integrado mediante PR #32, merge `5a1aa30`. CI aprobado antes y después del merge según el mantenedor; main sincronizado y rama eliminada. |
| OE-02-002D | Edición desde la web y resolución de conflictos de versión. | Issue #33 integrado mediante PR #34, merge `9651330`. CI aprobado antes y después del merge según el mantenedor. Main sincronizado y rama local eliminada. |

A utiliza las asignaciones de OE-01-002B y añade recuperación mediante API. B incorpora la pantalla de consulta. C añade edición API solo de borradores y D incorpora la interfaz de edición integrada mediante PR #34. No se añaden estimaciones independientes.


## Desglose de OE-03-001 — Registro manual

| Parte | Alcance | Seguimiento |
|---|---|---|
| OE-03-001A | API de inscripción autorizada por evento, deduplicación y persistencia atómica. | Issue #35 integrado mediante PR #36, merge `4d6d14c`. CI aprobado según el mantenedor; main sincronizado y rama eliminada. Validación previa: 977 pruebas. |
| OE-03-001B | Formulario web de inscripción, confirmación validada, duplicados y aislamiento por cuenta. | Issue #37 integrado mediante PR #38, merge `6fdd8b0`. CI aprobado según el mantenedor; main sincronizado y rama eliminada. Validación previa: 1.091 pruebas. |
| OE-03-001C | Listado y detalle de inscripciones mediante API con autorización por evento. | Issue #39 integrado mediante PR #40, merge `72a91f4`. CI verde según el mantenedor; main sincronizado y rama eliminada. Validación previa: 1.236 pruebas, smoke de ocho casos y práctica Postman. |
| OE-03-001D | Consulta/listado de inscripciones desde la web. | Issue #41 integrado mediante PR #42, merge `2d40ac2`. 1.348 pruebas globales aprobadas. CI de main ejecución #43: Success según el mantenedor; main sincronizado y rama eliminada. |

La historia principal mantiene su estimación original. A incorpora el alta API, B el formulario web y C las consultas API. La interfaz de listado quedó integrada en D (Issue #41, PR #42); no se declara completa la historia principal ni todo RF-ATT-001. No incluye CSV, QR, check-in persistido ni notificaciones. Depende del esquema y de la autorización por evento incorporada en entregas anteriores.


## Desglose de OE-03-002 — Importación CSV

| Parte | Alcance | Seguimiento |
|---|---|---|
| OE-03-002A | Validador interno de bytes CSV, normalización y reporte de errores sin escrituras. | Issue #43, rama `feat/43-registration-csv-validation`. Validación global confirmada por el mantenedor: 1.404 pruebas (558 API, 635 web y 211 de integración), typecheck, lint y build aprobados; práctica CSV válida/inválida y git diff --check correctos. Integrado mediante PR #44, merge `4fd3e88`; CI aprobado, main local sincronizado y rama eliminada. |
| OE-03-002B | Importación interna autorizada y transaccional, conflictos y rollback del lote. | Issue #45, rama `feat/45-registration-csv-import`. 1.441 pruebas globales aprobadas (558 API, 635 web y 248 de integración), typecheck, lint y build correctos; git diff --check limpio según salida del mantenedor. Integrado mediante PR #46, merge `3c716ea`; CI aprobado, main sincronizado y rama eliminada según el mantenedor. |
| OE-03-002C | Idempotencia y recuperación interna de importaciones con comprobante persistido. | Issue #47, rama `feat/47-registration-csv-idempotency`. Migración y segunda ejecución correctas; 1.476 pruebas globales aprobadas (558 API, 635 web y 283 de integración), typecheck, lint y build correctos. git diff --check sin errores de espacios. Integrado mediante PR #48, merge `223d55b`; CI aprobado, main local sincronizado y rama eliminada según evidencia del mantenedor. |

A aporta validación pura, B persistencia interna y C recuperación idempotente. D incorporó HTTP (PR #50) y E incorporó la web (PR #52). El estado de aceptación global de RF-ATT-002 se evalúa por sus criterios, no solo por este desglose. El desglose no añade puntos a la estimación original.


### CSV mediante HTTP - OE-03-002D (Issue #49)

POST y GET `/api/v1/events/{eventId}/registrations/imports` requieren Bearer e Idempotency-Key UUID. POST recibe text/csv hasta 1 MiB como bytes originales y llama a la operación idempotente. GET consulta el comprobante con permisos actuales. Ambos expresan resultado confirmado con 200; GET también admite not_observed, que no significa fallo.

Rama feat/49-registration-csv-http. Verificación del agente en copia aislada: typecheck y lint aprobados; 44 pruebas HTTP nuevas y 12 nuevas de integración PostgreSQL aprobadas. Regresión: 80 pruebas de rutas existentes y 35 de idempotencia aprobadas (171 casos distintos en total). Validación global confirmada por la salida del mantenedor del 21 de septiembre de 2026: **1.532 pruebas aprobadas** (602 API, 635 web y 295 de integración PostgreSQL), typecheck, lint y build correctos. Las 171 focalizadas están incluidas y no se suman de nuevo. git diff --check sin errores de espacios, con avisos de normalización CRLF a LF. Integrado mediante PR #50, merge 514ae9b; CI confirmado en success. Main local sincronizado y rama eliminada según salida del mantenedor. Las pruebas HTTP sustituyen el verificador JWT; no equivalen a una prueba manual con Entra real.

Sin pantalla CSV ni cambios de esquema. RF-ATT-002 continúa pendiente del recorrido web. Contrato completo en docs/architecture/api-contract.md; decisiones ADR-032, ADR-033 y ADR-034.


### CSV web - OE-03-002E (Issue #51)

La pantalla de importación y recuperación consume la API de OE-03-002D. Conserva clave y huella por cuenta/evento en sessionStorage antes de enviar; el CSV queda en memoria. Tras recarga o nueva autorización en la misma pestaña, permite consultar el comprobante y exige volver a seleccionar los mismos bytes para reenviar. not_observed mantiene incertidumbre. El comprobante histórico se distingue del estado actual.

Verificación del agente en copia aislada: typecheck y lint correctos, 152 pruebas focalizadas aprobadas, con 63 casos nuevos. Validación global confirmada por la salida del mantenedor del 21 de septiembre de 2026: 1.595 pruebas aprobadas (602 API, 698 web y 295 de integración PostgreSQL), typecheck, lint y build correctos. Las 152 focalizadas están incluidas y no se suman de nuevo. git diff --check sin errores; solo avisos CRLF a LF. Evidencia manual: importación confirmada de dos inscripciones y recuperación del mismo comprobante, con igual identificador, fecha y cantidad, siguiendo el recorrido de recarga en la misma pestaña, cuenta y evento. Esta comprobación no cubre un corte de red real ni un cambio de cuenta. Integrado mediante PR #52: implementación 88a0cb0, merge 69685f3. CI de main 35622349694 verificado completed / success. El mantenedor confirmó main/origin/main sincronizados y limpios, y la eliminación de la rama local y remota. Sin cambios de API, esquema ni dependencias. Detalles y límites en docs/architecture/registration-csv.md y ADR-035 a ADR-037. RF-ATT-002 no se declara completo automáticamente.


## Desglose de OE-03-003 - Búsqueda de inscripciones

| Parte | Alcance | Seguimiento |
|---|---|---|
| OE-03-003A | Búsqueda interna por nombre/correo, autorización de personal y paginación. | Issue #53, rama feat/53-registration-search. |

Exposición HTTP integrada en OE-03-003B, issue #55 y PR #56. Recorrido web para organizadores en OE-03-003C, issue #57. Interfaz de operadores y búsqueda por código siguen pendientes; esta última depende de las credenciales QR. El desglose no añade puntos a la estimación original.


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

Validación del agente en copia aislada: 897 pruebas web aprobadas, incluidas 73 nuevas (43 cliente, 23 vista y 7 sesión), typecheck, lint y build correctos. Pruebas automatizadas de MSAL/API simuladas. Validación web del mantenedor confirmada: 897 pruebas aprobadas, typecheck, lint y build correctos; git diff --check sin errores de espacios, solo avisos CRLF a LF. Captura manual aportada con inscripción de prueba: credencial emitida, código y metadatos visibles y confirmación de copia al portapapeles. Capturas adicionales muestran la advertencia de salida con el código visible y, posteriormente, el conflicto por credencial existente con el botón deshabilitado y sin el código anterior. El mantenedor confirmó además por texto y capturas, usando otra inscripción de prueba, que Cancelar mantiene el detalle y el código visibles. El cierre de sesión con código visible no se ha acreditado manualmente; cuenta con cobertura automatizada. Validación global del mantenedor confirmada el 22 de septiembre de 2026: 2.055 pruebas distintas aprobadas (748 API, 897 web y 410 PostgreSQL), typecheck, lint y build correctos. Las 897 pruebas web, incluidas las 73 nuevas, están incluidas en el total y no se suman nuevamente. git diff --check sin errores de espacios; solo avisos CRLF a LF. Pendientes commit, PR, CI y merge. No cambia API, esquema ni dependencias. No incluye imagen QR, descarga, correo, recuperación/reemisión, revocación ni check-in. OE-04-001 permanece parcial. ADR-059 a ADR-061.
