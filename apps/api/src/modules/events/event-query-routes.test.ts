import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";
import type { AccessTokenVerifier } from "../../auth/http-auth.js";
import { AuthenticationError, AuthorizationError, type AuthenticatedUser } from "../../auth/verify-access-token.js";
import { EventNotFoundError, type QueriedEvent } from "./query-events-for-organizer.js";
import type { EventQueryOperations } from "./event-query-routes.js";
import { encodeEventCursor } from "./event-query-input.js";

const actor: AuthenticatedUser = {
  tenantId: "22222222-2222-4222-8222-222222222222",
  objectId: "11111111-1111-4111-8111-111111111111",
  subject: "test", roles: ["organizer"],
};
const event: QueriedEvent = {
  id: "a3333333-3333-4333-8333-333333333333", name: "Test event", slug: "test-event",
  startsAt: new Date("2027-08-27T14:00:00Z"), endsAt: new Date("2027-08-27T22:00:00Z"),
  timezone: "America/Lima", location: "Lima", status: "draft", version: 1,
  createdAt: new Date("2026-09-19T12:00:00Z"),
};
const headers = { authorization: "Bearer test-token" };
const serialized = { ...event, startsAt: event.startsAt.toISOString(),
  endsAt: event.endsAt.toISOString(), createdAt: event.createdAt.toISOString() };

