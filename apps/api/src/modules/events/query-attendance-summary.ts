import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";
import { AuthenticationError, AuthorizationError, requireAnyRole, type AuthenticatedUser } from "../../auth/verify-access-token.js";
import { checkIns, events, eventStaff, registrations, users } from "../../db/schema.js";
import { parseEventId } from "./event-query-input.js";
import { EventNotFoundError } from "./query-events-for-organizer.js";
import { serializeAttendanceSummary, type AttendanceSummary } from "./attendance-summary.js";

const identitySchema = z.object({ tenantId: z.string().uuid(), objectId: z.string().uuid() });

export async function queryAttendanceSummary(db: NodePgDatabase, eventIdInput: unknown,
  actor: AuthenticatedUser): Promise<AttendanceSummary> {
  requireAnyRole(actor, ["organizer", "checkin_operator"]);
  const identity = identitySchema.safeParse(actor);
  if (!identity.success) throw new AuthenticationError();
  const subject = `entra:${identity.data.tenantId.toLowerCase()}:${identity.data.objectId.toLowerCase()}`;
  const roles = [...actor.roles];
  const eventId = parseEventId(eventIdInput);
  return db.transaction(async tx => {
    // Keep the existing lock order and hold authorization for this short read.
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
    // All counters share one PostgreSQL statement snapshot. Never count joined credentials.
    const [counts] = await tx.select({
      registered: sql<number>`count(*)`.mapWith(Number),
      confirmed: sql<number>`count(*) filter (where ${registrations.status} = 'confirmed')`.mapWith(Number),
      cancelled: sql<number>`count(*) filter (where ${registrations.status} = 'cancelled')`.mapWith(Number),
      checkedIn: sql<number>`count(${checkIns.id})`.mapWith(Number),
      cancelledCheckedIn: sql<number>`count(${checkIns.id}) filter (where ${registrations.status} = 'cancelled')`.mapWith(Number),
      pending: sql<number>`count(*) filter (where ${registrations.status} = 'confirmed' and ${checkIns.id} is null)`.mapWith(Number),
      observedAt: sql<Date>`statement_timestamp()`.mapWith(value => new Date(value)),
    }).from(registrations).leftJoin(checkIns, eq(checkIns.registrationId, registrations.id))
      .where(eq(registrations.eventId, eventId));
    const result = { eventId, ...counts };
    serializeAttendanceSummary(result, eventId);
    return result;
  });
}
