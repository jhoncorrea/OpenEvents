import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";
import {
  AuthenticationError, AuthorizationError, requireAnyRole,
  type AuthenticatedUser,
} from "../../auth/verify-access-token.js";
import { events, eventStaff, users } from "../../db/schema.js";
import { EventSlugConflictError } from "./create-event.js";
import { mergeEventChanges, parseEditEventInput } from "./edit-event-input.js";
import { parseEventId } from "./event-query-input.js";
import { EventNotFoundError, type QueriedEvent } from "./query-events-for-organizer.js";

export class EventVersionConflictError extends Error {
  readonly code = "EVENT_VERSION_CONFLICT";
  constructor() {
    super("El evento cambió. Consulta su versión actual antes de editar.");
    this.name = "EventVersionConflictError";
  }
}

export class EventNotEditableError extends Error {
  readonly code = "EVENT_NOT_EDITABLE";
  constructor() {
    super("Solo se pueden editar eventos en borrador.");
    this.name = "EventNotEditableError";
  }
}

const identitySchema = z.object({ tenantId: z.string().uuid(), objectId: z.string().uuid() });

function isSlugConflict(error: unknown): boolean {
  // Drizzle envuelve el error de PostgreSQL; no convertir otras restricciones.
  const databaseError = error instanceof Error && error.cause ? error.cause : error;
  return typeof databaseError === "object" && databaseError !== null
    && "code" in databaseError && databaseError.code === "23505"
    && "constraint" in databaseError && databaseError.constraint === "event_slug_unique";
}

export async function editEventForOrganizer(
  db: NodePgDatabase,
  eventIdInput: unknown,
  input: unknown,
  actor: AuthenticatedUser,
): Promise<QueriedEvent> {
  requireAnyRole(actor, ["organizer"]);
  const identity = identitySchema.safeParse(actor);
  if (!identity.success) throw new AuthenticationError();
  const subject = `entra:${identity.data.tenantId.toLowerCase()}:${identity.data.objectId.toLowerCase()}`;
  const eventId = parseEventId(eventIdInput);
  const changes = parseEditEventInput(input);

  try {
    return await db.transaction(async (tx) => {
      // Orden de bloqueos: usuario, asignación, evento. La autorización
      // permanece estable hasta que termina esta escritura.
      const [localUser] = await tx.select({ id: users.id, status: users.status })
        .from(users).where(eq(users.externalSubject, subject)).for("share");
      if (!localUser) throw new EventNotFoundError();
      if (localUser.status !== "active") throw new AuthorizationError();

      const [assignment] = await tx.select({ role: eventStaff.role }).from(eventStaff)
        .where(and(eq(eventStaff.userId, localUser.id), eq(eventStaff.eventId, eventId)))
        .for("share");
      if (assignment?.role !== "organizer") throw new EventNotFoundError();

      const [current] = await tx.select().from(events)
        .where(eq(events.id, eventId)).for("update");
      if (!current) throw new EventNotFoundError();
      if (current.status !== "draft") throw new EventNotEditableError();
      if (current.version !== changes.expectedVersion) throw new EventVersionConflictError();

      const data = mergeEventChanges(current, changes);
      const [updated] = await tx.update(events).set({ ...data, version: current.version + 1 })
        .where(and(eq(events.id, eventId), eq(events.version, changes.expectedVersion), eq(events.status, "draft")))
        .returning();
      if (!updated) throw new EventVersionConflictError();
      return updated;
    });
  } catch (error) {
    // Fuera de la transacción: PostgreSQL ya revirtió la operación fallida.
    if (isSlugConflict(error)) throw new EventSlugConflictError();
    throw error;
  }
}