describe("event query HTTP routes", () => {
  let app: ReturnType<typeof buildApp>;
  let verify: ReturnType<typeof vi.fn<AccessTokenVerifier>>;
  let list: ReturnType<typeof vi.fn<EventQueryOperations["list"]>>;
  let get: ReturnType<typeof vi.fn<EventQueryOperations["get"]>>;
  beforeEach(() => {
    verify = vi.fn<AccessTokenVerifier>().mockResolvedValue(actor);
    list = vi.fn<EventQueryOperations["list"]>().mockResolvedValue({ items: [event], nextCursor: null });
    get = vi.fn<EventQueryOperations["get"]>().mockResolvedValue(event);
    app = buildApp({ verifyAccessToken: verify,
      createEvent: vi.fn().mockRejectedValue(new Error("Unexpected creation")),
      eventQueries: { list, get } });
  });
  afterEach(async () => { await app.close(); vi.restoreAllMocks(); });

  it("returns a page with UTC dates and passes only the verified actor", async () => {
    const cursor = encodeEventCursor(event.id);
    list.mockResolvedValue({ items: [event], nextCursor: cursor });
    const response = await app.inject({ url: `/api/v1/events?limit=2&cursor=${cursor}`, headers });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [serialized], nextCursor: cursor });
    expect(list).toHaveBeenCalledExactlyOnceWith({ limit: "2", cursor }, actor);
    expect(verify).toHaveBeenCalledExactlyOnceWith("test-token");
  });

  it("returns an empty page", async () => {
    list.mockResolvedValue({ items: [], nextCursor: null });
    const response = await app.inject({ url: "/api/v1/events", headers });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [], nextCursor: null });
  });

  it("returns detail and normalizes the identifier", async () => {
    const response = await app.inject({ url: `/api/v1/events/${event.id.toUpperCase()}`, headers });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(serialized);
    expect(get).toHaveBeenCalledExactlyOnceWith(event.id, actor);
  });

  it.each([
    "/api/v1/events?limit=101", "/api/v1/events?limit=2&limit=3",
    "/api/v1/events?cursor=invalid", "/api/v1/events?cursor=a&cursor=b",
    "/api/v1/events?userId=someone", "/api/v1/events?role=admin",
    "/api/v1/events/invalid", `/api/v1/events/${event.id}?userId=someone`,
  ])("rejects invalid input before persistence: %s", async (url) => {
    const response = await app.inject({ url, headers });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("INVALID_EVENT_QUERY");
    expect(list).not.toHaveBeenCalled(); expect(get).not.toHaveBeenCalled();
  });

  describe.each(["/api/v1/events", `/api/v1/events/${event.id}`])("%s", (url) => {
    it("prevents caching successful responses", async () => {
      const response = await app.inject({ url, headers });
      expect(response.headers["cache-control"]).toBe("no-store");
    });
    it.each([undefined, "Basic test", "Bearer", "Bearer a b"])("rejects header %s", async (authorization) => {
      const response = await app.inject({ url, headers: authorization ? { authorization } : {} });
      expect(response.statusCode).toBe(401);
      expect(response.headers["www-authenticate"]).toBe("Bearer");
      expect(verify).not.toHaveBeenCalled();
      expect(list).not.toHaveBeenCalled(); expect(get).not.toHaveBeenCalled();
    });
    it.each<{ roles: AuthenticatedUser["roles"] }>([
      { roles: [] }, { roles: ["admin"] }, { roles: ["checkin_operator"] },
    ])("rejects roles $roles", async ({ roles }) => {
      verify.mockResolvedValue({ ...actor, roles });
      const response = await app.inject({ url, headers });
      expect(response.statusCode).toBe(403);
      expect(list).not.toHaveBeenCalled(); expect(get).not.toHaveBeenCalled();
    });
    it("maps token rejection to 401", async () => {
      verify.mockRejectedValue(new AuthenticationError());
      expect((await app.inject({ url, headers })).statusCode).toBe(401);
      expect(list).not.toHaveBeenCalled(); expect(get).not.toHaveBeenCalled();
    });
    it("maps scope or client rejection to 403", async () => {
      verify.mockRejectedValue(new AuthorizationError());
      expect((await app.inject({ url, headers })).statusCode).toBe(403);
      expect(list).not.toHaveBeenCalled(); expect(get).not.toHaveBeenCalled();
    });
    it("hides operational verifier errors", async () => {
      verify.mockRejectedValue(new Error("private-verifier-data"));
      const response = await app.inject({ url, headers });
      expect(response.statusCode).toBe(500);
      expect(response.body).not.toContain("private-verifier-data");
      expect(list).not.toHaveBeenCalled(); expect(get).not.toHaveBeenCalled();
    });
    it("rejects a disabled local account without logging the error", async () => {
      list.mockRejectedValue(new AuthorizationError()); get.mockRejectedValue(new AuthorizationError());
      const log = vi.spyOn(app.log, "error");
      const response = await app.inject({ url, headers });
      expect(response.statusCode).toBe(403);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(log).not.toHaveBeenCalled();
    });
    it("maps malformed internal identity to 401", async () => {
      list.mockRejectedValue(new AuthenticationError()); get.mockRejectedValue(new AuthenticationError());
      const response = await app.inject({ url, headers });
      expect(response.statusCode).toBe(401);
      expect(response.headers["www-authenticate"]).toBe("Bearer");
    });
    it("does not expose or log persistence error details", async () => {
      const error = new Error("private-SQL-details");
      list.mockRejectedValue(error); get.mockRejectedValue(error);
      const log = vi.spyOn(app.log, "error");
      const response = await app.inject({ url, headers });
      expect(response.statusCode).toBe(500);
      expect(response.body).not.toContain("private-SQL-details");
      expect(log).toHaveBeenCalledExactlyOnceWith({ code: "EVENT_QUERY_FAILED" }, "No se pudieron consultar los eventos.");
    });
  });

  it("returns the same generic 404 for a missing or unauthorized event", async () => {
    get.mockRejectedValue(new EventNotFoundError());
    const response = await app.inject({ url: `/api/v1/events/${event.id}`, headers });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ code: "EVENT_NOT_FOUND", message: "No se encontró el evento." });
  });
  it("checks authentication before query validation", async () => {
    expect((await app.inject({ url: "/api/v1/events?limit=bad" })).statusCode).toBe(401);
    expect((await app.inject({ url: "/api/v1/events/invalid" })).statusCode).toBe(401);
  });
});
