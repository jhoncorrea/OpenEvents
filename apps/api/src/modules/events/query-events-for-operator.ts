import { and, asc, eq, gt } from "drizzle-orm";
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

import { EventNotFoundError } from "./query-events-for-organizer.js";
export { EventNotFoundError } from "./query-events-for-organizer.js";
// Proyección operativa: no incluye metadatos de creación ni versión de edición.
const operatorEventColumns = {
  id: events.id, name: events.name, startsAt: events.startsAt, endsAt: events.endsAt,
  timezone: events.timezone, location: events.location, status: events.status,
};
export type OperatorEvent = Pick<typeof events.$inferSelect,
  "id" | "name" | "startsAt" | "endsAt" | "timezone" | "location" | "status">;
export interface OperatorEventPage { items: OperatorEvent[]; nextCursor: string | null }

const identitySchema = z.object({
  tenantId: z.string().uuid(),
  objectId: z.string().uuid(),
});

function operatorSubject(actor: AuthenticatedUser): string {
  requireAnyRole(actor, ["checkin_operator"]);
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

export async function listEventsForOperator(
  db: NodePgDatabase,
  input: unknown,
  actor: AuthenticatedUser,
): Promise<OperatorEventPage> {
  const subject = operatorSubject(actor);
  const { limit, afterId } = parseEventListInput(input);
  return readAsLocalUser(db, subject, async (tx, userId) => {
    if (!userId) return { items: [], nextCursor: null };
    const rows = await tx.select(operatorEventColumns).from(events)
      .innerJoin(eventStaff, eq(eventStaff.eventId, events.id))
      .where(and(
        eq(eventStaff.userId, userId),
        eq(eventStaff.role, "checkin_operator"),
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

export async function getEventForOperator(
  db: NodePgDatabase,
  input: unknown,
  actor: AuthenticatedUser,
): Promise<OperatorEvent> {
  const subject = operatorSubject(actor);
  const eventId = parseEventId(input);
  return readAsLocalUser(db, subject, async (tx, userId) => {
    if (!userId) throw new EventNotFoundError();
    const [event] = await tx.select(operatorEventColumns).from(events)
      .innerJoin(eventStaff, eq(eventStaff.eventId, events.id))
      .where(and(
        eq(events.id, eventId),
        eq(eventStaff.userId, userId),
        eq(eventStaff.role, "checkin_operator"),
      )).limit(1);
    // No se distingue entre un evento ajeno y uno inexistente.
    if (!event) throw new EventNotFoundError();
    return event;
  });
}
