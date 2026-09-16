# OpenEvents — Base de producto y arquitectura

Estado: **Baseline v0.1**  
Fecha: **15 de septiembre de 2026**  
Responsable: **Jhonnatan Correa**

Este directorio contiene la base documental que debe guiar el desarrollo de OpenEvents. El código existente se considera una **Iteración 0 / spike técnico**: valida el stack, el monorepo, GitHub Actions y el flujo básico de check-in, pero no representa aún la arquitectura completa del MVP.

## Orden recomendado de lectura

1. [Project Charter](project-management/project-charter.md)
2. [Alcance del MVP](project-management/mvp-scope.md)
3. [Stakeholders](project-management/stakeholders.md)
4. [Requisitos](project-management/requirements.md)
5. [Arquitectura inicial](architecture/architecture.md)
6. [Modelo de datos](architecture/data-model.md)
7. [Contrato inicial de API](architecture/api-contract.md)
8. [Épicas y backlog](project-management/backlog.md)
9. [Roadmap y Gantt](project-management/roadmap.md)
10. [Registro de riesgos](project-management/risk-register.md)
11. [Registro de decisiones](project-management/decision-log.md)
12. [ADR-002: monolito modular](adr/ADR-002-monolito-modular.md)
13. [ADR-003: despliegue inicial en Azure](adr/ADR-003-despliegue-azure.md)

## Regla de gobierno

Ninguna historia entra a desarrollo si no tiene:

- requisito o necesidad vinculada;
- criterio de aceptación verificable;
- prioridad;
- ubicación clara dentro de la arquitectura;
- pruebas previstas;
- definición de terminado.

## Convenciones

- Los diagramas usan Mermaid y se renderizan directamente en GitHub.
- Las decisiones arquitectónicas importantes se documentan como ADR.
- Los requisitos utilizan identificadores estables (`RF-*` y `RNF-*`).
- El backlog utiliza identificadores de historia (`OE-*`).
- Los cambios se realizan mediante Issue, rama, Pull Request, CI y merge.

