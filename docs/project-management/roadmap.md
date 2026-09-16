# Roadmap y Gantt

El roadmap considera una capacidad inicial de aproximadamente 5–7 horas por semana. Las fechas son objetivos y se revisarán cada semana.

## Fases

| Fase | Fechas objetivo | Resultado |
|---|---|---|
| Iteración 0 | 15–27 sep 2026 | Stack, repositorio, CI y arquitectura baseline |
| Fundación de datos | 28 sep–25 oct 2026 | PostgreSQL, migraciones y check-in persistido |
| Gestión de eventos/asistentes | 26 oct–29 nov 2026 | CRUD esencial, CSV y búsquedas |
| Identidad y QR | 30 nov 2026–10 ene 2027 | Roles, autenticación y QR operativo |
| Azure y operación | 11 ene–21 feb 2027 | IaC, ambientes, CI/CD y observabilidad |
| Piloto | 22 feb–28 mar 2027 | Pruebas, runbook, simulación y retroalimentación |

## Gantt

```mermaid
gantt
    title OpenEvents — Roadmap inicial del MVP
    dateFormat YYYY-MM-DD
    axisFormat %d %b

    section Fundación
    Spike técnico y GitHub          :done, i0a, 2026-09-15, 6d
    Charter y arquitectura          :active, i0b, 2026-09-21, 7d

    section Datos y dominio
    ORM, Docker y PostgreSQL        :d1, 2026-09-28, 14d
    Check-in persistido y concurrencia :d2, after d1, 14d

    section Producto
    Eventos y asistentes            :p1, 2026-10-26, 21d
    Importación CSV y búsqueda       :p2, after p1, 14d
    QR y escaneo                     :p3, 2026-11-30, 21d
    Identidad y roles                :p4, 2026-12-21, 21d
    Dashboard real                   :p5, 2027-01-04, 14d

    section Plataforma Azure
    Bicep y ambiente Development     :a1, 2027-01-11, 21d
    CI/CD con OIDC                   :a2, after a1, 14d
    Observabilidad y seguridad       :a3, 2027-02-08, 14d

    section Piloto
    Pruebas y hardening              :t1, 2027-02-22, 14d
    Simulación y runbook             :t2, after t1, 14d
    Piloto y retrospectiva           :t3, after t2, 7d
```

## Hitos

| Hito | Evidencia |
|---|---|
| H0 — Baseline aprobada | Documentación y ADR en `main` |
| H1 — Persistencia real | Reiniciar API no pierde check-ins |
| H2 — Recorrido de organizador | Evento e inscripciones gestionables |
| H3 — Recorrido de puerta | QR real, cámara y prevención de duplicados |
| H4 — Desarrollo en Azure | URL de Development y CI/CD automático |
| H5 — Release candidate | Pruebas, seguridad, monitoreo y runbook |
| H6 — Piloto | Evidencia operativa y retrospectiva |

## Regla de ajuste

Si una fase se retrasa, se reduce alcance `Should` antes de ampliar horas o añadir complejidad. Las funciones fuera del MVP no desplazan requisitos `Must`.

