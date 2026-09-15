# OpenEvents

OpenEvents es una plataforma open source para gestionar la operación de eventos: asistentes, códigos QR, check-in y métricas de asistencia.

## Estado

Primera iteración técnica. El objetivo actual es validar el flujo mínimo de check-in con una interfaz web y una API en TypeScript.

## Arquitectura inicial

- `apps/web`: aplicación web mobile-first con React y Vite.
- `apps/api`: API REST modular con Fastify.
- `docs/adr`: decisiones de arquitectura.
- `docs/project-management`: planificación y registro de sesiones.

La persistencia, autenticación y servicios Azure se incorporarán en incrementos posteriores. No se usarán microservicios en el MVP.

## Requisitos

- Node.js 22 o superior.
- pnpm 11.

## Ejecutar localmente

```bash
pnpm install
pnpm dev
```

- Web: `http://localhost:5173`
- API: `http://localhost:3001`
- Salud de API: `http://localhost:3001/health`

Código QR de demostración: `OE-2027-001`.

## Comandos

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm test
```

## Roadmap inmediato

1. Crear la base del repositorio y el primer vertical slice.
2. Añadir pruebas y pipeline de pull requests.
3. Modelar eventos, asistentes e inscripciones.
4. Incorporar persistencia y autenticación.
5. Desplegar el MVP en Azure.

## Licencia

MIT.
