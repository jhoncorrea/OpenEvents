# ADR-067: Check-in atómico y concurrencia

Estado: aceptado mediante PR #74, merge 6360e7a; CI aprobado.

## Contexto

Solicitudes simultáneas o cambios de autorización no deben producir ingresos duplicados o basados en estados obsoletos.

## Decisión

Usar READ COMMITTED y bloqueos en orden usuario/asignación/evento/inscripción/credencial, revalidando tras esperar. Serializar por inscripción y conservar UNIQUE como defensa. Retornar el registro original para duplicate.

## Consecuencias

Los escritores futuros deben respetar el orden; otras transacciones externas se rechazan. No hay reintento automático. Un resultado dentro de savepoint depende del commit externo.
