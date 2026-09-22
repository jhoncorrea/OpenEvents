import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";
import { AuthenticationError, AuthorizationError, requireAnyRole, type AuthenticatedUser } from "../../auth/verify-access-token.js";
import { events, eventStaff, qrCredentials, registrations, users } from "../../db/schema.js";
import { EventNotFoundError } from "../events/query-events-for-organizer.js";
import { RegistrationNotFoundError } from "./query-registrations-for-organizer.js";
import { parseRegistrationEventId, parseRegistrationId } from "./registration-query-input.js";
import { createRegistrationCredentialToken } from "./registration-credential-token.js";

export class CredentialIssuanceNotAllowedError extends Error {
  readonly code = "CREDENTIAL_ISSUANCE_NOT_ALLOWED";
  constructor() { super("El estado del evento o de la inscripción no permite emitir la credencial."); this.name = "CredentialIssuanceNotAllowedError"; }
}
export class RegistrationCredentialExistsError extends Error {
  readonly code = "REGISTRATION_CREDENTIAL_EXISTS";
  constructor() { super("La inscripción ya tiene una credencial; no se reemplazó."); this.name = "RegistrationCredentialExistsError"; }
}
export class CredentialIssuanceFailedError extends Error {
  readonly code = "CREDENTIAL_ISSUANCE_FAILED";
  constructor() { super("No se pudo emitir la credencial."); this.name = "CredentialIssuanceFailedError"; }
}
export interface IssuedRegistrationCredential {
  id: string; eventId: string; registrationId: string; status: "active"; issuedAt: Date; token: string;
}
const identitySchema = z.object({ tenantId: z.string().uuid(), objectId: z.string().uuid() });

export async function issueRegistrationCredentialForOrganizer(
  db: NodePgDatabase, eventIdInput: unknown, registrationIdInput: unknown, actor: AuthenticatedUser,
): Promise<IssuedRegistrationCredential> {
  requireAnyRole(actor, ["organizer"]);
  const identity = identitySchema.safeParse(actor);
  if (!identity.success) throw new AuthenticationError();
  const subject = `entra:${identity.data.tenantId.toLowerCase()}:${identity.data.objectId.toLowerCase()}`;
  const eventId = parseRegistrationEventId(eventIdInput);
  const registrationId = parseRegistrationId(registrationIdInput);
  try {
    return await db.transaction(async tx => {
      // Orden común de autorización: usuario, asignación, evento, inscripción.
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
      // Serializa emisiones de una misma inscripción sin bloquear las demás.
      const [registration] = await tx.select({ status: registrations.status }).from(registrations)
        .where(and(eq(registrations.id, registrationId), eq(registrations.eventId, eventId))).for("update");
      if (!registration) throw new RegistrationNotFoundError();
      if ((event.status !== "draft" && event.status !== "active") || registration.status !== "confirmed") {
        throw new CredentialIssuanceNotAllowedError();
      }
      const [existing] = await tx.select({ id: qrCredentials.id }).from(qrCredentials)
        .where(eq(qrCredentials.registrationId, registrationId));
      if (existing) throw new RegistrationCredentialExistsError();
      const { token, tokenHash } = createRegistrationCredentialToken();
      const [credential] = await tx.insert(qrCredentials).values({ registrationId, tokenHash, status: "active" })
        .onConflictDoNothing().returning({ id: qrCredentials.id, issuedAt: qrCredentials.issuedAt });
      if (!credential) {
        // Defensa ante escrituras externas y colisión de hash; sin reintento automático.
        const [conflict] = await tx.select({ id: qrCredentials.id }).from(qrCredentials)
          .where(eq(qrCredentials.registrationId, registrationId));
        if (conflict) throw new RegistrationCredentialExistsError();
        throw new CredentialIssuanceFailedError();
      }
      return { ...credential, eventId, registrationId, status: "active", token };
    });
  } catch (error) {
    if (error instanceof EventNotFoundError || error instanceof RegistrationNotFoundError ||
        error instanceof AuthorizationError || error instanceof CredentialIssuanceNotAllowedError ||
        error instanceof RegistrationCredentialExistsError) throw error;
    // Nunca exponer SQL, hash, token ni el error original, tampoco como cause.
    throw new CredentialIssuanceFailedError();
  }
}
