import { randomUUID, createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { AuthenticationError, AuthorizationError, type AuthenticatedUser } from "../../auth/verify-access-token.js";
import { parseDatabaseConfig } from "../../config.js";
import { attendees, events, eventStaff, registrations, registrationCsvImports, users } from "../../db/schema.js";
import { createEventForOrganizer } from "../events/create-event-for-organizer.js";
import { EventNotFoundError } from "../events/query-events-for-organizer.js";
import { RegistrationCsvValidationError } from "./import-registration-csv-for-organizer.js";
import { EventRegistrationNotAllowedError, RegistrationEmailConflictError, registerAttendeeForOrganizer } from "./register-attendee-for-organizer.js";
import { importRegistrationCsvIdempotently as run, queryRegistrationCsvImport as lookup, RegistrationCsvKeyConflictError, RegistrationCsvStoredResultError } from "./registration-csv-idempotency.js";

describe("CSV idempotency in an isolated migrated PostgreSQL schema", () => {
  const clients: Client[] = []; const dbs: NodePgDatabase[] = []; const pids: number[] = [];
  const schema = `issue47_${randomUUID().replaceAll("-", "")}`;
  let created = false;
  beforeAll(async () => {
    for (let i = 0; i < 4; i++) {
      const c = new Client({ connectionString: parseDatabaseConfig(process.env).databaseUrl,
        connectionTimeoutMillis: 5000, statement_timeout: 5000, query_timeout: 6000 });
      clients.push(c); await c.connect(); dbs.push(drizzle(c));
      pids.push((await c.query("select pg_backend_pid() as pid")).rows[0].pid);
    }
    await clients[0].query(`CREATE SCHEMA "${schema}"`); created = true;
    for (const c of clients) await c.query(`SET search_path TO "${schema}"`);
    // Apply the actual migration chain in a disposable namespace, never public.
    for (const file of readdirSync("drizzle").filter(f => /^\d+.*\.sql$/.test(f)).sort()) {
      await clients[0].query(readFileSync(`drizzle/${file}`, "utf8").replaceAll('"public"', `"${schema}"`));
    }
  });
  afterAll(async () => {
    try {
      for (const c of clients) await c.query("ROLLBACK").catch(() => undefined);
      if (created && /^issue47_[a-f0-9]{32}$/.test(schema)) await clients[0].query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally { await Promise.all(clients.map(c => c.end())); }
  });
  function actor(): AuthenticatedUser { return { tenantId: randomUUID(), objectId: randomUUID(), subject: "csv-idempotency", roles: ["organizer"] }; }
  const subject = (a: AuthenticatedUser) => `entra:${a.tenantId.toLowerCase()}:${a.objectId.toLowerCase()}`;
  function data() { return { fullName: "Synthetic Attendee", email: `${randomUUID()}@example.invalid` }; }
  function csv(rows = [data(), data()]) { return Buffer.from("fullName,email\n" + rows.map(r => `${r.fullName},${r.email}`).join("\n")); }
  async function seed(owner = actor()) {
    const event = await createEventForOrganizer(dbs[3], { name: "CSV recovery", slug: `csv-${randomUUID()}`,
      startsAt: "2027-08-27T14:00:00Z", endsAt: "2027-08-27T22:00:00Z", timezone: "America/Lima", location: "Synthetic" }, owner);
    const [user] = await dbs[3].select().from(users).where(eq(users.externalSubject, subject(owner)));
    return { owner, event, user, key: randomUUID(), bytes: csv() };
  }
  async function counts(eventId: string, count: number, imports: number) {
    expect(await dbs[3].select().from(registrations).where(eq(registrations.eventId, eventId))).toHaveLength(count);
    expect(await dbs[3].select().from(registrationCsvImports).where(eq(registrationCsvImports.eventId, eventId))).toHaveLength(imports);
  }
  async function waitForLock(worker: number, blocker: number) {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const r = await clients[3].query("select $2::int = any(pg_blocking_pids($1::int)) as blocked", [pids[worker], pids[blocker]]);
      if (r.rows[0].blocked) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error("Expected database lock was not observed");
  }

  it("persists a versioned receipt and returns the same historical result across connections", async () => {
    const s = await seed(); const first = await run(dbs[0], s.event.id, s.key, s.bytes, s.owner);
    const second = await run(dbs[1], s.event.id.toUpperCase(), s.key.toUpperCase(), s.bytes, { ...s.owner, subject: "changed" });
    expect(second).toEqual(first);
    expect(first).toMatchObject({ importId: expect.any(String), completedAt: expect.any(Date), result: { eventId: s.event.id, count: 2 } });
    const [saved] = await dbs[3].select().from(registrationCsvImports).where(eq(registrationCsvImports.id, first.importId));
    expect(saved.contentHash).toBe(createHash("sha256").update(s.bytes).digest("hex"));
    expect(saved.result).toMatchObject({ version: 1, count: 2 });
    expect(Object.keys(saved).sort()).toEqual(["id", "eventId", "requestedBy", "idempotencyKey", "contentHash", "result", "completedAt"].sort());
    await counts(s.event.id, 2, 1);
  });
  it("recovers a confirmed operation when the first response was discarded", async () => {
    const s = await seed(); await run(dbs[0], s.event.id, s.key, s.bytes, s.owner);
    const recovered = await lookup(dbs[1], s.event.id, s.key, s.owner);
    expect(recovered.status).toBe("completed");
    if (recovered.status !== "completed") throw new Error("Missing receipt");
    expect(await run(dbs[2], s.event.id, s.key, s.bytes, s.owner)).toEqual(recovered.receipt);
    await counts(s.event.id, 2, 1);
  });
  it("retains the original snapshot after a registration is cancelled", async () => {
    const s = await seed(); const original = await run(dbs[0], s.event.id, s.key, s.bytes, s.owner);
    await dbs[3].update(registrations).set({ status: "cancelled" }).where(eq(registrations.id, original.result.items[0].id));
    expect(await lookup(dbs[1], s.event.id, s.key, s.owner)).toEqual({ status: "completed", receipt: original });
    expect(await run(dbs[0], s.event.id, s.key, s.bytes, s.owner)).toEqual(original);
  });
  it.each(["closed", "cancelled"] as const)("recovers history in %s but rejects a new import", async status => {
    const s = await seed(); const original = await run(dbs[0], s.event.id, s.key, s.bytes, s.owner);
    await dbs[3].update(events).set({ status }).where(eq(events.id, s.event.id));
    expect(await run(dbs[1], s.event.id, s.key, s.bytes, s.owner)).toEqual(original);
    expect(await lookup(dbs[2], s.event.id, s.key, s.owner)).toEqual({ status: "completed", receipt: original });
    await expect(run(dbs[1], s.event.id, randomUUID(), csv(), s.owner)).rejects.toBeInstanceOf(EventRegistrationNotAllowedError);
    await counts(s.event.id, 2, 1);
  });
  it.each(["different rows", "newline only", "invalid CSV"])("rejects different bytes for a used key: %s", async mode => {
    const s = await seed(); await run(dbs[0], s.event.id, s.key, s.bytes, s.owner);
    const other = mode === "different rows" ? csv() : mode === "invalid CSV" ? Buffer.from("bad") : Buffer.concat([s.bytes, Buffer.from("\n")]);
    await expect(run(dbs[1], s.event.id, s.key, other, s.owner)).rejects.toBeInstanceOf(RegistrationCsvKeyConflictError);
    await counts(s.event.id, 2, 1);
  });
  it("isolates equal keys by event", async () => {
    const s = await seed(); const t = await seed(s.owner);
    const a = await run(dbs[0], s.event.id, s.key, s.bytes, s.owner);
    expect(await lookup(dbs[1], t.event.id, s.key, s.owner)).toEqual({ status: "not_observed" });
    const b = await run(dbs[1], t.event.id, s.key, s.bytes, s.owner);
    expect(b.importId).not.toBe(a.importId); expect(b.result.items[0].attendee.id).not.toBe(a.result.items[0].attendee.id);
  });
  it("isolates equal keys by organizer even when both are assigned", async () => {
    const s = await seed(); const other = actor();
    const [u] = await dbs[3].insert(users).values({ externalSubject: subject(other) }).returning();
    await dbs[3].insert(eventStaff).values({ eventId: s.event.id, userId: u.id, role: "organizer" });
    const a = await run(dbs[0], s.event.id, s.key, s.bytes, s.owner);
    expect(await lookup(dbs[1], s.event.id, s.key, other)).toEqual({ status: "not_observed" });
    const b = await run(dbs[1], s.event.id, s.key, csv(), other);
    expect(b.importId).not.toBe(a.importId); await counts(s.event.id, 4, 2);
  });
  it.each(["disabled", "removed", "operator"])("rechecks current access on lookup and replay: %s", async mode => {
    const s = await seed(); await run(dbs[0], s.event.id, s.key, s.bytes, s.owner);
    if (mode === "disabled") await dbs[3].update(users).set({ status: "disabled" }).where(eq(users.id, s.user.id));
    else if (mode === "removed") await dbs[3].delete(eventStaff).where(eq(eventStaff.eventId, s.event.id));
    else await dbs[3].update(eventStaff).set({ role: "checkin_operator" }).where(eq(eventStaff.eventId, s.event.id));
    const E = mode === "disabled" ? AuthorizationError : EventNotFoundError;
    await expect(run(dbs[1], s.event.id, s.key, s.bytes, s.owner)).rejects.toBeInstanceOf(E);
    await expect(lookup(dbs[1], s.event.id, s.key, s.owner)).rejects.toBeInstanceOf(E);
  });
  it("does not expose a receipt to an unknown user or another tenant", async () => {
    const s = await seed(); await run(dbs[0], s.event.id, s.key, s.bytes, s.owner);
    for (const a of [actor(), { ...s.owner, tenantId: randomUUID() }]) {
      await expect(lookup(dbs[1], s.event.id, s.key, a)).rejects.toBeInstanceOf(EventNotFoundError);
      await expect(run(dbs[1], s.event.id, s.key, csv(), a)).rejects.toBeInstanceOf(EventNotFoundError);
    }
  });
  it.each([[], ["admin"], ["checkin_operator"]])("requires organizer role %j", async (...roles) => {
    const s = await seed(); const a = { ...s.owner, roles: roles as AuthenticatedUser["roles"] };
    await expect(run(dbs[0], s.event.id, s.key, s.bytes, a)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(lookup(dbs[0], s.event.id, s.key, a)).rejects.toBeInstanceOf(AuthorizationError);
  });
  it("validates identity and key without creating a receipt", async () => {
    const s = await seed();
    await expect(run(dbs[0], s.event.id, "bad-key", s.bytes, s.owner)).rejects.toBeInstanceOf(ZodError);
    await expect(lookup(dbs[0], s.event.id, "bad-key", s.owner)).rejects.toBeInstanceOf(ZodError);
    await expect(run(dbs[0], s.event.id, s.key, s.bytes, { ...s.owner, objectId: "bad" })).rejects.toBeInstanceOf(AuthenticationError);
    await counts(s.event.id, 0, 0);
  });
  it.each(["", "fullName,email\nName,bad", "fullName,email\nA,a@example.invalid\nB,a@example.invalid"])("does not reserve a key for invalid CSV %j", async value => {
    const s = await seed();
    await expect(run(dbs[0], s.event.id, s.key, Buffer.from(value), s.owner)).rejects.toBeInstanceOf(RegistrationCsvValidationError);
    await counts(s.event.id, 0, 0);
    expect((await run(dbs[0], s.event.id, s.key, s.bytes, s.owner)).result.count).toBe(2);
  });
  it("does not infer success from preexisting email; key remains reusable after rollback", async () => {
    const s = await seed(); const row = data(); await registerAttendeeForOrganizer(dbs[0], s.event.id, row, s.owner);
    await expect(run(dbs[0], s.event.id, s.key, csv([data(), row]), s.owner)).rejects.toBeInstanceOf(RegistrationEmailConflictError);
    await counts(s.event.id, 1, 0);
    await run(dbs[0], s.event.id, s.key, s.bytes, s.owner); await counts(s.event.id, 3, 1);
  });
  it("rolls back inscriptions and profiles when receipt insertion fails", async () => {
    const s = await seed(); const rows = [data(), data()];
    await clients[0].query(`ALTER TABLE registration_csv_import ADD CONSTRAINT receipt_failure CHECK (idempotency_key <> '${s.key}'::uuid) NOT VALID`);
    try {
      await expect(run(dbs[1], s.event.id, s.key, csv(rows), s.owner)).rejects.toMatchObject({ cause: { code: "23514" } });
      await counts(s.event.id, 0, 0);
      for (const r of rows) expect(await dbs[3].select().from(attendees).where(eq(attendees.email, r.email))).toEqual([]);
    } finally { await clients[0].query("ALTER TABLE registration_csv_import DROP CONSTRAINT receipt_failure"); }
  });
  it("does not expose uncommitted history and replays after the first transaction commits", async () => {
    const s = await seed(); let pending: ReturnType<typeof run> | undefined;
    try {
      const first = await dbs[0].transaction(async tx => {
        const result = await run(tx, s.event.id, s.key, s.bytes, s.owner);
        expect(await lookup(dbs[2], s.event.id, s.key, s.owner)).toEqual({ status: "not_observed" });
        pending = run(dbs[1], s.event.id, s.key, s.bytes, s.owner); void pending.catch(() => undefined);
        await waitForLock(1, 0); return result;
      });
      expect(await pending).toEqual(first); await counts(s.event.id, 2, 1);
    } finally { await pending?.catch(() => undefined); }
  });
  it("allows a waiting request to become the importer after the first rolls back", async () => {
    const s = await seed(); let pending: ReturnType<typeof run> | undefined;
    const rollback = new Error("deliberate rollback"); let originalId: string | undefined;
    try {
      await expect(dbs[0].transaction(async tx => {
        originalId = (await run(tx, s.event.id, s.key, s.bytes, s.owner)).importId;
        pending = run(dbs[1], s.event.id, s.key, s.bytes, s.owner); void pending.catch(() => undefined);
        await waitForLock(1, 0); throw rollback;
      })).rejects.toBe(rollback);
      expect((await pending)?.importId).not.toBe(originalId); await counts(s.event.id, 2, 1);
    } finally { await pending?.catch(() => undefined); }
  });
  it("rejects a concurrent different payload after the winner commits", async () => {
    const s = await seed(); let pending: ReturnType<typeof run> | undefined;
    try {
      await dbs[0].transaction(async tx => {
        await run(tx, s.event.id, s.key, s.bytes, s.owner);
        pending = run(dbs[1], s.event.id, s.key, csv(), s.owner); void pending.catch(() => undefined);
        await waitForLock(1, 0);
      });
      await expect(pending).rejects.toBeInstanceOf(RegistrationCsvKeyConflictError); await counts(s.event.id, 2, 1);
    } finally { await pending?.catch(() => undefined); }
  });
  it("copies bytes before waiting so caller mutation cannot change the imported content", async () => {
    const s = await seed(); const bytes = Buffer.from(s.bytes); const expectedHash = createHash("sha256").update(bytes).digest("hex");
    const pending = run(dbs[0], s.event.id, s.key, bytes, s.owner); bytes.fill(0);
    const result = await pending;
    const [saved] = await dbs[3].select().from(registrationCsvImports).where(eq(registrationCsvImports.id, result.importId));
    expect(saved.contentHash).toBe(expectedHash); expect(result.result.count).toBe(2);
  });
  it("fails closed on a corrupt stored snapshot without exposing its content", async () => {
    const s = await seed(); const receipt = await run(dbs[0], s.event.id, s.key, s.bytes, s.owner);
    await dbs[3].update(registrationCsvImports).set({ result: { secret: "must not appear" } }).where(eq(registrationCsvImports.id, receipt.importId));
    await expect(lookup(dbs[0], s.event.id, s.key, s.owner)).rejects.toBeInstanceOf(RegistrationCsvStoredResultError);
    await expect(run(dbs[0], s.event.id, s.key, s.bytes, s.owner)).rejects.toMatchObject({ message: "No se pudo recuperar el resultado de la importación." });
    await counts(s.event.id, 2, 1);
  });
  it("rejects unsupported parent isolation instead of using a stale snapshot", async () => {
    const s = await seed();
    await expect(dbs[0].transaction(tx => run(tx, s.event.id, s.key, s.bytes, s.owner),
      { isolationLevel: "repeatable read" })).rejects.toThrow("READ COMMITTED");
    await counts(s.event.id, 0, 0);
  });
  it("migration enforces scoped key uniqueness and hash format", async () => {
    const s = await seed(); const r = await run(dbs[0], s.event.id, s.key, s.bytes, s.owner);
    const [saved] = await dbs[3].select().from(registrationCsvImports).where(eq(registrationCsvImports.id, r.importId));
    await expect(dbs[1].insert(registrationCsvImports).values({ ...saved, id: randomUUID() }))
      .rejects.toMatchObject({ cause: { code: "23505", constraint: "registration_csv_import_scope_key_unique" } });
    await expect(dbs[1].insert(registrationCsvImports).values({ ...saved, id: randomUUID(), idempotencyKey: randomUUID(), contentHash: "bad" }))
      .rejects.toMatchObject({ cause: { code: "23514", constraint: "registration_csv_import_hash_check" } });
    expect(await dbs[3].select().from(registrationCsvImports).where(and(eq(registrationCsvImports.eventId, s.event.id), eq(registrationCsvImports.requestedBy, s.user.id)))).toHaveLength(1);
  });
  it("enforces the byte limit before attempting storage", async () => {
    const s = await seed();
    await expect(run(dbs[0], s.event.id, s.key, Buffer.alloc(1_048_577), s.owner))
      .rejects.toMatchObject({ code: "INVALID_REGISTRATION_CSV", result: { errors: [expect.objectContaining({ code: "FILE_TOO_LARGE" })] } });
    await counts(s.event.id, 0, 0);
  });
  it("accepts active events and normalized tenant/object UUIDs", async () => {
    const s = await seed(); await dbs[3].update(events).set({ status: "active" }).where(eq(events.id, s.event.id));
    const a = { ...s.owner, tenantId: s.owner.tenantId.toUpperCase(), objectId: s.owner.objectId.toUpperCase() };
    const r = await run(dbs[0], s.event.id, s.key, s.bytes, a);
    expect(await lookup(dbs[1], s.event.id, s.key, s.owner)).toEqual({ status: "completed", receipt: r });
  });
  it("different keys do not bypass email uniqueness under concurrency", async () => {
    const s = await seed();
    const results = await Promise.allSettled([run(dbs[0], s.event.id, s.key, s.bytes, s.owner),
      run(dbs[1], s.event.id, randomUUID(), s.bytes, s.owner)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")[0].reason).toBeInstanceOf(RegistrationEmailConflictError);
    await counts(s.event.id, 2, 1);
  });
  it.each(["disabled", "removed"])("recovery waits for an earlier concurrent access revocation: %s", async mode => {
    const s = await seed(); await run(dbs[0], s.event.id, s.key, s.bytes, s.owner);
    let pending: ReturnType<typeof lookup> | undefined;
    try {
      await dbs[0].transaction(async tx => {
        if (mode === "disabled") await tx.update(users).set({ status: "disabled" }).where(eq(users.id, s.user.id));
        else await tx.delete(eventStaff).where(eq(eventStaff.eventId, s.event.id));
        pending = lookup(dbs[1], s.event.id, s.key, s.owner); void pending.catch(() => undefined);
        await waitForLock(1, 0);
      });
      await expect(pending).rejects.toBeInstanceOf(mode === "disabled" ? AuthorizationError : EventNotFoundError);
    } finally { await pending?.catch(() => undefined); }
  });
});
