import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { events } from "../../db/schema.js";
import { parseCreateEventInput } from "./create-event-input.js";

export class EventSlugConflictError extends Error {
  readonly code = "EVENT_SLUG_CONFLICT";

  constructor() {
    super("An event with this slug already exists.");
    this.name = "EventSlugConflictError";
  }
}

export async function createEvent(
  db: NodePgDatabase,
  input: unknown,
): Promise<typeof events.$inferSelect> {
  const data = parseCreateEventInput(input);

  const [event] = await db
    .insert(events)
    .values({
      name: data.name,
      slug: data.slug,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      timezone: data.timezone,
      location: data.location,
      status: "draft",
    })
    .onConflictDoNothing({
      target: events.slug,
    })
    .returning();

  if (!event) {
    throw new EventSlugConflictError();
  }

  return event;
}