import { type AccountInfo, type IPublicClientApplication, InteractionRequiredAuthError } from "@azure/msal-browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { searchApiRegistrations } from "./api-registration-queries";
const id = "a4444444-4444-4444-8444-444444444444";
const row = { id, eventId: id, status: "confirmed", source: "manual", createdAt: "2026-09-20T12:00:00.000Z",
  attendee: { id, fullName: "Persona", email: "persona@example.com" } };
function setup(data: unknown = { items: [], nextCursor: null }) {
  const token = vi.fn().mockResolvedValue({ accessToken: "token" });
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(data))); vi.stubGlobal("fetch", fetch);
  return { token, fetch, options: { instance: { acquireTokenSilent: token } as unknown as IPublicClientApplication,
    account: { homeAccountId: "one" } as AccountInfo, apiScope: "scope", apiUrl: "http://localhost:3001", eventId: id, q: "Ana" } };
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("registration search client", () => {
  it("encodes literal query once, preserves prefix and uses the selected account", async () => {
    const s = setup(); await searchApiRegistrations({ ...s.options, apiUrl: "https://example.com/prefix/", q: "  Ana + %_&!  " });
    const url = new URL(s.fetch.mock.calls[0][0]); expect(url.pathname).toBe(`/prefix/api/v1/events/${id}/registrations/search`);
    expect(url.searchParams.get("q")).toBe("Ana + %_&!"); expect(url.searchParams.getAll("q")).toHaveLength(1);
    expect(s.token).toHaveBeenCalledExactlyOnceWith({ account: s.options.account, scopes: ["scope"] });
    expect(s.fetch.mock.calls[0][1]).toMatchObject({ method: "GET", cache: "no-store", credentials: "omit", redirect: "error" });
  });
  it("accepts search cursors longer than list cursors and projects results", async () => {
    const s = setup({ items: [{ ...row, private: "hidden" }], nextCursor: "b".repeat(220) });
    expect(await searchApiRegistrations({ ...s.options, cursor: "a".repeat(220), limit: 1 }))
      .toEqual({ items: [row], nextCursor: "b".repeat(220) });
  });
  it.each(["", "  ", "a\n", "a\t", "a\u0000", "a".repeat(101), " ".repeat(201)])("rejects invalid term %# before token", async q => {
    const s = setup(); await expect(searchApiRegistrations({ ...s.options, q })).rejects.toMatchObject({ kind: "validation" });
    expect(s.token).not.toHaveBeenCalled(); expect(s.fetch).not.toHaveBeenCalled();
  });
  it.each(["", "x=" , "x".repeat(241)])("rejects invalid cursor %#", async cursor => {
    const s = setup(); await expect(searchApiRegistrations({ ...s.options, cursor })).rejects.toMatchObject({ kind: "validation" });
  });
  it.each([null, { items: [{ ...row, eventId: "foreign" }], nextCursor: null }, { items: [row, row], nextCursor: null },
    { items: [row], nextCursor: "=" }, { items: [], nextCursor: "next" }, { items: [{ ...row, createdAt: "bad" }], nextCursor: null }])("rejects malformed response %#", async data => {
    const s = setup(data); await expect(searchApiRegistrations(s.options)).rejects.toMatchObject({ kind: "invalid_response" });
  });
  it.each([[400, "validation"], [401, "unauthorized"], [403, "forbidden"], [404, "not_found"], [500, "unavailable"]])("maps HTTP %s", async (status, kind) => {
    const s = setup(); s.fetch.mockResolvedValue(new Response("private error", { status: Number(status) }));
    await expect(searchApiRegistrations(s.options)).rejects.toMatchObject({ kind });
  });
  it("checks account freshness after token and after response", async () => {
    const s = setup(); let current = true;
    s.token.mockImplementation(async () => { current = false; return { accessToken: "token" }; });
    await expect(searchApiRegistrations({ ...s.options, isCurrent: () => current })).rejects.toMatchObject({ kind: "cancelled" });
    expect(s.fetch).not.toHaveBeenCalled();
    current = true; s.token.mockResolvedValue({ accessToken: "token" });
    s.fetch.mockImplementation(async () => { current = false; return new Response('{"items":[],"nextCursor":null}'); });
    await expect(searchApiRegistrations({ ...s.options, isCurrent: () => current })).rejects.toMatchObject({ kind: "cancelled" });
  });
  it("handles interaction and cancellation without automatic retry", async () => {
    const s = setup(); s.token.mockRejectedValue(new InteractionRequiredAuthError("interaction_required", "Sign in"));
    await expect(searchApiRegistrations(s.options)).rejects.toMatchObject({ kind: "interaction_required" });
    const controller = new AbortController(); controller.abort();
    await expect(searchApiRegistrations({ ...s.options, signal: controller.signal })).rejects.toMatchObject({ kind: "cancelled" });
    expect(s.fetch).not.toHaveBeenCalled();
  });
});
