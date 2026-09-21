import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";
import { AuthenticationError, AuthorizationError, type AuthenticatedUser } from "../../auth/verify-access-token.js";
import { EventNotFoundError } from "../events/query-events-for-organizer.js";
import type { RegistrationSearchOperation } from "./registration-search-routes.js";
const id = "a3333333-3333-4333-8333-333333333333";
const actor: AuthenticatedUser = { tenantId: id, objectId: id, subject: "verified", roles: ["organizer"] };
const url = `/api/v1/events/${id}/registrations/search`;
const headers = { authorization: "Bearer sensitive-token" };
const item = { id, eventId: id, status: "confirmed" as const, source: "manual", createdAt: new Date("2026-09-21T14:00:00Z"),
  attendee: { id, fullName: "Private Name", email: "private@example.com" } };
describe("registration search HTTP", () => {
  let app: ReturnType<typeof buildApp>; let search: ReturnType<typeof vi.fn<RegistrationSearchOperation>>; let verify: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    search = vi.fn<RegistrationSearchOperation>().mockResolvedValue({ items: [item], nextCursor: null });
    verify = vi.fn().mockResolvedValue(actor);
    app = buildApp({ verifyAccessToken: verify, createEvent: vi.fn(), registrationSearch: search,
      registrationQueries: { list: vi.fn(), get: vi.fn() } });
  });
  afterEach(async () => { await app.close(); vi.restoreAllMocks(); });
  it.each(["organizer", "checkin_operator"])("accepts %s, forwards verified actor and serializes UTC", async role => {
    const user = { ...actor, roles: [role] }; verify.mockResolvedValue(user);
    const r = await app.inject({ url: url.replace(id, id.toUpperCase()) + "?q=Private&limit=1", headers });
    expect(r.statusCode).toBe(200); expect(r.headers["cache-control"]).toBe("no-store");
    expect(search).toHaveBeenCalledExactlyOnceWith(id, { q: "Private", limit: "1" }, user);
    expect(r.json()).toEqual({ items: [JSON.parse(JSON.stringify(item))], nextCursor: null });
  });
  it("projects fields and handles empty matches", async () => {
    search.mockResolvedValueOnce({ items: [{ ...item, ...{ secret: "hidden" }, attendee: { ...item.attendee, ...{ secret: "hidden" } } }], nextCursor: "next" });
    const r = await app.inject({ url: url + "?q=Private", headers });
    expect(r.body).not.toContain("hidden"); expect(r.json().nextCursor).toBe("next");
    search.mockResolvedValue({ items: [], nextCursor: null });
    expect((await app.inject({ url: url + "?q=absent", headers })).json()).toEqual({ items: [], nextCursor: null });
  });
  it.each(["", "?q=", "?q=+", "?q=x&limit=101", "?q=x&limit=1&limit=2", "?q=x&q=y",
    "?q=x&cursor=x&cursor=y", "?q=x&actor=admin", "?q=x&cursor=bad", "?q=x%00",
    "?q=" + "a".repeat(101)])("rejects invalid query %s", async suffix => {
    const r = await app.inject({ url: url + suffix, headers });
    expect(r.statusCode).toBe(400); expect(r.headers["cache-control"]).toBe("no-store"); expect(search).not.toHaveBeenCalled();
  });
  it("validates UUID and authenticates before invalid query", async () => {
    const r = await app.inject({ url: url.replace(id, "invalid") + "?q=x", headers });
    expect(r.statusCode).toBe(400);
    const anonymous = await app.inject({ url: url + "?q=" });
    expect(anonymous.statusCode).toBe(401); expect(anonymous.headers["www-authenticate"]).toBe("Bearer");
    expect(search).not.toHaveBeenCalled();
  });
  it.each([{ roles: [] }, { roles: ["admin"] }])("rejects roles $roles", async ({ roles }) => {
    verify.mockResolvedValue({ ...actor, roles });
    expect((await app.inject({ url: url + "?q=x", headers })).statusCode).toBe(403); expect(search).not.toHaveBeenCalled();
  });
  it.each([{ error: new AuthenticationError(), status: 401 }, { error: new AuthorizationError(), status: 403 },
    { error: new EventNotFoundError(), status: 404 }, { error: new Error("private SQL term"), status: 500 }])("maps service failure $status safely", async ({ error, status }) => {
    search.mockRejectedValue(error);
    const r = await app.inject({ url: url + "?q=x", headers });
    expect(r.statusCode).toBe(status); expect(r.headers["cache-control"]).toBe("no-store"); expect(r.body).not.toContain("private SQL");
  });
  it.each([{ error: new AuthenticationError(), status: 401 }, { error: new Error("private token"), status: 500 }])("maps verifier failure $status", async ({ error, status }) => {
    verify.mockRejectedValue(error);
    const r = await app.inject({ url: url + "?q=x", headers });
    expect(r.statusCode).toBe(status); expect(r.headers["cache-control"]).toBe("no-store"); expect(search).not.toHaveBeenCalled();
  });
  it("does not grant operators the existing list or detail", async () => {
    verify.mockResolvedValue({ ...actor, roles: ["checkin_operator"] });
    for (const path of [`/api/v1/events/${id}/registrations`, `/api/v1/events/${id}/registrations/${id}`]) {
      expect((await app.inject({ url: path, headers })).statusCode).toBe(403);
    }
  });
  it("rejects GET body", async () => {
    const r = await app.inject({ url: url + "?q=x", headers: { ...headers, "content-length": "3" }, payload: "abc" });
    expect(r.statusCode).toBe(400); expect(search).not.toHaveBeenCalled();
  });
  it("allows CORS preflight", async () => {
    const r = await app.inject({ method: "OPTIONS", url, headers: { origin: "http://localhost:5173",
      "access-control-request-method": "GET", "access-control-request-headers": "authorization" } });
    expect(r.statusCode).toBe(204);
  });
  it("does not log query, cursor, token, result or original exception with real logging enabled", async () => {
    await app.close();
    const chunks: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { chunks.push(String(chunk)); return true; });
    app = buildApp({ logger: true, verifyAccessToken: verify, createEvent: vi.fn(), registrationSearch: search });
    await app.inject({ url: url + "?q=private%40example.com", headers });
    search.mockRejectedValue(new Error("secret exception"));
    await app.inject({ url: url + "?q=private%40example.com", headers });
    await app.inject({ url: url + "?q=private%40example.com&cursor=secret-cursor", headers });
    await app.inject({ url: url + "?q=private%40example.com" });
    await app.close();
    const logs = chunks.join("");
    expect(logs).toContain("REGISTRATION_SEARCH_FAILED");
    for (const secret of ["private", "Private Name", "sensitive-token", "secret-cursor", "secret exception"]) expect(logs).not.toContain(secret);
  });
});
