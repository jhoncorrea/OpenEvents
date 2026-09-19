import {
  InteractionRequiredAuthError,
  type AccountInfo,
  type IPublicClientApplication,
} from "@azure/msal-browser";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  createApiEvent,
  EventCreationError,
} from "./api-events";
import type { CreateEventPayload } from "./event-form";

const account: AccountInfo = {
  homeAccountId: "test-home-account",
  localAccountId: "test-local-account",
  environment: "test.ciamlogin.com",
  tenantId: "22222222-2222-4222-8222-222222222222",
  username: "test@example.com",
};

const apiScope =
  "api://33333333-3333-4333-8333-333333333333/access_as_user";

const testToken = "test-access-token";

const input: CreateEventPayload = {
  name: "DevOpsDays Lima 2027",
  slug: "devopsdays-lima-2027",
  startsAt: "2027-08-27T14:00:00.000Z",
  endsAt: "2027-08-27T22:00:00.000Z",
  timezone: "America/Lima",
  location: "Centro de Convenciones de Lima",
};

const createdEvent = {
  ...input,
  id: "44444444-4444-4444-8444-444444444444",
  status: "draft",
  createdAt: "2026-09-18T23:00:00.000Z",
};

function setupClient() {
  const acquireTokenSilent = vi.fn(async () => ({
    accessToken: testToken,
  }));

  const acquireTokenRedirect = vi.fn(async () => {});

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
      input: { ...input },
    },
  };
}

