import { Buffer } from "node:buffer";
import { z } from "zod";

const idSchema = z.string().uuid().transform(value => value.toLowerCase());

export function parseRegistrationEventId(input: unknown): string {
  return idSchema.parse(input);
}

export function parseRegistrationId(input: unknown): string {
  return idSchema.parse(input);
}

// Posición por registration.id ASC, vinculada al evento para evitar mezclar páginas.
// No es un secreto ni una credencial: cada consulta debe autorizar el evento.
export function encodeRegistrationCursor(eventId: string, registrationId: string): string {
  return Buffer.from(`reg:v1:${parseRegistrationEventId(eventId)}:${parseRegistrationId(registrationId)}`, "utf8")
    .toString("base64url");
}

const listSchema = z.strictObject({
  limit: z.string().regex(/^[1-9][0-9]{0,2}$/)
    .transform(Number).pipe(z.number().int().max(100)).optional(),
  cursor: z.string().min(1).max(150).regex(/^[A-Za-z0-9_-]+$/).optional(),
});

export interface RegistrationListInput {
  limit: number;
  afterId?: string;
}

// El consumidor pide limit + 1 filas. El cursor no requiere que la fila siga
// existiendo y no promete una instantánea frente a inserciones concurrentes.
export function parseRegistrationListInput(eventId: unknown, input: unknown): RegistrationListInput {
  const normalizedEventId = parseRegistrationEventId(eventId);
  const parsed = listSchema.parse(input);
  if (parsed.cursor === undefined) return { limit: parsed.limit ?? 20 };

  const cursor = z.string().transform((value, context) => {
    const parts = Buffer.from(value, "base64url").toString("utf8").split(":");
    const id = idSchema.safeParse(parts[3]);
    if (parts.length !== 4 || parts[0] !== "reg" || parts[1] !== "v1" ||
        parts[2] !== normalizedEventId || !id.success ||
        encodeRegistrationCursor(normalizedEventId, id.data) !== value) {
      context.addIssue({ code: "custom", message: "Invalid registration cursor." });
      return z.NEVER;
    }
    return id.data;
  }).parse(parsed.cursor);

  return { limit: parsed.limit ?? 20, afterId: cursor };
}
