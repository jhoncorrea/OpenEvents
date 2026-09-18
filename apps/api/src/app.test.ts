import { describe, expect, it, vi } from "vitest";
import { buildApp } from "./app.js";

describe("API health", () => {
  it("responds without authentication", async () => {
    const verifyAccessToken = vi.fn(async () => {
      throw new Error("Health must not invoke the token verifier.");
    });

    const app = buildApp({ verifyAccessToken });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/health",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        status: "ok",
        service: "openevents-api",
        timestamp: expect.any(String),
      });
      expect(verifyAccessToken).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});