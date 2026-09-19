import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { buildApp } from "../../app.js";
import type { AccessTokenVerifier } from "../../auth/http-auth.js";
import { AuthenticationError, AuthorizationError, type AuthenticatedUser } from "../../auth/verify-access-token.js";
import { EventSlugConflictError } from "./create-event.js";
import { EventNotEditableError, EventVersionConflictError } from "./edit-event-for-organizer.js";
import { EventNotFoundError, type QueriedEvent } from "./query-events-for-organizer.js";
import type { EditEventOperation } from "./event-edit-routes.js";

const actor: AuthenticatedUser = { tenantId: "22222222-2222-4222-8222-222222222222",
  objectId: "11111111-1111-4111-8111-111111111111", subject: "verified", roles: ["organizer"] };
const event: QueriedEvent = { id: "33333333-3333-4333-8333-333333333333", name: "Edited", slug: "edited",
  startsAt: new Date("2027-08-27T14:00:00Z"), endsAt: new Date("2027-08-27T22:00:00Z"),
  createdAt: new Date("2026-09-19T12:00:00Z"), location: "Lima", timezone: "America/Lima", status: "draft", version: 2 };
const url = `/api/v1/events/${event.id}`;
const headers = { authorization: "Bearer test-token" };
const payload = { expectedVersion: 1, name: "Edited" };

describe("PATCH event HTTP route", () => {
  let app: ReturnType<typeof buildApp>;
  let verify: ReturnType<typeof vi.fn<AccessTokenVerifier>>;
  let edit: ReturnType<typeof vi.fn<EditEventOperation>>;
  beforeEach(() => {
    verify = vi.fn<AccessTokenVerifier>().mockResolvedValue(actor);
    edit = vi.fn<EditEventOperation>().mockResolvedValue(event);
    app = buildApp({ verifyAccessToken: verify, editEvent: edit,
      createEvent: vi.fn().mockRejectedValue(new Error("Unexpected creation")) });
  });
  afterEach(async () => { await app.close(); vi.restoreAllMocks(); });

  it("returns updated data and version, passing only the verified actor", async () => {
    const response = await app.inject({ method: "PATCH", url, headers, payload });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ...event, startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(), createdAt: event.createdAt.toISOString() });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(edit).toHaveBeenCalledExactlyOnceWith(event.id, payload, actor);
  });

  it.each([{}, { name: "Edited" }, { expectedVersion: 1 }, { expectedVersion: "1", name: "Edited" },
    { ...payload, status: "active" }, { ...payload, userId: actor.objectId }, { ...payload, version: 2 },
    { ...payload, authenticatedUser: actor }, { ...payload, name: null }, { ...payload, name: " " }])(
    "rejects invalid body %j before executing the operation", async body => {
      const response = await app.inject({ method: "PATCH", url, headers, payload: body });
      expect(response.statusCode).toBe(400); expect(edit).not.toHaveBeenCalled();
    },
  );
  it.each(["/api/v1/events/invalid", `${url}?userId=other`, `${url}?expectedVersion=1`])(
    "rejects invalid path or query %s", async address => {
      expect((await app.inject({ method: "PATCH", url: address, headers, payload })).statusCode).toBe(400);
      expect(edit).not.toHaveBeenCalled();
    },
  );
  it("authenticates before processing an invalid body or path", async () => {
    const response = await app.inject({ method: "PATCH", url: "/api/v1/events/invalid", payload: {} });
    expect(response.statusCode).toBe(401); expect(response.headers["www-authenticate"]).toBe("Bearer");
    expect(verify).not.toHaveBeenCalled(); expect(edit).not.toHaveBeenCalled();
  });
  it.each<{ roles: AuthenticatedUser["roles"] }>([{ roles: [] }, { roles: ["admin"] }, { roles: ["checkin_operator"] }])(
    "denies roles $roles", async ({ roles }) => {
      verify.mockResolvedValue({ ...actor, roles });
      expect((await app.inject({ method: "PATCH", url, headers, payload })).statusCode).toBe(403);
      expect(edit).not.toHaveBeenCalled();
    },
  );
  it.each([
    { error: new AuthenticationError(), status: 401, code: "UNAUTHORIZED" },
    { error: new AuthorizationError(), status: 403, code: "FORBIDDEN" },
    { error: new ZodError([]), status: 400, code: "INVALID_EVENT_INPUT" },
    { error: new EventNotFoundError(), status: 404, code: "EVENT_NOT_FOUND" },
    { error: new EventSlugConflictError(), status: 409, code: "EVENT_SLUG_CONFLICT" },
    { error: new EventVersionConflictError(), status: 409, code: "EVENT_VERSION_CONFLICT" },
    { error: new EventNotEditableError(), status: 409, code: "EVENT_NOT_EDITABLE" },
  ])("maps $code to $status without logging internal details", async ({ error, status, code }) => {
    edit.mockRejectedValue(error); const log = vi.spyOn(app.log, "error");
    const response = await app.inject({ method: "PATCH", url, headers, payload });
    expect(response.statusCode).toBe(status); expect(response.json().code).toBe(code);
    expect(response.headers["cache-control"]).toBe("no-store"); expect(log).not.toHaveBeenCalled();
    if (status === 401) expect(response.headers["www-authenticate"]).toBe("Bearer");
  });
  it("hides unexpected operation errors in the response and log", async () => {
    edit.mockRejectedValue(new Error("private SQL and credentials"));
    const log = vi.spyOn(app.log, "error");
    const response = await app.inject({ method: "PATCH", url, headers, payload });
    expect(response.statusCode).toBe(500); expect(response.body).not.toContain("private");
    expect(log).toHaveBeenCalledExactlyOnceWith({ code: "EVENT_EDIT_FAILED" }, "No se pudo editar el evento.");
  });
  it("allows a PATCH preflight from the configured web origin", async () => {
    const response = await app.inject({ method: "OPTIONS", url, headers: {
      origin: "http://localhost:5173", "access-control-request-method": "PATCH",
      "access-control-request-headers": "authorization,content-type",
    } });
    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(response.headers["access-control-allow-methods"]).toContain("PATCH");
    expect(edit).not.toHaveBeenCalled();
  });
});
