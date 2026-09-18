# Autenticación de API — OE-01-002A

Implementación del Issue #19: validación de access tokens y roles de aplicación con Microsoft Entra External ID.

## Estado y alcance

Implementado:

- Validación de configuración de autenticación al arrancar la API.
- Validación de access tokens mediante `jose`.
- Control reutilizable de autenticación y autorización para Fastify.
- Ruta protegida `GET /api/v1/auth/me`.
- Solicitud de un access token desde la web mediante MSAL.
- Consulta de identidad y roles mediante el botón «Comprobar acceso».
- Pruebas automatizadas de configuración, verificación de tokens, controles HTTP y cliente web.
- Comprobación manual satisfactoria con un token real y el rol `organizer`.

Límites actuales:

- `GET /health` continúa público.
- `GET /api/events/current` y `POST /api/check-ins` son rutas demo sin autenticación.
- La interfaz demo sigue visible sin iniciar sesión.
- No está implementado `POST /api/v1/events`.
- No está implementada la autorización por evento mediante `event_staff`.
- Los roles de aplicación no conceden automáticamente acceso a un evento concreto.

## Configuración de la API

Estas variables son obligatorias al arrancar:

| Variable | Propósito |
|---|---|
| `ENTRA_TENANT_ID` | Tenant permitido; se compara con `tid`. |
| `ENTRA_API_CLIENT_ID` | Audiencia esperada del access token. |
| `ENTRA_WEB_CLIENT_ID` | Aplicación cliente permitida; se compara con `azp`. |
| `ENTRA_ISSUER` | Emisor esperado del token. |
| `ENTRA_JWKS_URI` | Dirección HTTPS de las claves públicas de Entra. |

La API carga `apps/api/.env` si existe. Las variables también pueden proporcionarse mediante el entorno.

Si falta una variable obligatoria o su formato es inválido, el arranque falla antes de escuchar solicitudes.

El archivo `.env.example` contiene la configuración pública de referencia. Los archivos `.env` privados no se versionan.

El verificador se crea una vez al arrancar y reutiliza el conjunto remoto de claves. Validar la configuración no implica comprobar la disponibilidad de Entra durante el arranque.

## Validación del access token

El verificador:

- Comprueba la firma con las claves públicas de Entra.
- Permite únicamente el algoritmo `RS256`.
- Valida el emisor y la audiencia configurados.
- Exige los claims `exp`, `iat`, `nbf`, `sub`, `oid`, `tid`, `azp` y `ver`.
- Valida expiración y momento de inicio de validez con 5 segundos de tolerancia.
- Exige `ver` igual a `2.0`.
- Comprueba el tenant permitido.
- Comprueba la aplicación cliente permitida.
- Exige `access_as_user` como un scope completo dentro de `scp`.
- Devuelve únicamente la identidad y los roles reconocidos.

El scope requerido por la API es fijo: `access_as_user`.

Los fallos operativos del servicio de claves se propagan desde el verificador y el control HTTP responde con un error 500 genérico.

## Roles de aplicación

Roles reconocidos:

- `admin`
- `organizer`
- `checkin_operator`

Los roles desconocidos se ignoran y los duplicados se eliminan. Un token sin roles produce una lista vacía.

`requireAnyRole` exige al menos uno de los roles expresamente permitidos por la ruta:

- Una lista vacía de roles permitidos deniega el acceso.
- `admin` no hereda permisos de otros roles.
- Omitir la restricción de roles en `createAuthGuard` exige autenticación válida, pero no un rol específico.

Las pruebas HTTP utilizan una ruta temporal para comprobar estas restricciones. Esa ruta no se registra en la aplicación normal.

## GET /api/v1/auth/me

Requiere un access token enviado mediante:

```http
Authorization: Bearer <access-token>
```

La ruta aplica las validaciones de firma, claims, aplicación cliente y scope. No exige un rol específico.

Respuesta `200 OK`, con valores de identidad ilustrativos:

```json
{
  "tenantId": "22222222-2222-4222-8222-222222222222",
  "objectId": "11111111-1111-4111-8111-111111111111",
  "subject": "example-subject",
  "roles": ["organizer"]
}
```

El token no forma parte de la respuesta.

### Errores actuales

| HTTP | Código | Situación |
|---|---|---|
| 401 | `UNAUTHORIZED` | Encabezado Bearer ausente o mal formado, o token inválido. |
| 403 | `FORBIDDEN` | Aplicación cliente no permitida o scope insuficiente. |
| 500 | `INTERNAL_SERVER_ERROR` | Fallo operativo o inesperado durante la verificación. |

Cuando una ruta utiliza además restricciones de roles, no cumplirlas produce 403.

El formato implementado es plano:

```json
{
  "code": "UNAUTHORIZED",
  "message": "Se requiere un token de acceso válido."
}
```

Las respuestas del control incluyen `Cache-Control: no-store`. Las respuestas 401 incluyen `WWW-Authenticate: Bearer`.

El contenedor `error` y el campo `correlationId` descritos en el contrato objetivo del MVP no forman parte todavía de estas respuestas.

El control no devuelve ni registra el error original del verificador. Los fallos inesperados generan un registro con código y mensaje genéricos. La configuración del logger redacta `req.headers.authorization`.

## Configuración y comportamiento de la web

La web conserva las variables de sesión existentes y requiere:

```dotenv
VITE_API_URL=http://localhost:3001
VITE_ENTRA_API_SCOPE=api://cd81b6dc-e10f-4240-bf69-7df9a49c514a/access_as_user
```

El scope anterior corresponde a la API de Development. Otros entornos deben utilizar su propio identificador.

El validador actual del scope admite el formato `api://<UUID>/access_as_user`.

La consulta de identidad requiere `VITE_API_URL`; esta función no aplica un valor predeterminado. Admite HTTPS o HTTP en localhost, sin credenciales, query ni fragmento.

El inicio de sesión solicita `openid` y `profile`. El botón «Comprobar acceso» solicita por separado el scope de la API:

1. MSAL intenta obtener el access token mediante `acquireTokenSilent`.
2. Si se necesita interacción, utiliza `acquireTokenRedirect`.
3. Al regresar de la redirección, el usuario vuelve a pulsar «Comprobar acceso».
4. La web envía el access token a `/api/v1/auth/me`.
5. Muestra los roles devueltos por la API.

La solicitud HTTP tiene un tiempo límite de 15 segundos y rechaza redirecciones. La web valida el formato de la respuesta y muestra mensajes controlados ante errores.

MSAL administra su caché en `sessionStorage`. La aplicación no imprime el token, no lo muestra en pantalla y no crea almacenamiento adicional para él.

Las variables `VITE_*` son públicas. La SPA no utiliza secretos de cliente.

## Validación

Pruebas relevantes:

- API: `auth-config.test.ts`.
- API: `auth/verify-access-token.test.ts`.
- API: `auth/http-auth.test.ts`.
- API: `app.test.ts`.
- Web: `auth-config.test.ts`.
- Web: `api-auth.test.ts`.

Estas pruebas no necesitan conectarse a Entra. El verificador se prueba con claves y tokens locales; las pruebas HTTP y del cliente web utilizan dependencias simuladas.

Comprobación manual realizada:

1. Arrancar la API y la web con la configuración de Development.
2. Iniciar sesión con la cuenta de prueba.
3. Pulsar «Comprobar acceso».
4. Verificar los mensajes «Acceso a la API verificado» y «Roles: organizer».

Esta comprobación confirma el acceso a `/api/v1/auth/me` con un token real. No demuestra autorización por evento ni protección de las rutas demo.