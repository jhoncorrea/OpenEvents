import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createRegistrationCredentialToken } from "./registration-credential-token.js";
describe("registration credential token", () => {
  it("encodes 32 random bytes with a version prefix and hashes the entire token", () => {
    const { token, tokenHash } = createRegistrationCredentialToken();
    expect(token).toMatch(/^oe1_[A-Za-z0-9_-]{43}$/);
    const bytes = Buffer.from(token.slice(4), "base64url");
    expect(bytes.length).toBe(32); expect(bytes.toString("base64url")).toBe(token.slice(4));
    expect(tokenHash).toBe(createHash("sha256").update(token, "utf8").digest("hex"));
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });
  it("uses fresh randomness for successive credentials", () => {
    const samples = Array.from({ length: 100 }, createRegistrationCredentialToken);
    expect(new Set(samples.map(v => v.token)).size).toBe(100);
    expect(new Set(samples.map(v => v.tokenHash)).size).toBe(100);
  });
});
