# ADR-058: Conflicto HTTP y entrega incierta

Estado: aceptado e integrado mediante PR #66 (merge 2f73568).

## Contexto

Confirmar la transacción no garantiza que el cliente reciba la respuesta con el secreto.

## Decisión

Exponer credencial existente y estado no elegible como conflictos 409 diferentes. No ofrecer replay, sobrescritura ni reintento automático. Mantener unicidad y serialización de #63.

## Consecuencias

Dos peticiones simultáneas autorizadas producen 201 y 409. Una respuesta perdida tras commit no permite recuperar el token del hash. Recuperación y rotación quedan para un incremento explícito posterior.
