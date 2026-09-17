# Registro de decisiones

| ID | Fecha | Decisión | Estado | Evidencia / consecuencia |
|---|---|---|---|---|
| DEC-001 | 2026-09-15 | OpenEvents será el Work y fuente detallada del proyecto. | Aceptada | El Plan Maestro solo recibe avance ejecutivo. |
| DEC-002 | 2026-09-15 | Repositorio público bajo licencia MIT. | Aceptada | Facilita portafolio y contribución open source. |
| DEC-003 | 2026-09-15 | Monorepo administrado con pnpm workspaces. | Aceptada | Web y API comparten gobierno y CI. |
| DEC-004 | 2026-09-15 | TypeScript de extremo a extremo. | Aceptada | Coherencia y reducción de errores de contrato. |
| DEC-005 | 2026-09-15 | React + Vite para la web. | Aceptada | SPA rápida con camino a PWA. |
| DEC-006 | 2026-09-15 | Fastify para la API. | Aceptada | Buen rendimiento, esquemas y baja complejidad. |
| DEC-007 | 2026-09-15 | PostgreSQL como fuente de verdad. | Aceptada | Integridad relacional y transacciones. |
| DEC-008 | 2026-09-15 | Monolito modular en lugar de microservicios. | Aceptada | Ver ADR-002. |
| DEC-009 | 2026-09-15 | Azure Static Web Apps + App Service + PostgreSQL Flexible Server. | Aceptada para MVP | Ver ADR-003. |
| DEC-010 | 2026-09-15 | GitHub Actions autenticará en Azure mediante OIDC. | Aceptada | Evita secretos Azure de larga duración. |
| DEC-011 | 2026-09-15 | Un check-in por inscripción en el MVP. | Aceptada | Restricción única en base de datos. |
| DEC-012 | 2026-09-15 | El QR utilizará un token opaco sin PII. | Aceptada | Reduce exposición de datos. |
| DEC-013 | 2026-09-15 | Offline completo queda fuera del MVP. | Aceptada | Se preparará contingencia operativa y se reevaluará. |
| DEC-014 | 2026-09-15 | El código existente se clasifica como Iteración 0/spike. | Aceptada | Sirve como aprendizaje; se refactoriza incrementalmente. |
| DEC-015 | 2026-09-15 | La implementación formal del dominio inicia con persistencia. | Aceptada | Evita seguir ampliando datos simulados. |
| DEC-016 | 2026-09-17 | Drizzle ORM + Drizzle Kit + `pg` para persistencia y migraciones. | Aceptada para MVP | Ver ADR-004; migraciones SQL versionadas y revisables. |

## Decisiones pendientes

| ID | Pregunta | Fecha límite sugerida | Mecanismo |
|---|---|---|---|
| PEND-002 | ¿Cuál será la política exacta de retención de PII? | Antes del ambiente Production | Política + ADR si afecta diseño |
| PEND-003 | ¿Cómo se distribuirán los QR en el piloto? | Antes de EP-07 | Decisión de producto |
| PEND-004 | ¿Qué contingencia mínima se usará sin internet? | Antes de la simulación | Runbook + prueba |
| PEND-005 | ¿Se requiere reingreso en el primer piloto? | Antes de cerrar reglas de check-in | Decisión de producto |

## Convención para nuevas decisiones

Una decisión se convierte en ADR cuando:

- cambia estructura, seguridad, operación o tecnología;
- es costosa de revertir;
- afecta varios módulos;
- necesita conservar contexto, alternativas y consecuencias.

