# ADR-054: Emisión transaccional y autorización

Estado: aceptado e integrado mediante PR #64 (merge 30aad88).

## Contexto

Los permisos, estados y emisiones simultáneas pueden cambiar mientras se prepara una credencial.

## Decisión

Exigir organizer global y local, usuario activo, evento draft/active e inscripción confirmed. Dentro de una transacción bloquear usuario, asignación y evento con SHARE e inscripción con UPDATE; comprobar pertenencia antes de generar el secreto y mantener las restricciones únicas.

## Consecuencias

Una emisión concurrente gana y la otra recibe conflicto. Los cambios de permisos que obtienen primero el bloqueo se observan al continuar; los posteriores esperan. El consumidor de una transacción exterior debe confirmar antes de entregar el token. No existe revocación retroactiva automática.
