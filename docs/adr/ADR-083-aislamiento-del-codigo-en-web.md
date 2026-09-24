# ADR-083: Aislamiento del código en web

Estado: propuesto en issue #83; pendiente de integración.

## Contexto

El código de una credencial es sensible y la sesión puede cambiar durante el envío.

## Decisión

Mantenerlo solo en memoria del formulario, sin normalizar, en campo oculto. Limpiar al salir o recibir resultado definitivo; abortar y descartar respuestas tardías, verificando cuenta después de MSAL.

## Consecuencias

Se conserva temporalmente ante incertidumbre para un reenvío explícito. No hay storage, logs propios ni URL con el secreto; el POST necesariamente transporta el código.
