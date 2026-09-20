import { InteractionRequiredAuthError, type AccountInfo, type IPublicClientApplication } from "@azure/msal-browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerApiAttendee, parseRegistrationInput, type RegistrationPayload } from "./api-registrations";

const eventId = "a4444444-4444-4444-8444-444444444444";
const input = { fullName: "Ana Pérez", email: "ana.perez+evento@example.com" };
const registration = { id: "b4444444-4444-4444-8444-444444444444", eventId, status: "confirmed", source: "manual",
  createdAt: "2026-09-20T14:00:00.000Z", attendee: { id: "c4444444-4444-4444-8444-444444444444", ...input } };
const account = { homeAccountId: "selected-account" } as AccountInfo;
function setup() {
  const acquireTokenSilent = vi.fn().mockResolvedValue({ accessToken: "test-token" });
  const acquireTokenRedirect = vi.fn();
  return { acquireTokenSilent, acquireTokenRedirect, options: {
    instance: { acquireTokenSilent, acquireTokenRedirect } as unknown as IPublicClientApplication,
    account, apiScope: "api://test/access_as_user", apiUrl: "http://localhost:3001", eventId, input: { ...input },
  } };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }

describe("attendee registration client", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
  function respond(value: unknown = registration, status = 201) {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(value), { status }));
  }
  it("sends normalized data with the selected account and strips extra response fields", async () => {
    const client = setup(); respond({ ...registration, secret: "private", attendee: { ...registration.attendee, secret: "private" } });
    expect(await registerApiAttendee({ ...client.options, eventId: eventId.toUpperCase(),
      input: { fullName: " Ana Pérez ", email: " ANA.PEREZ+EVENTO@EXAMPLE.COM " } })).toEqual(registration);
    expect(client.acquireTokenSilent).toHaveBeenCalledExactlyOnceWith({ account, scopes: [client.options.apiScope] });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`http://localhost:3001/api/v1/events/${eventId}/registrations`, expect.objectContaining({
      method: "POST", body: JSON.stringify(input),
      headers: { Authorization: "Bearer test-token", Accept: "application/json", "Content-Type": "application/json" },
      cache: "no-store", credentials: "omit", redirect: "error", signal: expect.any(AbortSignal),
    }));
  });
  it("preserves the proposal and event while waiting for a token", async () => {
    const client = setup(); const token = deferred<{ accessToken: string }>();
    client.acquireTokenSilent.mockReturnValue(token.promise); respond();
    const pending = registerApiAttendee(client.options);
    client.options.input.fullName = "Other"; client.options.input.email = "other@example.com"; client.options.eventId = "bad";
    token.resolve({ accessToken: "test-token" }); expect(await pending).toEqual(registration);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(input);
    expect(fetchMock.mock.calls[0][0]).toContain(eventId);
  });
  it("supports an HTTPS API path prefix", async () => {
    respond(); await registerApiAttendee({ ...setup().options, apiUrl: "https://api.example.com/prefix/" });
    expect(fetchMock.mock.calls[0][0]).toBe(`https://api.example.com/prefix/api/v1/events/${eventId}/registrations`);
  });
  it.each(["http://example.com", "https://user:pass@example.com", "https://example.com?q=1", "https://example.com#x", "bad"])(
    "rejects unsafe API configuration %s before acquiring access", async apiUrl => {
      const client = setup(); await expect(registerApiAttendee({ ...client.options, apiUrl })).rejects.toMatchObject({ kind: "configuration" });
      expect(client.acquireTokenSilent).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
    });
  it("rejects an empty scope and an invalid event ID before acquiring access", async () => {
    const client = setup();
    await expect(registerApiAttendee({ ...client.options, apiScope: " " })).rejects.toMatchObject({ kind: "configuration" });
    await expect(registerApiAttendee({ ...client.options, eventId: "../other" })).rejects.toMatchObject({ kind: "validation" });
    expect(client.acquireTokenSilent).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    null, [], {}, { fullName: "Ana" }, { email: "ana@example.com" }, { ...input, fullName: null },
    { ...input, fullName: " " }, { ...input, fullName: "x".repeat(201) },
    { ...input, fullName: "Ana\nPérez" }, { ...input, fullName: "Ana\u200bPérez" },
    ...["a..b@example.com", ".a@example.com", "a.@example.com", "á@example.com", "a@localhost", "a@exam ple.com", "a@例.com", "a@example.c", "a".repeat(65)+"@example.com",
      "a@"+"b".repeat(249)+".com"].map(email => ({ ...input, email })),
    ...[{ status: "confirmed" }, { source: "manual" }, { userId: "caller" }, { eventId }, { attendeeId: registration.attendee.id }].map(extra => ({ ...input, ...extra })),
  ])("rejects invalid input before requesting a token: %j", async value => {
    const client = setup();
    await expect(registerApiAttendee({ ...client.options, input: value as RegistrationPayload })).rejects.toMatchObject({ kind: "validation" });
    expect(client.acquireTokenSilent).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("accepts Unicode names and boundary lengths without mutating input", () => {
    const value = { fullName: " 李明 O’Connor ", email: " A.B+TAG@EXAMPLE.COM " };
    expect(parseRegistrationInput(value)).toEqual({ fullName: "李明 O’Connor", email: "a.b+tag@example.com" });
    expect(value.email).toBe(" A.B+TAG@EXAMPLE.COM ");
    expect(parseRegistrationInput({ fullName: "x".repeat(200), email: "a".repeat(64)+"@example.com" }).fullName).toHaveLength(200);
    expect(parseRegistrationInput({ fullName: "Ana", email: "a@"+"b".repeat(248)+".com" })).toBeDefined();
  });
  it.each([[400,"validation"],[413,"validation"],[415,"validation"],[401,"unauthorized"],[403,"forbidden"],[404,"not_found"],
    [500,"uncertain"],[502,"uncertain"],[429,"uncertain"],[200,"uncertain"],[202,"uncertain"]] as const)(
    "maps HTTP %s without exposing a server message", async (status, kind) => {
      respond({ message: "private-server-message" }, status); const pending = registerApiAttendee(setup().options);
      await expect(pending).rejects.toMatchObject({ kind });
      await expect(pending).rejects.not.toHaveProperty("message", "private-server-message"); expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  it.each([["REGISTRATION_EMAIL_CONFLICT","duplicate"],["EVENT_REGISTRATION_NOT_ALLOWED","not_allowed"],
    ["unknown","uncertain"],["toString","uncertain"],[null,"uncertain"]] as const)("maps conflict %s", async (code, kind) => {
    respond({ code, message: "private" },409);
    await expect(registerApiAttendee(setup().options)).rejects.toMatchObject({ kind }); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([null, [], {}, { ...registration, eventId: registration.id }, { ...registration, id: "invalid" },
    { ...registration, status: "cancelled" }, { ...registration, source: "csv" },
    { ...registration, createdAt: "2026-02-30T14:00:00.000Z" }, { ...registration, createdAt: "2026-09-20T09:00:00-05:00" },
    { ...registration, attendee: null }, { ...registration, attendee: { ...registration.attendee, id: "bad" } },
    { ...registration, attendee: { ...registration.attendee, email: "other@example.com" } },
    { ...registration, attendee: { ...registration.attendee, fullName: "Other" } },
  ])("does not claim success for a mismatched or malformed response: %j", async value => {
    respond(value); await expect(registerApiAttendee(setup().options)).rejects.toMatchObject({ kind: "uncertain" });
  });
  it.each([201,409])("treats unreadable HTTP %s JSON as uncertain", async status => {
    fetchMock.mockResolvedValue(new Response("{",{ status }));
    await expect(registerApiAttendee(setup().options)).rejects.toMatchObject({ kind: "uncertain" });
  });
  it("does not redirect or send when interaction is required", async () => {
    const client = setup(); client.acquireTokenSilent.mockRejectedValue(new InteractionRequiredAuthError("interaction_required", "Interaction required"));
    await expect(registerApiAttendee(client.options)).rejects.toMatchObject({ kind: "interaction_required" });
    expect(client.acquireTokenRedirect).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not send on token failure or an empty token", async () => {
    const client = setup(); client.acquireTokenSilent.mockRejectedValueOnce(new Error("private"));
    await expect(registerApiAttendee(client.options)).rejects.toMatchObject({ kind: "authentication" });
    client.acquireTokenSilent.mockResolvedValue({ accessToken: " " });
    await expect(registerApiAttendee(client.options)).rejects.toMatchObject({ kind: "authentication" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not retry or expose a network failure", async () => {
    fetchMock.mockRejectedValue(new Error("private-network")); const pending = registerApiAttendee(setup().options);
    await expect(pending).rejects.toMatchObject({ kind: "uncertain" });
    await expect(pending).rejects.not.toHaveProperty("message", "private-network"); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("does not acquire access when already cancelled", async () => {
    const client = setup(); const controller = new AbortController(); controller.abort();
    await expect(registerApiAttendee({ ...client.options, signal: controller.signal })).rejects.toMatchObject({ kind: "cancelled" });
    expect(client.acquireTokenSilent).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not send if cancelled while waiting for the token", async () => {
    const client = setup(); const controller = new AbortController();
    client.acquireTokenSilent.mockImplementation(async () => { controller.abort(); return { accessToken: "token" }; });
    await expect(registerApiAttendee({ ...client.options, signal: controller.signal })).rejects.toMatchObject({ kind: "cancelled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("aborts the active request and ignores a late success", async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(async (_url, init: RequestInit) => {
      controller.abort(); expect(init.signal?.aborted).toBe(true); return new Response(JSON.stringify(registration),{status:201});
    });
    await expect(registerApiAttendee({ ...setup().options, signal: controller.signal })).rejects.toMatchObject({ kind: "cancelled" });
  });
  it("ignores a body completed after cancellation", async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValue({status:201,json:async () => { controller.abort(); return registration; }});
    await expect(registerApiAttendee({ ...setup().options, signal: controller.signal })).rejects.toMatchObject({ kind: "cancelled" });
  });
  it("times out a stalled fetch without retry and cleans up", async () => {
    vi.useFakeTimers(); const controller = new AbortController(); const remove = vi.spyOn(controller.signal,"removeEventListener");
    fetchMock.mockImplementation((_url, init: RequestInit) => new Promise((_resolve,reject) => {
      init.signal?.addEventListener("abort",() => reject(new Error("private-timeout")));
    }));
    const pending = expect(registerApiAttendee({ ...setup().options, signal: controller.signal })).rejects.toMatchObject({ kind:"uncertain" });
    await vi.advanceTimersByTimeAsync(15000); await pending;
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(remove).toHaveBeenCalledWith("abort",expect.any(Function)); expect(vi.getTimerCount()).toBe(0);
  });
  it("rejects a body completed after the timeout", async () => {
    vi.useFakeTimers(); const body = deferred<unknown>(); const started = deferred<boolean>();
    fetchMock.mockResolvedValue({status:201,json:() => { started.resolve(true); return body.promise; }});
    const pending = expect(registerApiAttendee(setup().options)).rejects.toMatchObject({ kind:"uncertain" });
    await started.promise; await vi.advanceTimersByTimeAsync(15000); body.resolve(registration); await pending;
  });
});
