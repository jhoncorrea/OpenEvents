import { InteractionRequiredAuthError, type AccountInfo, type IPublicClientApplication } from "@azure/msal-browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getApiRegistration, listApiRegistrations } from "./api-registration-queries";

const eventId = "a4444444-4444-4444-8444-444444444444";
const registration = { id: "b4444444-4444-4444-8444-444444444444", eventId,
  status: "confirmed", source: "manual", createdAt: "2026-09-20T12:00:00.000Z",
  attendee: { id: "c4444444-4444-4444-8444-444444444444", fullName: "Asistente de prueba", email: "test@example.com" } };
function setup() {
  const acquireTokenSilent = vi.fn().mockResolvedValue({ accessToken: "test-token" });
  const acquireTokenRedirect = vi.fn();
  return { acquireTokenSilent, acquireTokenRedirect, options: {
    instance: { acquireTokenSilent, acquireTokenRedirect } as unknown as IPublicClientApplication,
    account: { homeAccountId: "account-one" } as AccountInfo,
    apiScope: "api://test/access_as_user", apiUrl: "http://localhost:3001", eventId,
  } };
}
describe("registration query client", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
  function respond(data: unknown, status = 200) { fetchMock.mockResolvedValue(new Response(JSON.stringify(data), { status })); }
  it("uses the selected account, event, cursor and safe read options", async () => {
    const client = setup(); respond({ items: [registration], nextCursor: "next" });
    expect(await listApiRegistrations({ ...client.options, limit: 1, cursor: "previous" }))
      .toEqual({ items: [registration], nextCursor: "next" });
    expect(client.acquireTokenSilent).toHaveBeenCalledExactlyOnceWith({ account: client.options.account, scopes: [client.options.apiScope] });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`http://localhost:3001/api/v1/events/${eventId}/registrations?limit=1&cursor=previous`, expect.objectContaining({
      method: "GET", headers: { Authorization: "Bearer test-token", Accept: "application/json" },
      cache: "no-store", credentials: "omit", redirect: "error", signal: expect.any(AbortSignal),
    }));
  });
  it("defaults to twenty and accepts no registrations", async () => {
    respond({ items: [], nextCursor: null });
    expect(await listApiRegistrations(setup().options)).toEqual({ items: [], nextCursor: null });
    expect(fetchMock.mock.calls[0][0]).toContain("limit=20");
  });
  it("preserves the API base path and normalizes requested UUIDs", async () => {
    respond(registration);
    expect(await getApiRegistration({ ...setup().options, apiUrl: "https://api.example.com/prefix/", eventId: eventId.toUpperCase(), registrationId: registration.id.toUpperCase() })).toEqual(registration);
    expect(fetchMock.mock.calls[0][0]).toBe(`https://api.example.com/prefix/api/v1/events/${eventId}/registrations/${registration.id}`);
  });
  it.each(["confirmed", "cancelled"])("accepts %s and persisted source without exposing extra fields", async status => {
    respond({ ...registration, status, source: "csv", privateData: "hidden", attendee: { ...registration.attendee, emailNormalized: "hidden" } });
    expect(await getApiRegistration({ ...setup().options, registrationId: registration.id })).toEqual({ ...registration, status, source: "csv" });
  });
  it.each(["bad", "http://example.com", "https://user:pass@example.com", "https://example.com?x=1", "https://example.com#x"])("rejects configuration %s before acquiring access", async apiUrl => {
    const client = setup();
    await expect(listApiRegistrations({ ...client.options, apiUrl })).rejects.toMatchObject({ kind: "configuration" });
    expect(client.acquireTokenSilent).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([0, -1, 101, 1.5, NaN, Infinity])("rejects page size %s before acquiring access", async limit => {
    const client = setup();
    await expect(listApiRegistrations({ ...client.options, limit })).rejects.toMatchObject({ kind: "validation" });
    expect(client.acquireTokenSilent).not.toHaveBeenCalled();
  });
  it.each(["", "a".repeat(151), "bad&x=1", "bad=", "bad cursor"])("rejects malformed cursor %s", async cursor => {
    const client = setup();
    await expect(listApiRegistrations({ ...client.options, cursor })).rejects.toMatchObject({ kind: "validation" });
    expect(client.acquireTokenSilent).not.toHaveBeenCalled();
  });
  it("accepts a 150-character opaque cursor", async () => {
    respond({ items: [], nextCursor: null });
    await expect(listApiRegistrations({ ...setup().options, cursor: "a".repeat(150) })).resolves.toMatchObject({ items: [] });
  });
  it("rejects both invalid route identifiers and an empty scope locally", async () => {
    const client = setup();
    await expect(listApiRegistrations({ ...client.options, eventId: "../other" })).rejects.toMatchObject({ kind: "validation" });
    await expect(getApiRegistration({ ...client.options, registrationId: "../other" })).rejects.toMatchObject({ kind: "validation" });
    await expect(listApiRegistrations({ ...client.options, apiScope: " " })).rejects.toMatchObject({ kind: "configuration" });
    expect(client.acquireTokenSilent).not.toHaveBeenCalled();
  });
  it.each([
    [400, "validation"], [401, "unauthorized"], [403, "forbidden"], [404, "not_found"],
    [429, "unavailable"], [500, "unavailable"], [201, "unavailable"],
  ])("maps HTTP %s without exposing server details", async (status, kind) => {
    respond({ message: "private-server-details" }, status as number);
    await expect(listApiRegistrations(setup().options)).rejects.toMatchObject({ kind });
    await expect(getApiRegistration({ ...setup().options, registrationId: registration.id })).rejects.not.toHaveProperty("message", "private-server-details");
  });
  it.each([
    { eventId: "d4444444-4444-4444-8444-444444444444" }, { id: "bad" }, { status: "unknown" },
    { source: "" }, { source: 1 }, { createdAt: "2026-02-30T12:00:00.000Z" }, { createdAt: "2026-09-20T12:00:00-05:00" },
    { attendee: null }, { attendee: { ...registration.attendee, id: "bad" } },
    { attendee: { ...registration.attendee, fullName: " " } },
    { attendee: { ...registration.attendee, fullName: "a".repeat(201) } },
    { attendee: { ...registration.attendee, fullName: "a\u0000b" } },
    { attendee: { ...registration.attendee, email: "invalid" } },
  ])("rejects invalid registration in both reads: %j", async changes => {
    const value = { ...registration, ...changes };
    respond(value);
    await expect(getApiRegistration({ ...setup().options, registrationId: registration.id })).rejects.toMatchObject({ kind: "invalid_response" });
    respond({ items: [value], nextCursor: null });
    await expect(listApiRegistrations(setup().options)).rejects.toMatchObject({ kind: "invalid_response" });
  });
  it("rejects a detail belonging to another registration in the same event", async () => {
    respond({ ...registration, id: registration.attendee.id });
    await expect(getApiRegistration({ ...setup().options, registrationId: registration.id })).rejects.toMatchObject({ kind: "invalid_response" });
  });
  it.each([
    null, [], { items: [] }, { items: {}, nextCursor: null }, { items: [], nextCursor: "next" },
    { items: [registration], nextCursor: "bad=" }, { items: [registration], nextCursor: 1 },
    { items: [registration, registration], nextCursor: null },
    { items: [{ ...registration, id: registration.attendee.id }, registration], nextCursor: null },
  ])("rejects malformed pages: %j", async page => {
    respond(page);
    await expect(listApiRegistrations(setup().options)).rejects.toMatchObject({ kind: "invalid_response" });
  });
  it("rejects repeated cursors, short continuing pages and oversized pages", async () => {
    respond({ items: [registration], nextCursor: "same" });
    await expect(listApiRegistrations({ ...setup().options, limit: 1, cursor: "same" })).rejects.toMatchObject({ kind: "invalid_response" });
    await expect(listApiRegistrations({ ...setup().options, limit: 2 })).rejects.toMatchObject({ kind: "invalid_response" });
    respond({ items: [registration, { ...registration, id: registration.attendee.id }], nextCursor: null });
    await expect(listApiRegistrations({ ...setup().options, limit: 1 })).rejects.toMatchObject({ kind: "invalid_response" });
  });
  it("accepts a full final page with null cursor", async () => {
    respond({ items: [registration], nextCursor: null });
    await expect(listApiRegistrations({ ...setup().options, limit: 1 })).resolves.toEqual({ items: [registration], nextCursor: null });
  });
  it("handles authentication failures without redirection or requests", async () => {
    const client = setup();
    client.acquireTokenSilent.mockRejectedValueOnce(new InteractionRequiredAuthError("interaction_required", "Interaction required"));
    await expect(listApiRegistrations(client.options)).rejects.toMatchObject({ kind: "interaction_required" });
    client.acquireTokenSilent.mockRejectedValueOnce(new Error("private"));
    await expect(listApiRegistrations(client.options)).rejects.toMatchObject({ kind: "authentication" });
    client.acquireTokenSilent.mockResolvedValueOnce({ accessToken: " " });
    await expect(listApiRegistrations(client.options)).rejects.toMatchObject({ kind: "authentication" });
    expect(client.acquireTokenRedirect).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("handles malformed JSON and network errors without retries", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{"));
    await expect(listApiRegistrations(setup().options)).rejects.toMatchObject({ kind: "invalid_response" });
    fetchMock.mockRejectedValueOnce(new Error("private-network-details"));
    await expect(listApiRegistrations(setup().options)).rejects.toMatchObject({ kind: "unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("does not acquire a token for an already cancelled request", async () => {
    const client = setup(); const controller = new AbortController(); controller.abort();
    await expect(listApiRegistrations({ ...client.options, signal: controller.signal })).rejects.toMatchObject({ kind: "cancelled" });
    expect(client.acquireTokenSilent).not.toHaveBeenCalled();
  });
  it("discards access acquired after cancellation", async () => {
    const client = setup(); const controller = new AbortController();
    client.acquireTokenSilent.mockImplementation(async () => { controller.abort(); return { accessToken: "token" }; });
    await expect(listApiRegistrations({ ...client.options, signal: controller.signal })).rejects.toMatchObject({ kind: "cancelled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("discards a response body completed after cancellation", async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValue({ status: 200, json: async () => { controller.abort(); return { items: [registration], nextCursor: null }; } });
    await expect(listApiRegistrations({ ...setup().options, signal: controller.signal })).rejects.toMatchObject({ kind: "cancelled" });
  });
  it("propagates cancellation to the active fetch", async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(async (_url, init: RequestInit) => {
      controller.abort(); expect(init.signal?.aborted).toBe(true); throw new Error("aborted");
    });
    await expect(listApiRegistrations({ ...setup().options, signal: controller.signal })).rejects.toMatchObject({ kind: "cancelled" });
  });
  it("times out stalled transport", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new Error("timeout")));
    }));
    const result = expect(listApiRegistrations(setup().options)).rejects.toMatchObject({ kind: "unavailable" });
    await vi.advanceTimersByTimeAsync(15000); await result;
    expect(vi.getTimerCount()).toBe(0);
  });
  it("rejects a body that resolves after the timeout even if transport ignores abort", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue({ status: 200, json: () => new Promise(resolve => {
      setTimeout(() => resolve({ items: [], nextCursor: null }), 16000);
    }) });
    const result = expect(listApiRegistrations(setup().options)).rejects.toMatchObject({ kind: "unavailable" });
    await vi.advanceTimersByTimeAsync(16000); await result;
    expect(vi.getTimerCount()).toBe(0);
  });
});
