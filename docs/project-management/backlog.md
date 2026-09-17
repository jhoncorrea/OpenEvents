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
| OE-02-001B | Exponer `POST /api/v1/events` con autenticación, autorización de Organizador y pruebas HTTP. | Pendiente de crear Issue; depende de OE-02-001A y de las capacidades de autenticación y roles de OE-01-001/OE-01-002. |

La estimación de la fila principal se conserva como referencia original; este desglose no añade puntos ni estimaciones independientes.

OE-02-002 mantiene su referencia a OE-02-001. No debe interpretarse la finalización de OE-02-001A como cumplimiento de toda esa dependencia.

El formulario web queda fuera de OE-02-001A y su planificación se definirá por separado.
