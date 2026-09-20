import { InteractionRequiredAuthError, type AccountInfo, type IPublicClientApplication } from "@azure/msal-browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { editApiEvent, type EditEventPayload } from "./api-event-edits";

const event = { id: "a4444444-4444-4444-8444-444444444444", name: "Actualizado", slug: "evento",
  startsAt: "2027-08-27T14:00:00.000Z", endsAt: "2027-08-27T22:00:00.000Z",
  createdAt: "2026-09-19T12:00:00.000Z", timezone: "America/Lima", location: "Lima", status: "draft", version: 2 };
const account = { homeAccountId: "selected-account" } as AccountInfo;
function setup() {
  const acquireTokenSilent = vi.fn().mockResolvedValue({ accessToken: "test-token" });
  const acquireTokenRedirect = vi.fn();
  return { acquireTokenSilent, acquireTokenRedirect, options: {
    instance: { acquireTokenSilent, acquireTokenRedirect } as unknown as IPublicClientApplication,
    account, apiScope: "api://test/access_as_user", apiUrl: "http://localhost:3001",
    eventId: event.id, input: { expectedVersion: 1, name: "Actualizado" } as EditEventPayload,
  } };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
describe("event editing client", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
  function respond(value: unknown = event, status = 200) { fetchMock.mockResolvedValue(new Response(JSON.stringify(value), { status })); }

  it("sends a partial PATCH with the selected account and safe fetch settings", async () => {
    const client = setup(); respond({ ...event, privateData: "secret" });
    expect(await editApiEvent({ ...client.options, eventId: event.id.toUpperCase() })).toEqual(event);
    expect(client.acquireTokenSilent).toHaveBeenCalledExactlyOnceWith({ account, scopes: [client.options.apiScope] });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`http://localhost:3001/api/v1/events/${event.id}`, expect.objectContaining({
      method: "PATCH", body: JSON.stringify(client.options.input),
      headers: { Authorization: "Bearer test-token", Accept: "application/json", "Content-Type": "application/json" },
      cache: "no-store", credentials: "omit", redirect: "error", signal: expect.any(AbortSignal),
    }));
  });
  it("snapshots identity and payload before waiting for authorization", async () => {
    const client = setup(); const token = deferred<{ accessToken: string }>();
    client.acquireTokenSilent.mockReturnValue(token.promise); respond();
    const request = editApiEvent(client.options);
    client.options.input.name = "Other"; client.options.input.expectedVersion = 9; client.options.eventId = "bad";
    token.resolve({ accessToken: "test-token" });
    expect((await request).version).toBe(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ expectedVersion: 1, name: "Actualizado" });
    expect(fetchMock.mock.calls[0][0]).toContain(event.id);
  });
  it("sends only timezone when no instant changes were requested", async () => {
    respond({ ...event, timezone: "Europe/Madrid" });
    await editApiEvent({ ...setup().options, input: { expectedVersion: 1, timezone: "Europe/Madrid" } });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ expectedVersion: 1, timezone: "Europe/Madrid" });
  });
  it("supports all six editable fields and an API path prefix", async () => {
    const { name, slug, startsAt, endsAt, timezone, location } = event;
    const input = { expectedVersion: 1, name, slug, startsAt, endsAt, timezone, location }; respond();
    await editApiEvent({ ...setup().options, apiUrl: "https://api.example.com/prefix/", input });
    expect(fetchMock.mock.calls[0][0]).toBe(`https://api.example.com/prefix/api/v1/events/${event.id}`);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(input);
  });
  it.each(["http://example.com", "https://user:pass@example.com", "https://example.com?q=1", "https://example.com#x", "bad"])("rejects unsafe configuration %s before acquiring access", async apiUrl => {
    const client = setup();
    await expect(editApiEvent({ ...client.options, apiUrl })).rejects.toMatchObject({ kind: "configuration" });
    expect(client.acquireTokenSilent).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects an empty scope and a malformed event ID", async () => {
    const client = setup();
    await expect(editApiEvent({ ...client.options, apiScope: " " })).rejects.toMatchObject({ kind: "configuration" });
    await expect(editApiEvent({ ...client.options, eventId: "../other" })).rejects.toMatchObject({ kind: "validation" });
    expect(client.acquireTokenSilent).not.toHaveBeenCalled();
  });
  it.each([
    null, [], {}, { name: "Missing version" }, { expectedVersion: 1 },
    ...[0, -1, 1.2, "1", NaN, 2147483647].map(expectedVersion => ({ expectedVersion, name: "x" })),
    ...[{ status: "active" }, { userId: "actor" }, { version: 99 }, { name: null }, { name: " " },
      { name: "x".repeat(201) }, { location: "x".repeat(501) }, { slug: "Bad Slug" },
      { timezone: "Not/AZone" }, { timezone: "+05:00" }, { startsAt: "2027-02-30T14:00:00Z" },
      { startsAt: "2027-08-27T09:00:00-05:00" }, { startsAt: event.startsAt, endsAt: event.startsAt }]
      .map(change => ({ expectedVersion: 1, name: "x", ...change })),
  ])("rejects invalid input before acquiring access: %j", async input => {
    const client = setup();
    await expect(editApiEvent({ ...client.options, input: input as EditEventPayload })).rejects.toMatchObject({ kind: "validation" });
    expect(client.acquireTokenSilent).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([[400, "validation"], [401, "unauthorized"], [403, "forbidden"], [404, "not_found"], [500, "uncertain"], [201, "uncertain"]] as const)("maps HTTP %s without exposing server messages", async (status, kind) => {
    respond({ message: "private-server-message", code: "EVENT_VERSION_CONFLICT" }, status);
    const result = editApiEvent(setup().options);
    await expect(result).rejects.toMatchObject({ kind });
    await expect(result).rejects.not.toHaveProperty("message", "private-server-message");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([["EVENT_VERSION_CONFLICT", "version_conflict"], ["EVENT_SLUG_CONFLICT", "slug_conflict"], ["EVENT_NOT_EDITABLE", "not_editable"], ["unknown", "uncertain"], ["toString", "uncertain"]] as const)("maps conflict code %s without retrying", async (code, kind) => {
    respond({ code, message: "private" }, 409);
    await expect(editApiEvent(setup().options)).rejects.toMatchObject({ kind });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([undefined, null, "EVENT_VERSION_CONFLICT", {}])("treats malformed conflict codes as uncertain: %j", async value => {
    respond(value, 409); await expect(editApiEvent(setup().options)).rejects.toMatchObject({ kind: "uncertain" });
  });
  it("does not redirect or send a PATCH when consent is required", async () => {
    const client = setup(); client.acquireTokenSilent.mockRejectedValue(new InteractionRequiredAuthError("interaction_required", "Interaction required"));
    await expect(editApiEvent(client.options)).rejects.toMatchObject({ kind: "interaction_required" });
    expect(client.acquireTokenRedirect).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not send on failed authorization or an empty token", async () => {
    const client = setup(); client.acquireTokenSilent.mockRejectedValueOnce(new Error("private"));
    await expect(editApiEvent(client.options)).rejects.toMatchObject({ kind: "authentication" });
    client.acquireTokenSilent.mockResolvedValue({ accessToken: " " });
    await expect(editApiEvent(client.options)).rejects.toMatchObject({ kind: "authentication" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([{ version: 1 }, { version: 3 }, { version: undefined }, { version: "2" }, { status: "active" },
    { id: "b4444444-4444-4444-8444-444444444444" }, { endsAt: event.startsAt }, { timezone: "Invalid/Zone" }])("does not claim success for an invalid response: %j", async changes => {
    respond({ ...event, ...changes });
    await expect(editApiEvent(setup().options)).rejects.toMatchObject({ kind: "uncertain" });
  });
  it.each([200, 409])("handles unreadable HTTP %s JSON as uncertain", async status => {
    fetchMock.mockResolvedValue(new Response("{", { status }));
    await expect(editApiEvent(setup().options)).rejects.toMatchObject({ kind: "uncertain" });
  });
  it("accepts the maximum resulting persisted version", async () => {
    respond({ ...event, version: 2147483647 });
    expect((await editApiEvent({ ...setup().options, input: { expectedVersion: 2147483646, name: event.name } })).version).toBe(2147483647);
  });
  it("treats network errors as uncertain and never retries", async () => {
    fetchMock.mockRejectedValue(new Error("private-network"));
    const result = editApiEvent(setup().options);
    await expect(result).rejects.toMatchObject({ kind: "uncertain" });
    await expect(result).rejects.not.toHaveProperty("message", "private-network"); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("does not request access for an already cancelled operation", async () => {
    const client = setup(); const controller = new AbortController(); controller.abort();
    await expect(editApiEvent({ ...client.options, signal: controller.signal })).rejects.toMatchObject({ kind: "cancelled" });
    expect(client.acquireTokenSilent).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not send if cancelled while awaiting authorization", async () => {
    const client = setup(); const controller = new AbortController();
    client.acquireTokenSilent.mockImplementation(async () => { controller.abort(); return { accessToken: "token" }; });
    await expect(editApiEvent({ ...client.options, signal: controller.signal })).rejects.toMatchObject({ kind: "cancelled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("aborts a sent request and ignores its late successful completion", async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(async (_url, init: RequestInit) => {
      controller.abort(); expect(init.signal?.aborted).toBe(true);
      return new Response(JSON.stringify(event), { status: 200 });
    });
    await expect(editApiEvent({ ...setup().options, signal: controller.signal })).rejects.toMatchObject({ kind: "cancelled" });
  });
  it("ignores a body completed after account cancellation", async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValue({ status: 200, json: async () => { controller.abort(); return event; } });
    await expect(editApiEvent({ ...setup().options, signal: controller.signal })).rejects.toMatchObject({ kind: "cancelled" });
  });
  it("times out a stalled request as uncertain and removes the listener", async () => {
    vi.useFakeTimers(); const controller = new AbortController(); const remove = vi.spyOn(controller.signal, "removeEventListener");
    fetchMock.mockImplementation((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new Error("timeout")));
    }));
    const result = expect(editApiEvent({ ...setup().options, signal: controller.signal })).rejects.toMatchObject({ kind: "uncertain" });
    await vi.advanceTimersByTimeAsync(15000); await result;
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(remove).toHaveBeenCalledWith("abort", expect.any(Function)); expect(vi.getTimerCount()).toBe(0);
  });
  it("does not accept a body that completes after the timeout", async () => {
    vi.useFakeTimers(); const body = deferred<unknown>(); const started = deferred<boolean>();
    fetchMock.mockResolvedValue({ status: 200, json: () => { started.resolve(true); return body.promise; } });
    const result = expect(editApiEvent(setup().options)).rejects.toMatchObject({ kind: "uncertain" });
    await started.promise; await vi.advanceTimersByTimeAsync(15000); body.resolve(event); await result;
  });
});
