import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";
import { AuthenticationError, AuthorizationError, type AuthenticatedUser } from "../../auth/verify-access-token.js";
import { EventNotFoundError } from "./query-events-for-organizer.js";
import { EventLifecycleFailedError, EventTransitionNotAllowedError, EventLifecycleVersionConflictError } from "./change-event-state-for-organizer.js";
import type { EventLifecycleOperation } from "./event-lifecycle-routes.js";
const eventId = "a3333333-3333-4333-8333-333333333333";
const actor: AuthenticatedUser = { tenantId: eventId, objectId: eventId, subject: "verified", roles: ["organizer"] };
const headers = { authorization: "Bearer sensitive-bearer", "content-type": "application/json" };
const payload = { expectedVersion: 1 };
const saved = { id: eventId, name: "Evento", slug: "evento", location: "Lima", timezone: "America/Lima",
  startsAt: new Date("2027-08-27T09:00:00-05:00"), endsAt: new Date("2027-08-27T17:00:00-05:00"),
  createdAt: new Date("2026-09-24T10:00:00-05:00"), status: "active" as const, version: 2 };
describe.each(["activate", "close"] as const)("event lifecycle HTTP %s", action => {
  const url = `/api/v1/events/${eventId}/${action}`;
  let app: ReturnType<typeof buildApp>; let operation: ReturnType<typeof vi.fn<EventLifecycleOperation>>; let verify: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    operation = vi.fn<EventLifecycleOperation>().mockResolvedValue({ ...saved, status: action === "activate" ? "active" : "closed" });
    verify = vi.fn().mockResolvedValue(actor);
    app = buildApp({ verifyAccessToken: verify, createEvent: vi.fn(), eventLifecycle: { activate: action === "activate" ? operation : vi.fn(), close: action === "close" ? operation : vi.fn() } });
  });
  afterEach(async () => { await app.close(); vi.restoreAllMocks(); });
  it("projects the updated event and normalizes UUID and dates", async () => {
    const status = action === "activate" ? "active" : "closed";
    operation.mockResolvedValue({ ...saved, status, ...{ privateField: "private-person" } });
    const r = await app.inject({ method: "POST", url: url.replace(eventId, eventId.toUpperCase()), headers, payload });
    expect(r.statusCode).toBe(200); expect(r.headers["cache-control"]).toBe("no-store");
    expect(r.json()).toEqual({ ...saved, status, startsAt: "2027-08-27T14:00:00.000Z", endsAt: "2027-08-27T22:00:00.000Z", createdAt: "2026-09-24T15:00:00.000Z" });
    expect(operation).toHaveBeenCalledExactlyOnceWith(eventId, payload, actor);
    expect(verify).toHaveBeenCalledExactlyOnceWith("sensitive-bearer");
  });
  it.each([1, 2147483646])("accepts version boundary %s", async expectedVersion => {
    expect((await app.inject({ method: "POST", url, headers, payload: { expectedVersion } })).statusCode).toBe(200);
    expect(operation).toHaveBeenCalledExactlyOnceWith(eventId, { expectedVersion }, actor);
  });
  it.each(["", "Basic secret", "Bearer", "Bearer a b"])("authenticates before malformed/oversized body: %#", async authorization => {
    const r = await app.inject({ method: "POST", url, headers: { ...headers, authorization }, payload: "x".repeat(2048) });
    expect(r.statusCode).toBe(401); expect(r.headers["www-authenticate"]).toBe("Bearer"); expect(r.headers["cache-control"]).toBe("no-store");
    expect(operation).not.toHaveBeenCalled(); expect(verify).not.toHaveBeenCalled();
  });
  it.each([{ roles: [] }, { roles: ["checkin_operator"] }, { roles: ["admin"] }])("denies incompatible roles %# before parser", async ({ roles }) => {
    verify.mockResolvedValue({ ...actor, roles });
    const r = await app.inject({ method: "POST", url, headers, payload: "{" });
    expect(r.statusCode).toBe(403); expect(r.headers["cache-control"]).toBe("no-store"); expect(operation).not.toHaveBeenCalled();
  });
  it("accepts multiple roles while forwarding the verified actor", async () => {
    const both = { ...actor, roles: ["organizer", "checkin_operator", "admin"] }; verify.mockResolvedValue(both);
    expect((await app.inject({ method: "POST", url, headers, payload })).statusCode).toBe(200);
    expect(operation.mock.calls[0][2]).toBe(both);
  });
  it.each([{}, [], { expectedVersion: "1" }, { expectedVersion: null }, { expectedVersion: 0 }, { expectedVersion: -1 }, { expectedVersion: 1.5 }, { expectedVersion: 2147483647 }, { ...payload, actor: "forged" }, { ...payload, status: "active" }, { ...payload, createdAt: "forged" }])("rejects invalid body %#", async body => {
    const r = await app.inject({ method: "POST", url, headers, payload: body });
    expect(r.statusCode).toBe(400); expect(r.json().code).toBe("INVALID_EVENT_LIFECYCLE_INPUT"); expect(r.headers["cache-control"]).toBe("no-store"); expect(operation).not.toHaveBeenCalled();
  });
  it.each(["{", "null", "", '"private-body"'])("rejects JSON parser or shape %# safely", async body => {
    const r = await app.inject({ method: "POST", url, headers, payload: body });
    expect(r.statusCode).toBe(400); expect(r.headers["cache-control"]).toBe("no-store"); expect(r.body).not.toContain("private-body"); expect(operation).not.toHaveBeenCalled();
  });
  it.each(["application/json", "application/json; charset=utf-8", 'application/json; charset="UTF-8"'])("accepts content type %s", async type => {
    expect((await app.inject({ method: "POST", url, headers: { ...headers, "content-type": type }, payload })).statusCode).toBe(200);
  });
  it.each(["text/plain", "application/octet-stream", "application/problem+json", "application/json; charset=latin1", "application/json; extra=value"])("rejects content type %s", async type => {
    const r = await app.inject({ method: "POST", url, headers: { ...headers, "content-type": type }, payload: JSON.stringify(payload) });
    expect(r.statusCode).toBe(415); expect(r.headers["cache-control"]).toBe("no-store"); expect(operation).not.toHaveBeenCalled();
  });
  it("rejects absent content type", async () => {
    const r = await app.inject({ method: "POST", url, headers: { authorization: headers.authorization }, payload: JSON.stringify(payload) });
    expect(r.statusCode).toBe(415); expect(r.headers["cache-control"]).toBe("no-store"); expect(operation).not.toHaveBeenCalled();
  });
  it("rejects bodies beyond 1 KiB", async () => {
    const r = await app.inject({ method: "POST", url, headers, payload: { ...payload, code: "s".repeat(1100) } });
    expect(r.statusCode).toBe(413); expect(r.headers["cache-control"]).toBe("no-store"); expect(operation).not.toHaveBeenCalled();
  });
  it.each(["?code=private-query", "?x=1&x=2", "?actor=forged"])("rejects query %s", async query => {
    const r = await app.inject({ method: "POST", url: url + query, headers, payload });
    expect(r.statusCode).toBe(400); expect(r.headers["cache-control"]).toBe("no-store"); expect(operation).not.toHaveBeenCalled();
  });
  it("rejects a malformed event UUID", async () => {
    const r = await app.inject({ method: "POST", url: url.replace(eventId, "bad"), headers, payload });
    expect(r.statusCode).toBe(400); expect(operation).not.toHaveBeenCalled();
  });
  it.each([
    { error: new AuthenticationError(), status: 401 }, { error: new AuthorizationError(), status: 403 },
    { error: new EventNotFoundError(), status: 404 }, { error: new EventTransitionNotAllowedError(), status: 409 },
    { error: new EventLifecycleVersionConflictError(), status: 409 },
    { error: new EventLifecycleFailedError(), status: 500 }, { error: Object.assign(new Error("private SQL"), { statusCode: 404 }), status: 500 },
  ])("maps operation error to $status without details", async ({ error, status }) => {
    operation.mockRejectedValue(error); const r = await app.inject({ method: "POST", url, headers, payload });
    expect(r.statusCode).toBe(status); expect(r.headers["cache-control"]).toBe("no-store"); expect(r.json()).toHaveProperty("code"); expect(r.body).not.toContain("private");
    if (status === 401) expect(r.headers["www-authenticate"]).toBe("Bearer");
    if (error instanceof EventTransitionNotAllowedError) expect(r.json().code).toBe("EVENT_TRANSITION_NOT_ALLOWED");
    if (error instanceof EventLifecycleVersionConflictError) expect(r.json().code).toBe("EVENT_VERSION_CONFLICT");
  });
  it.each([{ error: new AuthenticationError(), status: 401 }, { error: new AuthorizationError(), status: 403 }, { error: new Error("verifier-secret"), status: 500 }])("maps verifier error $status", async ({ error, status }) => {
    verify.mockRejectedValue(error); const r = await app.inject({ method: "POST", url, headers, payload });
    expect(r.statusCode).toBe(status); expect(r.headers["cache-control"]).toBe("no-store"); expect(operation).not.toHaveBeenCalled(); expect(r.body).not.toContain("verifier-secret");
  });
  it.each(["GET", "HEAD", "PUT", "PATCH", "DELETE"] as const)("does not register an ingress on %s", async method => {
    expect((await app.inject({ method, url, headers: { authorization: headers.authorization } })).statusCode).toBe(404); expect(operation).not.toHaveBeenCalled();
  });
  it("supports CORS preflight without operation", async () => {
    const r = await app.inject({ method: "OPTIONS", url, headers: { origin: "http://localhost:5173", "access-control-request-method": "POST", "access-control-request-headers": "authorization,content-type" } });
    expect(r.statusCode).toBe(204); expect(operation).not.toHaveBeenCalled();
  });
  it("does not log code, actor, bearer, URL or raw failures", async () => {
    await app.close(); const chunks: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation(chunk => { chunks.push(String(chunk)); return true; });
    app = buildApp({ logger: true, verifyAccessToken: verify, createEvent: vi.fn(), eventLifecycle: { activate: action === "activate" ? operation : vi.fn(), close: action === "close" ? operation : vi.fn() } });
    await app.inject({ method: "POST", url, headers, payload });
    await app.inject({ method: "POST", url: url + "?code=private-query", headers, payload });
    await app.inject({ method: "POST", url, headers, payload: '{"private-body":' });
    operation.mockRejectedValue(new Error("original-secret")); await app.inject({ method: "POST", url, headers, payload });
    verify.mockRejectedValue(new Error("verifier-secret")); await app.inject({ method: "POST", url, headers, payload });
    await app.close(); const logs = chunks.join("");
    expect(logs).toContain("EVENT_LIFECYCLE_FAILED"); expect(logs).toContain("AUTHENTICATION_SERVICE_ERROR");
    for (const secret of ["sensitive-bearer", "private-", "original-secret", "verifier-secret", url]) expect(logs).not.toContain(secret);
  });
});
