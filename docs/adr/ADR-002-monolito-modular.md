# ADR-002 — Adoptar un monolito modular

- Estado: Aceptada
- Fecha: 15 de septiembre de 2026

## Contexto

OpenEvents necesita separar responsabilidades de negocio, pero será desarrollado inicialmente por una persona, con capacidad limitada y un primer piloto de escala moderada. Microservicios introducirían despliegues, redes, observabilidad y consistencia distribuida antes de existir una necesidad comprobada.

## Decisión

Construir la API como un monolito modular dentro del monorepo. Los módulos iniciales serán Auth, Events, Attendees, Registrations, Check-in y Audit. Cada módulo mantendrá límites explícitos y se comunicará mediante interfaces internas.

## Consecuencias positivas

- desarrollo, pruebas y depuración más simples;
- una sola unidad de despliegue para la API;
- transacciones PostgreSQL directas;
- menor costo operativo;
- posibilidad de extraer un módulo posteriormente si existe evidencia.

## Consecuencias negativas

- requiere disciplina para evitar acoplamiento;
- un despliegue actualiza toda la API;
- el escalado es conjunto al inicio.

## Alternativas descartadas

- Microservicios: complejidad desproporcionada para el MVP.
- Funciones independientes por endpoint: fragmentarían prematuramente dominio y operación.
- Aplicación full-stack única: se mantiene separación web/API para practicar contratos y despliegues independientes.

