import { Buffer } from "node:buffer";
import { z } from "zod";

const eventIdSchema = z.string().uuid().transform((value) => value.toLowerCase());

export function parseEventId(input: unknown): string {
  return eventIdSchema.parse(input);
}

// El cursor representa la última posición, no concede acceso al evento.
// Cada consulta debe volver a comprobar la identidad y event_staff.
export function encodeEventCursor(eventId: string): string {
  return Buffer.from(`v1:${parseEventId(eventId)}`, "utf8").toString("base64url");
}

const cursorSchema = z.string().min(1).max(100)
  .regex(/^[A-Za-z0-9_-]+$/)
  .transform((value, context) => {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    const id = eventIdSchema.safeParse(decoded.slice(3));
    if (!decoded.startsWith("v1:") || !id.success ||
        encodeEventCursor(id.data) !== value) {
      context.addIssue({ code: "custom", message: "Invalid event cursor." });
      return z.NEVER;
    }
    return id.data;
  });

const listInputSchema = z.strictObject({
  limit: z.string().regex(/^[1-9][0-9]{0,2}$/)
    .transform(Number).pipe(z.number().int().max(100)).optional(),
  cursor: cursorSchema.optional(),
});

export interface EventListInput {
  limit: number;
  afterId?: string;
}

// Orden previsto: event.id ASC. Se solicita limit + 1 para determinar
// si hay otra página. No se utilizan offsets ni fechas redondeadas.
export function parseEventListInput(input: unknown): EventListInput {
  const parsed = listInputSchema.parse(input);
  return {
    limit: parsed.limit ?? 20,
    ...(parsed.cursor === undefined ? {} : { afterId: parsed.cursor }),
  };
}
