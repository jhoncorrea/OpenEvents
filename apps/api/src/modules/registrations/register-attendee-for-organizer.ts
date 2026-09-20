import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";
import {
  AuthenticationError, AuthorizationError, requireAnyRole,
  type AuthenticatedUser,
} from "../../auth/verify-access-token.js";
import { attendees, events, eventStaff, registrations, users } from "../../db/schema.js";
import { parseEventId } from "../events/event-query-input.js";
import { EventNotFoundError } from "../events/query-events-for-organizer.js";
import { parseRegisterAttendeeInput } from "./register-attendee-input.js";

export class RegistrationEmailConflictError extends Error {
  readonly code = "REGISTRATION_EMAIL_CONFLICT";
  constructor() {
    super("Ya existe una inscripción con ese correo en el evento.");
    this.name = "RegistrationEmailConflictError";
  }
}
export class EventRegistrationNotAllowedError extends Error {
  readonly code = "EVENT_REGISTRATION_NOT_ALLOWED";
  constructor() {
    super("El evento no admite nuevas inscripciones.");
    this.name = "EventRegistrationNotAllowedError";
  }
}

export interface RegisteredAttendee {
  id: string;
  eventId: string;
  status: "confirmed";
  source: "manual";
  createdAt: Date;
  attendee: { id: string; fullName: string; email: string };
}

const identitySchema = z.object({ tenantId: z.string().uuid(), objectId: z.string().uuid() });
function isEmailConflict(error: unknown): boolean {
  const cause = error instanceof Error && error.cause ? error.cause : error;
  return typeof cause === "object" && cause !== null
    && "code" in cause && cause.code === "23505"
    && "constraint" in cause && cause.constraint === "registration_event_email_unique";
}

export async function registerAttendeeForOrganizer(
  db: NodePgDatabase,
  eventIdInput: unknown,
  input: unknown,
  actor: AuthenticatedUser,
): Promise<RegisteredAttendee> {
  requireAnyRole(actor, ["organizer"]);
  const identity = identitySchema.safeParse(actor);
  if (!identity.success) throw new AuthenticationError();
  const subject = `entra:${identity.data.tenantId.toLowerCase()}:${identity.data.objectId.toLowerCase()}`;
  const eventId = parseEventId(eventIdInput);
  const data = parseRegisterAttendeeInput(input);

  try {
    return await db.transaction(async tx => {
      // Mismo orden de autorización que la edición: usuario, asignación, evento.
      // SHARE permite inscripciones paralelas, pero impide cambiar el estado
      // o revocar las filas ya bloqueadas hasta confirmar/revertir la operación.
      const [user] = await tx.select({ id: users.id, status: users.status }).from(users)
        .where(eq(users.externalSubject, subject)).for("share");
      if (!user) throw new EventNotFoundError();
      if (user.status !== "active") throw new AuthorizationError();
      const [assignment] = await tx.select({ role: eventStaff.role }).from(eventStaff)
        .where(and(eq(eventStaff.userId, user.id), eq(eventStaff.eventId, eventId))).for("share");
      if (assignment?.role !== "organizer") throw new EventNotFoundError();
      const [event] = await tx.select({ status: events.status }).from(events)
        .where(eq(events.id, eventId)).for("share");
      if (!event) throw new EventNotFoundError();
      if (event.status !== "draft" && event.status !== "active") throw new EventRegistrationNotAllowedError();

      // No buscar ni reutilizar perfiles de otro evento por su correo.
      const [attendee] = await tx.insert(attendees).values(data).returning({
        id: attendees.id, fullName: attendees.fullName, email: attendees.email,
      });
      const [registration] = await tx.insert(registrations).values({
        eventId, attendeeId: attendee.id, emailNormalized: data.email,
        status: "confirmed", source: "manual",
      }).returning({ id: registrations.id, createdAt: registrations.createdAt });
      return { ...registration, eventId, status: "confirmed", source: "manual", attendee };
    });
  } catch (error) {
    // Traducir únicamente esta restricción, después del rollback (sin huérfanos).
    if (isEmailConflict(error)) throw new RegistrationEmailConflictError();
    throw error;
  }
}
