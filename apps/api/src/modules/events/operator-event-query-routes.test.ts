import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";
import type { AccessTokenVerifier } from "../../auth/http-auth.js";
import { AuthenticationError, AuthorizationError, type AuthenticatedUser } from "../../auth/verify-access-token.js";
import { EventNotFoundError, type OperatorEvent } from "./query-events-for-operator.js";
import type { OperatorEventQueryOperations } from "./operator-event-query-routes.js";
import { encodeEventCursor } from "./event-query-input.js";

const actor: AuthenticatedUser = {
  tenantId: "22222222-2222-4222-8222-222222222222",
  objectId: "11111111-1111-4111-8111-111111111111",
  subject: "test", roles: ["checkin_operator"],
};
const event: OperatorEvent = {
  id: "a3333333-3333-4333-8333-333333333333", name: "Test event",
  startsAt: new Date("2027-08-27T14:00:00Z"), endsAt: new Date("2027-08-27T22:00:00Z"),
  timezone: "America/Lima", location: "Lima", status: "draft",
};
const headers = { authorization: "Bearer test-token" };
const serialized = { ...event, startsAt: event.startsAt.toISOString(),
  endsAt: event.endsAt.toISOString() };

describe("operator event query HTTP routes", () => {
  let app: ReturnType<typeof buildApp>;
  let verify: ReturnType<typeof vi.fn<AccessTokenVerifier>>;
  let list: ReturnType<typeof vi.fn<OperatorEventQueryOperations["list"]>>;
  let get: ReturnType<typeof vi.fn<OperatorEventQueryOperations["get"]>>;
  beforeEach(() => {
    verify = vi.fn<AccessTokenVerifier>().mockResolvedValue(actor);
    list = vi.fn<OperatorEventQueryOperations["list"]>().mockResolvedValue({ items: [event], nextCursor: null });
    get = vi.fn<OperatorEventQueryOperations["get"]>().mockResolvedValue(event);
    app = buildApp({ verifyAccessToken: verify,
      createEvent: vi.fn().mockRejectedValue(new Error("Unexpected creation")),
      operatorEventQueries: { list, get } });
  });
  afterEach(async () => { await app.close(); vi.restoreAllMocks(); });

  it("returns a page with UTC dates and passes only the verified actor", async () => {
    const cursor = encodeEventCursor(event.id);
    list.mockResolvedValue({ items: [event], nextCursor: cursor });
    const response = await app.inject({ url: `/api/v1/operator/events?limit=2&cursor=${cursor}`, headers });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [serialized], nextCursor: cursor });
    expect(list).toHaveBeenCalledExactlyOnceWith({ limit: "2", cursor }, actor);
    expect(verify).toHaveBeenCalledExactlyOnceWith("test-token");
  });

  it("returns an empty page", async () => {
    list.mockResolvedValue({ items: [], nextCursor: null });
    const response = await app.inject({ url: "/api/v1/operator/events", headers });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [], nextCursor: null });
  });

  it("returns detail and normalizes the identifier", async () => {
    const response = await app.inject({ url: `/api/v1/operator/events/${event.id.toUpperCase()}`, headers });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(serialized);
    expect(get).toHaveBeenCalledExactlyOnceWith(event.id, actor);
  });

  it.each([
    "/api/v1/operator/events?limit=101", "/api/v1/operator/events?limit=2&limit=3",
    "/api/v1/operator/events?cursor=invalid", "/api/v1/operator/events?cursor=a&cursor=b",
    "/api/v1/operator/events?userId=someone", "/api/v1/operator/events?role=admin",
    "/api/v1/operator/events/invalid", `/api/v1/operator/events/${event.id}?userId=someone`,
  ])("rejects invalid input before persistence: %s", async (url) => {
    const response = await app.inject({ url, headers });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("INVALID_EVENT_QUERY");
    expect(list).not.toHaveBeenCalled(); expect(get).not.toHaveBeenCalled();
  });

  describe.each(["/api/v1/operator/events", `/api/v1/operator/events/${event.id}`])("%s", (url) => {
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
      { roles: [] }, { roles: ["admin"] }, { roles: ["organizer"] },
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
      expect(log).toHaveBeenCalledExactlyOnceWith({ code: "OPERATOR_EVENT_QUERY_FAILED" }, "No se pudieron consultar los eventos.");
    });
  });

  it("returns the same generic 404 for a missing or unauthorized event", async () => {
    get.mockRejectedValue(new EventNotFoundError());
    const response = await app.inject({ url: `/api/v1/operator/events/${event.id}`, headers });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ code: "EVENT_NOT_FOUND", message: "No se encontró el evento." });
  });
  it("checks authentication before query validation", async () => {
    expect((await app.inject({ url: "/api/v1/operator/events?limit=bad" })).statusCode).toBe(401);
    expect((await app.inject({ url: "/api/v1/operator/events/invalid" })).statusCode).toBe(401);
  });
  it.each(["/api/v1/operator/events", `/api/v1/operator/events/${event.id}`])("rejects request bodies on %s", async url => {
    const response = await app.inject({ method: "GET", url, headers: { ...headers, "content-type": "application/json" }, payload: { userId: "not-an-identity" } });
    expect(response.statusCode).toBe(400); expect(response.headers["cache-control"]).toBe("no-store");
    expect(list).not.toHaveBeenCalled(); expect(get).not.toHaveBeenCalled();
  });
  it.each(["/api/v1/operator/events", `/api/v1/operator/events/${event.id}`])("has no implicit HEAD handler for %s", async url => {
    expect((await app.inject({ method: "HEAD", url, headers })).statusCode).toBe(404);
    expect(list).not.toHaveBeenCalled(); expect(get).not.toHaveBeenCalled();
  });
  it("omits extra metadata even if an operation returns it", async () => {
    const extra = { ...event, slug: "private-slug", version: 99, createdAt: new Date(), staff: [{ userId: "private" }] };
    list.mockResolvedValue({ items: [extra], nextCursor: null }); get.mockResolvedValue(extra);
    expect((await app.inject({ url: "/api/v1/operator/events", headers })).json()).toEqual({ items: [serialized], nextCursor: null });
    expect((await app.inject({ url: `/api/v1/operator/events/${event.id}`, headers })).json()).toEqual(serialized);
  });

});
