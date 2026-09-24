import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { AuthenticationError, AuthorizationError, type AuthenticatedUser } from "../../auth/verify-access-token.js";
import { parseDatabaseConfig } from "../../config.js";
import { attendees, auditLogs, checkIns, events, eventStaff, qrCredentials, registrations, users } from "../../db/schema.js";
import { createEventForOrganizer } from "./create-event-for-organizer.js";
import { EventNotFoundError } from "./query-events-for-organizer.js";
import { editEventForOrganizer, EventNotEditableError } from "./edit-event-for-organizer.js";
import { issueRegistrationCredentialForOrganizer } from "../registrations/issue-registration-credential-for-organizer.js";
import { registerAttendeeForOrganizer } from "../registrations/register-attendee-for-organizer.js";
import { registerCheckInForOperator, CheckInNotAllowedError } from "../registrations/register-check-in-for-operator.js";
import { activateEventForOrganizer as activate, closeEventForOrganizer as close, EventLifecycleFailedError, EventLifecycleVersionConflictError, EventTransitionNotAllowedError } from "./change-event-state-for-organizer.js";

const actor = (roles: AuthenticatedUser["roles"] = ["organizer"]): AuthenticatedUser => ({ tenantId: randomUUID(), objectId: randomUUID(), subject: "ignored", roles });
const subject = (a: AuthenticatedUser) => `entra:${a.tenantId}:${a.objectId}`;
describe("event lifecycle persistence and concurrency", () => {
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
  async function fixture() {
    const owner = actor();
    const event = await createEventForOrganizer(db, { name: "Lifecycle fixture", slug: `lifecycle-${randomUUID()}`, startsAt: "2027-08-27T14:00:00Z", endsAt: "2027-08-27T22:00:00Z", timezone: "America/Lima", location: "Test" }, owner); eventIds.push(event.id);
    const [user] = await db.select().from(users).where(eq(users.externalSubject, subject(owner))); userIds.push(user.id);
    const registration = await registerAttendeeForOrganizer(db, event.id, { fullName: "Synthetic lifecycle", email: `${randomUUID()}@example.invalid` }, owner);
    registrationIds.push(registration.id); attendeeIds.push(registration.attendee.id);
    const credential = await issueRegistrationCredentialForOrganizer(db, event.id, registration.id, owner);
    const operator = actor(["checkin_operator"]); const [operatorUser] = await db.insert(users).values({ externalSubject: subject(operator) }).returning(); userIds.push(operatorUser.id);
    await db.insert(eventStaff).values({ eventId: event.id, userId: operatorUser.id, role: "checkin_operator" });
    return { owner, event, user, registration, credential, operator };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  const modes = [{ name: "activate", op: activate, from: "draft" as const, to: "active" as const }, { name: "close", op: close, from: "active" as const, to: "closed" as const }];
  const current = async (f: Fixture) => (await db.select().from(events).where(eq(events.id, f.event.id)))[0];
  const audits = (f: Fixture) => db.select().from(auditLogs).where(eq(auditLogs.eventId, f.event.id));
  const ingress = (connection: NodePgDatabase, f: Fixture) => registerCheckInForOperator(connection, f.event.id, f.credential.token, "qr", f.operator);
  it("activates, accepts ingress, closes and retains all related records", async () => {
    const f = await fixture(); const registrationBefore = await db.select().from(registrations).where(eq(registrations.id, f.registration.id));
    const credentialBefore = await db.select().from(qrCredentials).where(eq(qrCredentials.id, f.credential.id));
    const activated = await activate(db, f.event.id.toUpperCase(), { expectedVersion: 1 }, { ...f.owner, tenantId: f.owner.tenantId.toUpperCase(), objectId: f.owner.objectId.toUpperCase(), subject: "changed", roles: ["organizer", "admin", "checkin_operator"] });
    expect(activated).toEqual({ ...f.event, status: "active", version: 2 });
    expect((await ingress(db, f)).status).toBe("accepted");
    const before = await db.select().from(checkIns).where(eq(checkIns.registrationId, f.registration.id));
    expect(await close(db, f.event.id, { expectedVersion: 2 }, f.owner)).toEqual({ ...f.event, status: "closed", version: 3 });
    await expect(ingress(db, f)).rejects.toBeInstanceOf(CheckInNotAllowedError);
    expect(await db.select().from(checkIns).where(eq(checkIns.registrationId, f.registration.id))).toEqual(before);
    expect(await db.select().from(registrations).where(eq(registrations.id, f.registration.id))).toEqual(registrationBefore);
    expect(await db.select().from(qrCredentials).where(eq(qrCredentials.id, f.credential.id))).toEqual(credentialBefore);
    const rows = (await audits(f)).filter(row => row.entityType === "event").sort((a,b) => a.action.localeCompare(b.action));
    expect(rows).toHaveLength(2);
    expect(rows.map(({ action, actorId, entityId, metadata }) => ({ action, actorId, entityId, metadata }))).toEqual([
      { action: "event.activated", actorId: f.user.id, entityId: f.event.id, metadata: { fromStatus: "draft", toStatus: "active", fromVersion: 1, toVersion: 2 } },
      { action: "event.closed", actorId: f.user.id, entityId: f.event.id, metadata: { fromStatus: "active", toStatus: "closed", fromVersion: 2, toVersion: 3 } },
    ]);
  });
  describe.each(modes)("$name", ({ op, from, to }) => {
    it.each(["draft", "active", "closed", "cancelled"] as const)("enforces transition from %s and state precedence", async status => {
      const f = await fixture(); await db.update(events).set({ status }).where(eq(events.id, f.event.id)); const before = await current(f);
      if (status === from) {
        expect(await op(db, f.event.id, { expectedVersion: 1 }, f.owner)).toEqual({ ...before, status: to, version: 2 }); expect(await audits(f)).toHaveLength(1);
      } else {
        await expect(op(db, f.event.id, { expectedVersion: 9 }, f.owner)).rejects.toBeInstanceOf(EventTransitionNotAllowedError);
        expect(await current(f)).toEqual(before); expect(await audits(f)).toEqual([]);
      }
    });
    it("rejects stale version without writes", async () => {
      const f = await fixture(); await db.update(events).set({ status: from }).where(eq(events.id, f.event.id)); const before = await current(f);
      await expect(op(db, f.event.id, { expectedVersion: 2 }, f.owner)).rejects.toBeInstanceOf(EventLifecycleVersionConflictError);
      expect(await current(f)).toEqual(before); expect(await audits(f)).toEqual([]);
    });
    it("increments the last supported input version without overflow", async () => {
      const f = await fixture(); await db.update(events).set({ status: from, version: 2_147_483_646 }).where(eq(events.id, f.event.id));
      expect((await op(db, f.event.id, { expectedVersion: 2_147_483_646 }, f.owner)).version).toBe(2_147_483_647);
    });
    it.each([{ roles: [] }, { roles: ["admin"] }, { roles: ["checkin_operator"] }])("denies global roles $roles", async ({ roles }) => {
      const f = await fixture();
      await expect(op(db, f.event.id, { expectedVersion: 1 }, { ...f.owner, roles: roles as AuthenticatedUser["roles"] })).rejects.toBeInstanceOf(AuthorizationError);
      expect(await current(f)).toEqual(f.event); expect(await audits(f)).toEqual([]);
    });
    it.each(["disabled", "removed", "operator", "admin", "unknown", "tenant", "missing-event"])("denies authorization case %s", async mode => {
      const f = await fixture();
      if (mode === "disabled") await db.update(users).set({ status: "disabled" }).where(eq(users.id, f.user.id));
      if (mode === "removed") await db.delete(eventStaff).where(eq(eventStaff.userId, f.user.id));
      if (mode === "operator" || mode === "admin") await db.update(eventStaff).set({ role: mode === "operator" ? "checkin_operator" : "admin" }).where(eq(eventStaff.userId, f.user.id));
      if (mode === "unknown") f.owner.objectId = randomUUID();
      if (mode === "tenant") f.owner.tenantId = randomUUID();
      await expect(op(db, mode === "missing-event" ? randomUUID() : f.event.id, { expectedVersion: 1 }, f.owner)).rejects.toBeInstanceOf(mode === "disabled" ? AuthorizationError : EventNotFoundError);
      if (mode === "unknown" || mode === "tenant") expect(await db.select().from(users).where(eq(users.externalSubject, subject(f.owner)))).toEqual([]);
      expect(await current(f)).toEqual(f.event); expect(await audits(f)).toEqual([]);
    });
    it.each(["identity", "event", "input"])("validates %s before database access", async field => {
      const fake = { transaction: vi.fn() }; const owner = actor();
      await expect(op(fake as unknown as NodePgDatabase, field === "event" ? "bad" : randomUUID(), field === "input" ? { expectedVersion: "1" } : { expectedVersion: 1 }, field === "identity" ? { ...owner, objectId: "bad" } : owner)).rejects.toBeInstanceOf(field === "identity" ? AuthenticationError : ZodError);
      expect(fake.transaction).not.toHaveBeenCalled();
    });
    it.each(["repeatable read", "serializable"] as const)("rejects outer isolation %s", async isolationLevel => {
      const f = await fixture(); await db.transaction(async tx => {
        await expect(op(tx, f.event.id, { expectedVersion: 1 }, f.owner)).rejects.toEqual(new EventLifecycleFailedError());
      }, { isolationLevel }); expect(await current(f)).toEqual(f.event); expect(await audits(f)).toEqual([]);
    });
    it("rolls back state, version and audit on audit failure", async () => {
      const f = await fixture(); await db.update(events).set({ status: from }).where(eq(events.id, f.event.id)); const before = await current(f); const rollback = new Error("rollback fixture");
      try { await db.transaction(async tx => {
        const name = `lifecycle_test_${randomUUID().replaceAll("-", "")}`;
        await tx.execute(sql.raw(`CREATE FUNCTION pg_temp.${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'private detail'; END $$`));
        await tx.execute(sql.raw(`CREATE TRIGGER ${name} AFTER INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION pg_temp.${name}()`));
        await expect(op(tx, f.event.id, { expectedVersion: 1 }, f.owner)).rejects.toEqual(new EventLifecycleFailedError());
        expect((await tx.select().from(events).where(eq(events.id, f.event.id)))[0]).toEqual(before);
        expect(await tx.select().from(auditLogs).where(eq(auditLogs.eventId, f.event.id))).toEqual([]); throw rollback;
      }); } catch (error) { if (error !== rollback) throw error; }
      expect((await op(db, f.event.id, { expectedVersion: 1 }, f.owner)).status).toBe(to);
    });
    it("sanitizes unexpected database failures without a cause", async () => {
      const fake = { transaction: vi.fn().mockRejectedValue(new Error("private SQL")) };
      await expect(op(fake as unknown as NodePgDatabase, randomUUID(), { expectedVersion: 1 }, actor())).rejects.toEqual(new EventLifecycleFailedError());
    });
    it("serializes repeated transitions with one audit", async () => {
      const f = await fixture(); await db.update(events).set({ status: from }).where(eq(events.id, f.event.id));
      const result = await ordered(tx => op(tx, f.event.id, { expectedVersion: 1 }, f.owner), tx => op(tx, f.event.id, { expectedVersion: 1 }, f.owner));
      expect(result.leader).toMatchObject({ status: to, version: 2 });
      expect(result.follower).toMatchObject({ status: "rejected", reason: expect.any(EventTransitionNotAllowedError) });
      expect(await audits(f)).toHaveLength(1); expect((await current(f)).version).toBe(2);
    });
    it.each(["disabled", "removed", "role"])("observes concurrent permission change %s", async mode => {
      const f = await fixture(); await db.update(events).set({ status: from }).where(eq(events.id, f.event.id));
      await clients[1].query("BEGIN"); let open = true; let pending: ReturnType<typeof op> | undefined;
      try {
        if (mode === "disabled") await clients[1].query('UPDATE "user" SET status = \'disabled\' WHERE id = $1', [f.user.id]);
        if (mode === "removed") await clients[1].query("DELETE FROM event_staff WHERE event_id = $1 AND user_id = $2", [f.event.id, f.user.id]);
        if (mode === "role") await clients[1].query("UPDATE event_staff SET role = 'checkin_operator' WHERE event_id = $1 AND user_id = $2", [f.event.id, f.user.id]);
        pending = op(databases[0], f.event.id, { expectedVersion: 1 }, f.owner); void pending.catch(() => undefined);
        await waitForLock(); await clients[1].query("COMMIT"); open = false;
        await expect(pending).rejects.toBeInstanceOf(mode === "disabled" ? AuthorizationError : EventNotFoundError);
        expect(await audits(f)).toEqual([]); expect(await current(f)).toEqual({ ...f.event, status: from });
      } finally { if (open) await clients[1].query("ROLLBACK"); await pending?.catch(() => undefined); }
    });
  });
  async function waitForLock() {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      if ((await clients[2].query("SELECT $2::int = ANY(pg_blocking_pids($1::int)) AS blocked", [workerPid, lockerPid])).rows[0].blocked) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error("Lifecycle operation did not reach expected lock");
  }
  async function ordered(leaderOp: (tx: NodePgDatabase) => Promise<unknown>, followerOp: (tx: NodePgDatabase) => Promise<unknown>) {
    let release!: () => void; let ready!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; }); const inserted = new Promise<void>(resolve => { ready = resolve; });
    const leader = databases[1].transaction(async tx => { const result = await leaderOp(tx); ready(); await gate; return result; }); void leader.catch(() => undefined);
    let follower: Promise<unknown> | undefined;
    try {
      await Promise.race([inserted, leader]); follower = followerOp(databases[0]); void follower.catch(() => undefined);
      await waitForLock(); release(); const first = await leader;
      return { leader: first, follower: (await Promise.allSettled([follower]))[0] };
    } finally { release(); await leader.catch(() => undefined); await follower?.catch(() => undefined); }
  }
  it("allows an already locked ingress to finish before closing", async () => {
    const f = await fixture(); await activate(db, f.event.id, { expectedVersion: 1 }, f.owner);
    const result = await ordered(tx => ingress(tx, f), tx => close(tx, f.event.id, { expectedVersion: 2 }, f.owner));
    expect(result.leader).toMatchObject({ status: "accepted" }); expect(result.follower).toMatchObject({ status: "fulfilled", value: { status: "closed", version: 3 } });
    expect(await db.select().from(checkIns).where(eq(checkIns.registrationId, f.registration.id))).toHaveLength(1);
    expect((await audits(f)).map(r => r.action).sort()).toEqual(["check_in.accepted", "event.activated", "event.closed"]);
  });
  it("rejects an ingress waiting behind a committed close", async () => {
    const f = await fixture(); await activate(db, f.event.id, { expectedVersion: 1 }, f.owner);
    const result = await ordered(tx => close(tx, f.event.id, { expectedVersion: 2 }, f.owner), tx => ingress(tx, f));
    expect(result.leader).toMatchObject({ status: "closed" }); expect(result.follower).toMatchObject({ status: "rejected", reason: expect.any(CheckInNotAllowedError) });
    expect(await db.select().from(checkIns).where(eq(checkIns.registrationId, f.registration.id))).toEqual([]);
    expect((await audits(f)).map(r => r.action).sort()).toEqual(["event.activated", "event.closed"]);
  });
  it("rejects activation with stale version after an edit commits", async () => {
    const f = await fixture(); const result = await ordered(tx => editEventForOrganizer(tx, f.event.id, { expectedVersion: 1, name: "Edited fixture" }, f.owner), tx => activate(tx, f.event.id, { expectedVersion: 1 }, f.owner));
    expect(result.follower).toMatchObject({ status: "rejected", reason: expect.any(EventLifecycleVersionConflictError) });
    expect(await current(f)).toEqual({ ...f.event, name: "Edited fixture", version: 2 }); expect(await audits(f)).toEqual([]);
  });
  it("rejects a draft edit waiting behind activation", async () => {
    const f = await fixture(); const result = await ordered(tx => activate(tx, f.event.id, { expectedVersion: 1 }, f.owner), tx => editEventForOrganizer(tx, f.event.id, { expectedVersion: 1, name: "Stale edit" }, f.owner));
    expect(result.follower).toMatchObject({ status: "rejected", reason: expect.any(EventNotEditableError) });
    expect(await current(f)).toEqual({ ...f.event, status: "active", version: 2 }); expect(await audits(f)).toHaveLength(1);
  });
});
