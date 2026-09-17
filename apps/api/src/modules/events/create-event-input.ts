import { z } from "zod";

function isRecognizedTimezone(value: string): boolean {
  // Exigimos un nombre de zona, no un desplazamiento como "-05:00".
  if (/^[+-]/.test(value)) {
    return false;
  }

  try {
    new Intl.DateTimeFormat("en-US", {
      timeZone: value,
    }).format();

    return true;
  } catch {
    return false;
  }
}

const utcDateTime = z.iso
  .datetime()
  .transform((value) => new Date(value))
  .pipe(z.date());

export const createEventInputSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(200),

    slug: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "Use lowercase letters, numbers and single hyphens between words.",
      ),

    startsAt: utcDateTime,
    endsAt: utcDateTime,

    timezone: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .refine(
        isRecognizedTimezone,
        "Use a recognized timezone, such as America/Lima.",
      ),

    location: z.string().trim().min(1).max(500),
  })
  .refine(
    (event) => event.endsAt.getTime() > event.startsAt.getTime(),
    {
      message: "endsAt must be later than startsAt.",
      path: ["endsAt"],
    },
  );

export type CreateEventInput = z.output<typeof createEventInputSchema>;

export function parseCreateEventInput(input: unknown): CreateEventInput {
  return createEventInputSchema.parse(input);
}