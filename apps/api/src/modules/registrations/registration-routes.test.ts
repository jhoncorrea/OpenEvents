import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { buildApp } from "../../app.js";
import type { AccessTokenVerifier } from "../../auth/http-auth.js";
import { AuthenticationError, AuthorizationError, type AuthenticatedUser } from "../../auth/verify-access-token.js";
import { EventRegistrationNotAllowedError, RegistrationEmailConflictError } from "./register-attendee-for-organizer.js";
import { EventNotFoundError } from "../events/query-events-for-organizer.js";
import type { RegisterAttendeeOperation } from "./registration-routes.js";

const actor: AuthenticatedUser = { tenantId: "22222222-2222-4222-8222-222222222222",
  objectId: "11111111-1111-4111-8111-111111111111", subject: "verified", roles: ["organizer"] };
const event = { id: "33333333-3333-4333-8333-333333333333", eventId: "44444444-4444-4444-8444-444444444444",
 status: "confirmed" as const, source: "manual" as const, createdAt: new Date("2026-09-19T12:00:00Z"),
 attendee: { id: "55555555-5555-4555-8555-555555555555", fullName: "Ana", email: "ana@example.com" } };
const url = `/api/v1/events/${event.eventId}/registrations`;
const headers = { authorization: "Bearer test-token" };
const payload = { fullName: "Ana", email: "ana@example.com" };

describe("POST registration HTTP route", () => {
  let app: ReturnType<typeof buildApp>;
  let verify: ReturnType<typeof vi.fn<AccessTokenVerifier>>;
  let edit: ReturnType<typeof vi.fn<RegisterAttendeeOperation>>;
  beforeEach(() => {
    verify = vi.fn<AccessTokenVerifier>().mockResolvedValue(actor);
    edit = vi.fn<RegisterAttendeeOperation>().mockResolvedValue(event);
    app = buildApp({ verifyAccessToken: verify, registerAttendee: edit,
      createEvent: vi.fn().mockRejectedValue(new Error("Unexpected creation")) });
  });
  afterEach(async () => { await app.close(); vi.restoreAllMocks(); });

  it("returns the registration, passing only the verified actor", async () => {
    const response = await app.inject({ method: "POST", url, headers, payload });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ ...event, createdAt: event.createdAt.toISOString() });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(edit).toHaveBeenCalledExactlyOnceWith(event.eventId, payload, actor);
  });

  it.each([{}, { fullName: "Ana" }, { email: "ana@example.com" }, { ...payload, fullName: null },
    { ...payload, status: "confirmed" }, { ...payload, source: "manual" }, { ...payload, userId: actor.objectId },
    { ...payload, authenticatedUser: actor }, { ...payload, email: "invalid" }, { ...payload, fullName: " " } ])(
    "rejects invalid body %j before executing the operation", async body => {
      const response = await app.inject({ method: "POST", url, headers, payload: body });
      expect(response.statusCode).toBe(400); expect(edit).not.toHaveBeenCalled();
    },
  );
  it.each(["/api/v1/events/invalid/registrations", `${url}?userId=other`, `${url}?expectedVersion=1`])(
    "rejects invalid path or query %s", async address => {
      expect((await app.inject({ method: "POST", url: address, headers, payload })).statusCode).toBe(400);
      expect(edit).not.toHaveBeenCalled();
    },
  );
  it("authenticates before processing an invalid body or path", async () => {
    const response = await app.inject({ method: "POST", url: "/api/v1/events/invalid/registrations", payload: {} });
    expect(response.statusCode).toBe(401); expect(response.headers["www-authenticate"]).toBe("Bearer");
    expect(verify).not.toHaveBeenCalled(); expect(edit).not.toHaveBeenCalled();
  });
  it.each<{ roles: AuthenticatedUser["roles"] }>([{ roles: [] }, { roles: ["admin"] }, { roles: ["checkin_operator"] }])(
    "denies roles $roles", async ({ roles }) => {
      verify.mockResolvedValue({ ...actor, roles });
      expect((await app.inject({ method: "POST", url, headers, payload })).statusCode).toBe(403);
      expect(edit).not.toHaveBeenCalled();
    },
  );
  it.each([
    { error: new AuthenticationError(), status: 401, code: "UNAUTHORIZED" },
    { error: new AuthorizationError(), status: 403, code: "FORBIDDEN" },
    { error: new ZodError([]), status: 400, code: "INVALID_REGISTRATION_INPUT" },
    { error: new EventNotFoundError(), status: 404, code: "EVENT_NOT_FOUND" },
    { error: new RegistrationEmailConflictError(), status: 409, code: "REGISTRATION_EMAIL_CONFLICT" },
    { error: new EventRegistrationNotAllowedError(), status: 409, code: "EVENT_REGISTRATION_NOT_ALLOWED" },
  ])("maps $code to $status without logging internal details", async ({ error, status, code }) => {
    edit.mockRejectedValue(error); const log = vi.spyOn(app.log, "error");
    const response = await app.inject({ method: "POST", url, headers, payload });
    expect(response.statusCode).toBe(status); expect(response.json().code).toBe(code);
    expect(response.headers["cache-control"]).toBe("no-store"); expect(log).not.toHaveBeenCalled();
    if (status === 401) expect(response.headers["www-authenticate"]).toBe("Bearer");
  });
  it("hides unexpected operation errors in the response and log", async () => {
    edit.mockRejectedValue(new Error("private SQL and credentials"));
    const log = vi.spyOn(app.log, "error");
    const response = await app.inject({ method: "POST", url, headers, payload });
    expect(response.statusCode).toBe(500); expect(response.body).not.toContain("private");
    expect(log).toHaveBeenCalledExactlyOnceWith({ code: "REGISTRATION_FAILED" }, "No se pudo registrar al asistente.");
  });
  it("allows a POST preflight from the configured web origin", async () => {
    const response = await app.inject({ method: "OPTIONS", url, headers: {
      origin: "http://localhost:5173", "access-control-request-method": "POST",
      "access-control-request-headers": "authorization,content-type",
    } });
    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(response.headers["access-control-allow-methods"]).toContain("POST");
    expect(edit).not.toHaveBeenCalled();
  });
  it.each([
    { body: '{"email":"private@example.com",', contentType: "application/json", status: 400 },
    { body: "private@example.com".repeat(300), contentType: "application/json", status: 413 },
    { body: "private@example.com", contentType: "application/xml", status: 415 },
  ])("sanitizes parser failures with status $status", async ({ body, contentType, status }) => {
    const log = vi.spyOn(app.log, "error");
    const response = await app.inject({ method: "POST", url, headers: { ...headers, "content-type": contentType }, payload: body });
    expect(response.statusCode).toBe(status); expect(response.body).not.toContain("private");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(edit).not.toHaveBeenCalled(); expect(log).not.toHaveBeenCalled();
  });
  it("normalizes input and strips extra output fields", async () => {
    edit.mockResolvedValue({ ...event, secret: "private", attendee: { ...event.attendee, secret: "private" } } as typeof event);
    const response = await app.inject({ method: "POST", url, headers, payload: { fullName: " Ana ", email: " ANA@EXAMPLE.COM " } });
    expect(edit).toHaveBeenCalledExactlyOnceWith(event.eventId, payload, actor);
    expect(response.statusCode).toBe(201); expect(response.body).not.toContain("private");
  });

});
