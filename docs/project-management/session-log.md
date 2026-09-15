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
