import { createHash, randomBytes } from "node:crypto";

// 256 bits de entropía. El prefijo versiona el formato sin incluir identidad o PII.
export function createRegistrationCredentialToken(): { token: string; tokenHash: string } {
  const token = `oe1_${randomBytes(32).toString("base64url")}`;
  return { token, tokenHash: createHash("sha256").update(token, "utf8").digest("hex") };
}
