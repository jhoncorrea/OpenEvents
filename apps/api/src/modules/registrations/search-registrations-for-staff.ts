import { and, asc, eq, gt, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";
import { AuthenticationError, AuthorizationError, requireAnyRole, type AuthenticatedUser } from "../../auth/verify-access-token.js";
import { attendees, events, eventStaff, registrations, users } from "../../db/schema.js";
import { EventNotFoundError } from "../events/query-events-for-organizer.js";
import type { RegistrationPage } from "./query-registrations-for-organizer.js";
import { parseRegistrationEventId } from "./registration-query-input.js";
import { encodeRegistrationSearchCursor, parseRegistrationSearchInput } from "./registration-search-input.js";

const identitySchema = z.object({ tenantId: z.string().uuid(), objectId: z.string().uuid() });

export async function searchRegistrationsForStaff(db: NodePgDatabase, eventIdInput: unknown,
  input: unknown, actor: AuthenticatedUser): Promise<RegistrationPage> {
  requireAnyRole(actor, ["organizer", "checkin_operator"]);
  const identity = identitySchema.safeParse(actor);
  if (!identity.success) throw new AuthenticationError();
  const subject = `entra:${identity.data.tenantId.toLowerCase()}:${identity.data.objectId.toLowerCase()}`;
  // Capturar roles antes del primer await; no confiar en mutaciones del llamador.
  const roles = [...actor.roles];
  const eventId = parseRegistrationEventId(eventIdInput);
  const { q, limit, afterId } = parseRegistrationSearchInput(eventId, input);
  // ! es el escape explícito de LIKE. %, _ y ! del usuario son literales.
  const pattern = `%${q.replace(/[!%_]/g, char => `!${char}`)}%`;
  return db.transaction(async tx => {
    // Orden compartido con las lecturas/escrituras existentes; permisos vigentes en cada página.
    const [user] = await tx.select({ id: users.id, status: users.status }).from(users)
      .where(eq(users.externalSubject, subject)).for("share");
    if (!user) throw new EventNotFoundError();
    if (user.status !== "active") throw new AuthorizationError();
    const [assignment] = await tx.select({ role: eventStaff.role }).from(eventStaff)
      .where(and(eq(eventStaff.userId, user.id), eq(eventStaff.eventId, eventId))).for("share");
    const compatible = assignment?.role === "organizer" && roles.includes("organizer") ||
      assignment?.role === "checkin_operator" && roles.includes("checkin_operator");
    if (!compatible) throw new EventNotFoundError();
    const [event] = await tx.select({ id: events.id }).from(events).where(eq(events.id, eventId)).for("share");
    if (!event) throw new EventNotFoundError();
    const rows = await tx.select({
      id: registrations.id, eventId: registrations.eventId, status: registrations.status,
      source: registrations.source, createdAt: registrations.createdAt,
      attendee: { id: attendees.id, fullName: attendees.fullName, email: attendees.email },
    }).from(registrations).innerJoin(attendees, eq(attendees.id, registrations.attendeeId))
      .where(and(eq(registrations.eventId, eventId),
        or(sql`${attendees.fullName} ilike ${pattern} escape '!'`, sql`${registrations.emailNormalized} ilike ${pattern} escape '!'`),
        afterId === undefined ? undefined : gt(registrations.id, afterId)))
      .orderBy(asc(registrations.id)).limit(limit + 1);
    const items = rows.slice(0, limit);
    return { items, nextCursor: rows.length > limit
      ? encodeRegistrationSearchCursor(eventId, q, items[items.length - 1].id) : null };
  });
}
