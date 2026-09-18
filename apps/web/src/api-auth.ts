import {
  InteractionRequiredAuthError,
  type AccountInfo,
  type IPublicClientApplication,
} from "@azure/msal-browser";

export interface ApiIdentity {
  tenantId: string;
  objectId: string;
  subject: string;
  roles: string[];
}

interface FetchApiIdentityOptions {
  instance: IPublicClientApplication;
  account: AccountInfo;
  apiScope: string;
  apiUrl: string;
}

function isApiIdentity(value: unknown): value is ApiIdentity {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return (
    "tenantId" in value &&
    typeof value.tenantId === "string" &&
    "objectId" in value &&
    typeof value.objectId === "string" &&
    "subject" in value &&
    typeof value.subject === "string" &&
    "roles" in value &&
    Array.isArray(value.roles) &&
    value.roles.every((role: unknown) => typeof role === "string")
  );
}

function buildIdentityUrl(apiUrl: string): string {
  let url: URL;

  try {
    url = new URL(apiUrl);
  } catch {
    throw new Error("Revisa la configuración VITE_API_URL.");
  }

  const isLocalHttp =
    url.protocol === "http:" && url.hostname === "localhost";

  if (
    (url.protocol !== "https:" && !isLocalHttp) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "VITE_API_URL debe usar HTTPS o HTTP en localhost, sin credenciales, consulta ni fragmento.",
    );
  }

  url.pathname =
    `${url.pathname.replace(/\/+$/, "")}/api/v1/auth/me`;

  return url.toString();
}

export async function fetchApiIdentity({
  instance,
  account,
  apiScope,
  apiUrl,
}: FetchApiIdentityOptions): Promise<ApiIdentity | null> {
  const url = buildIdentityUrl(apiUrl);
  const tokenRequest = {
    account,
    scopes: [apiScope],
  };

  let accessToken: string;

  try {
    const result = await instance.acquireTokenSilent(tokenRequest);
    accessToken = result.accessToken;
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      try {
        await instance.acquireTokenRedirect(tokenRequest);
      } catch {
        throw new Error(
          "No pudimos iniciar la autorización de acceso. Inténtalo nuevamente.",
        );
      }

      return null;
    }

    throw new Error(
      "No pudimos obtener el token de acceso. Comprueba tu conexión e inténtalo nuevamente.",
    );
  }

  if (!accessToken) {
    throw new Error("No se recibió un token de acceso para la API.");
  }

  let response: Response;

  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error(
      "No pudimos contactar con la API. Comprueba que esté encendida y vuelve a intentarlo.",
    );
  }

  if (response.status === 401) {
    throw new Error(
      "La API rechazó el token de acceso. Cierra sesión e inicia sesión nuevamente.",
    );
  }

  if (response.status === 403) {
    throw new Error(
      "La API no permitió el acceso. Revisa los permisos de la aplicación.",
    );
  }

  if (!response.ok) {
    throw new Error(
      "La API no pudo completar la verificación. Inténtalo más tarde.",
    );
  }

  let identity: unknown;

  try {
    identity = await response.json();
  } catch {
    throw new Error("La API devolvió una respuesta inesperada.");
  }

  if (!isApiIdentity(identity)) {
    throw new Error("La API devolvió una identidad con formato inesperado.");
  }

  return identity;
}