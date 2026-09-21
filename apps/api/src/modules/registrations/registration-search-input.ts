import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { z } from "zod";
import { parseRegistrationEventId, parseRegistrationId } from "./registration-query-input.js";

const querySchema = z.string().max(200).refine(value => [...value].every(char =>
  char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127), "Invalid search text.")
  .transform(value => value.trim()).pipe(z.string().min(1).max(100));
const inputSchema = z.strictObject({
  q: querySchema,
  limit: z.string().regex(/^[1-9][0-9]{0,2}$/).transform(Number)
    .pipe(z.number().int().max(100)).optional(),
  cursor: z.string().min(1).max(240).regex(/^[A-Za-z0-9_-]+$/).optional(),
});

// No contiene el término en claro. La huella no es un secreto ni autorización.
export function encodeRegistrationSearchCursor(eventId: string, q: string, afterId: string): string {
  const hash = createHash("sha256").update(querySchema.parse(q), "utf8").digest("hex");
  return Buffer.from(`search:v1:${parseRegistrationEventId(eventId)}:${hash}:${parseRegistrationId(afterId)}`)
    .toString("base64url");
}

export function parseRegistrationSearchInput(eventId: unknown, input: unknown): {
  q: string; limit: number; afterId?: string;
} {
  const event = parseRegistrationEventId(eventId);
  const parsed = inputSchema.parse(input);
  let afterId: string | undefined;
  if (parsed.cursor !== undefined) {
    afterId = z.string().transform((value, context) => {
      const parts = Buffer.from(value, "base64url").toString("utf8").split(":");
      const id = z.string().uuid().safeParse(parts[4]);
      if (parts.length !== 5 || !id.success || encodeRegistrationSearchCursor(event, parsed.q, id.data) !== value) {
        context.addIssue({ code: "custom", message: "Invalid registration search cursor." });
        return z.NEVER;
      }
      return id.data.toLowerCase();
    }).parse(parsed.cursor);
  }
  return { q: parsed.q, limit: parsed.limit ?? 20, ...(afterId === undefined ? {} : { afterId }) };
}
