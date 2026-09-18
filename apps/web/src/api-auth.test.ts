import {
  InteractionRequiredAuthError,
  type AccountInfo,
  type IPublicClientApplication,
} from "@azure/msal-browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchApiIdentity } from "./api-auth";

const account: AccountInfo = {
  homeAccountId: "test-home-account",
  localAccountId: "test-local-account",
  environment: "test.ciamlogin.com",
  tenantId: "22222222-2222-4222-8222-222222222222",
  username: "test@example.com",
};

const apiScope =
  "api://33333333-3333-4333-8333-333333333333/access_as_user";

const identity = {
  tenantId: account.tenantId,
  objectId: account.localAccountId,
  subject: "test-subject",
  roles: ["organizer"],
};

const testToken = "test-access-token";

function setupClient() {
  const acquireTokenSilent = vi.fn(async () => ({
    accessToken: testToken,
  }));
  const acquireTokenRedirect = vi.fn(async () => {});

  // Solo simulamos los dos métodos utilizados por fetchApiIdentity.
  const instance = {
    acquireTokenSilent,
    acquireTokenRedirect,
  } as unknown as IPublicClientApplication;

  return {
    acquireTokenSilent,
    acquireTokenRedirect,
    options: {
      instance,
      account,
      apiScope,
      apiUrl: "http://localhost:3001",
    },
  };
}

describe("fetchApiIdentity", () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(identity), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests the API scope and sends the access token to the API", async () => {
    const client = setupClient();

    const result = await fetchApiIdentity(client.options);

    expect(result).toEqual(identity);
    expect(client.acquireTokenSilent).toHaveBeenCalledExactlyOnceWith({
      account,
      scopes: [apiScope],
    });
    expect(client.acquireTokenRedirect).not.toHaveBeenCalled();

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "http://localhost:3001/api/v1/auth/me",
      expect.objectContaining({
        method: "GET",
        headers: {
          Authorization: `Bearer ${testToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("handles a trailing slash in the API URL", async () => {
    const client = setupClient();

    await fetchApiIdentity({
      ...client.options,
      apiUrl: "http://localhost:3001/",
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://localhost:3001/api/v1/auth/me",
    );
  });

  it("redirects only when MSAL requires interaction", async () => {
    const client = setupClient();
    client.acquireTokenSilent.mockRejectedValue(
      new InteractionRequiredAuthError(
  "interaction_required",
  "User interaction is required.",
),
    );

    await expect(fetchApiIdentity(client.options)).resolves.toBeNull();

    expect(client.acquireTokenRedirect).toHaveBeenCalledExactlyOnceWith({
      account,
      scopes: [apiScope],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("hides unexpected token errors without starting a redirect", async () => {
    const client = setupClient();
    client.acquireTokenSilent.mockRejectedValue(
      new Error(`Sensitive detail: ${testToken}`),
    );

    await expect(fetchApiIdentity(client.options)).rejects.toThrow(
      "No pudimos obtener el token de acceso. Comprueba tu conexión e inténtalo nuevamente.",
    );
    expect(client.acquireTokenRedirect).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("handles a failed interactive redirect", async () => {
    const client = setupClient();
    client.acquireTokenSilent.mockRejectedValue(
      new InteractionRequiredAuthError(
  "interaction_required",
  "User interaction is required.",
),
    );
    client.acquireTokenRedirect.mockRejectedValue(
      new Error(`Sensitive detail: ${testToken}`),
    );

    await expect(fetchApiIdentity(client.options)).rejects.toThrow(
      "No pudimos iniciar la autorización de acceso. Inténtalo nuevamente.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not call the API when the access token is empty", async () => {
    const client = setupClient();
    client.acquireTokenSilent.mockResolvedValue({ accessToken: "" });

    await expect(fetchApiIdentity(client.options)).rejects.toThrow(
      "No se recibió un token de acceso para la API.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [401, "La API rechazó el token de acceso."],
    [403, "La API no permitió el acceso."],
    [500, "La API no pudo completar la verificación."],
  ])("handles HTTP %s without displaying the response body", async (status, message) => {
    const client = setupClient();
    fetchMock.mockResolvedValue(
      new Response(`Sensitive detail: ${testToken}`, { status }),
    );

    await expect(fetchApiIdentity(client.options)).rejects.toThrow(
      message,
    );
  });

  it("handles a network failure without exposing its details", async () => {
    const client = setupClient();
    fetchMock.mockRejectedValue(
      new Error(`Sensitive detail: ${testToken}`),
    );

    await expect(fetchApiIdentity(client.options)).rejects.toThrow(
      "No pudimos contactar con la API.",
    );
  });

  it("rejects a successful response containing invalid JSON", async () => {
    const client = setupClient();
    fetchMock.mockResolvedValue(
      new Response("not-json", { status: 200 }),
    );

    await expect(fetchApiIdentity(client.options)).rejects.toThrow(
      "La API devolvió una respuesta inesperada.",
    );
  });

  it.each([
    null,
    {},
    { ...identity, roles: "organizer" },
    { ...identity, roles: [42] },
  ])("rejects an invalid identity response: %j", async (body) => {
    const client = setupClient();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200 }),
    );

    await expect(fetchApiIdentity(client.options)).rejects.toThrow(
      "La API devolvió una identidad con formato inesperado.",
    );
  });

  it.each([
    "",
    "not-a-url",
    "http://api.example.com",
    "http://localhost.example.com",
    "https://user:password@api.example.com",
    "https://api.example.com?token=example",
    "https://api.example.com#fragment",
  ])("rejects an invalid API URL before requesting a token: %s", async (apiUrl) => {
    const client = setupClient();

    await expect(
      fetchApiIdentity({ ...client.options, apiUrl }),
    ).rejects.toThrow();

    expect(client.acquireTokenSilent).not.toHaveBeenCalled();
    expect(client.acquireTokenRedirect).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});