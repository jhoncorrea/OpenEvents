import { z } from "zod";
import {
  createEventInputSchema,
  parseCreateEventInput,
  type CreateEventInput,
} from "./create-event-input.js";

const fields = createEventInputSchema.shape;

const editEventInputSchema = z.strictObject({
  expectedVersion: z.number().int().min(1).max(2_147_483_646),
  name: fields.name.optional(),
  slug: fields.slug.optional(),
  startsAt: fields.startsAt.optional(),
  endsAt: fields.endsAt.optional(),
  timezone: fields.timezone.optional(),
  location: fields.location.optional(),
}).refine(
  (input) => Object.entries(input).some(
    ([key, value]) => key !== "expectedVersion" && value !== undefined,
  ),
  { message: "Provide at least one editable field." },
);

export type EditEventInput = z.output<typeof editEventInputSchema>;

export function parseEditEventInput(input: unknown): EditEventInput {
  return editEventInputSchema.parse(input);
}

// Invocar con el evento autorizado leído dentro de la transacción.
// No trasladar campos de identidad, estado o versión al objeto editable.
export function mergeEventChanges(
  current: CreateEventInput,
  changes: EditEventInput,
): CreateEventInput {
  return parseCreateEventInput({
    name: changes.name ?? current.name,
    slug: changes.slug ?? current.slug,
    startsAt: (changes.startsAt ?? current.startsAt).toISOString(),
    endsAt: (changes.endsAt ?? current.endsAt).toISOString(),
    timezone: changes.timezone ?? current.timezone,
    location: changes.location ?? current.location,
  });
}
