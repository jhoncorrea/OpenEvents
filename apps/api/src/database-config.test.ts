import { describe, expect, it } from "vitest";
import { parseDatabaseConfig } from "./config.js";

describe("parseDatabaseConfig", () => {
  it.each([undefined, "", "   "])(
    "rejects a missing or empty DATABASE_URL: %s",
    (databaseUrl) => {
      expect(() =>
        parseDatabaseConfig({ DATABASE_URL: databaseUrl }),
      ).toThrow("DATABASE_URL is required");
    },
  );

  it.each(["postgres:", "postgresql:"])(
    "accepts the PostgreSQL protocol %s",
    (protocol) => {
      const databaseUrl =
        `${protocol}//user:password@127.0.0.1:5432/openevents`;

      expect(
        parseDatabaseConfig({
          DATABASE_URL: `  ${databaseUrl}  `,
        }),
      ).toEqual({ databaseUrl });
    },
  );

  it.each([
    "not-a-url",
    "https://localhost/openevents",
    "postgresql:///openevents",
    "postgresql://localhost",
    "postgresql://localhost/",
    "postgresql://localhost:invalid/openevents",
    "postgresql://localhost/openevents#fragment",
  ])("rejects an invalid database URL: %s", (databaseUrl) => {
    expect(() =>
      parseDatabaseConfig({ DATABASE_URL: databaseUrl }),
    ).toThrow("Invalid database configuration");
  });

  it("preserves connection query parameters", () => {
    const databaseUrl =
      "postgresql://localhost/openevents?application_name=openevents";

    expect(
      parseDatabaseConfig({ DATABASE_URL: databaseUrl }),
    ).toEqual({ databaseUrl });
  });

  it("does not expose credentials in validation errors", () => {
    const secret = "example-secret-for-test";
    const databaseUrl =
      `https://user:${secret}@localhost/openevents`;

    const parse = () =>
      parseDatabaseConfig({ DATABASE_URL: databaseUrl });

    expect(parse).toThrow("Invalid database configuration");
    expect(parse).not.toThrow(secret);
    expect(parse).not.toThrow(databaseUrl);
  });
});