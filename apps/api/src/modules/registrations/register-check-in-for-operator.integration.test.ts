import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { AuthenticationError, AuthorizationError, type AuthenticatedUser } from "../../auth/verify-access-token.js";
import { parseDatabaseConfig } from "../../config.js";
import { attendees, auditLogs, checkIns, events, eventStaff, qrCredentials, registrations, users } from "../../db/schema.js";
import { createEventForOrganizer } from "../events/create-event-for-organizer.js";
import { EventNotFoundError } from "../events/query-events-for-organizer.js";
import { issueRegistrationCredentialForOrganizer } from "./issue-registration-credential-for-organizer.js";
import { registerAttendeeForOrganizer } from "./register-attendee-for-organizer.js";
import { CheckInFailedError, CheckInNotAllowedError, registerCheckInForOperator as checkIn } from "./register-check-in-for-operator.js";

const actor = (roles: AuthenticatedUser["roles"] = ["checkin_operator"]): AuthenticatedUser => ({ tenantId: randomUUID(), objectId: randomUUID(), subject: "ignored", roles });
const subject = (a: AuthenticatedUser) => `entra:${a.tenantId}:${a.objectId}`;
describe("persistent authorized check-in", () => {
  const clients: Client[] = []; const databases: NodePgDatabase[] = [];
  const eventIds: string[] = []; const userIds: string[] = []; const registrationIds: string[] = []; const attendeeIds: string[] = [];
  let db: NodePgDatabase; let workerPid: number; let lockerPid: number;
  beforeAll(async () => {
    for (let i = 0; i < 3; i++) {
      const client = new Client({ connectionString: parseDatabaseConfig(process.env).databaseUrl, connectionTimeoutMillis: 5000, statement_timeout: 5000, query_timeout: 6000 });
      clients.push(client); await client.connect(); databases.push(drizzle(client));
    }
    db = databases[2]; workerPid = (await clients[0].query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    lockerPid = (await clients[1].query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
  });
  afterEach(async () => {
    await db.transaction(async tx => {
      if (eventIds.length) await tx.delete(auditLogs).where(inArray(auditLogs.eventId, eventIds));
      if (registrationIds.length) {
        await tx.delete(checkIns).where(inArray(checkIns.registrationId, registrationIds));
        await tx.delete(qrCredentials).where(inArray(qrCredentials.registrationId, registrationIds));
        await tx.delete(registrations).where(inArray(registrations.id, registrationIds));
      }
      if (attendeeIds.length) await tx.delete(attendees).where(inArray(attendees.id, attendeeIds));
      if (eventIds.length) { await tx.delete(eventStaff).where(inArray(eventStaff.eventId, eventIds)); await tx.delete(events).where(inArray(events.id, eventIds)); }
      if (userIds.length) await tx.delete(users).where(inArray(users.id, userIds));
    });
    eventIds.length = userIds.length = registrationIds.length = attendeeIds.length = 0;
  });
  afterAll(async () => { await Promise.all(clients.map(c => c.end())); });
  async function addOperator(eventId: string) {
    const operator = actor(); const [user] = await db.insert(users).values({ externalSubject: subject(operator) }).returning(); userIds.push(user.id);
    await db.insert(eventStaff).values({ eventId, userId: user.id, role: "checkin_operator" });
    return { operator, user };
  }
  async function fixture() {
    const owner = actor(["organizer"]);
    const event = await createEventForOrganizer(db, { name: "Check-in fixture", slug: `check-in-${randomUUID()}`, startsAt: "2027-08-27T14:00:00Z", endsAt: "2027-08-27T22:00:00Z", timezone: "America/Lima", location: "Test" }, owner); eventIds.push(event.id);
    const [ownerUser] = await db.select().from(users).where(eq(users.externalSubject, subject(owner))); userIds.push(ownerUser.id);
    const registration = await registerAttendeeForOrganizer(db, event.id, { fullName: "Synthetic check-in", email: `${randomUUID()}@example.invalid` }, owner);
    registrationIds.push(registration.id); attendeeIds.push(registration.attendee.id);
    const credential = await issueRegistrationCredentialForOrganizer(db, event.id, registration.id, owner);
    await db.update(events).set({ status: "active" }).where(eq(events.id, event.id));
    return { owner, event, registration, credential, ...await addOperator(event.id) };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  const call = (f: Fixture, connection = db) => checkIn(connection, f.event.id, f.credential.token, "qr", f.operator);
  async function empty(f: Fixture) {
    expect(await db.select().from(checkIns).where(eq(checkIns.registrationId, f.registration.id))).toEqual([]);
    expect(await db.select().from(auditLogs).where(eq(auditLogs.eventId, f.event.id))).toEqual([]);
  }
  it.each(["manual", "qr"])("persists first %s ingress and audit with real actor", async source => {
    const f = await fixture(); const before = Date.now();
    const result = await checkIn(db, f.event.id.toUpperCase(), f.credential.token, source, { ...f.operator, tenantId: f.operator.tenantId.toUpperCase(), objectId: f.operator.objectId.toUpperCase(), roles: ["organizer", "checkin_operator"] });
    expect(result.status).toBe("accepted"); if (result.status === "invalid") throw new Error("Expected accepted");
    expect(result.checkIn).toMatchObject({ registrationId: f.registration.id, performedBy: f.user.id, source });
    expect(result.checkIn.checkedInAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(result.checkIn.checkedInAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    expect(await db.select().from(checkIns).where(eq(checkIns.registrationId, f.registration.id))).toEqual([result.checkIn]);
    const audit = await db.select().from(auditLogs).where(eq(auditLogs.eventId, f.event.id));
    expect(audit).toEqual([{ id: expect.any(String), eventId: f.event.id, actorId: f.user.id, action: "check_in.accepted", entityType: "check_in", entityId: result.checkIn.id, occurredAt: result.checkIn.checkedInAt, metadata: {} }]);
    expect(JSON.stringify(result)).not.toContain(f.credential.token);
    expect((await db.select().from(events).where(eq(events.id, f.event.id)))[0].version).toBe(f.event.version);
  });
  it("preserves the original actor, time and source on another operator's retry", async () => {
    const f = await fixture(); const first = await call(f); const other = await addOperator(f.event.id);
    const second = await checkIn(db, f.event.id, f.credential.token, "manual", other.operator);
    expect(second).toEqual({ ...first, status: "duplicate" });
    expect(await db.select().from(checkIns).where(eq(checkIns.registrationId, f.registration.id))).toHaveLength(1);
    expect(await db.select().from(auditLogs).where(eq(auditLogs.eventId, f.event.id))).toHaveLength(1);
  });
  it.each(["draft", "closed", "cancelled"] as const)("rejects event %s", async status => {
    const f = await fixture(); await db.update(events).set({ status }).where(eq(events.id, f.event.id));
    await expect(call(f)).rejects.toBeInstanceOf(CheckInNotAllowedError); await empty(f);
  });
  it.each(["revoked", "expired", "timestamp", "registration", "missing", "malformed", "foreign"])("rejects %s credential without writes", async mode => {
    const f = await fixture();
    if (mode === "revoked" || mode === "expired") await db.update(qrCredentials).set({ status: mode }).where(eq(qrCredentials.id, f.credential.id));
    if (mode === "timestamp") await db.update(qrCredentials).set({ revokedAt: new Date() }).where(eq(qrCredentials.id, f.credential.id));
    if (mode === "registration") await db.update(registrations).set({ status: "cancelled" }).where(eq(registrations.id, f.registration.id));
    if (mode === "missing") f.credential.token = `oe1_${Buffer.alloc(32).toString("base64url")}`;
    if (mode === "malformed") f.credential.token += " ";
    if (mode === "foreign") { const other = await fixture(); f.credential.token = other.credential.token; }
    expect(await call(f)).toEqual({ status: "invalid" }); await empty(f);
  });
  it.each(([[], ["organizer"], ["admin"]] as AuthenticatedUser["roles"][]).map(roles => ({ roles })))("rejects global $roles", async ({ roles }) => {
    const f = await fixture(); f.operator.roles = roles; await expect(call(f)).rejects.toBeInstanceOf(AuthorizationError); await empty(f);
  });
  it.each(["organizer", "admin", "removed", "disabled", "unknown", "tenant", "missing-event"])("rejects authorization case %s", async mode => {
    const f = await fixture();
    if (mode === "organizer" || mode === "admin") await db.update(eventStaff).set({ role: mode }).where(eq(eventStaff.userId, f.user.id));
    if (mode === "removed") await db.delete(eventStaff).where(eq(eventStaff.userId, f.user.id));
    if (mode === "disabled") await db.update(users).set({ status: "disabled" }).where(eq(users.id, f.user.id));
    if (mode === "unknown") f.operator = actor();
    if (mode === "tenant") f.operator.tenantId = randomUUID();
    const eventId = mode === "missing-event" ? randomUUID() : f.event.id;
    await expect(checkIn(db, eventId, f.credential.token, "qr", f.operator)).rejects.toBeInstanceOf(mode === "disabled" ? AuthorizationError : EventNotFoundError);
    if (mode === "unknown" || mode === "tenant") expect(await db.select().from(users).where(eq(users.externalSubject, subject(f.operator)))).toEqual([]);
    await empty(f);
  });
  it.each(["event", "identity", "source"])("rejects invalid %s before database access", async mode => {
    const fake = { transaction: vi.fn() }; const operator = actor();
    await expect(checkIn(fake as unknown as NodePgDatabase, mode === "event" ? "bad" : randomUUID(), "secret", mode === "source" ? "bad" : "qr", mode === "identity" ? { ...operator, objectId: "bad" } : operator)).rejects.toBeInstanceOf(mode === "identity" ? AuthenticationError : ZodError);
    expect(fake.transaction).not.toHaveBeenCalled();
  });
  it.each(["assignment", "user", "event", "registration", "credential"])("revalidates %s before returning duplicate", async mode => {
    const f = await fixture(); await call(f);
    if (mode === "assignment") await db.delete(eventStaff).where(eq(eventStaff.userId, f.user.id));
    if (mode === "user") await db.update(users).set({ status: "disabled" }).where(eq(users.id, f.user.id));
    if (mode === "event") await db.update(events).set({ status: "closed" }).where(eq(events.id, f.event.id));
    if (mode === "registration") await db.update(registrations).set({ status: "cancelled" }).where(eq(registrations.id, f.registration.id));
    if (mode === "credential") await db.update(qrCredentials).set({ status: "revoked" }).where(eq(qrCredentials.id, f.credential.id));
    if (mode === "registration" || mode === "credential") expect(await call(f)).toEqual({ status: "invalid" });
    else await expect(call(f)).rejects.toBeInstanceOf(mode === "assignment" ? EventNotFoundError : mode === "user" ? AuthorizationError : CheckInNotAllowedError);
    expect(await db.select().from(checkIns).where(eq(checkIns.registrationId, f.registration.id))).toHaveLength(1);
    expect(await db.select().from(auditLogs).where(eq(auditLogs.eventId, f.event.id))).toHaveLength(1);
  });
  it.each(["same", "different"])("serializes simultaneous %s operators", async mode => {
    const f = await fixture(); const second = mode === "same" ? f.operator : (await addOperator(f.event.id)).operator;
    const results = await Promise.all([call(f, databases[0]), checkIn(databases[1], f.event.id, f.credential.token, "manual", second)]);
    expect(results.map(r => r.status).sort()).toEqual(["accepted", "duplicate"]);
    const [winner, loser] = results[0].status === "accepted" ? results : [results[1], results[0]];
    expect(loser).toEqual({ ...winner, status: "duplicate" });
    expect(await db.select().from(checkIns).where(eq(checkIns.registrationId, f.registration.id))).toHaveLength(1);
    expect(await db.select().from(auditLogs).where(eq(auditLogs.eventId, f.event.id))).toHaveLength(1);
  });
  async function waitForLock() {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      if ((await clients[2].query("SELECT $2::int = ANY(pg_blocking_pids($1::int)) AS blocked", [workerPid, lockerPid])).rows[0].blocked) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error("Check-in did not reach expected lock");
  }
  it("waits for an uncommitted accepted check-in, then returns its exact record", async () => {
    const f = await fixture(); let release!: () => void; let ready!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const inserted = new Promise<void>(resolve => { ready = resolve; });
    const winner = databases[1].transaction(async tx => { const result = await call(f, tx); ready(); await gate; return result; });
    void winner.catch(() => undefined);
    let pending: ReturnType<typeof checkIn> | undefined;
    try {
      await Promise.race([inserted, winner]);
      pending = call(f, databases[0]);
      void pending.catch(() => undefined);
      await waitForLock(); release(); const first = await winner;
      expect(first.status).toBe("accepted");
      expect(await pending).toEqual({ ...first, status: "duplicate" });
      expect(await db.select().from(auditLogs).where(eq(auditLogs.eventId, f.event.id))).toHaveLength(1);
    } finally { release(); await winner.catch(() => undefined); await pending?.catch(() => undefined); }
  });
  it.each(["event", "registration", "user", "assignment", "credential"])("observes concurrent %s revocation after waiting", async mode => {
    const f = await fixture(); await clients[1].query("BEGIN"); let open = true; let pending: ReturnType<typeof checkIn> | undefined;
    try {
      if (mode === "event") await clients[1].query("UPDATE event SET status = 'closed' WHERE id = $1", [f.event.id]);
      if (mode === "registration") await clients[1].query("UPDATE registration SET status = 'cancelled' WHERE id = $1", [f.registration.id]);
      if (mode === "user") await clients[1].query('UPDATE "user" SET status = \'disabled\' WHERE id = $1', [f.user.id]);
      if (mode === "assignment") await clients[1].query("DELETE FROM event_staff WHERE event_id = $1 AND user_id = $2", [f.event.id, f.user.id]);
      if (mode === "credential") await clients[1].query("UPDATE qr_credential SET status = 'revoked' WHERE id = $1", [f.credential.id]);
      pending = call(f, databases[0]); void pending.catch(() => undefined);
      await waitForLock(); await clients[1].query("COMMIT"); open = false;
      if (mode === "registration" || mode === "credential") expect(await pending).toEqual({ status: "invalid" });
      else await expect(pending).rejects.toBeInstanceOf(mode === "user" ? AuthorizationError : mode === "assignment" ? EventNotFoundError : CheckInNotAllowedError);
      await empty(f);
    } finally { if (open) await clients[1].query("ROLLBACK"); await pending?.catch(() => undefined); }
  });
  it("rolls back check-in when audit fails, sanitizes failure, then permits retry", async () => {
    const f = await fixture(); const rollback = new Error("rollback fixture");
    try {
      await db.transaction(async tx => {
        const name = `checkin_test_${randomUUID().replaceAll("-", "")}`;
        await tx.execute(sql.raw(`CREATE FUNCTION pg_temp.${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'private audit detail'; END $$`));
        await tx.execute(sql.raw(`CREATE TRIGGER ${name} AFTER INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION pg_temp.${name}()`));
        await expect(call(f, tx)).rejects.toEqual(new CheckInFailedError());
        expect(await tx.select().from(checkIns).where(eq(checkIns.registrationId, f.registration.id))).toEqual([]);
        expect(await tx.select().from(auditLogs).where(eq(auditLogs.eventId, f.event.id))).toEqual([]);
        throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
    expect((await call(f)).status).toBe("accepted");
  });
  it("does not report unexpected transaction failure as invalid or duplicate", async () => {
    const fake = { transaction: vi.fn().mockRejectedValue(new Error("private SQL and token")) };
    await expect(checkIn(fake as unknown as NodePgDatabase, randomUUID(), "secret", "qr", actor())).rejects.toEqual(new CheckInFailedError());
  });
  it.each(["repeatable read", "serializable"] as const)("rejects a parent transaction using %s", async isolationLevel => {
    const f = await fixture();
    await db.transaction(async tx => {
      await expect(call(f, tx)).rejects.toEqual(new CheckInFailedError());
    }, { isolationLevel });
    await empty(f);
  });
});
