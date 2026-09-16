# Project Charter — OpenEvents

## 1. Identificación

| Campo | Valor |
|---|---|
| Proyecto | OpenEvents |
| Versión del Charter | 0.1 |
| Product Owner y responsable técnico | Jhonnatan Correa |
| Tipo | Plataforma open source para gestión de eventos |
| Repositorio | `github.com/jhoncorrea/OpenEvents` |
| Licencia | MIT |
| Inicio de Iteración 0 | 15 de septiembre de 2026 |
| Inicio previsto de implementación formal | 28 de septiembre de 2026 |
| Capacidad inicial | 1 hora diaria, aproximadamente 5–7 horas semanales |

## 2. Problema

Los eventos comunitarios y técnicos suelen gestionar asistentes y accesos mediante hojas de cálculo, formularios desconectados o soluciones cerradas. Esto dificulta validar inscripciones rápidamente, evitar ingresos duplicados, conocer la asistencia en tiempo real y conservar una trazabilidad útil para futuras ediciones.

## 3. Visión

Crear una plataforma open source, sencilla y desplegable en Azure que permita a organizadores administrar eventos, asistentes y check-ins mediante códigos QR, con seguridad, trazabilidad y automatización DevOps incorporadas desde el inicio.

## 4. Objetivos

### Objetivo de producto

Entregar un MVP utilizable en un evento piloto que reduzca el tiempo de validación de asistentes y ofrezca un conteo confiable de ingresos.

### Objetivo profesional

Usar OpenEvents como proyecto ancla para demostrar competencias reales en:

- Git y GitHub;
- frontend y backend TypeScript;
- modelado de datos;
- pruebas automatizadas;
- CI/CD y GitHub Actions;
- seguridad y gestión de secretos;
- Azure e infraestructura como código;
- observabilidad y operación.

## 5. Entregables principales

- aplicación web responsiva/PWA;
- API REST documentada;
- base de datos PostgreSQL;
- gestión de eventos y asistentes;
- generación y validación de códigos QR;
- check-in con prevención de duplicados;
- dashboard operativo;
- auditoría básica;
- pipelines CI/CD;
- infraestructura Azure reproducible;
- documentación de producto, arquitectura y operación.

## 6. Indicadores de éxito del MVP

| Indicador | Objetivo |
|---|---:|
| Check-ins válidos registrados correctamente | 100 % en pruebas de aceptación |
| Duplicados bloqueados | 100 % en pruebas de aceptación |
| Tiempo objetivo de respuesta del check-in | p95 menor de 500 ms, sin contar latencia de internet |
| Disponibilidad objetivo durante el piloto | 99.5 % durante la ventana del evento |
| Cobertura de rutas críticas | Pruebas automatizadas para los tres resultados del check-in |
| Despliegues de aplicación | Repetibles mediante GitHub Actions |
| Secretos en el repositorio | 0 |
| Evento piloto | 1 evento real o simulación completa aprobada |

Estos valores son objetivos de ingeniería del piloto, no compromisos contractuales de SLA.

## 7. Restricciones

- capacidad individual aproximada de una hora diaria;
- prioridad profesional paralela: certificación AZ-104;
- presupuesto cloud limitado;
- desarrollo inicial por una sola persona;
- el MVP debe evitar microservicios y complejidad operacional prematura;
- protección de datos personales desde el diseño.

## 8. Supuestos

- el primer piloto tendrá hasta 1,000 asistentes;
- existirán entre 1 y 20 operadores de check-in;
- el evento contará normalmente con conexión a internet;
- el organizador podrá preparar o importar la lista antes del evento;
- el código QR identificará una inscripción, no expondrá datos personales;
- las decisiones de producto se revisarán con organizadores potenciales.

## 9. Gobierno

| Decisión | Responsable |
|---|---|
| Visión, alcance y prioridad | Product Owner |
| Arquitectura y seguridad | Responsable técnico |
| Aceptación funcional | Product Owner + organizador piloto |
| Cambios de código | Pull Request con CI verde |
| Cambios arquitectónicos | ADR aprobado |
| Seguimiento | Revisión semanal del backlog, riesgos y roadmap |

## 10. Criterio de cierre del MVP

El MVP se considera terminado cuando un organizador puede crear o configurar un evento, cargar asistentes, obtener códigos, realizar check-in desde la web, impedir duplicados, consultar métricas y operar una simulación completa con despliegue automatizado y evidencia de pruebas.

