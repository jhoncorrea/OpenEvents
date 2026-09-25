import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";
import type { AccessTokenVerifier } from "../../auth/http-auth.js";
import { AuthenticationError, AuthorizationError, type AuthenticatedUser } from "../../auth/verify-access-token.js";
import { EventNotFoundError } from "../events/query-events-for-organizer.js";
import { RegistrationNotFoundError, type QueriedRegistration } from "./query-registrations-for-organizer.js";
import type { RegistrationQueryOperations } from "./registration-query-routes.js";
import { encodeRegistrationCursor } from "./registration-query-input.js";

const actor: AuthenticatedUser = { tenantId: "a2222222-2222-4222-8222-222222222222",
  objectId: "b1111111-1111-4111-8111-111111111111", subject: "test", roles: ["organizer"] };
const registration: QueriedRegistration = { id: "b4444444-4444-4444-8444-444444444444",
  eventId: "a3333333-3333-4333-8333-333333333333", status: "confirmed", source: "manual",
  createdAt: new Date("2026-09-20T12:00:00Z"), checkedInAt: null,
  attendee: { id: "c5555555-5555-4555-8555-555555555555", fullName: "Test attendee", email: "test@example.com" } };
const headers = { authorization: "Bearer test-token" };
const base = `/api/v1/events/${registration.eventId}/registrations`;
const detail = `${base}/${registration.id}`;
const serialized = { ...registration, createdAt: registration.createdAt.toISOString() };

