import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";
import type { AccessTokenVerifier } from "../../auth/http-auth.js";
import {
  AuthenticationError,
  AuthorizationError,
  type AppRole,
  type AuthenticatedUser,
} from "../../auth/verify-access-token.js";
import { EventSlugConflictError } from "./create-event.js";
import { parseCreateEventInput } from "./create-event-input.js";
import type { CreateEventOperation } from "./event-routes.js";

const organizer: AuthenticatedUser = {
  tenantId: "22222222-2222-4222-8222-222222222222",
  objectId: "11111111-1111-4111-8111-111111111111",
  subject: "test-organizer",
  roles: ["organizer"],
};

const validInput = {
  name: "Evento de prueba",
  slug: "evento-de-prueba",
  startsAt: "2027-08-27T14:00:00Z",
  endsAt: "2027-08-27T22:00:00Z",
  timezone: "America/Lima",
  location: "Lima",
};

const eventId = "33333333-3333-4333-8333-333333333333";
const createdAt = new Date("2026-09-18T18:00:00Z");

const deniedRoles: { name: string; roles: AppRole[] }[] = [
  { name: "without roles", roles: [] },
  { name: "admin only", roles: ["admin"] },
  { name: "check-in operator only", roles: ["checkin_operator"] },
];

const invalidBodies = [
  {
    name: "caller-supplied creator",
    body: { ...validInput, userId: organizer.objectId },
  },
  {
    name: "caller-supplied authenticated identity",
    body: { ...validInput, authenticatedUser: organizer },
  },
  {
    name: "empty event name",
    body: { ...validInput, name: " " },
  },
  {
    name: "invalid slug",
    body: { ...validInput, slug: "INVALID SLUG" },
  },
  {
    name: "end not later than start",
    body: { ...validInput, endsAt: validInput.startsAt },
  },
  {
    name: "caller-supplied status",
    body: { ...validInput, status: "active" },
  },
  {
    name: "caller-supplied id",
    body: { ...validInput, id: eventId },
  },
];

