# ADR-001 — Stack inicial de OpenEvents

- **Fecha:** 2026-09-15
- **Estado:** Aceptada

## Contexto

OpenEvents debe ser desarrollado en sesiones de una hora, servir como práctica real de GitHub y DevOps, y evolucionar hacia Azure, contenedores, Terraform y AKS. El MVP no requiere microservicios.

## Decisión

Usar un monorepo pnpm con TypeScript de extremo a extremo:

- React + Vite para la aplicación web mobile-first.
- Fastify para una API REST organizada como monolito modular.
- PostgreSQL como base de datos relacional cuando se incorpore persistencia.
- GitHub Actions para CI/CD.
- Azure como plataforma cloud objetivo.

## Motivos

- Un solo lenguaje reduce el cambio de contexto durante sesiones cortas.
- React permite construir la PWA de check-in.
- Fastify ofrece una API explícita, liviana y fácil de probar y contenerizar.
- PostgreSQL encaja con la integridad transaccional requerida para evitar check-ins duplicados.
- El monorepo facilita cambios coordinados y un pipeline común durante la etapa inicial.

## Consecuencias

- Se deberá mantener separación clara entre web, API y contratos.
- La autenticación, persistencia y Azure se añadirán mediante ADR independientes.
- La división en microservicios solo se evaluará con evidencia operativa.
