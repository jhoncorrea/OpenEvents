import { beforeAll, describe, expect, it } from "vitest";
import {
  generateKeyPair,
  SignJWT,
  type JWTPayload,
} from "jose";
import type { AuthConfig } from "../auth-config.js";
import {
  AuthenticationError,
  AuthorizationError,
  createAccessTokenVerifier,
  requireAnyRole,
  type AuthenticatedUser,
} from "./verify-access-token.js";

const config: AuthConfig = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  audience: "22222222-2222-4222-8222-222222222222",
  allowedClientId: "33333333-3333-4333-8333-333333333333",
  issuer: "https://identity.example.test/tenant/v2.0",
  jwksUri: "https://identity.example.test/tenant/keys",
  requiredScope: "access_as_user",
};

const objectId = "44444444-4444-4444-8444-444444444444";
const otherId = "55555555-5555-4555-8555-555555555555";

let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let verify: ReturnType<typeof createAccessTokenVerifier>;

function validClaims(): JWTPayload {
  const now = Math.floor(Date.now() / 1000);

  return {
    iss: config.issuer,
    aud: config.audience,
    sub: "test-subject",
    oid: objectId,
    tid: config.tenantId,
    azp: config.allowedClientId,
    ver: "2.0",
    iat: now,
    nbf: now - 10,
    exp: now + 300,
    scp: "access_as_user",
    roles: ["organizer"],
  };
}

function signClaims(claims: JWTPayload) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256" })
    .sign(keys.privateKey);
}

function tokenWith(overrides: JWTPayload = {}) {
  return signClaims({ ...validClaims(), ...overrides });
}

beforeAll(async () => {
  keys = await generateKeyPair("RS256");

  verify = createAccessTokenVerifier(
    config,
    async () => keys.publicKey,
  );
});

describe("verifyAccessToken", () => {
  it("accepts a valid delegated access token", async () => {
    const token = await tokenWith();

    await expect(verify(token)).resolves.toEqual({
      tenantId: config.tenantId,
      objectId,
      subject: "test-subject",
      roles: ["organizer"],
    });
  });

  it.each([
    ["issuer", { iss: "https://other.example.test/v2.0" }],
    ["audience", { aud: otherId }],
    ["tenant", { tid: otherId }],
    ["version", { ver: "1.0" }],
    ["user identifier", { oid: "not-a-uuid" }],
    ["roles format", { roles: "organizer" }],
  ] satisfies [string, JWTPayload][])(
    "rejects an invalid %s",
    async (_name, overrides) => {
      const token = await tokenWith(overrides);

      await expect(verify(token)).rejects.toBeInstanceOf(
        AuthenticationError,
      );
    },
  );

  it("rejects an expired token", async () => {
    const token = await tokenWith({
      exp: Math.floor(Date.now() / 1000) - 60,
    });

    await expect(verify(token)).rejects.toBeInstanceOf(
      AuthenticationError,
    );
  });

  it("rejects a token that is not valid yet", async () => {
    const token = await tokenWith({
      nbf: Math.floor(Date.now() / 1000) + 120,
    });

    await expect(verify(token)).rejects.toBeInstanceOf(
      AuthenticationError,
    );
  });

  it.each([
    "exp",
    "iat",
    "nbf",
    "sub",
    "oid",
    "tid",
    "azp",
    "ver",
  ])("rejects a missing required claim: %s", async (claim) => {
    const claims = validClaims();
    delete claims[claim];

    const token = await signClaims(claims);

    await expect(verify(token)).rejects.toBeInstanceOf(
      AuthenticationError,
    );
  });

  it("rejects a malformed token", async () => {
    await expect(verify("not-a-token")).rejects.toBeInstanceOf(
      AuthenticationError,
    );
  });

  it("rejects a token signed with another private key", async () => {
    const otherKeys = await generateKeyPair("RS256");

    const token = await new SignJWT(validClaims())
      .setProtectedHeader({ alg: "RS256" })
      .sign(otherKeys.privateKey);

    await expect(verify(token)).rejects.toBeInstanceOf(
      AuthenticationError,
    );
  });

  it("rejects payload changes made after signing", async () => {
    const token = await tokenWith();
    const [header, , signature] = token.split(".");

    const alteredPayload = Buffer.from(
      JSON.stringify({
        ...validClaims(),
        roles: ["admin"],
      }),
    ).toString("base64url");

    const alteredToken = `${header}.${alteredPayload}.${signature}`;

    await expect(verify(alteredToken)).rejects.toBeInstanceOf(
      AuthenticationError,
    );
  });

  it("rejects a different signing algorithm", async () => {
    const secret = new Uint8Array(32).fill(1);

    const token = await new SignJWT(validClaims())
      .setProtectedHeader({ alg: "HS256" })
      .sign(secret);

    await expect(verify(token)).rejects.toBeInstanceOf(
      AuthenticationError,
    );
  });

  it("rejects another client application", async () => {
    const token = await tokenWith({ azp: otherId });

    await expect(verify(token)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
  });

  it.each([
    undefined,
    "",
    "another_scope",
    "access_as_user_extra",
  ])("rejects insufficient scope: %s", async (scope) => {
    const token = await tokenWith({ scp: scope });

    await expect(verify(token)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
  });

  it("accepts the required scope among other scopes", async () => {
    const token = await tokenWith({
      scp: "another_scope access_as_user",
    });

    await expect(verify(token)).resolves.toMatchObject({
      objectId,
    });
  });

  it("ignores unknown roles and removes duplicates", async () => {
    const token = await tokenWith({
      roles: ["organizer", "unknown_role", "organizer"],
    });

    await expect(verify(token)).resolves.toMatchObject({
      roles: ["organizer"],
    });
  });

  it("returns no roles when none are assigned", async () => {
    const token = await tokenWith({ roles: undefined });

    await expect(verify(token)).resolves.toMatchObject({
      roles: [],
    });
  });

  it("propagates key-service failures without misclassifying them", async () => {
    const failure = new Error("Key service unavailable");

    const failingVerifier = createAccessTokenVerifier(
      config,
      async () => {
        throw failure;
      },
    );

    const token = await tokenWith();

    await expect(failingVerifier(token)).rejects.toBe(failure);
  });
});

describe("requireAnyRole", () => {
  const user: AuthenticatedUser = {
    tenantId: config.tenantId,
    objectId,
    subject: "test-subject",
    roles: ["organizer"],
  };

  it("allows an explicitly permitted role", () => {
    expect(() =>
      requireAnyRole(user, ["admin", "organizer"]),
    ).not.toThrow();
  });

  it("rejects a user without a permitted role", () => {
    expect(() =>
      requireAnyRole(user, ["checkin_operator"]),
    ).toThrow(AuthorizationError);
  });

  it("rejects a user without assigned roles", () => {
    expect(() =>
      requireAnyRole({ ...user, roles: [] }, ["organizer"]),
    ).toThrow(AuthorizationError);
  });

  it("denies access when no roles are allowed", () => {
    expect(() => requireAnyRole(user, [])).toThrow(
      AuthorizationError,
    );
  });

  it("does not grant admin an implicit role hierarchy", () => {
    expect(() =>
      requireAnyRole(
        { ...user, roles: ["admin"] },
        ["organizer"],
      ),
    ).toThrow(AuthorizationError);
  });
});