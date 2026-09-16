import { describe, expect, it } from "vitest";
import { parseWebConfig } from "./config";

describe("parseWebConfig", () => {
  it("uses the local API URL when the variable is not defined", () => {
    expect(parseWebConfig({})).toEqual({
      apiUrl: "http://localhost:3001",
    });
  });

  it("normalizes a valid API URL", () => {
    expect(
      parseWebConfig({
        VITE_API_URL: " https://api.openevents.example/ ",
      }),
    ).toEqual({
      apiUrl: "https://api.openevents.example",
    });
  });

  it.each(["not-a-url", "ftp://api.openevents.example"])(
    "rejects the invalid API URL %s",
    (apiUrl) => {
      expect(() =>
        parseWebConfig({
          VITE_API_URL: apiUrl,
        }),
      ).toThrow("Invalid VITE_API_URL");
    },
  );
});