import { and, asc, eq, gt } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";
import { AuthenticationError, AuthorizationError, requireAnyRole, type AuthenticatedUser } from "../../auth/verify-access-token.js";
import { attendees, checkIns, events, eventStaff, registrations, users } from "../../db/schema.js";
import { EventNotFoundError } from "../events/query-events-for-organizer.js";
import { encodeRegistrationCursor, parseRegistrationEventId, parseRegistrationId, parseRegistrationListInput } from "./registration-query-input.js";

export interface QueriedRegistration {
  id: string;
  eventId: string;
  status: typeof registrations.$inferSelect.status;
  source: string;
  createdAt: Date;
  checkedInAt: Date | null;
  attendee: { id: string; fullName: string; email: string };
}
export interface RegistrationPage {
  items: QueriedRegistration[];
  nextCursor: string | null;
}
export class RegistrationNotFoundError extends Error {
  readonly code = "REGISTRATION_NOT_FOUND";
  constructor() {
    super("No se encontró la inscripción.");
    this.name = "RegistrationNotFoundError";
  }
}

const identitySchema = z.object({ tenantId: z.string().uuid(), objectId: z.string().uuid() });
function organizerSubject(actor: AuthenticatedUser): string {
  requireAnyRole(actor, ["organizer"]);
  const identity = identitySchema.safeParse(actor);
  if (!identity.success) throw new AuthenticationError();
  return `entra:${identity.data.tenantId.toLowerCase()}:${identity.data.objectId.toLowerCase()}`;
}

async function readForEvent<T>(db: NodePgDatabase, subject: string, eventId: string,
  read: (tx: NodePgDatabase) => Promise<T>): Promise<T> {
  return db.transaction(async tx => {
    // Mismo orden que la escritura: usuario, asignación, evento. SHARE mantiene
    // la autorización durante esta lectura breve; no reserva páginas futuras.
    const [user] = await tx.select({ id: users.id, status: users.status }).from(users)
      .where(eq(users.externalSubject, subject)).for("share");
    if (!user) throw new EventNotFoundError();
    if (user.status !== "active") throw new AuthorizationError();
    const [assignment] = await tx.select({ role: eventStaff.role }).from(eventStaff)
      .where(and(eq(eventStaff.userId, user.id), eq(eventStaff.eventId, eventId))).for("share");
    if (assignment?.role !== "organizer") throw new EventNotFoundError();
    const [event] = await tx.select({ id: events.id }).from(events)
      .where(eq(events.id, eventId)).for("share");
    if (!event) throw new EventNotFoundError();
    // Consultar también está permitido para closed/cancelled; no habilita altas.
    return read(tx);
  });
}

const fields = {
  id: registrations.id, eventId: registrations.eventId, status: registrations.status,
  source: registrations.source, createdAt: registrations.createdAt, checkedInAt: checkIns.checkedInAt,
  attendee: { id: attendees.id, fullName: attendees.fullName, email: attendees.email },
};

export async function listRegistrationsForOrganizer(db: NodePgDatabase, eventIdInput: unknown,
  input: unknown, actor: AuthenticatedUser): Promise<RegistrationPage> {
  const subject = organizerSubject(actor);
  const eventId = parseRegistrationEventId(eventIdInput);
  const { limit, afterId } = parseRegistrationListInput(eventId, input);
  return readForEvent(db, subject, eventId, async tx => {
    const rows = await tx.select(fields).from(registrations)
      .innerJoin(attendees, eq(attendees.id, registrations.attendeeId))
      .leftJoin(checkIns, eq(checkIns.registrationId, registrations.id))
      .where(and(eq(registrations.eventId, eventId), afterId === undefined ? undefined : gt(registrations.id, afterId)))
      .orderBy(asc(registrations.id)).limit(limit + 1);
    const items = rows.slice(0, limit);
    return { items, nextCursor: rows.length > limit ? encodeRegistrationCursor(eventId, items[items.length - 1].id) : null };
  });
}

export async function getRegistrationForOrganizer(db: NodePgDatabase, eventIdInput: unknown,
  registrationIdInput: unknown, actor: AuthenticatedUser): Promise<QueriedRegistration> {
  const subject = organizerSubject(actor);
  const eventId = parseRegistrationEventId(eventIdInput);
  const registrationId = parseRegistrationId(registrationIdInput);
  return readForEvent(db, subject, eventId, async tx => {
    const [registration] = await tx.select(fields).from(registrations)
      .innerJoin(attendees, eq(attendees.id, registrations.attendeeId))
      .leftJoin(checkIns, eq(checkIns.registrationId, registrations.id))
      .where(and(eq(registrations.eventId, eventId), eq(registrations.id, registrationId))).limit(1);
    // Incluso con acceso a ambos eventos, el detalle debe pertenecer al de la ruta.
    if (!registration) throw new RegistrationNotFoundError();
    return registration;
  });
}
