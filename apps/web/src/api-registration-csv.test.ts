import { InteractionRequiredAuthError, type AccountInfo, type IPublicClientApplication } from "@azure/msal-browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { importApiRegistrationCsv as send, queryApiRegistrationCsv as get } from "./api-registration-csv";
const eventId = "a4444444-4444-4444-8444-444444444444", key = "b4444444-4444-4444-8444-444444444444";
const item = { id: key, eventId, status: "confirmed", source: "csv", createdAt: "2026-09-21T12:00:00.000Z",
  attendee: { id: key, fullName: "Persona", email: "persona@example.com" } };
const value = { status: "completed", receipt: { importId: key, completedAt: item.createdAt, result: { eventId, count: 1, items: [item] } } };
function setup() {
  const token = vi.fn().mockResolvedValue({ accessToken: "token" });
  return { token, options: { instance: { acquireTokenSilent: token } as unknown as IPublicClientApplication,
    account: { homeAccountId: "a" } as AccountInfo, apiScope: "scope", apiUrl: "http://localhost:3001", eventId, key,
    bytes: new TextEncoder().encode("\ufefffullName,email\r\nPersona,persona@example.com") } };
}
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => { fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(value))); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
describe("CSV HTTP client", () => {
  it("preserves bytes and sends account/scope, key and protected fetch options", async () => {
    const s = setup(); expect(await send(s.options)).toEqual(value);
    expect(s.token).toHaveBeenCalledExactlyOnceWith({ account: s.options.account, scopes: ["scope"] });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`http://localhost:3001/api/v1/events/${eventId}/registrations/imports`, expect.objectContaining({
      method: "POST", body: s.options.bytes, headers: { Authorization: "Bearer token", Accept: "application/json", "Idempotency-Key": key, "Content-Type": "text/csv" },
      cache: "no-store", credentials: "omit", redirect: "error", signal: expect.any(AbortSignal) }));
  });
  it("snapshots bytes before acquiring the token", async () => {
    const s = setup(); let resolve!: (v: { accessToken: string }) => void;
    s.token.mockReturnValue(new Promise(r => { resolve = r; })); const original = s.options.bytes.slice();
    const p = send(s.options); s.options.bytes.fill(0); resolve({ accessToken: "token" }); await p;
    expect(fetchMock.mock.calls[0][1].body).toEqual(original);
  });
  it("queries without a body and accepts not_observed", async () => {
    fetchMock.mockResolvedValue(new Response('{"status":"not_observed"}'));
    expect(await get(setup().options)).toEqual({ status: "not_observed" }); expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
    expect(fetchMock.mock.calls[0][1].method).toBe("GET");
  });
  it.each(["http://evil.example", "https://u:p@example.com", "https://example.com?q=x", "https://example.com#x", "invalid"])("rejects configuration %s before MSAL", async apiUrl => {
    const s = setup(); await expect(send({ ...s.options, apiUrl })).rejects.toMatchObject({ kind: "configuration" }); expect(s.token).not.toHaveBeenCalled();
  });
  it.each([{ key: "bad" }, { eventId: "bad" }, { bytes: new Uint8Array() }, { bytes: new Uint8Array(1048577) }])("rejects invalid input %#", async change => {
    const s = setup(); await expect(send({ ...s.options, ...change })).rejects.toMatchObject({ kind: "validation" }); expect(s.token).not.toHaveBeenCalled();
  });
  it("does not send after account changes during MSAL", async () => {
    const s = setup(); let current = true; s.token.mockImplementation(async () => { current = false; return { accessToken: "token" }; });
    await expect(send({ ...s.options, isCurrent: () => current })).rejects.toMatchObject({ kind: "cancelled" }); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not redirect automatically when interaction is required", async () => {
    const s = setup(); s.token.mockRejectedValue(new InteractionRequiredAuthError("interaction_required", "Interaction required"));
    await expect(send(s.options)).rejects.toMatchObject({ kind: "interaction_required" }); expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([401, 403, 404])("maps auth/access status %s", async status => {
    fetchMock.mockResolvedValue(new Response("", { status }));
    await expect(send(setup().options)).rejects.toMatchObject({ kind: ({ 401: "unauthorized", 403: "forbidden", 404: "not_found" })[status] });
  });
  it.each([
    [400, "INVALID_REGISTRATION_CSV_REQUEST", "validation"], [413, "PAYLOAD_TOO_LARGE", "validation"], [415, "UNSUPPORTED_MEDIA_TYPE", "validation"],
    [409, "REGISTRATION_EMAIL_CONFLICT", "duplicate"], [409, "EVENT_REGISTRATION_NOT_ALLOWED", "not_allowed"], [409, "REGISTRATION_CSV_KEY_CONFLICT", "key_conflict"],
  ])("maps known %s %s", async (status, code, kind) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ code }), { status: Number(status) }));
    await expect(send(setup().options)).rejects.toMatchObject({ kind });
  });
  it("ignores server error text and retains safe diagnostics", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ code: "INVALID_REGISTRATION_CSV", errors: [{ code: "INVALID_EMAIL", message: "<script>secret</script>", record: 1, line: 2, field: "email", secret: "private" }], truncated: true }), { status: 400 }));
    await expect(send(setup().options)).rejects.toMatchObject({ kind: "validation", diagnostics: [{ code: "INVALID_EMAIL", record: 1, line: 2, field: "email" }], truncated: true });
  });
  it.each([null, { status: "not_observed" }, { ...value, receipt: { ...value.receipt, completedAt: "bad" } },
    { ...value, receipt: { ...value.receipt, result: { ...value.receipt.result, count: 2 } } },
    { ...value, receipt: { ...value.receipt, result: { ...value.receipt.result, eventId: key } } },
    { ...value, receipt: { ...value.receipt, result: { ...value.receipt.result, items: [{ ...item, source: "manual" }] } } },
    { ...value, receipt: { ...value.receipt, result: { ...value.receipt.result, count: 2, items: [item, item] } } },
  ])("treats inconsistent success %# as uncertain", async data => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(data))); await expect(send(setup().options)).rejects.toMatchObject({ kind: "uncertain" });
  });
  it.each([400, 409, 500])("treats unknown or operational %s as uncertain", async status => {
    fetchMock.mockResolvedValue(new Response('{"code":"UNKNOWN"}', { status })); await expect(send(setup().options)).rejects.toMatchObject({ kind: "uncertain" });
  });
  it("does not retry after a network failure", async () => {
    fetchMock.mockRejectedValue(new Error("network")); await expect(send(setup().options)).rejects.toMatchObject({ kind: "uncertain" }); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("times out an HTTP request as uncertain", async () => {
    vi.useFakeTimers(); fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("abort")))));
    const outcome = expect(send(setup().options)).rejects.toMatchObject({ kind: "uncertain" }); await vi.advanceTimersByTimeAsync(15000); await outcome;
  });
});
