import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";
import {
  AuthenticationError,
  AuthorizationError,
  requireAnyRole,
  type AuthenticatedUser,
} from "../../auth/verify-access-token.js";
import { eventStaff, users } from "../../db/schema.js";
import { createEvent } from "./create-event.js";

const externalIdentitySchema = z.object({
  tenantId: z.string().uuid(),
  objectId: z.string().uuid(),
});

export async function createEventForOrganizer(
  db: NodePgDatabase,
  input: unknown,
  authenticatedUser: AuthenticatedUser,
): ReturnType<typeof createEvent> {
  requireAnyRole(authenticatedUser, ["organizer"]);

  const identity = externalIdentitySchema.safeParse(
    authenticatedUser,
  );

  if (!identity.success) {
    throw new AuthenticationError();
  }

  const externalSubject = [
    "entra",
    identity.data.tenantId.toLowerCase(),
    identity.data.objectId.toLowerCase(),
  ].join(":");

  return db.transaction(async (transaction) => {
    // La restricción única evita duplicar una identidad cuando
    // llegan solicitudes concurrentes. No modifica usuarios existentes.
    await transaction
      .insert(users)
      .values({
        externalSubject,
        email: null,
        displayName: null,
        status: "active",
      })
      .onConflictDoNothing({
        target: users.externalSubject,
      });

    // El bloqueo mantiene estable el estado del usuario durante
    // esta operación y coordina cambios concurrentes en esa fila.
    const [localUser] = await transaction
      .select({
        id: users.id,
        status: users.status,
      })
      .from(users)
      .where(eq(users.externalSubject, externalSubject))
      .for("update");

    if (!localUser) {
      throw new Error("Local identity could not be resolved.");
    }

    if (localUser.status !== "active") {
      throw new AuthorizationError();
    }

    // La operación existente valida el cuerpo y controla
    // el conflicto de slug dentro de esta misma transacción.
    const event = await createEvent(transaction, input);

    await transaction.insert(eventStaff).values({
      eventId: event.id,
      userId: localUser.id,
      role: "organizer",
    });

    return event;
  });
}