describe("registration query HTTP routes", () => {
  let app: ReturnType<typeof buildApp>;
  let verify: ReturnType<typeof vi.fn<AccessTokenVerifier>>;
  let list: ReturnType<typeof vi.fn<RegistrationQueryOperations["list"]>>;
  let get: ReturnType<typeof vi.fn<RegistrationQueryOperations["get"]>>;
  beforeEach(() => {
    verify = vi.fn<AccessTokenVerifier>().mockResolvedValue(actor);
    list = vi.fn<RegistrationQueryOperations["list"]>().mockResolvedValue({ items: [registration], nextCursor: null });
    get = vi.fn<RegistrationQueryOperations["get"]>().mockResolvedValue(registration);
    app = buildApp({ verifyAccessToken: verify, createEvent: vi.fn(), registrationQueries: { list, get } });
  });
  afterEach(async () => { await app.close(); vi.restoreAllMocks(); });
  it.each(["confirmed", "cancelled"] as const)("serializes persisted attendance for %s without internal fields", async status => {
    const checkedInAt = new Date("2026-09-25T19:52:00.000Z");
    const value = { ...registration, status, checkedInAt, performedBy: "private-operator" };
    list.mockResolvedValue({ items: [value], nextCursor: null }); get.mockResolvedValue(value);
    for (const url of [base, detail]) {
      const response = await app.inject({ url, headers });
      expect(response.statusCode).toBe(200);
      const item = url === base ? response.json().items[0] : response.json();
      expect(item.checkedInAt).toBe(checkedInAt.toISOString()); expect(item.status).toBe(status);
      expect(response.body).not.toContain("private-operator");
    }
  });

  it("returns a page and passes only the verified actor, normalized event and validated query", async () => {
    const cursor = encodeRegistrationCursor(registration.eventId, registration.id);
    list.mockResolvedValue({ items: [registration], nextCursor: cursor });
    const response = await app.inject({ url: `/api/v1/events/${registration.eventId.toUpperCase()}/registrations?limit=2&cursor=${cursor}`, headers });
    expect(response.statusCode).toBe(200); expect(response.json()).toEqual({ items: [serialized], nextCursor: cursor });
    expect(list).toHaveBeenCalledExactlyOnceWith(registration.eventId, { limit: "2", cursor }, actor);
    expect(verify).toHaveBeenCalledExactlyOnceWith("test-token");
  });
  it("returns an empty list", async () => {
    list.mockResolvedValue({ items: [], nextCursor: null });
    const response = await app.inject({ url: base, headers });
    expect(response.statusCode).toBe(200); expect(response.json()).toEqual({ items: [], nextCursor: null });
  });
  it("normalizes both route IDs for detail", async () => {
    const response = await app.inject({ url: `/api/v1/events/${registration.eventId.toUpperCase()}/registrations/${registration.id.toUpperCase()}`, headers });
    expect(response.statusCode).toBe(200); expect(response.json()).toEqual(serialized);
    expect(get).toHaveBeenCalledExactlyOnceWith(registration.eventId, registration.id, actor);
  });
  it("serializes cancelled registrations without inventing manual source", async () => {
    get.mockResolvedValue({ ...registration, status: "cancelled", source: "import" });
    expect((await app.inject({ url: detail, headers })).json()).toEqual({ ...serialized, status: "cancelled", source: "import" });
  });
  it.each([base, detail])("strips internal and extra fields from %s", async url => {
    const extended = { ...registration, emailNormalized: "private", tokenHash: "secret", attendee: { ...registration.attendee, internal: "private" } };
    list.mockResolvedValue({ items: [extended], nextCursor: null }); get.mockResolvedValue(extended);
    const response = await app.inject({ url, headers });
    expect(response.json()).toEqual(url === base ? { items: [serialized], nextCursor: null } : serialized);
  });
  it.each([
    `${base}?limit=101`, `${base}?limit=2&limit=3`, `${base}?cursor=bad`, `${base}?cursor=a&cursor=b`,
    `${base}?userId=someone`, `${base}?role=admin`, `${base}?email=someone@example.com`, `${base}?offset=2`,
    "/api/v1/events/invalid/registrations", `${base}/invalid`, `${detail}?limit=1`,
    `${base}?cursor=${encodeRegistrationCursor("d6666666-6666-4666-8666-666666666666", registration.id)}`,
  ])("rejects invalid input before persistence: %s", async url => {
    const response = await app.inject({ url, headers });
    expect(response.statusCode).toBe(400); expect(response.json().code).toBe("INVALID_REGISTRATION_QUERY");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(list).not.toHaveBeenCalled(); expect(get).not.toHaveBeenCalled();
  });
  describe.each([base, detail])("%s", url => {
    it("disables caching", async () => {
      expect((await app.inject({ url, headers })).headers["cache-control"]).toBe("no-store");
    });
    it.each([undefined, "Basic test", "Bearer", "Bearer a b"])("rejects invalid authorization %s", async authorization => {
      const response = await app.inject({ url, headers: authorization ? { authorization } : {} });
      expect(response.statusCode).toBe(401); expect(response.headers["www-authenticate"]).toBe("Bearer");
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(verify).not.toHaveBeenCalled(); expect(list).not.toHaveBeenCalled(); expect(get).not.toHaveBeenCalled();
    });
    it.each(([[], ["admin"], ["checkin_operator"]] as AuthenticatedUser["roles"][]).map(roles => ({ roles })))("denies roles %j", async ({ roles }) => {
      verify.mockResolvedValue({ ...actor, roles });
      expect((await app.inject({ url, headers })).statusCode).toBe(403);
      expect(list).not.toHaveBeenCalled(); expect(get).not.toHaveBeenCalled();
    });
    it("maps rejected tokens to 401", async () => {
      verify.mockRejectedValue(new AuthenticationError());
      expect((await app.inject({ url, headers })).statusCode).toBe(401);
      expect(list).not.toHaveBeenCalled(); expect(get).not.toHaveBeenCalled();
    });
    it("maps scope rejection to 403", async () => {
      verify.mockRejectedValue(new AuthorizationError());
      expect((await app.inject({ url, headers })).statusCode).toBe(403);
    });
    it("hides unexpected verifier errors", async () => {
      verify.mockRejectedValue(new Error("private-verifier-details"));
      const response = await app.inject({ url, headers });
      expect(response.statusCode).toBe(500); expect(response.body).not.toContain("private-verifier-details");
    });
    it("maps disabled users to 403 without logging sensitive errors", async () => {
      list.mockRejectedValue(new AuthorizationError()); get.mockRejectedValue(new AuthorizationError());
      const log = vi.spyOn(app.log, "error"); const response = await app.inject({ url, headers });
      expect(response.statusCode).toBe(403); expect(log).not.toHaveBeenCalled();
    });
    it("maps invalid identity to 401", async () => {
      list.mockRejectedValue(new AuthenticationError()); get.mockRejectedValue(new AuthenticationError());
      const response = await app.inject({ url, headers });
      expect(response.statusCode).toBe(401); expect(response.headers["www-authenticate"]).toBe("Bearer");
    });
    it("maps unavailable events to a generic 404", async () => {
      list.mockRejectedValue(new EventNotFoundError()); get.mockRejectedValue(new EventNotFoundError());
      const response = await app.inject({ url, headers });
      expect(response.statusCode).toBe(404); expect(response.json()).toEqual({ code: "EVENT_NOT_FOUND", message: "No se encontró el evento." });
    });
    it("does not expose or log SQL or personal data", async () => {
      const error = new Error("SQL private@example.com"); list.mockRejectedValue(error); get.mockRejectedValue(error);
      const log = vi.spyOn(app.log, "error"); const response = await app.inject({ url, headers });
      expect(response.statusCode).toBe(500); expect(response.body).not.toContain("private@example.com");
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(log).toHaveBeenCalledExactlyOnceWith({ code: "REGISTRATION_QUERY_FAILED" }, "No se pudieron consultar las inscripciones.");
    });
  });
  it("returns a generic 404 for missing or foreign registration", async () => {
    get.mockRejectedValue(new RegistrationNotFoundError());
    const response = await app.inject({ url: detail, headers });
    expect(response.statusCode).toBe(404); expect(response.json()).toEqual({ code: "REGISTRATION_NOT_FOUND", message: "No se encontró la inscripción." });
  });
  it("checks authentication before malformed query or route IDs", async () => {
    for (const url of [`${base}?limit=bad`, "/api/v1/events/invalid/registrations", `${base}/invalid`]) {
      expect((await app.inject({ url })).statusCode).toBe(401);
    }
    expect(list).not.toHaveBeenCalled(); expect(get).not.toHaveBeenCalled();
  });
});
