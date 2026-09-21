import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";
import { AuthenticationError, AuthorizationError, requireAnyRole, type AuthenticatedUser } from "../../auth/verify-access-token.js";
import { attendees, events, eventStaff, registrations, users } from "../../db/schema.js";
import { parseEventId } from "../events/event-query-input.js";
import { EventNotFoundError } from "../events/query-events-for-organizer.js";
import { RegistrationEmailConflictError, EventRegistrationNotAllowedError } from "./register-attendee-for-organizer.js";
import { validateRegistrationCsv, type RegistrationCsvResult } from "./validate-registration-csv.js";

export class RegistrationCsvValidationError extends Error {
  readonly code = "INVALID_REGISTRATION_CSV";
  constructor(readonly result: Extract<RegistrationCsvResult, { valid: false }>) {
    super("El archivo CSV no es válido.");
    this.name = "RegistrationCsvValidationError";
  }
}
export interface ImportedRegistration {
  id: string;
  eventId: string;
  status: "confirmed";
  source: "csv";
  createdAt: Date;
  attendee: { id: string; fullName: string; email: string };
}
export interface RegistrationCsvImportResult {
  eventId: string;
  count: number;
  /** Orden original del CSV; solo disponible tras confirmar la transacción. */
  items: ImportedRegistration[];
}
const identitySchema = z.object({ tenantId: z.string().uuid(), objectId: z.string().uuid() });

/** Operación interna sin endpoint ni reintentos. Validar no reserva correos. */
export async function importRegistrationCsvForOrganizer(
  db: NodePgDatabase, eventIdInput: unknown, bytes: Uint8Array, actor: AuthenticatedUser,
): Promise<RegistrationCsvImportResult> {
  requireAnyRole(actor, ["organizer"]);
  const identity = identitySchema.safeParse(actor);
  if (!identity.success) throw new AuthenticationError();
  const subject = `entra:${identity.data.tenantId.toLowerCase()}:${identity.data.objectId.toLowerCase()}`;
  const eventId = parseEventId(eventIdInput);
  // Antes del primer await: el consumidor no puede cambiar el lote validado.
  const validation = validateRegistrationCsv(bytes);
  if (!validation.valid) throw new RegistrationCsvValidationError(validation);
  try {
    return await db.transaction(async tx => {
      // Mismo orden y bloqueos SHARE del alta manual: usuario, asignación, evento.
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


      const profiles = validation.rows.map(row => ({ id: randomUUID(), ...row }));
      await tx.insert(attendees).values(profiles);
      // Orden ASCII global para que lotes con orden inverso adquieran las claves
      // únicas en el mismo orden. La restricción sigue siendo la autoridad final.
      const ordered = [...profiles].sort((a, b) => a.email < b.email ? -1 : a.email > b.email ? 1 : 0);
      const saved = await tx.insert(registrations).values(ordered.map(profile => ({
        eventId, attendeeId: profile.id, emailNormalized: profile.email,
        status: "confirmed" as const, source: "csv",
      }))).returning({ id: registrations.id, attendeeId: registrations.attendeeId, createdAt: registrations.createdAt });
      const byAttendee = new Map(saved.map(row => [row.attendeeId, row]));
      const items: ImportedRegistration[] = profiles.map(profile => {
        const row = byAttendee.get(profile.id);
        if (!row) throw new Error("La importación no devolvió todas las inscripciones.");
        return { id: row.id, eventId, status: "confirmed", source: "csv", createdAt: row.createdAt, attendee: profile };
      });
      return { eventId, count: items.length, items };
    });
  } catch (error) {
    // Traducir solo el conflicto conocido y después del rollback completo.
    const cause = error instanceof Error && error.cause ? error.cause : error;
    if (typeof cause === "object" && cause !== null && "code" in cause && cause.code === "23505"
      && "constraint" in cause && cause.constraint === "registration_event_email_unique") {
      throw new RegistrationEmailConflictError();
    }
    throw error;
  }
}
