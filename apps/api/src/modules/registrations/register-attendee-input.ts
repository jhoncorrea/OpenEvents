import { z } from "zod";

// Política MVP: ASCII, espacios exteriores ignorados y comparación sin mayúsculas.
// No eliminamos puntos ni etiquetas +; no verificamos propiedad del correo.
const emailSchema = z.string().trim().max(254)
  .regex(/^[\x21-\x7e]+$/)
  .pipe(z.email())
  .refine(value => value.split("@")[0].length <= 64)
  .transform(value => value.toLowerCase());

export const registerAttendeeInputSchema = z.strictObject({
  fullName: z.string().trim().min(1).max(200)
    .refine(value => !/[\p{Cc}\p{Cf}]/u.test(value), "Use a name without control characters."),
  email: emailSchema,
});

export type RegisterAttendeeInput = z.output<typeof registerAttendeeInputSchema>;

export function parseRegisterAttendeeInput(input: unknown): RegisterAttendeeInput {
  return registerAttendeeInputSchema.parse(input);
}
