# ADR-003 — Despliegue inicial administrado en Azure

- Estado: Aceptada para el MVP
- Fecha: 15 de septiembre de 2026

## Contexto

El proyecto debe demostrar Azure y DevOps sin convertir la operación de Kubernetes o máquinas virtuales en el objetivo principal. La solución requiere hospedar una SPA React, una API Node.js y PostgreSQL.

## Decisión

Usar inicialmente:

- Azure Static Web Apps para `apps/web`;
- Azure App Service Linux para `apps/api`;
- Azure Database for PostgreSQL Flexible Server;
- Azure Key Vault;
- Application Insights/Azure Monitor;
- GitHub Actions con OIDC;
- infraestructura como código, preferentemente Bicep en la primera etapa Azure.

## Consecuencias positivas

- menos administración de infraestructura;
- integración directa con GitHub;
- servicios alineados con el stack existente;
- camino claro para seguridad, observabilidad y automatización;
- aprendizaje aplicable a AZ-104 y Azure DevOps.

## Consecuencias negativas

- costo mensual si los recursos permanecen activos;
- dependencia de servicios administrados Azure;
- algunas capacidades avanzadas requieren planes pagados;
- se debe vigilar networking, CORS y autenticación entre frontend y API.

## Alternativas

- Azure Container Apps: candidata para una evolución con contenedores.
- AKS: descartado para el MVP por complejidad y costo.
- VM Linux: descartada por mantenimiento innecesario.
- Azure Functions: viable para endpoints pequeños, pero el monolito Fastify actual encaja mejor en App Service.

## Revisión

Revisar después del piloto o si existen requisitos de contenedores, escalado independiente o portabilidad que justifiquen Azure Container Apps.

