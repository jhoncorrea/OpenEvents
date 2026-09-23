import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";
import { AuthenticationError, AuthorizationError, requireAnyRole, type AuthenticatedUser } from "../../auth/verify-access-token.js";
import { auditLogs, checkIns, events, eventStaff, qrCredentials, registrations, users } from "../../db/schema.js";
import { EventNotFoundError } from "../events/query-events-for-organizer.js";
import { parseRegistrationEventId } from "./registration-query-input.js";
import { checkInSourceSchema, hashCheckInToken } from "./check-in-input.js";

export class CheckInNotAllowedError extends Error {
  readonly code = "CHECK_IN_NOT_ALLOWED";
  constructor() { super("El evento no está activo para registrar ingresos."); this.name = "CheckInNotAllowedError"; }
}
export class CheckInFailedError extends Error {
  readonly code = "CHECK_IN_FAILED";
  constructor() { super("No se pudo confirmar el ingreso."); this.name = "CheckInFailedError"; }
}
export type PersistedCheckInResult = { status: "invalid" } | {
  status: "accepted" | "duplicate";
  checkIn: { id: string; registrationId: string; performedBy: string; checkedInAt: Date; source: string };
};
const identitySchema = z.object({ tenantId: z.string().uuid(), objectId: z.string().uuid() });

export async function registerCheckInForOperator(
  db: NodePgDatabase, eventIdInput: unknown, tokenInput: unknown, sourceInput: unknown, actor: AuthenticatedUser,
): Promise<PersistedCheckInResult> {
  requireAnyRole(actor, ["checkin_operator"]);
  const identity = identitySchema.safeParse(actor);
  if (!identity.success) throw new AuthenticationError();
  const subject = `entra:${identity.data.tenantId.toLowerCase()}:${identity.data.objectId.toLowerCase()}`;
  const eventId = parseRegistrationEventId(eventIdInput);
  const source = checkInSourceSchema.parse(sourceInput);
  try {
    return await db.transaction(async tx => {
      const isolation = await tx.execute(sql`SHOW transaction_isolation`);
      if (isolation.rows[0]?.transaction_isolation !== "read committed") throw new CheckInFailedError();
      // Mismo orden que emisión: usuario, asignación, evento, inscripción; luego credencial.
      const [user] = await tx.select({ id: users.id, status: users.status }).from(users)
        .where(eq(users.externalSubject, subject)).for("share");
      if (!user) throw new EventNotFoundError();
      if (user.status !== "active") throw new AuthorizationError();
      const [assignment] = await tx.select({ role: eventStaff.role }).from(eventStaff)
        .where(and(eq(eventStaff.userId, user.id), eq(eventStaff.eventId, eventId))).for("share");
      if (assignment?.role !== "checkin_operator") throw new EventNotFoundError();
      const [event] = await tx.select({ status: events.status }).from(events).where(eq(events.id, eventId)).for("share");
      if (!event) throw new EventNotFoundError();
      if (event.status !== "active") throw new CheckInNotAllowedError();
      const tokenHash = hashCheckInToken(tokenInput);
      if (!tokenHash) return { status: "invalid" };
      // Esta lectura solo localiza: permisos y estado de la credencial se comprueban bajo bloqueo.
      const [candidate] = await tx.select({ registrationId: qrCredentials.registrationId }).from(qrCredentials)
        .innerJoin(registrations, eq(registrations.id, qrCredentials.registrationId))
        .where(and(eq(qrCredentials.tokenHash, tokenHash), eq(registrations.eventId, eventId)));
      if (!candidate) return { status: "invalid" };
      const [registration] = await tx.select({ status: registrations.status }).from(registrations)
        .where(and(eq(registrations.id, candidate.registrationId), eq(registrations.eventId, eventId))).for("update");
      if (registration?.status !== "confirmed") return { status: "invalid" };
      const [credential] = await tx.select({ status: qrCredentials.status, revokedAt: qrCredentials.revokedAt }).from(qrCredentials)
        .where(and(eq(qrCredentials.registrationId, candidate.registrationId), eq(qrCredentials.tokenHash, tokenHash))).for("share");
      if (credential?.status !== "active" || credential.revokedAt !== null) return { status: "invalid" };
      const [existing] = await tx.select().from(checkIns).where(eq(checkIns.registrationId, candidate.registrationId));
      if (existing) return { status: "duplicate", checkIn: existing };
      const [saved] = await tx.insert(checkIns).values({ registrationId: candidate.registrationId, performedBy: user.id,
        checkedInAt: sql`clock_timestamp()`, source }).onConflictDoNothing({ target: checkIns.registrationId }).returning();
      if (!saved) {
        // Defensa de unicidad ante otro escritor que no tome el bloqueo de inscripción.
        const [conflict] = await tx.select().from(checkIns).where(eq(checkIns.registrationId, candidate.registrationId));
        if (!conflict) throw new CheckInFailedError();
        return { status: "duplicate", checkIn: conflict };
      }
      await tx.insert(auditLogs).values({ eventId, actorId: user.id, action: "check_in.accepted", entityType: "check_in",
        entityId: saved.id, occurredAt: saved.checkedInAt, metadata: {} });
      return { status: "accepted", checkIn: saved };
    }, { isolationLevel: "read committed" });
  } catch (error) {
    if (error instanceof EventNotFoundError || error instanceof AuthorizationError || error instanceof CheckInNotAllowedError) throw error;
    // Los fallos técnicos permanecen como fallos, sin filtrar SQL, parámetros ni cause con secretos.
    throw new CheckInFailedError();
  }
}