describe("POST /api/v1/events", () => {
  let app: ReturnType<typeof buildApp>;
  let verifyAccessToken: ReturnType<typeof vi.fn<AccessTokenVerifier>>;
  let createEvent: ReturnType<typeof vi.fn<CreateEventOperation>>;

  beforeEach(() => {
    verifyAccessToken = vi
      .fn<AccessTokenVerifier>()
      .mockResolvedValue(organizer);

    // Reutiliza la validación real, pero simula la persistencia.
    createEvent = vi.fn<CreateEventOperation>(async (input) => ({
      ...parseCreateEventInput(input),
      id: eventId,
      status: "draft", version: 1,
      createdAt,
    }));

    app = buildApp({
      verifyAccessToken,
      createEvent,
    });
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  it("returns 201 with a draft event and UTC date strings", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/events",
      headers: { authorization: "Bearer test-token" },
      payload: validInput,
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual({
      id: eventId,
      name: validInput.name,
      slug: validInput.slug,
      startsAt: "2027-08-27T14:00:00.000Z",
      endsAt: "2027-08-27T22:00:00.000Z",
      timezone: validInput.timezone,
      location: validInput.location,
      status: "draft", version: 1,
      createdAt: "2026-09-18T18:00:00.000Z",
    });
    expect(verifyAccessToken).toHaveBeenCalledExactlyOnceWith(
      "test-token",
    );
    expect(createEvent).toHaveBeenCalledExactlyOnceWith(validInput, organizer);
  });

  it.each(deniedRoles)(
    "returns 403 for a user $name without invoking creation",
    async ({ roles }) => {
      verifyAccessToken.mockResolvedValue({ ...organizer, roles });

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/events",
        headers: { authorization: "Bearer test-token" },
        payload: validInput,
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe("FORBIDDEN");
      expect(createEvent).not.toHaveBeenCalled();
    },
  );

  it.each([
    undefined,
    "Basic credentials",
    "Bearer",
    "Bearer first second",
  ])("returns 401 for an invalid authorization header: %s", async (header) => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/events",
      headers: header === undefined ? {} : { authorization: header },
      payload: validInput,
    });

    expect(response.statusCode).toBe(401);
    expect(response.headers["www-authenticate"]).toBe("Bearer");
    expect(verifyAccessToken).not.toHaveBeenCalled();
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("returns 401 when the verifier rejects the token", async () => {
    verifyAccessToken.mockRejectedValue(new AuthenticationError());

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/events",
      headers: { authorization: "Bearer test-token" },
      payload: validInput,
    });

    expect(response.statusCode).toBe(401);
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("returns 403 when the verifier rejects client or scope permissions", async () => {
    verifyAccessToken.mockRejectedValue(new AuthorizationError());

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/events",
      headers: { authorization: "Bearer test-token" },
      payload: validInput,
    });

    expect(response.statusCode).toBe(403);
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("does not invoke creation if authentication has an operational failure", async () => {
    verifyAccessToken.mockRejectedValue(
      new Error("Key service unavailable"),
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/events",
      headers: { authorization: "Bearer test-token" },
      payload: validInput,
    });

    expect(response.statusCode).toBe(500);
    expect(createEvent).not.toHaveBeenCalled();
    expect(response.body).not.toContain("Key service unavailable");
  });

  it.each(invalidBodies)(
    "returns 400 for $name",
    async ({ body }) => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/events",
        headers: { authorization: "Bearer test-token" },
        payload: body,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        code: "INVALID_EVENT_INPUT",
        message: "Los datos del evento no son válidos.",
      });
    },
  );

  it("returns 403 when the operation rejects a disabled local user", async () => {
    createEvent.mockRejectedValue(new AuthorizationError());
    const logError = vi.spyOn(app.log, "error");
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/events",
      headers: { authorization: "Bearer test-token" },
      payload: validInput,
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      code: "FORBIDDEN",
      message: "No tienes los permisos necesarios para esta operación.",
    });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(logError).not.toHaveBeenCalled();
  });

  it("returns 401 when the operation rejects the identity", async () => {
    createEvent.mockRejectedValue(new AuthenticationError());
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/events",
      headers: { authorization: "Bearer test-token" },
      payload: validInput,
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe("UNAUTHORIZED");
    expect(response.headers["www-authenticate"]).toBe("Bearer");
  });

  it("returns 409 for a duplicate slug", async () => {
    createEvent.mockRejectedValue(new EventSlugConflictError());

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/events",
      headers: { authorization: "Bearer test-token" },
      payload: validInput,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      code: "EVENT_SLUG_CONFLICT",
      message: "Ya existe un evento con ese slug.",
    });
  });

  it("returns 500 without exposing or logging the original persistence error", async () => {
    const sensitiveDetail = "private-database-details";
    const logError = vi.spyOn(app.log, "error");

    createEvent.mockRejectedValue(
      new Error(`Database failure: ${sensitiveDetail}`),
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/events",
      headers: { authorization: "Bearer test-token" },
      payload: validInput,
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      code: "INTERNAL_SERVER_ERROR",
      message: "No se pudo crear el evento. Inténtalo más tarde.",
    });
    expect(response.body).not.toContain(sensitiveDetail);
    expect(logError).toHaveBeenCalledExactlyOnceWith(
      { code: "EVENT_CREATION_FAILED" },
      "No se pudo crear el evento.",
    );
  });

  it("rejects malformed JSON without invoking creation", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/events",
      headers: {
        authorization: "Bearer test-token",
        "content-type": "application/json",
      },
      payload: '{"name":',
    });

    expect(response.statusCode).toBe(400);
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("checks authentication before parsing the request body", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/events",
      headers: { "content-type": "application/json" },
      payload: '{"name":',
    });

    expect(response.statusCode).toBe(401);
    expect(verifyAccessToken).not.toHaveBeenCalled();
    expect(createEvent).not.toHaveBeenCalled();
  });
});