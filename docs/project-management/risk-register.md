# Registro de riesgos

Escala: Probabilidad e impacto de 1 (bajo) a 5 (alto). Exposición = P × I.

| ID | Riesgo | P | I | Exposición | Respuesta / mitigación | Señal de activación | Responsable |
|---|---|---:|---:|---:|---|---|---|
| R-01 | Crecimiento descontrolado del alcance | 4 | 4 | 16 | Mantener lista fuera del MVP y priorización Must/Should | Nuevas épicas antes de terminar el recorrido crítico | Product Owner |
| R-02 | Poco tiempo por AZ-104 y trabajo | 4 | 4 | 16 | Sesiones de una hora, tareas pequeñas y revisión semanal | Dos semanas sin incremento demostrable | Product Owner |
| R-03 | Check-in duplicado por concurrencia | 3 | 5 | 15 | Restricción única y prueba concurrente | Dos solicitudes simultáneas crean registros | Responsable técnico |
| R-04 | Exposición de datos personales | 3 | 5 | 15 | Minimización, QR opaco, roles, logs sin PII y retención | PII en QR, log o ambiente no autorizado | Responsable técnico |
| R-05 | Mala conectividad en el evento | 4 | 5 | 20 | Medir red, runbook, dispositivos alternos y evaluar contingencia | Latencia alta o pérdida sostenida de conexión | Coordinador operativo |
| R-06 | Costos Azure inesperados | 3 | 4 | 12 | Presupuesto, alertas, tiers pequeños y apagado de recursos no usados | Consumo supera umbral semanal | Product Owner |
| R-07 | Cuenta única / bus factor 1 | 4 | 3 | 12 | Documentación, IaC, backups y recuperación de cuentas | Imposibilidad de acceder o continuar desde otro equipo | Product Owner |
| R-08 | Credenciales expuestas en GitHub | 2 | 5 | 10 | OIDC, secret scanning y rotación documentada | Alerta de GitHub o secreto en commit | Responsable técnico |
| R-09 | Dependencias vulnerables | 3 | 4 | 12 | Dependabot, lockfile, revisión y actualizaciones controladas | Vulnerabilidad alta/crítica | Responsable técnico |
| R-10 | Arquitectura sobredimensionada | 3 | 4 | 12 | Monolito modular y ADR obligatoria antes de añadir servicios | Nuevo servicio sin requisito operativo | Responsable técnico |
| R-11 | Interfaz lenta o confusa en puerta | 3 | 5 | 15 | Pruebas con operadores, estados visuales claros y acceso por teclado | Operador duda o repite escaneo | Product Owner |
| R-12 | Fallo de despliegue antes del evento | 2 | 5 | 10 | Ambientes, release candidate, rollback y freeze previo | CI/CD rojo o cambios de última hora | Responsable técnico |
| R-13 | Pérdida/corrupción de datos | 2 | 5 | 10 | Backups administrados, restauración probada y exportación previa | Error de DB o registros faltantes | Responsable técnico |
| R-14 | Baja adopción open source | 3 | 2 | 6 | README, demo, issues claros y piloto real | Sin usuarios/feedback tras publicación | Product Owner |

## Riesgos prioritarios

1. Conectividad durante el evento.
2. Alcance descontrolado.
3. Tiempo disponible.
4. Privacidad de datos.
5. Concurrencia del check-in.

## Revisión

- frecuencia: semanal;
- registrar cambios de probabilidad, impacto y respuesta;
- riesgos con exposición igual o mayor a 15 requieren una acción activa en el backlog;
- incidentes reales deben convertirse en aprendizaje y, si corresponde, ADR o runbook.

