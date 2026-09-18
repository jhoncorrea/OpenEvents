import { describe, expect, it } from "vitest";
import { parseAuthConfig } from "./auth-config";

const validEnvironment = {
  VITE_ENTRA_CLIENT_ID: "11111111-1111-4111-8111-111111111111",
  VITE_ENTRA_TENANT_ID: "22222222-2222-4222-8222-222222222222",
  VITE_ENTRA_TENANT_SUBDOMAIN: "openeventstest",
  VITE_ENTRA_REDIRECT_URI: "http://localhost:5173/",
};

describe("parseAuthConfig", () => {
  it("builds the configuration for the external tenant", () => {
    expect(parseAuthConfig(validEnvironment)).toEqual({
      clientId: validEnvironment.VITE_ENTRA_CLIENT_ID,
      authority:
        "https://openeventstest.ciamlogin.com/" +
        validEnvironment.VITE_ENTRA_TENANT_ID,
      knownAuthorities: ["openeventstest.ciamlogin.com"],
      redirectUri: "http://localhost:5173/",
    });
  });

  it("trims values and normalizes the tenant subdomain", () => {
    expect(
      parseAuthConfig({
        VITE_ENTRA_CLIENT_ID:
          ` ${validEnvironment.VITE_ENTRA_CLIENT_ID} `,
        VITE_ENTRA_TENANT_ID:
          ` ${validEnvironment.VITE_ENTRA_TENANT_ID} `,
        VITE_ENTRA_TENANT_SUBDOMAIN: " OpenEventsTest ",
        VITE_ENTRA_REDIRECT_URI: " http://localhost:5173 ",
      }),
    ).toEqual({
      clientId: validEnvironment.VITE_ENTRA_CLIENT_ID,
      authority:
        "https://openeventstest.ciamlogin.com/" +
        validEnvironment.VITE_ENTRA_TENANT_ID,
      knownAuthorities: ["openeventstest.ciamlogin.com"],
      redirectUri: "http://localhost:5173/",
    });
  });

  it.each(Object.keys(validEnvironment))(
    "rejects a missing required variable: %s",
    (name) => {
      expect(() =>
        parseAuthConfig({
          ...validEnvironment,
          [name]: undefined,
        }),
      ).toThrow(`Missing authentication configuration: ${name}.`);
    },
  );

  it.each(Object.keys(validEnvironment))(
    "rejects a blank required variable: %s",
    (name) => {
      expect(() =>
        parseAuthConfig({
          ...validEnvironment,
          [name]: "   ",
        }),
      ).toThrow(`Missing authentication configuration: ${name}.`);
    },
  );

  it.each(["VITE_ENTRA_CLIENT_ID", "VITE_ENTRA_TENANT_ID"])(
    "rejects an invalid identifier: %s",
    (name) => {
      expect(() =>
        parseAuthConfig({
          ...validEnvironment,
          [name]: "not-a-uuid",
        }),
      ).toThrow(`Invalid ${name}`);
    },
  );

  it.each([
    "https://openeventstest",
    "openeventstest.ciamlogin.com",
    "tenant/path",
    "tenant name",
  ])("rejects an invalid tenant subdomain: %s", (subdomain) => {
    expect(() =>
      parseAuthConfig({
        ...validEnvironment,
        VITE_ENTRA_TENANT_SUBDOMAIN: subdomain,
      }),
    ).toThrow("Invalid VITE_ENTRA_TENANT_SUBDOMAIN");
  });

  it("accepts an HTTPS redirect", () => {
    const result = parseAuthConfig({
      ...validEnvironment,
      VITE_ENTRA_REDIRECT_URI:
        "https://app.example.com/auth/callback",
    });

    expect(result.redirectUri).toBe(
      "https://app.example.com/auth/callback",
    );
  });

  it.each([
    "not-a-url",
    "/auth/callback",
    "http://app.example.com/",
    "http://localhost.example.com/",
    "ftp://localhost/",
    "https://user:password@app.example.com/",
    "http://localhost:5173/?code=example",
    "http://localhost:5173/#fragment",
  ])("rejects an invalid redirect: %s", (redirectUri) => {
    expect(() =>
      parseAuthConfig({
        ...validEnvironment,
        VITE_ENTRA_REDIRECT_URI: redirectUri,
      }),
    ).toThrow("Invalid VITE_ENTRA_REDIRECT_URI");
  });
});