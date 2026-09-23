import { InteractionRequiredAuthError, type AccountInfo, type IPublicClientApplication } from "@azure/msal-browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { issueApiRegistrationCredential, type CredentialOptions } from "./api-registration-credentials";
const id = "a4444444-4444-4444-8444-444444444444", reg = "b4444444-4444-4444-8444-444444444444";
const result = { id, eventId: id, registrationId: reg, status: "active", issuedAt: "2026-09-22T23:00:00.000Z", token: "oe1_" + "A".repeat(43) };
function setup() {
  const acquireTokenSilent = vi.fn().mockResolvedValue({ accessToken: "access-secret" });
  const options: CredentialOptions = { instance: { acquireTokenSilent } as unknown as IPublicClientApplication, account: { homeAccountId: "selected" } as AccountInfo,
    apiUrl: "http://localhost:3001", apiScope: "api://test/access", eventId: id, registrationId: reg, isCurrent: () => true };
  return { options, acquireTokenSilent };
}
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { resolve, promise }; }
describe("credential HTTP client", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => { fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify(result), { status: 201 })); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
  it("sends only authenticated POST with normalized IDs and no body or Content-Type", async () => {
    const f = setup(); expect(await issueApiRegistrationCredential({ ...f.options, eventId: id.toUpperCase(), registrationId: reg.toUpperCase() })).toEqual(result);
    expect(f.acquireTokenSilent).toHaveBeenCalledExactlyOnceWith({ account: f.options.account, scopes: [f.options.apiScope] });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`http://localhost:3001/api/v1/events/${id}/registrations/${reg}/qr`, {
      method: "POST", headers: { Authorization: "Bearer access-secret", Accept: "application/json" }, cache: "no-store", credentials: "omit", redirect: "error", signal: expect.any(AbortSignal) });
  });
  it.each(["http://example.com", "https://user:pass@example.com", "https://example.com?x=y", "https://example.com#x", "bad"])("rejects configuration %s before token acquisition", async apiUrl => {
    const f = setup(); await expect(issueApiRegistrationCredential({ ...f.options, apiUrl })).rejects.toMatchObject({ kind: "configuration" }); expect(f.acquireTokenSilent).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["eventId", "registrationId"])("rejects invalid %s before sending", async key => {
    const f = setup(); await expect(issueApiRegistrationCredential({ ...f.options, [key]: "invalid" })).rejects.toMatchObject({ kind: "validation" }); expect(f.acquireTokenSilent).not.toHaveBeenCalled();
  });
  it.each([
    { patch: { id: "bad" } }, { patch: { eventId: reg } }, { patch: { registrationId: id } }, { patch: { status: "expired" } },
    { patch: { issuedAt: "2026-02-30T00:00:00.000Z" } }, { patch: { issuedAt: "yesterday" } },
    { patch: { token: "oe1_" + "A".repeat(42) + "B" } }, { patch: { token: "oe1_" + "A".repeat(42) + "=" } },
    { patch: { token: "secret" } }, { patch: { tokenHash: "extra" } }, { patch: { token: undefined } },
  ])("rejects invalid response %# without exposing its contents", async ({ patch }) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ...result, ...patch }), { status: 201 }));
    await expect(issueApiRegistrationCredential(setup().options)).rejects.toMatchObject({ kind: "uncertain" }); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([
    [401, "", "unauthorized"], [403, "", "forbidden"], [400, "", "validation"], [413, "", "validation"], [415, "", "validation"],
    [404, "EVENT_NOT_FOUND", "event_not_found"], [404, "REGISTRATION_NOT_FOUND", "registration_not_found"],
    [409, "REGISTRATION_CREDENTIAL_EXISTS", "exists"], [409, "CREDENTIAL_ISSUANCE_NOT_ALLOWED", "not_allowed"],
    [404, "UNKNOWN", "uncertain"], [409, "UNKNOWN", "uncertain"], [500, "", "uncertain"], [200, "", "uncertain"], [302, "", "uncertain"],
  ])("maps HTTP %s / %s safely", async (status, code, kind) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ code, message: "private-server-detail" }), { status: status as number }));
    await expect(issueApiRegistrationCredential(setup().options)).rejects.toMatchObject({ kind }); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([{ error: new Error("private"), kind: "authentication" }, { error: new InteractionRequiredAuthError("interaction_required", "private"), kind: "interaction_required" }])("handles auth $kind without POST", async ({ error, kind }) => {
    const f = setup(); f.acquireTokenSilent.mockRejectedValue(error); await expect(issueApiRegistrationCredential(f.options)).rejects.toMatchObject({ kind }); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects an empty access token", async () => {
    const f = setup(); f.acquireTokenSilent.mockResolvedValue({ accessToken: " " }); await expect(issueApiRegistrationCredential(f.options)).rejects.toMatchObject({ kind: "authentication" }); expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["cancel", "account"])("does not send after %s changes during token acquisition", async mode => {
    const f = setup(); const pending = deferred<{ accessToken: string }>(); f.acquireTokenSilent.mockReturnValue(pending.promise);
    const controller = new AbortController(); let current = true;
    const operation = issueApiRegistrationCredential({ ...f.options, signal: controller.signal, isCurrent: () => current });
    if (mode === "cancel") controller.abort(); else current = false;
    pending.resolve({ accessToken: "secret" }); await expect(operation).rejects.toMatchObject({ kind: "cancelled_before_send" }); expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["cancel", "account"])("discards a response after %s changes during POST", async mode => {
    const pending = deferred<Response>(); fetchMock.mockReturnValue(pending.promise); const controller = new AbortController(); let current = true;
    const operation = issueApiRegistrationCredential({ ...setup().options, signal: controller.signal, isCurrent: () => current });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1)); if (mode === "cancel") controller.abort(); else current = false;
    pending.resolve(new Response(JSON.stringify(result), { status: 201 })); await expect(operation).rejects.toMatchObject({ kind: "uncertain" });
  });
  it.each(["network", "json"])("treats %s failure as uncertain without retry", async mode => {
    if (mode === "network") fetchMock.mockRejectedValue(new Error("secret")); else fetchMock.mockResolvedValue(new Response("secret-invalid-json", { status: 201 }));
    await expect(issueApiRegistrationCredential(setup().options)).rejects.toMatchObject({ kind: "uncertain" }); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("times out without retry even when fetch completes late", async () => {
    vi.useFakeTimers(); const pending = deferred<Response>(); fetchMock.mockReturnValue(pending.promise);
    const operation = issueApiRegistrationCredential(setup().options); const checked = expect(operation).rejects.toMatchObject({ kind: "uncertain" });
    await vi.advanceTimersByTimeAsync(15001); expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    pending.resolve(new Response(JSON.stringify(result), { status: 201 })); await checked; expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
