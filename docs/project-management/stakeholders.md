# Stakeholders y usuarios

## 1. Registro

| Stakeholder | Interés | Influencia | Necesidad principal | Estrategia |
|---|---|---:|---|---|
| Jhonnatan Correa — Product Owner | Producto y crecimiento profesional | Alta | Alcance claro, aprendizaje y evidencia pública | Decisión y revisión semanal |
| Organizador del evento piloto | Operación confiable | Alta | Configuración simple y métricas correctas | Validación mediante entrevistas y demos |
| Coordinador de acreditación | Flujo de ingreso | Alta | Velocidad, claridad y contingencia | Pruebas de operación |
| Operador de check-in | Uso diario | Media | Escaneo rápido y mensajes inequívocos | Pruebas de usabilidad |
| Asistente | Acceso al evento | Media | QR fácil de presentar y privacidad | Comunicación clara |
| Mantenedores open source | Evolución técnica | Media | Documentación y contribución segura | Issues, ADR y CONTRIBUTING |
| Responsable de seguridad/privacidad | Protección de datos | Alta | Mínimo privilegio, auditoría y retención | Threat modeling y controles |
| Azure/GitHub | Plataforma tecnológica | Media | Configuración soportada y costos controlados | IaC, monitoreo y presupuestos |
| Sponsors | Funciones futuras | Baja en MVP | Leads y métricas | Mantener fuera del MVP |

## 2. Personas iniciales

### Organizador

Prepara el evento, carga la lista, asigna operadores y necesita saber cuántas personas ingresaron. Valora control y exactitud más que personalización visual.

### Operador de check-in

Trabaja bajo presión y necesita una interfaz de pocas acciones, usable desde laptop o teléfono, con respuestas visibles en menos de un segundo.

### Asistente

Presenta un QR y espera ingresar sin fricción. No debería exponer nombre, correo u otros datos dentro del código.

### Mantenedor

Necesita comprender el monorepo, ejecutar el proyecto localmente y contribuir mediante un flujo GitHub reproducible.

## 3. Matriz RACI resumida

| Actividad | Product Owner | Organizador piloto | Operador | Mantenedor |
|---|---|---|---|---|
| Definir alcance | A/R | C | C | C |
| Priorizar backlog | A/R | C | C | I |
| Diseñar arquitectura | A/R | I | I | C |
| Aprobar experiencia de check-in | A | C | R | I |
| Desarrollar y probar | A/R | I | C | C |
| Aprobar piloto | A | R | C | I |

Leyenda: **R** responsable de ejecutar, **A** responsable final, **C** consultado, **I** informado.

## 4. Cadencia

- revisión personal diaria: 5 minutos al cierre de cada sesión;
- revisión de backlog y riesgos: semanal;
- demo funcional: al final de cada incremento;
- validación con organizador: al completar un recorrido de negocio;
- retrospectiva y actualización del roadmap: mensual.
