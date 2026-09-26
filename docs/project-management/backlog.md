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

OE-04-002A incorpora las garantías internas inseparables de OE-04-003 y OE-04-004: rechazo de códigos y unicidad concurrente. No se suman estimaciones adicionales ni se declaran cerradas las historias principales. Quedan pendientes exposición HTTP autenticada, conexión web, activación/cierre de eventos y recorrido manual/escáner. RF-QR-002 conserva pendiente la resolución operativa del QR desde la interfaz.

### Check-in HTTP autenticado - OE-04-002B (Issue #75)

POST /api/v1/events/:eventId/check-ins recibe JSON estricto con code y source manual/qr. Autentica Bearer y exige checkin_operator antes del parser; delega permisos locales, estados, unicidad y auditoría a la operación persistente. Devuelve 201 accepted, 409 duplicate o 404 invalid; las dos primeras respuestas proyectan el ingreso original con fecha UTC, sin performedBy ni datos personales. Autorización y estado de evento mantienen errores separados.

Sin query ni campos extra, con límite de cuerpo 1 KiB y code string hasta 256 caracteres, sin normalizar el secreto. Cache-Control: no-store en respuestas de la ruta, incluidos errores. Logs de códigos fijos sin cuerpo, URL, token ni errores originales. No añade reintentos, web, cámara, activación/cierre de eventos, migraciones o dependencias; mantiene separado el demo.

Validación del agente en copia aislada: 827 pruebas unitarias API y 61 PostgreSQL focalizadas aprobadas (888 casos distintos), incluidas 76 nuevas (58 HTTP y 18 integración) y 43 regresiones del check-in interno dentro de las 61. Typecheck, lint y build API correctos. Las pruebas HTTP usan verificador simulado; no acreditan un recorrido manual con Entra. Validación global confirmada por la salida del mantenedor del 23 de septiembre de 2026: 2.234 pruebas aprobadas (827 API, 936 web y 471 PostgreSQL), typecheck, lint y build correctos. Las pruebas anteriores están incluidas y no se suman nuevamente. git diff --check sin errores de espacios; solo avisos de normalización CRLF a LF. Integrado mediante PR #76: implementación 0b85038, merge 6f87944. CI de main 35912048005 aprobado según evidencia verificada del cierre. Issue #75 cerrado; main local limpio y sincronizado y ramas eliminadas según salida del mantenedor. Contrato HTTP y límites en docs/architecture/api-contract.md y docs/architecture/check-in.md. ADR-069 a ADR-071.

### Ciclo de vida interno del evento - OE-02-003A (Issue #77)

activateEventForOrganizer y closeEventForOrganizer permiten exclusivamente draft -> active y active -> closed. Exigen organizer global, identidad válida, usuario activo y asignación organizer al evento. La entrada estricta contiene expectedVersion; se comprueban estado y versión bajo bloqueo, se incrementa version una vez y se audita la transición atómicamente. Se conservan los demás datos del evento, inscripciones, credenciales e ingresos.

READ COMMITTED y bloqueos usuario SHARE, asignación SHARE, evento UPDATE coordinan edición y check-in. Un ingreso que obtiene primero el bloqueo puede confirmarse antes del cierre; un cierre confirmado primero impide el ingreso pendiente. Fallar la auditoría revierte todo. Repetir una transición no produce éxito silencioso. No hay activación por fecha, reapertura, cancelación, HTTP o web nuevos, migraciones ni dependencias.

Validación del agente en copia aislada: 845 pruebas unitarias API y 120 PostgreSQL focalizadas aprobadas (965 casos distintos). Incluyen 77 nuevas (18 de entrada y 59 de integración) y 61 regresiones (18 edición y 43 check-in). Typecheck, lint y build API correctos. No se repiten pruebas web sin cambios. Validación global confirmada por la salida del mantenedor del 24 de septiembre de 2026: 2.311 pruebas aprobadas (845 API, 936 web y 530 PostgreSQL), typecheck, lint y build correctos. Las pruebas anteriores están incluidas y no se suman nuevamente. git diff --check sin errores de espacios; solo avisos de normalización CRLF a LF. Integrado mediante PR #78: implementación 4f5228f, merge d7d1be6. Issue #77 cerrado y CI de main 36030450886 completed / success verificados. Main local limpio y sincronizado y rama local/referencia remota eliminadas según evidencia del mantenedor. Contrato: docs/architecture/event-lifecycle.md; ADR-072 a ADR-074.

OE-02-003 se incorpora como desglose explícito de RF-EVT-002: controlar activación y cierre del evento. OE-02-003A entrega la operación interna; quedan pendientes transporte HTTP y recorrido web. Sin estimaciones adicionales. RF-EVT-002 y las historias de check-in no se declaran completas por este incremento.

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
