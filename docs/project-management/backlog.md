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

OE-02-001C ya está integrado. RF-EVT-001 exige un evento persistido y recuperable: existe persistencia y confirmación de creación; la recuperación mediante API se integró en OE-02-002A y la pantalla de consulta se implementó en OE-02-002B, pendiente de integración. La edición continúa pendiente.

## Desglose de OE-02-002 — Consulta y edición

| Parte | Alcance | Seguimiento |
|---|---|---|
| OE-02-002A | Listado paginado y detalle API para organizadores con autorización por evento. | Issue #27 cerrado; PR #28 integrado en `main`, merge `bf74848`. CI aprobado según comprobación del mantenedor. Validación local previa: 512 pruebas, typecheck, lint y build. |
| OE-02-002B | Listado y detalle web, paginación, estados y aislamiento por cuenta. | Issue #29, rama `feat/29-event-query-web`. Implementación y validación local aprobadas: 581 pruebas globales; 108 relacionadas repetidas tras ajuste de carga. Typecheck, lint, build final sin aviso de tamaño y revisión de espacios aprobados. Comprobación manual de listado, detalle y vuelta. Pendientes revisión final, PR, CI y merge. |
| Posteriores | Edición autorizada de eventos. | Pendiente de planificación; sin Issue asignado en este registro. |

A utiliza las asignaciones de OE-01-002B y añade recuperación mediante API. B incorpora la pantalla web; ninguna de estas entregas completa la edición. No se añaden estimaciones independientes.
