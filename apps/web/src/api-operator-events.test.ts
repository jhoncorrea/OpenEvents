import { InteractionRequiredAuthError, type AccountInfo, type IPublicClientApplication } from "@azure/msal-browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOperatorEvent, listOperatorEvents } from "./api-operator-events";

const event = { id: "a4444444-4444-4444-8444-444444444444", name: "Evento",
  startsAt: "2027-08-27T14:00:00.000Z", endsAt: "2027-08-27T22:00:00.000Z",
  timezone: "America/Lima", location: "Lima", status: "draft" };
const account = { homeAccountId: "account-one" } as AccountInfo;
function setup() {
  const acquireTokenSilent = vi.fn().mockResolvedValue({ accessToken: "test-token" });
  const acquireTokenRedirect = vi.fn();
  return { acquireTokenSilent, acquireTokenRedirect, options: {
    instance: { acquireTokenSilent, acquireTokenRedirect } as unknown as IPublicClientApplication,
    account, apiScope: "api://test/access_as_user", apiUrl: "http://localhost:3001",
  } };
}
describe("operator event query client", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
  function respond(data: unknown, status = 200) { fetchMock.mockResolvedValue(new Response(JSON.stringify(data), { status })); }

  it("requests a bounded page using the selected account and safe fetch options", async () => {
    const client = setup(); respond({ items: [event], nextCursor: "cursor" });
    expect(await listOperatorEvents({ ...client.options, limit: 1, cursor: "previous" }))
      .toEqual({ items: [event], nextCursor: "cursor" });
    expect(client.acquireTokenSilent).toHaveBeenCalledExactlyOnceWith({ account, scopes: [client.options.apiScope] });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("http://localhost:3001/api/v1/operator/events?limit=1&cursor=previous", expect.objectContaining({
      method: "GET", headers: { Authorization: "Bearer test-token", Accept: "application/json" },
      cache: "no-store", credentials: "omit", redirect: "error", signal: expect.any(AbortSignal),
    }));
  });
  it("defaults to twenty and accepts an empty list", async () => {
    respond({ items: [], nextCursor: null });
    expect(await listOperatorEvents(setup().options)).toEqual({ items: [], nextCursor: null });
    expect(fetchMock.mock.calls[0][0]).toContain("limit=20");
  });
  it.each(["draft", "active", "closed", "cancelled"])("accepts persisted status %s and removes extra data", async status => {
    respond({ ...event, status, privateProfile: "not-returned", slug: "private", version: 1, createdAt: "private" });
    expect(await getOperatorEvent({ ...setup().options, eventId: event.id.toUpperCase() })).toEqual({ ...event, status });
  });
  it.each(["http://example.com", "https://user:password@example.com", "https://example.com?x=1", "https://example.com#x", "bad"])("rejects unsafe API URL %s before requesting a token", async apiUrl => {
    const client = setup();
    await expect(listOperatorEvents({ ...client.options, apiUrl })).rejects.toMatchObject({ kind: "configuration" });
    expect(client.acquireTokenSilent).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([0, 101, 1.5, NaN])("rejects invalid page size %s", async limit => {
    await expect(listOperatorEvents({ ...setup().options, limit })).rejects.toMatchObject({ kind: "validation" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects invalid IDs and cursors before acquiring a token", async () => {
    const client = setup();
    await expect(getOperatorEvent({ ...client.options, eventId: "../other" })).rejects.toMatchObject({ kind: "validation" });
    await expect(listOperatorEvents({ ...client.options, cursor: "bad&userId=other" })).rejects.toMatchObject({ kind: "validation" });
    expect(client.acquireTokenSilent).not.toHaveBeenCalled();
  });
  it.each([
    { status: 400, kind: "validation" }, { status: 401, kind: "unauthorized" },
    { status: 403, kind: "forbidden" }, { status: 404, kind: "not_found" },
    { status: 500, kind: "unavailable" }, { status: 201, kind: "unavailable" },
  ])("maps HTTP $status without exposing the body", async ({ status, kind }) => {
    respond({ message: "private-server-details" }, status);
    await expect(getOperatorEvent({ ...setup().options, eventId: event.id })).rejects.toMatchObject({ kind });
    await expect(listOperatorEvents(setup().options)).rejects.not.toHaveProperty("message", "private-server-details");
  });
  it("requests renewed authorization without redirecting or fetching", async () => {
    const client = setup(); client.acquireTokenSilent.mockRejectedValue(new InteractionRequiredAuthError("interaction_required", "Interaction required"));
    await expect(listOperatorEvents(client.options)).rejects.toMatchObject({ kind: "interaction_required" });
    expect(client.acquireTokenRedirect).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("handles authentication failure and empty tokens", async () => {
    const client = setup(); client.acquireTokenSilent.mockRejectedValueOnce(new Error("private"));
    await expect(listOperatorEvents(client.options)).rejects.toMatchObject({ kind: "authentication" });
    client.acquireTokenSilent.mockResolvedValue({ accessToken: " " });
    await expect(listOperatorEvents(client.options)).rejects.toMatchObject({ kind: "authentication" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("hides network failures without retrying", async () => {
    fetchMock.mockRejectedValue(new Error("private-network-data"));
    await expect(listOperatorEvents(setup().options)).rejects.toMatchObject({ kind: "unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([
    { label: "invalid calendar date", changes: { startsAt: "2027-02-30T14:00:00Z" } },
    { label: "offset date", changes: { startsAt: "2027-08-27T09:00:00-05:00" } },
    { label: "invalid timezone", changes: { timezone: "Not/AZone" } },
    { label: "offset timezone", changes: { timezone: "+05:00" } },
    { label: "invalid state", changes: { status: "unknown" } },
    { label: "empty name", changes: { name: " " } },
    { label: "reversed dates", changes: { endsAt: event.startsAt } },
  ])("rejects $label", async ({ changes }) => {
    respond({ ...event, ...changes });
    await expect(getOperatorEvent({ ...setup().options, eventId: event.id })).rejects.toMatchObject({ kind: "invalid_response" });
  });
  it.each([
    { label: "missing cursor", value: { items: [] } },
    { label: "duplicated event", value: { items: [event, event], nextCursor: null } },
    { label: "empty page with cursor", value: { items: [], nextCursor: "next" } },
    { label: "non-array items", value: { items: {}, nextCursor: null } },
  ])("rejects page with $label", async ({ value }) => {
    respond(value);
    await expect(listOperatorEvents(setup().options)).rejects.toMatchObject({ kind: "invalid_response" });
  });
  it("rejects a repeated cursor and a page larger than requested", async () => {
    respond({ items: [event], nextCursor: "same" });
    await expect(listOperatorEvents({ ...setup().options, cursor: "same" })).rejects.toMatchObject({ kind: "invalid_response" });
    respond({ items: [event, { ...event, id: "b4444444-4444-4444-8444-444444444444" }], nextCursor: null });
    await expect(listOperatorEvents({ ...setup().options, limit: 1 })).rejects.toMatchObject({ kind: "invalid_response" });
  });
  it("rejects detail for a different event", async () => {
    respond({ ...event, id: "b4444444-4444-4444-8444-444444444444" });
    await expect(getOperatorEvent({ ...setup().options, eventId: event.id })).rejects.toMatchObject({ kind: "invalid_response" });
  });
  it("handles malformed JSON", async () => {
    fetchMock.mockResolvedValue(new Response("{", { status: 200 }));
    await expect(listOperatorEvents(setup().options)).rejects.toMatchObject({ kind: "invalid_response" });
  });
  it("does not send a request cancelled while waiting for a token", async () => {
    const client = setup(); const controller = new AbortController();
    client.acquireTokenSilent.mockImplementation(async () => { controller.abort(); return { accessToken: "token" }; });
    await expect(listOperatorEvents({ ...client.options, signal: controller.signal })).rejects.toMatchObject({ kind: "cancelled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not acquire access for an already cancelled query", async () => {
    const client = setup(); const controller = new AbortController(); controller.abort();
    await expect(listOperatorEvents({ ...client.options, signal: controller.signal })).rejects.toMatchObject({ kind: "cancelled" });
    expect(client.acquireTokenSilent).not.toHaveBeenCalled();
  });
  it("aborts an active fetch when the account query is cancelled", async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(async (_url, init: RequestInit) => {
      controller.abort(); expect(init.signal?.aborted).toBe(true); throw new Error("aborted");
    });
    await expect(listOperatorEvents({ ...setup().options, signal: controller.signal })).rejects.toMatchObject({ kind: "cancelled" });
  });
  it("times out a stalled fetch", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new Error("timeout")));
    }));
    const result = expect(listOperatorEvents(setup().options)).rejects.toMatchObject({ kind: "unavailable" });
    await vi.advanceTimersByTimeAsync(15000); await result;
  });
  it.each(["token", "json"])("discards results when account changes during %s", async stage => {
    const client = setup(); let current = true;
    if (stage === "token") client.acquireTokenSilent.mockImplementation(async () => { current = false; return { accessToken: "token" }; });
    else fetchMock.mockResolvedValue({ status: 200, json: async () => { current = false; return { items: [], nextCursor: null }; } });
    await expect(listOperatorEvents({ ...client.options, isCurrent: () => current })).rejects.toMatchObject({ kind: "cancelled" });
    if (stage === "token") expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects a descending page", async () => {
    respond({ items: [{ ...event, id: "b4444444-4444-4444-8444-444444444444" }, event], nextCursor: null });
    await expect(listOperatorEvents(setup().options)).rejects.toMatchObject({ kind: "invalid_response" });
  });
  it("rejects JSON that arrives after the deadline even if the transport ignores abort", async () => {
    vi.useFakeTimers(); let finish!: (value: unknown) => void;
    fetchMock.mockResolvedValue({ status: 200, json: () => new Promise(resolve => { finish = resolve; }) });
    const result = expect(listOperatorEvents(setup().options)).rejects.toMatchObject({ kind: "unavailable" });
    await vi.advanceTimersByTimeAsync(15000); finish({ items: [], nextCursor: null }); await result;
  });

});
