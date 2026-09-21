import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";
import { AuthenticationError, AuthorizationError, requireAnyRole, type AuthenticatedUser } from "../../auth/verify-access-token.js";
import { users, eventStaff, events, registrationCsvImports } from "../../db/schema.js";
import { parseEventId } from "../events/event-query-input.js";
import { EventNotFoundError } from "../events/query-events-for-organizer.js";
import { importRegistrationCsvForOrganizer, RegistrationCsvValidationError, type RegistrationCsvImportResult } from "./import-registration-csv-for-organizer.js";
import { validateRegistrationCsv } from "./validate-registration-csv.js";

export class RegistrationCsvKeyConflictError extends Error {
  readonly code = "REGISTRATION_CSV_KEY_CONFLICT";
  constructor() {
    super("La clave de importación ya se utilizó con otro contenido.");
    this.name = "RegistrationCsvKeyConflictError";
  }
}
export class RegistrationCsvStoredResultError extends Error {
  readonly code = "INVALID_STORED_REGISTRATION_CSV_RESULT";
  constructor() {
    super("No se pudo recuperar el resultado de la importación.");
    this.name = "RegistrationCsvStoredResultError";
  }
}
export interface RegistrationCsvReceipt {
  importId: string;
  completedAt: Date;
  /** Resultado histórico de la operación; no es el estado actual de las inscripciones. */
  result: RegistrationCsvImportResult;
}
export type RegistrationCsvLookup =
  | { status: "completed"; receipt: RegistrationCsvReceipt }
  | { status: "not_observed" };

const uuid = z.string().uuid();
const identity = z.object({ tenantId: uuid, objectId: uuid });
function scope(eventIdInput: unknown, keyInput: unknown, actor: AuthenticatedUser) {
  requireAnyRole(actor, ["organizer"]);
  const parsed = identity.safeParse(actor);
  if (!parsed.success) throw new AuthenticationError();
  return {
    eventId: parseEventId(eventIdInput), key: uuid.parse(keyInput).toLowerCase(),
    subject: `entra:${parsed.data.tenantId.toLowerCase()}:${parsed.data.objectId.toLowerCase()}`,
  };
}
async function authorize(tx: NodePgDatabase, target: ReturnType<typeof scope>) {
  const [user] = await tx.select({ id: users.id, status: users.status }).from(users)
    .where(eq(users.externalSubject, target.subject)).for("share");
  if (!user) throw new EventNotFoundError();
  if (user.status !== "active") throw new AuthorizationError();
  const [assignment] = await tx.select({ role: eventStaff.role }).from(eventStaff)
    .where(and(eq(eventStaff.userId, user.id), eq(eventStaff.eventId, target.eventId))).for("share");
  if (assignment?.role !== "organizer") throw new EventNotFoundError();
  const [event] = await tx.select({ id: events.id }).from(events).where(eq(events.id, target.eventId)).for("share");
  if (!event) throw new EventNotFoundError();
  return user.id;
}
function matching(target: ReturnType<typeof scope>, requestedBy: string) {
  return and(eq(registrationCsvImports.eventId, target.eventId), eq(registrationCsvImports.requestedBy, requestedBy),
    eq(registrationCsvImports.idempotencyKey, target.key));
}
const storedSchema = z.object({
  version: z.literal(1), eventId: uuid, count: z.number().int().min(1).max(500),
  items: z.array(z.object({
    id: uuid, eventId: uuid, status: z.literal("confirmed"), source: z.literal("csv"), createdAt: z.iso.datetime(),
    attendee: z.object({ id: uuid, fullName: z.string().min(1).max(200), email: z.string().min(1).max(254) }).strict(),
  }).strict()).min(1).max(500),
}).strict();
function receipt(row: typeof registrationCsvImports.$inferSelect): RegistrationCsvReceipt {
  const parsed = storedSchema.safeParse(row.result);
  if (!parsed.success) throw new RegistrationCsvStoredResultError();
  const data = parsed.data;
  if (data.eventId !== row.eventId || data.count !== data.items.length
    || data.items.some(item => item.eventId !== row.eventId)
    || new Set(data.items.map(item => item.id)).size !== data.count
    || new Set(data.items.map(item => item.attendee.id)).size !== data.count) throw new RegistrationCsvStoredResultError();
  return { importId: row.id, completedAt: row.completedAt,
    result: { eventId: data.eventId, count: data.count, items: data.items.map(item => ({ ...item, createdAt: new Date(item.createdAt) })) } };
}

/** Sin reintentos automáticos. Clave UUID; contenido identificado por SHA-256 de los bytes exactos. */
export async function importRegistrationCsvIdempotently(
  db: NodePgDatabase, eventIdInput: unknown, keyInput: unknown, bytes: Uint8Array, actor: AuthenticatedUser,
): Promise<RegistrationCsvReceipt> {
  const target = scope(eventIdInput, keyInput, actor);
  // Acotar antes del hash/copia; un archivo excesivo nunca requiere hash ni acceso a datos.
  const validation = validateRegistrationCsv(bytes);
  if (!validation.valid && validation.errors[0]?.code === "FILE_TOO_LARGE") throw new RegistrationCsvValidationError(validation);
  const contentHash = createHash("sha256").update(bytes).digest("hex");
  const input = Uint8Array.from(bytes);
  return db.transaction(async tx => {
    // El siguiente SELECT debe observar el commit del ganador tras esperar el lock.
    const isolation = await tx.execute<{ isolation: string }>(sql`select current_setting('transaction_isolation') as isolation`);
    if (isolation.rows[0].isolation !== "read committed") throw new Error("La importación idempotente requiere READ COMMITTED.");
    const requestedBy = await authorize(tx, target);
    const lockKey = `registration-csv:v1:${target.eventId}:${requestedBy}:${target.key}`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
    const [existing] = await tx.select().from(registrationCsvImports).where(matching(target, requestedBy));
    if (existing) {
      if (existing.contentHash !== contentHash) throw new RegistrationCsvKeyConflictError();
      return receipt(existing);
    }
    if (!validation.valid) throw new RegistrationCsvValidationError(validation);
    // SAVEPOINT del servicio existente dentro de esta transacción: no confirma por separado.
    const result = await importRegistrationCsvForOrganizer(tx, target.eventId, input, actor);
    const stored = { version: 1, ...result, items: result.items.map(item => ({ ...item, createdAt: item.createdAt.toISOString() })) };
    const [saved] = await tx.insert(registrationCsvImports).values({
      eventId: target.eventId, requestedBy, idempotencyKey: target.key, contentHash, result: stored,
    }).returning();
    return receipt(saved);
  }, { isolationLevel: "read committed" });
}

/** No espera operaciones no confirmadas. not_observed no acredita fallo ni permiso para cambiar la clave. */
export async function queryRegistrationCsvImport(
  db: NodePgDatabase, eventIdInput: unknown, keyInput: unknown, actor: AuthenticatedUser,
): Promise<RegistrationCsvLookup> {
  const target = scope(eventIdInput, keyInput, actor);
  return db.transaction(async tx => {
    const requestedBy = await authorize(tx, target);
    const [row] = await tx.select().from(registrationCsvImports).where(matching(target, requestedBy));
    return row ? { status: "completed", receipt: receipt(row) } : { status: "not_observed" };
  }, { isolationLevel: "read committed" });
}
