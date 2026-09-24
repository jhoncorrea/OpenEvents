import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";
import { AuthenticationError, AuthorizationError, requireAnyRole, type AuthenticatedUser } from "../../auth/verify-access-token.js";
import { auditLogs, events, eventStaff, users } from "../../db/schema.js";
import { parseEventId } from "./event-query-input.js";
import { parseEventLifecycleInput } from "./event-lifecycle-input.js";
import { EventNotFoundError, type QueriedEvent } from "./query-events-for-organizer.js";

export class EventTransitionNotAllowedError extends Error {
  readonly code = "EVENT_TRANSITION_NOT_ALLOWED";
  constructor() { super("El estado actual no permite esta transición."); this.name = "EventTransitionNotAllowedError"; }
}
export class EventLifecycleVersionConflictError extends Error {
  readonly code = "EVENT_VERSION_CONFLICT";
  constructor() { super("El evento cambió. Consulta su versión actual antes de continuar."); this.name = "EventLifecycleVersionConflictError"; }
}
export class EventLifecycleFailedError extends Error {
  readonly code = "EVENT_LIFECYCLE_FAILED";
  constructor() { super("No se pudo confirmar el cambio de estado del evento."); this.name = "EventLifecycleFailedError"; }
}
const identitySchema = z.object({ tenantId: z.string().uuid(), objectId: z.string().uuid() });

async function transition(db: NodePgDatabase, eventIdInput: unknown, input: unknown, actor: AuthenticatedUser,
  action: "activate" | "close"): Promise<QueriedEvent> {
  requireAnyRole(actor, ["organizer"]);
  const identity = identitySchema.safeParse(actor);
  if (!identity.success) throw new AuthenticationError();
  const subject = `entra:${identity.data.tenantId.toLowerCase()}:${identity.data.objectId.toLowerCase()}`;
  const eventId = parseEventId(eventIdInput);
  const { expectedVersion } = parseEventLifecycleInput(input);
  const from = action === "activate" ? "draft" : "active";
  const to = action === "activate" ? "active" : "closed";
  try {
    return await db.transaction(async tx => {
      const isolation = await tx.execute(sql`SHOW transaction_isolation`);
      if (isolation.rows[0]?.transaction_isolation !== "read committed") throw new EventLifecycleFailedError();
      // Orden compartido con edición/check-in: usuario, asignación y evento.
      const [user] = await tx.select({ id: users.id, status: users.status }).from(users)
        .where(eq(users.externalSubject, subject)).for("share");
      if (!user) throw new EventNotFoundError();
      if (user.status !== "active") throw new AuthorizationError();
      const [assignment] = await tx.select({ role: eventStaff.role }).from(eventStaff)
        .where(and(eq(eventStaff.eventId, eventId), eq(eventStaff.userId, user.id))).for("share");
      if (assignment?.role !== "organizer") throw new EventNotFoundError();
      const [current] = await tx.select().from(events).where(eq(events.id, eventId)).for("update");
      if (!current) throw new EventNotFoundError();
      // Estado antes de versión, como en edición: repetir no es éxito silencioso.
      if (current.status !== from) throw new EventTransitionNotAllowedError();
      if (current.version !== expectedVersion) throw new EventLifecycleVersionConflictError();
      const [updated] = await tx.update(events).set({ status: to, version: current.version + 1 })
        .where(and(eq(events.id, eventId), eq(events.status, from), eq(events.version, expectedVersion))).returning();
      if (!updated) throw new EventLifecycleVersionConflictError();
      await tx.insert(auditLogs).values({ eventId, actorId: user.id, action: action === "activate" ? "event.activated" : "event.closed",
        entityType: "event", entityId: eventId, occurredAt: sql`clock_timestamp()`,
        metadata: { fromStatus: from, toStatus: to, fromVersion: current.version, toVersion: updated.version } });
      return updated;
    }, { isolationLevel: "read committed" });
  } catch (error) {
    if (error instanceof EventNotFoundError || error instanceof AuthorizationError ||
      error instanceof EventTransitionNotAllowedError || error instanceof EventLifecycleVersionConflictError) throw error;
    // Sin cause, SQL ni datos de la fila en errores técnicos.
    throw new EventLifecycleFailedError();
  }
}

export function activateEventForOrganizer(db: NodePgDatabase, eventId: unknown, input: unknown, actor: AuthenticatedUser): Promise<QueriedEvent> {
  return transition(db, eventId, input, actor, "activate");
}
export function closeEventForOrganizer(db: NodePgDatabase, eventId: unknown, input: unknown, actor: AuthenticatedUser): Promise<QueriedEvent> {
  return transition(db, eventId, input, actor, "close");
}
