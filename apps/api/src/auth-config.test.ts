import { describe, expect, it } from "vitest";
import { parseAuthConfig } from "./auth-config.js";

const validEnvironment = {
  ENTRA_TENANT_ID: "11111111-1111-4111-8111-111111111111",
  ENTRA_API_CLIENT_ID: "22222222-2222-4222-8222-222222222222",
  ENTRA_WEB_CLIENT_ID: "33333333-3333-4333-8333-333333333333",
  ENTRA_ISSUER: "https://identity.example.test/tenant/v2.0",
  ENTRA_JWKS_URI: "https://identity.example.test/tenant/keys",
};

describe("parseAuthConfig", () => {
  it("parses valid authentication configuration", () => {
    expect(parseAuthConfig(validEnvironment)).toEqual({
      tenantId: validEnvironment.ENTRA_TENANT_ID,
      audience: validEnvironment.ENTRA_API_CLIENT_ID,
      allowedClientId: validEnvironment.ENTRA_WEB_CLIENT_ID,
      issuer: validEnvironment.ENTRA_ISSUER,
      jwksUri: validEnvironment.ENTRA_JWKS_URI,
      requiredScope: "access_as_user",
    });
  });

  it("trims surrounding whitespace", () => {
    expect(
      parseAuthConfig({
        ...validEnvironment,
        ENTRA_ISSUER: ` ${validEnvironment.ENTRA_ISSUER} `,
      }).issuer,
    ).toBe(validEnvironment.ENTRA_ISSUER);
  });

  it.each(Object.keys(validEnvironment))(
    "rejects a missing variable: %s",
    (name) => {
      expect(() =>
        parseAuthConfig({
          ...validEnvironment,
          [name]: undefined,
        }),
      ).toThrow(name);
    },
  );

  it.each([
    "ENTRA_TENANT_ID",
    "ENTRA_API_CLIENT_ID",
    "ENTRA_WEB_CLIENT_ID",
  ])("rejects an invalid UUID: %s", (name) => {
    expect(() =>
      parseAuthConfig({
        ...validEnvironment,
        [name]: "not-a-uuid",
      }),
    ).toThrow(name);
  });

  describe.each(["ENTRA_ISSUER", "ENTRA_JWKS_URI"])("%s", (name) => {
    it.each([
      "",
      "not-a-url",
      "http://identity.example.test/keys",
      "https://user:password@identity.example.test/keys",
      "https://identity.example.test/keys?value=1",
      "https://identity.example.test/keys#fragment",
    ])("rejects an invalid URL: %s", (value) => {
      expect(() =>
        parseAuthConfig({
          ...validEnvironment,
          [name]: value,
        }),
      ).toThrow(name);
    });
  });

  it("does not include configuration values in errors", () => {
    const invalidValue = "https://user:private-value@example.test/keys";

    expect(() =>
      parseAuthConfig({
        ...validEnvironment,
        ENTRA_JWKS_URI: invalidValue,
      }),
    ).toThrow(
      "Invalid authentication configuration: check ENTRA_JWKS_URI.",
    );
  });
});