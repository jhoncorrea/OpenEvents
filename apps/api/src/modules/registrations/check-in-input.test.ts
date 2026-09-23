import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { checkInSourceSchema, hashCheckInToken } from "./check-in-input.js";

describe("check-in input", () => {
  const token = `oe1_${Buffer.alloc(32, 42).toString("base64url")}`;
  it("hashes exact canonical bytes and preserves case", () => {
    expect(hashCheckInToken(token)).toBe(createHash("sha256").update(token).digest("hex"));
    const changed = token.slice(0, 4) + token[4].toLowerCase() + token.slice(5);
    expect(hashCheckInToken(changed)).not.toBe(hashCheckInToken(token));
  });
  it.each([null, undefined, 42, {}, "", "OE-2027-001", ` ${token}`, `${token}\n`, token.toUpperCase(), `${token}=`, token.slice(0, -1), `${token.slice(0, -1)}p`])("rejects malformed input %#", value => {
    expect(hashCheckInToken(value)).toBeNull();
  });
  it.each(["manual", "qr"])("accepts source %s", source => expect(checkInSourceSchema.parse(source)).toBe(source));
  it.each([null, undefined, "QR", "camera", " manual", ""])("rejects source %#", source => expect(checkInSourceSchema.safeParse(source).success).toBe(false));
});
