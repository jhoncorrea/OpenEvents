import { and, asc, eq, getTableColumns, gt } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";
import {
  AuthenticationError,
  AuthorizationError,
  requireAnyRole,
  type AuthenticatedUser,
} from "../../auth/verify-access-token.js";
import { events, eventStaff, users } from "../../db/schema.js";
import {
  encodeEventCursor,
  parseEventId,
  parseEventListInput,
} from "./event-query-input.js";

export type QueriedEvent = typeof events.$inferSelect;
export interface EventPage {
  items: QueriedEvent[];
  nextCursor: string | null;
}

export class EventNotFoundError extends Error {
  readonly code = "EVENT_NOT_FOUND";

  constructor() {
    super("No se encontró el evento.");
    this.name = "EventNotFoundError";
  }
}

const identitySchema = z.object({
  tenantId: z.string().uuid(),
  objectId: z.string().uuid(),
});

function organizerSubject(actor: AuthenticatedUser): string {
  requireAnyRole(actor, ["organizer"]);
  const identity = identitySchema.safeParse(actor);
  if (!identity.success) throw new AuthenticationError();
  return `entra:${identity.data.tenantId.toLowerCase()}:${identity.data.objectId.toLowerCase()}`;
}

async function readAsLocalUser<T>(
  db: NodePgDatabase,
  subject: string,
  read: (tx: NodePgDatabase, userId: string | undefined) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // SHARE permite lecturas simultáneas y evita que la cuenta cambie
    // de estado entre esta comprobación y la consulta de eventos.
    const [localUser] = await tx.select({ id: users.id, status: users.status })
      .from(users).where(eq(users.externalSubject, subject)).for("share");
    if (localUser && localUser.status !== "active") {
      throw new AuthorizationError();
    }
    return read(tx, localUser?.id);
  });
}

export async function listEventsForOrganizer(
  db: NodePgDatabase,
  input: unknown,
  actor: AuthenticatedUser,
): Promise<EventPage> {
  const subject = organizerSubject(actor);
  const { limit, afterId } = parseEventListInput(input);
  return readAsLocalUser(db, subject, async (tx, userId) => {
    if (!userId) return { items: [], nextCursor: null };
    const rows = await tx.select(getTableColumns(events)).from(events)
      .innerJoin(eventStaff, eq(eventStaff.eventId, events.id))
      .where(and(
        eq(eventStaff.userId, userId),
        eq(eventStaff.role, "organizer"),
        afterId === undefined ? undefined : gt(events.id, afterId),
      ))
      .orderBy(asc(events.id)).limit(limit + 1);
    const items = rows.slice(0, limit);
    return {
      items,
      nextCursor: rows.length > limit
        ? encodeEventCursor(items[items.length - 1].id)
        : null,
    };
  });
}

export async function getEventForOrganizer(
  db: NodePgDatabase,
  input: unknown,
  actor: AuthenticatedUser,
): Promise<QueriedEvent> {
  const subject = organizerSubject(actor);
  const eventId = parseEventId(input);
  return readAsLocalUser(db, subject, async (tx, userId) => {
    if (!userId) throw new EventNotFoundError();
    const [event] = await tx.select(getTableColumns(events)).from(events)
      .innerJoin(eventStaff, eq(eventStaff.eventId, events.id))
      .where(and(
        eq(events.id, eventId),
        eq(eventStaff.userId, userId),
        eq(eventStaff.role, "organizer"),
      )).limit(1);
    // No se distingue entre un evento ajeno y uno inexistente.
    if (!event) throw new EventNotFoundError();
    return event;
  });
}
