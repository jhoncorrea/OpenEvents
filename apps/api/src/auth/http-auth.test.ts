import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";
import {
  createAuthGuard,
  type AccessTokenVerifier,
} from "./http-auth.js";
import {
  AuthenticationError,
  AuthorizationError,
  type AppRole,
  type AuthenticatedUser,
} from "./verify-access-token.js";

const user: AuthenticatedUser = {
  tenantId: "69b045f1-1d6c-435a-a8b3-ab76dc15ded9",
  objectId: "11111111-1111-4111-8111-111111111111",
  subject: "test-subject",
  roles: ["organizer"],
};

const roleCases: {
  name: string;
  roles: AppRole[];
  allowedRoles: AppRole[];
  status: number;
}[] = [
  {
    name: "allows organizer when explicitly permitted",
    roles: ["organizer"],
    allowedRoles: ["organizer"],
    status: 200,
  },
  {
    name: "rejects a user without roles",
    roles: [],
    allowedRoles: ["organizer"],
    status: 403,
  },
  {
    name: "does not give admin implicit organizer access",
    roles: ["admin"],
    allowedRoles: ["organizer"],
    status: 403,
  },
  {
    name: "allows admin when explicitly permitted",
    roles: ["admin"],
    allowedRoles: ["organizer", "admin"],
    status: 200,
  },
  {
    name: "denies access when no roles are allowed",
    roles: ["organizer"],
    allowedRoles: [],
    status: 403,
  },
];

describe("HTTP authentication", () => {
  let app: ReturnType<typeof buildApp>;
  let verifyAccessToken: ReturnType<typeof vi.fn<AccessTokenVerifier>>;

  beforeEach(() => {
    verifyAccessToken = vi
      .fn<AccessTokenVerifier>()
      .mockResolvedValue(user);

    app = buildApp({ verifyAccessToken });
  });

  afterEach(async () => {
    await app.close();
  });

  it.each([
    undefined,
    "",
    "Basic credentials",
    "Bearer",
    "Bearer first second",
  ])("returns 401 for an invalid authorization header: %s", async (header) => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: header === undefined ? {} : { authorization: header },
    });

    expect(response.statusCode).toBe(401);
    expect(response.headers["www-authenticate"]).toBe("Bearer");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual({
      code: "UNAUTHORIZED",
      message: "Se requiere un token de acceso válido.",
    });
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it("returns 401 when the verifier rejects the token", async () => {
    verifyAccessToken.mockRejectedValue(new AuthenticationError());

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: "Bearer invalid-test-token" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.headers["www-authenticate"]).toBe("Bearer");
    expect(response.json().code).toBe("UNAUTHORIZED");
    expect(verifyAccessToken).toHaveBeenCalledExactlyOnceWith(
      "invalid-test-token",
    );
  });

  it("returns 403 when the verifier rejects permissions", async () => {
    verifyAccessToken.mockRejectedValue(new AuthorizationError());

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: "Bearer test-token" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      code: "FORBIDDEN",
      message: "No tienes los permisos necesarios para esta operación.",
    });
  });

  it.each(["Bearer", "bearer"])(
    "returns the authenticated identity with the %s scheme",
    async (scheme) => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/auth/me",
        headers: { authorization: `${scheme} test-token` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.json()).toEqual(user);
      expect(verifyAccessToken).toHaveBeenCalledExactlyOnceWith(
        "test-token",
      );
    },
  );

  it("allows an authenticated identity without assigned roles on me", async () => {
    verifyAccessToken.mockResolvedValue({ ...user, roles: [] });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: "Bearer test-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ...user, roles: [] });
  });

  it("returns 500 without exposing or logging the original error", async () => {
    const sensitiveValue = "private-test-token";
    const logError = vi.spyOn(app.log, "error");

    verifyAccessToken.mockRejectedValue(
      new Error(`Key service failed while processing ${sensitiveValue}`),
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: `Bearer ${sensitiveValue}` },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      code: "INTERNAL_SERVER_ERROR",
      message: "No se pudo completar la verificación de acceso.",
    });
    expect(response.body).not.toContain(sensitiveValue);
    expect(logError).toHaveBeenCalledExactlyOnceWith(
      { code: "AUTHENTICATION_SERVICE_ERROR" },
      "No se pudo completar la verificación de acceso.",
    );
  });

  it.each(roleCases)("$name", async ({ roles, allowedRoles, status }) => {
    verifyAccessToken.mockResolvedValue({ ...user, roles });

    const handler = vi.fn(async () => ({ ok: true }));

    // Esta ruta solo existe en esta prueba.
    app.get(
      "/test/roles",
      {
        onRequest: createAuthGuard(verifyAccessToken, allowedRoles),
      },
      handler,
    );

    const response = await app.inject({
      method: "GET",
      url: "/test/roles",
      headers: { authorization: "Bearer test-token" },
    });

    expect(response.statusCode).toBe(status);

    if (status === 200) {
      expect(response.json()).toEqual({ ok: true });
      expect(handler).toHaveBeenCalledTimes(1);
    } else {
      expect(response.json().code).toBe("FORBIDDEN");
      expect(handler).not.toHaveBeenCalled();
    }
  });
});