function jsonResponse(body: unknown, status = 201): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createApiEvent", () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(createdEvent),
    );

    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests the API scope and creates the event once", async () => {
    const client = setupClient();

    await expect(createApiEvent(client.options)).resolves.toEqual(
      createdEvent,
    );

    expect(
      client.acquireTokenSilent,
    ).toHaveBeenCalledExactlyOnceWith({
      account,
      scopes: [apiScope],
    });

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "http://localhost:3001/api/v1/events",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${testToken}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        signal: expect.any(AbortSignal),
      },
    );

    expect(client.acquireTokenRedirect).not.toHaveBeenCalled();
  });

  it.each([
    [
      "http://localhost:3001/",
      "http://localhost:3001/api/v1/events",
    ],
    [
      "https://api.example.com/backend/",
      "https://api.example.com/backend/api/v1/events",
    ],
  ])("builds the endpoint from %s", async (apiUrl, expectedUrl) => {
    const client = setupClient();

    await createApiEvent({ ...client.options, apiUrl });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(expectedUrl);
  });

  it("sends only the permitted input fields", async () => {
    const client = setupClient();

    await createApiEvent({
      ...client.options,
      input: {
        ...input,
        ...{
          id: "caller-id",
          status: "active",
          createdAt: "caller-date",
        },
      },
    });

    const request = fetchMock.mock.calls[0]?.[1];

    expect(JSON.parse(String(request?.body))).toEqual(input);
  });

  it("captures input before waiting for the access token", async () => {
    const client = setupClient();

    client.acquireTokenSilent.mockImplementation(async () => {
      client.options.input.name = "Changed during authorization";
      return { accessToken: testToken };
    });

    await createApiEvent(client.options);

    const request = fetchMock.mock.calls[0]?.[1];

    expect(JSON.parse(String(request?.body))).toEqual(input);
  });

  it("returns the server-generated event data", async () => {
    const client = setupClient();
    const serverEvent = {
      ...createdEvent,
      id: "55555555-5555-4555-8555-555555555555",
      createdAt: "2026-09-19T00:00:00.000Z",
    };

    fetchMock.mockResolvedValue(jsonResponse(serverEvent));

    await expect(createApiEvent(client.options)).resolves.toEqual(
      serverEvent,
    );
  });

  it("does not expose additional response fields", async () => {
    const client = setupClient();

    fetchMock.mockResolvedValue(
      jsonResponse({
        ...createdEvent,
        internalDetail: "not-for-display",
      }),
    );

    await expect(createApiEvent(client.options)).resolves.toEqual(
      createdEvent,
    );
  });

  it("reports required interaction without redirecting or posting", async () => {
    const client = setupClient();

    client.acquireTokenSilent.mockRejectedValue(
      new InteractionRequiredAuthError(
        "interaction_required",
        "User interaction is required.",
      ),
    );

    await expect(createApiEvent(client.options)).rejects.toMatchObject({
      name: "EventCreationError",
      kind: "interaction_required",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(client.acquireTokenRedirect).not.toHaveBeenCalled();
  });

  it("hides unexpected token errors without posting", async () => {
    const client = setupClient();

    client.acquireTokenSilent.mockRejectedValue(
      new Error(`Sensitive detail: ${testToken}`),
    );

    await expect(createApiEvent(client.options)).rejects.toMatchObject({
      kind: "authentication",
      message:
        "No pudimos obtener el acceso a la API. La solicitud de creación no se envió.",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(client.acquireTokenRedirect).not.toHaveBeenCalled();
  });

  it.each(["", "   "])("rejects an empty token: %j", async (accessToken) => {
    const client = setupClient();

    client.acquireTokenSilent.mockResolvedValue({ accessToken });

    await expect(createApiEvent(client.options)).rejects.toMatchObject({
      kind: "authentication",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    "",
    "not-a-url",
    "http://api.example.com",
    "http://localhost.example.com",
    "https://user:password@api.example.com",
    "https://api.example.com?token=example",
    "https://api.example.com#fragment",
  ])("rejects an invalid API URL before acquiring a token: %s", async (apiUrl) => {
    const client = setupClient();

    await expect(
      createApiEvent({ ...client.options, apiUrl }),
    ).rejects.toMatchObject({
      kind: "configuration",
    });

    expect(client.acquireTokenSilent).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [400, "validation"],
    [401, "unauthorized"],
    [403, "forbidden"],
    [409, "conflict"],
    [500, "uncertain"],
    [502, "uncertain"],
    [200, "uncertain"],
  ] as const)(
    "handles HTTP %s without exposing the body or retrying",
    async (status, kind) => {
      const client = setupClient();

      fetchMock.mockResolvedValue(
        new Response(`Sensitive detail: ${testToken}`, { status }),
      );

      const error = await createApiEvent(client.options).catch(
        (caught: unknown) => caught,
      );

      expect(error).toBeInstanceOf(EventCreationError);
      expect(error).toMatchObject({ kind });
      expect((error as EventCreationError).message).not.toContain(
        testToken,
      );
      expect((error as EventCreationError).message).not.toContain(
        "Sensitive detail",
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(client.acquireTokenSilent).toHaveBeenCalledTimes(1);
      expect(client.acquireTokenRedirect).not.toHaveBeenCalled();
    },
  );

  it.each([
    new TypeError("Sensitive network detail"),
    new DOMException("Sensitive timeout detail", "TimeoutError"),
  ])("reports an uncertain result after a transport failure", async (failure) => {
    const client = setupClient();

    fetchMock.mockRejectedValue(failure);

    await expect(createApiEvent(client.options)).rejects.toMatchObject({
      kind: "uncertain",
      message: expect.stringContaining(
        "El evento podría haberse guardado.",
      ),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports an uncertain result when 201 contains invalid JSON", async () => {
    const client = setupClient();

    fetchMock.mockResolvedValue(
      new Response("not-json", { status: 201 }),
    );

    await expect(createApiEvent(client.options)).rejects.toMatchObject({
      kind: "uncertain",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    null,
    {},
    { ...createdEvent, id: "not-a-uuid" },
    { ...createdEvent, name: "" },
    { ...createdEvent, slug: "Invalid Slug" },
    { ...createdEvent, location: null },
    { ...createdEvent, timezone: "" },
    { ...createdEvent, status: "active" },
    { ...createdEvent, startsAt: "not-a-date" },
    { ...createdEvent, endsAt: input.startsAt },
    { ...createdEvent, createdAt: "not-a-date" },
  ])("rejects an invalid success response: %j", async (body) => {
    const client = setupClient();

    fetchMock.mockResolvedValue(jsonResponse(body));

    await expect(createApiEvent(client.options)).rejects.toMatchObject({
      kind: "uncertain",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
