import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { AuthenticationError, AuthorizationError, type AuthenticatedUser } from "../../auth/verify-access-token.js";
import { parseDatabaseConfig } from "../../config.js";
import { attendees, events, eventStaff, registrations, users } from "../../db/schema.js";
import { createEventForOrganizer } from "../events/create-event-for-organizer.js";
import { EventNotFoundError } from "../events/query-events-for-organizer.js";
import { registerAttendeeForOrganizer, RegistrationEmailConflictError, EventRegistrationNotAllowedError } from "./register-attendee-for-organizer.js";

const actor = (): AuthenticatedUser => ({ tenantId: randomUUID(), objectId: randomUUID(), subject: "registration-test", roles: ["organizer"] });
const key = (a: AuthenticatedUser) => `entra:${a.tenantId.toLowerCase()}:${a.objectId.toLowerCase()}`;
const input = () => ({ fullName: "Ana María", email: `registration-${randomUUID()}@example.invalid` });
const eventInput = () => ({ name: "Registration test", slug: `registration-${randomUUID()}`,
  startsAt: "2027-08-27T14:00:00Z", endsAt: "2027-08-27T22:00:00Z", timezone: "America/Lima", location: "Test" });

describe("registerAttendeeForOrganizer persistence", () => {
  let client: Client; let db: NodePgDatabase;
  beforeAll(async () => {
    client = new Client({ connectionString: parseDatabaseConfig(process.env).databaseUrl,
      connectionTimeoutMillis: 5000, query_timeout: 6000, statement_timeout: 5000 });
    await client.connect(); db = drizzle(client);
  });
  afterAll(async () => { await client?.end(); });
  async function isolated(run: (tx: NodePgDatabase) => Promise<void>) {
    const rollback = new Error("Rollback registration test");
    try { await db.transaction(async tx => { await run(tx); throw rollback; }); }
    catch (error) { if (error !== rollback) throw error; }
  }
  async function noWrites(tx: NodePgDatabase, email: string, eventId: string) {
    expect(await tx.select().from(attendees).where(eq(attendees.email, email))).toEqual([]);
    expect(await tx.select().from(registrations).where(eq(registrations.eventId, eventId))).toEqual([]);
  }

  it.each(["draft", "active"] as const)("registers in %s atomically without changing event version or assignments", async status => {
    await isolated(async tx => {
      const owner = actor(); const event = await createEventForOrganizer(tx, eventInput(), owner);
      await tx.update(events).set({ status }).where(eq(events.id, event.id));
      const staff = await tx.select().from(eventStaff).where(eq(eventStaff.eventId, event.id));
      const data = input(); const result = await registerAttendeeForOrganizer(tx, event.id.toUpperCase(),
        { fullName: ` ${data.fullName} `, email: ` ${data.email.toUpperCase()} ` }, owner);
      expect(result).toEqual({ id: expect.any(String), eventId: event.id, status: "confirmed", source: "manual",
        createdAt: expect.any(Date), attendee: { id: expect.any(String), ...data } });
      expect(await tx.select().from(registrations).where(eq(registrations.id, result.id))).toEqual([{
        id: result.id, eventId: event.id, attendeeId: result.attendee.id, status: "confirmed", source: "manual",
        emailNormalized: data.email, createdAt: result.createdAt,
      }]);
      expect(await tx.select().from(attendees).where(eq(attendees.id, result.attendee.id))).toEqual([
        { ...result.attendee, createdAt: expect.any(Date) },
      ]);
      expect(await tx.select().from(events).where(eq(events.id, event.id))).toEqual([{ ...event, status }]);
      expect(await tx.select().from(eventStaff).where(eq(eventStaff.eventId, event.id))).toEqual(staff);
    });
  });
  it.each(["closed", "cancelled"] as const)("rejects %s without writing", async status => {
    await isolated(async tx => {
      const owner = actor(); const event = await createEventForOrganizer(tx, eventInput(), owner); const data = input();
      await tx.update(events).set({ status }).where(eq(events.id, event.id));
      await expect(registerAttendeeForOrganizer(tx, event.id, data, owner)).rejects.toBeInstanceOf(EventRegistrationNotAllowedError);
      await noWrites(tx, data.email, event.id);
    });
  });
  it("preserves the original profile and rolls back the new attendee on normalized duplicate", async () => {
    await isolated(async tx => {
      const owner = actor(); const event = await createEventForOrganizer(tx, eventInput(), owner); const data = input();
      const saved = await registerAttendeeForOrganizer(tx, event.id, data, owner);
      await expect(registerAttendeeForOrganizer(tx, event.id, { fullName: "Different name", email: ` ${data.email.toUpperCase()} ` }, owner))
        .rejects.toBeInstanceOf(RegistrationEmailConflictError);
      expect(await tx.select().from(attendees).where(eq(attendees.email, data.email))).toEqual([{ ...saved.attendee, createdAt: expect.any(Date) }]);
      expect(await tx.select().from(registrations).where(eq(registrations.eventId, event.id))).toHaveLength(1);
    });
  });
  it("does not silently reactivate a cancelled registration", async () => {
    await isolated(async tx => {
      const owner = actor(); const event = await createEventForOrganizer(tx, eventInput(), owner); const data = input();
      const saved = await registerAttendeeForOrganizer(tx, event.id, data, owner);
      await tx.update(registrations).set({ status: "cancelled" }).where(eq(registrations.id, saved.id));
      await expect(registerAttendeeForOrganizer(tx, event.id, data, owner)).rejects.toBeInstanceOf(RegistrationEmailConflictError);
      expect((await tx.select().from(registrations).where(eq(registrations.id, saved.id)))[0].status).toBe("cancelled");
      expect(await tx.select().from(attendees).where(eq(attendees.email, data.email))).toHaveLength(1);
    });
  });
  it("keeps equal emails in distinct events as independent profiles", async () => {
    await isolated(async tx => {
      const owners = [actor(), actor()]; const data = input();
      const first = await createEventForOrganizer(tx, eventInput(), owners[0]);
      const second = await createEventForOrganizer(tx, eventInput(), owners[1]);
      const a = await registerAttendeeForOrganizer(tx, first.id, data, owners[0]);
      const b = await registerAttendeeForOrganizer(tx, second.id, { ...data, fullName: "Other event name" }, owners[1]);
      expect(a.attendee.id).not.toBe(b.attendee.id);
      expect(b.attendee.fullName).toBe("Other event name");
      expect((await tx.select().from(attendees).where(eq(attendees.id, a.attendee.id)))[0].fullName).toBe(data.fullName);
    });
  });
  it("uses the same not-found error for missing and foreign events without provisioning", async () => {
    await isolated(async tx => {
      const owner = actor(); const outsider = actor(); const event = await createEventForOrganizer(tx, eventInput(), owner); const data = input();
      for (const id of [event.id, randomUUID()]) {
        await expect(registerAttendeeForOrganizer(tx, id, data, outsider)).rejects.toBeInstanceOf(EventNotFoundError);
      }
      expect(await tx.select().from(users).where(eq(users.externalSubject, key(outsider)))).toEqual([]);
      await noWrites(tx, data.email, event.id);
    });
  });
  it("denies an organizer assigned only to another event", async () => {
    await isolated(async tx => {
      const owner = actor(); const outsider = actor(); const event = await createEventForOrganizer(tx, eventInput(), owner);
      await createEventForOrganizer(tx, eventInput(), outsider); const data = input();
      await expect(registerAttendeeForOrganizer(tx, event.id, data, outsider)).rejects.toBeInstanceOf(EventNotFoundError);
      await noWrites(tx, data.email, event.id);
    });
  });
  it("rejects a disabled local organizer without reactivation", async () => {
    await isolated(async tx => {
      const owner = actor(); const event = await createEventForOrganizer(tx, eventInput(), owner); const data = input();
      await tx.update(users).set({ status: "disabled" }).where(eq(users.externalSubject, key(owner)));
      await expect(registerAttendeeForOrganizer(tx, event.id, data, owner)).rejects.toBeInstanceOf(AuthorizationError);
      expect((await tx.select().from(users).where(eq(users.externalSubject, key(owner))))[0].status).toBe("disabled");
      await noWrites(tx, data.email, event.id);
    });
  });
  it.each(([[], ["admin"], ["checkin_operator"]] as AuthenticatedUser["roles"][]).map(roles => ({ roles })))("requires organizer in the token: %j", async ({ roles }) => {
      await isolated(async tx => {
        const owner = actor(); const event = await createEventForOrganizer(tx, eventInput(), owner); const data = input();
        await expect(registerAttendeeForOrganizer(tx, event.id, data, { ...owner, roles })).rejects.toBeInstanceOf(AuthorizationError);
        await noWrites(tx, data.email, event.id);
      });
    });
  it.each(["removed", "checkin_operator"])("rejects assignment %s", async role => {
    await isolated(async tx => {
      const owner = actor(); const event = await createEventForOrganizer(tx, eventInput(), owner); const data = input();
      if (role === "removed") await tx.delete(eventStaff).where(eq(eventStaff.eventId, event.id));
      else await tx.update(eventStaff).set({ role }).where(eq(eventStaff.eventId, event.id));
      await expect(registerAttendeeForOrganizer(tx, event.id, data, owner)).rejects.toBeInstanceOf(EventNotFoundError);
      await noWrites(tx, data.email, event.id);
    });
  });
  it("normalizes identity case, ignores sub and isolates tenants", async () => {
    await isolated(async tx => {
      const owner = actor(); const event = await createEventForOrganizer(tx, eventInput(), owner); const data = input();
      const changed = { ...owner, tenantId: owner.tenantId.toUpperCase(), objectId: owner.objectId.toUpperCase(), subject: "changed" };
      expect((await registerAttendeeForOrganizer(tx, event.id, data, changed)).eventId).toBe(event.id);
      await expect(registerAttendeeForOrganizer(tx, event.id, input(), { ...owner, tenantId: randomUUID() })).rejects.toBeInstanceOf(EventNotFoundError);
    });
  });
  it.each(["tenantId", "objectId"])("rejects malformed identity %s", async field => {
    await isolated(async tx => {
      await expect(registerAttendeeForOrganizer(tx, randomUUID(), input(), { ...actor(), [field]: "bad" })).rejects.toBeInstanceOf(AuthenticationError);
    });
  });
  it("rejects invalid input and event ID without writing", async () => {
    await isolated(async tx => {
      const owner = actor(); const event = await createEventForOrganizer(tx, eventInput(), owner); const data = input();
      await expect(registerAttendeeForOrganizer(tx, event.id, { ...data, status: "confirmed" }, owner)).rejects.toBeInstanceOf(ZodError);
      await expect(registerAttendeeForOrganizer(tx, "invalid", data, owner)).rejects.toBeInstanceOf(ZodError);
      await noWrites(tx, data.email, event.id);
    });
  });
  it("rolls back the attendee after a real registration failure without translating other constraints", async () => {
    await isolated(async tx => {
      const owner = actor(); const event = await createEventForOrganizer(tx, eventInput(), owner); const data = input();
      await tx.execute(sql`ALTER TABLE registration ADD CONSTRAINT issue35_test_reject_manual CHECK (source <> 'manual') NOT VALID`);
      await expect(registerAttendeeForOrganizer(tx, event.id, data, owner)).rejects.toMatchObject({
        cause: { code: "23514", constraint: "issue35_test_reject_manual" },
      });
      await noWrites(tx, data.email, event.id);
    });
  });
});
