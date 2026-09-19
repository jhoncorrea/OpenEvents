import {
  InteractionRequiredAuthError,
  type AccountInfo,
  type IPublicClientApplication,
} from "@azure/msal-browser";
import type { CreateEventPayload } from "./event-form";

export interface CreatedEvent extends CreateEventPayload {
  id: string;
  status: "draft";
  createdAt: string;
}

export type EventCreationErrorKind =
  | "configuration"
  | "authentication"
  | "interaction_required"
  | "validation"
  | "unauthorized"
  | "forbidden"
  | "conflict"
  | "uncertain";

export class EventCreationError extends Error {
  constructor(
    readonly kind: EventCreationErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "EventCreationError";
  }
}

interface CreateApiEventOptions {
  instance: IPublicClientApplication;
  account: AccountInfo;
  apiScope: string;
  apiUrl: string;
  input: CreateEventPayload;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildEventsUrl(apiUrl: string): string {
  let url: URL;

  try {
    url = new URL(apiUrl);
  } catch {
    throw new EventCreationError(
      "configuration",
      "Revisa la configuración VITE_API_URL.",
    );
  }

  const localHttp =
    url.protocol === "http:" && url.hostname === "localhost";

  if (
    (url.protocol !== "https:" && !localHttp) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new EventCreationError(
      "configuration",
      "La dirección de la API debe usar HTTPS o HTTP en localhost, sin credenciales, consulta ni fragmento.",
    );
  }

  url.pathname =
    `${url.pathname.replace(/\/+$/, "")}/api/v1/events`;

  return url.toString();
}

function isUtcDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function parseCreatedEvent(value: unknown): CreatedEvent | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const data = value as Record<string, unknown>;

  if (
    typeof data.id !== "string" ||
    !UUID_PATTERN.test(data.id) ||
    typeof data.name !== "string" ||
    !data.name.trim() ||
    typeof data.slug !== "string" ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug) ||
    typeof data.timezone !== "string" ||
    !data.timezone.trim() ||
    typeof data.location !== "string" ||
    !data.location.trim() ||
    data.status !== "draft" ||
    !isUtcDate(data.startsAt) ||
    !isUtcDate(data.endsAt) ||
    !isUtcDate(data.createdAt) ||
    Date.parse(data.endsAt) <= Date.parse(data.startsAt)
  ) {
    return null;
  }

  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    startsAt: data.startsAt,
    endsAt: data.endsAt,
    timezone: data.timezone,
    location: data.location,
    status: data.status,
    createdAt: data.createdAt,
  };
}

function uncertainResult(): EventCreationError {
  return new EventCreationError(
    "uncertain",
    "No pudimos confirmar el resultado. El evento podría haberse guardado. Conserva el slug y verifica el resultado antes de volver a enviarlo.",
  );
}

export async function createApiEvent({
  instance,
  account,
  apiScope,
  apiUrl,
  input,
}: CreateApiEventOptions): Promise<CreatedEvent> {
  const url = buildEventsUrl(apiUrl);

  // Copiar solo los campos permitidos antes de iniciar operaciones asíncronas.
  const body = JSON.stringify({
    name: input.name,
    slug: input.slug,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    timezone: input.timezone,
    location: input.location,
  });

  let accessToken: string;

  try {
    const result = await instance.acquireTokenSilent({
      account,
      scopes: [apiScope],
    });

    accessToken = result.accessToken;
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      // La interfaz gestionará la autorización antes de un nuevo envío.
      throw new EventCreationError(
        "interaction_required",
        "Debes renovar la autorización con Microsoft antes de crear el evento. La solicitud de creación no se envió.",
      );
    }

    throw new EventCreationError(
      "authentication",
      "No pudimos obtener el acceso a la API. La solicitud de creación no se envió.",
    );
  }

  if (!accessToken.trim()) {
    throw new EventCreationError(
      "authentication",
      "No se recibió un token de acceso. La solicitud de creación no se envió.",
    );
  }

  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body,
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw uncertainResult();
  }

  switch (response.status) {
    case 400:
      throw new EventCreationError(
        "validation",
        "La API rechazó los datos. Revisa los campos del formulario.",
      );
    case 401:
      throw new EventCreationError(
        "unauthorized",
        "La API rechazó tu acceso. Vuelve a comprobar la sesión antes de crear el evento.",
      );
    case 403:
      throw new EventCreationError(
        "forbidden",
        "No tienes permiso para crear eventos. Se requiere acceso autorizado y el rol organizer.",
      );
    case 409:
      throw new EventCreationError(
        "conflict",
        "Ya existe un evento con ese slug. Revisa si corresponde a un envío anterior o elige otro para un evento diferente.",
      );
  }

  if (response.status !== 201) {
    throw uncertainResult();
  }

  let data: unknown;

  try {
    data = await response.json();
  } catch {
    throw uncertainResult();
  }

  const createdEvent = parseCreatedEvent(data);

  if (!createdEvent) {
    throw uncertainResult();
  }

  return createdEvent;
}