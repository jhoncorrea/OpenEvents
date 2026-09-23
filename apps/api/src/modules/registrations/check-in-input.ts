import { createHash } from "node:crypto";
import { z } from "zod";

export const checkInSourceSchema = z.enum(["manual", "qr"]);

// No trim ni conversión de mayúsculas: cada byte forma parte del secreto.
export function hashCheckInToken(input: unknown): string | null {
  if (typeof input !== "string" || !/^oe1_[A-Za-z0-9_-]{43}$/.test(input)) return null;
  const encoded = input.slice(4);
  const bytes = Buffer.from(encoded, "base64url");
  if (bytes.length !== 32 || bytes.toString("base64url") !== encoded) return null;
  return createHash("sha256").update(input, "utf8").digest("hex");
}
