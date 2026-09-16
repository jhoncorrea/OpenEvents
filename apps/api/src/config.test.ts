import { describe, expect, it } from "vitest";
import { parseApiConfig } from "./config.js";

describe("parseApiConfig", () => {
  it("uses local defaults when variables are not defined", () => {
    expect(parseApiConfig({})).toEqual({
      port: 3001,
      host: "127.0.0.1",
    });
  });

  it("parses valid environment variables", () => {
    expect(
      parseApiConfig({
        PORT: "8080",
        HOST: " 0.0.0.0 ",
      }),
    ).toEqual({
      port: 8080,
      host: "0.0.0.0",
    });
  });

  it.each(["abc", "0", "65536", "3001.5"])(
    "rejects the invalid PORT value %s",
    (port) => {
      expect(() =>
        parseApiConfig({
          PORT: port,
          HOST: "127.0.0.1",
        }),
      ).toThrow("Invalid environment configuration");
    },
  );

  it("rejects an empty HOST value", () => {
    expect(() =>
      parseApiConfig({
        PORT: "3001",
        HOST: "   ",
      }),
    ).toThrow("HOST");
  });
});