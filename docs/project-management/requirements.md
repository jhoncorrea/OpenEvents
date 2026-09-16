# Requisitos del MVP

## 1. Requisitos funcionales

| ID | Requisito | Prioridad | Evidencia de aceptación |
|---|---|---|---|
| RF-AUT-001 | El personal debe iniciar sesión antes de acceder a funciones operativas. | Must | Usuario anónimo recibe 401/redirect; usuario válido accede. |
| RF-AUT-002 | El sistema debe aplicar roles Administrador, Organizador y Operador. | Must | Cada rol solo ejecuta acciones autorizadas. |
| RF-EVT-001 | El Organizador debe crear un evento con nombre, fecha, zona horaria y ubicación. | Must | Evento persistido y recuperable. |
| RF-EVT-002 | El Organizador debe activar o cerrar el check-in. | Must | Evento cerrado rechaza nuevos check-ins. |
| RF-ATT-001 | El Organizador debe registrar un asistente manualmente. | Must | Asistente e inscripción aparecen en la lista. |
| RF-ATT-002 | El Organizador debe importar inscripciones desde CSV. | Must | Filas válidas importadas; errores reportados sin importación parcial accidental. |
| RF-ATT-003 | El personal debe buscar asistentes por nombre, correo o código. | Should | Resultados correctos y paginados. |
| RF-QR-001 | El sistema debe generar un código opaco y único por inscripción. | Must | No existen códigos duplicados y no contienen PII. |
| RF-QR-002 | La web debe representar el código como QR descargable. | Must | El QR puede escanearse y resuelve la inscripción. |
| RF-CHK-001 | El Operador debe registrar un check-in mediante código manual o escaneado. | Must | Primer intento válido devuelve `accepted`. |
| RF-CHK-002 | El sistema debe rechazar códigos inexistentes, inactivos o de otro evento. | Must | Devuelve `invalid` sin escribir un check-in. |
| RF-CHK-003 | El sistema debe impedir un segundo check-in para la misma inscripción. | Must | Devuelve `duplicate` y conserva un solo registro. |
| RF-CHK-004 | El check-in debe registrar operador y fecha/hora UTC. | Must | Registro auditable persistido. |
| RF-DAS-001 | El dashboard debe mostrar registrados, ingresaron y pendientes. | Must | Los valores se calculan desde datos persistidos. |
| RF-DAS-002 | El dashboard debe mostrar los ingresos recientes. | Should | Lista ordenada de más reciente a más antiguo. |
| RF-AUD-001 | El sistema debe auditar acciones sensibles. | Must | Evento, actor, acción, entidad y timestamp consultables. |
| RF-OPS-001 | La API debe exponer un endpoint de salud. | Must | `/health` responde correctamente cuando el servicio está operativo. |

## 2. Requisitos no funcionales

| ID | Categoría | Requisito / objetivo inicial |
|---|---|---|
| RNF-PER-001 | Rendimiento | Check-in con p95 menor de 500 ms sin contar latencia del cliente. |
| RNF-SCL-001 | Capacidad | Soportar inicialmente 1,000 inscripciones y 20 operadores concurrentes. |
| RNF-REL-001 | Confiabilidad | La creación del primer check-in debe ser atómica y resistente a solicitudes simultáneas. |
| RNF-AVL-001 | Disponibilidad | Objetivo de 99.5 % durante la ventana del evento piloto. |
| RNF-SEC-001 | Autorización | Denegar por defecto y aplicar mínimo privilegio. |
| RNF-SEC-002 | Secretos | No almacenar credenciales en código, commits, imágenes o logs. |
| RNF-SEC-003 | Transporte | Todo ambiente remoto debe usar HTTPS. |
| RNF-PRV-001 | Privacidad | Minimizar PII y nunca incorporarla al valor del QR. |
| RNF-PRV-002 | Retención | Definir y aplicar una política de conservación/borrado antes del piloto real. |
| RNF-OBS-001 | Observabilidad | Correlation ID, logs estructurados, métricas de error/latencia y alertas básicas. |
| RNF-ACC-001 | Accesibilidad | Objetivo WCAG 2.1 AA para el recorrido de check-in. |
| RNF-CMP-001 | Compatibilidad | Últimas dos versiones estables de Chrome, Edge y Safari móvil. |
| RNF-MNT-001 | Mantenibilidad | TypeScript estricto, módulos con responsabilidades claras y ADR para cambios relevantes. |
| RNF-CIC-001 | CI | Todo PR ejecuta lint, typecheck, pruebas y build. |
| RNF-BCP-001 | Recuperación | Objetivo inicial RPO 24 h y RTO 4 h para el piloto. |
| RNF-CST-001 | Costos | Presupuesto y alertas configurados antes de desplegar recursos de pago. |

## 3. Casos de aceptación críticos

### CA-CHK-001 — Primer ingreso

- Dado un evento activo y una inscripción válida sin check-in,
- cuando un operador autorizado envía su código,
- entonces la API crea exactamente un registro y devuelve `accepted`.

### CA-CHK-002 — Duplicado

- Dada una inscripción que ya ingresó,
- cuando se envía nuevamente el código,
- entonces no se crea otro registro y se devuelve `duplicate`.

### CA-CHK-003 — Código inválido

- Dado un código inexistente, inactivo o ajeno al evento,
- cuando se intenta validar,
- entonces no se registra ingreso y se devuelve `invalid`.

### CA-CHK-004 — Concurrencia

- Dada una inscripción sin ingreso,
- cuando dos solicitudes simultáneas usan el mismo código,
- entonces solo una crea el check-in y la otra recibe `duplicate`.

