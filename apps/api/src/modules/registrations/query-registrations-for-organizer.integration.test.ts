import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { AuthenticationError, AuthorizationError, type AuthenticatedUser } from "../../auth/verify-access-token.js";
import { parseDatabaseConfig } from "../../config.js";
import { attendees, events, eventStaff, registrations, users } from "../../db/schema.js";
import { createEventForOrganizer } from "../events/create-event-for-organizer.js";
import { EventNotFoundError } from "../events/query-events-for-organizer.js";
import { registerAttendeeForOrganizer } from "./register-attendee-for-organizer.js";
import { encodeRegistrationCursor } from "./registration-query-input.js";
import { getRegistrationForOrganizer, listRegistrationsForOrganizer, RegistrationNotFoundError } from "./query-registrations-for-organizer.js";

const actor = (): AuthenticatedUser => ({ tenantId: randomUUID(), objectId: randomUUID(), subject: "query-test", roles: ["organizer"] });
const key = (a: AuthenticatedUser) => `entra:${a.tenantId.toLowerCase()}:${a.objectId.toLowerCase()}`;
const eventInput = () => ({ name: "Query test", slug: `query-${randomUUID()}`, startsAt: "2027-08-27T14:00:00Z",
  endsAt: "2027-08-27T22:00:00Z", timezone: "America/Lima", location: "Test" });

describe("registration queries with PostgreSQL", () => {
  let client: Client; let db: NodePgDatabase;
  beforeAll(async () => {
    client = new Client({ connectionString: parseDatabaseConfig(process.env).databaseUrl,
      connectionTimeoutMillis: 5000, query_timeout: 6000, statement_timeout: 5000 });
    await client.connect(); db = drizzle(client);
  });
  afterAll(async () => { await client?.end(); });
  async function isolated(run: (tx: NodePgDatabase) => Promise<void>) {
    const rollback = new Error("Rollback query test");
    try { await db.transaction(async tx => { await run(tx); throw rollback; }); }
    catch (error) { if (error !== rollback) throw error; }
  }
  async function fixture(tx: NodePgDatabase) {
    const owner = actor(); const event = await createEventForOrganizer(tx, eventInput(), owner);
    const saved = await registerAttendeeForOrganizer(tx, event.id,
      { fullName: "Query attendee", email: `query-${randomUUID()}@example.com` }, owner);
    return { owner, event, saved: { ...saved, checkedInAt: null as Date | null } };
  }
  it.each(["draft", "active", "closed", "cancelled"] as const)("reads in %s without changing persisted rows", async status => {
    await isolated(async tx => {
      const { owner, event, saved } = await fixture(tx);
      await tx.update(events).set({ status }).where(eq(events.id, event.id));
      const before = await tx.select().from(registrations).where(eq(registrations.id, saved.id));
      const profile = await tx.select().from(attendees).where(eq(attendees.id, saved.attendee.id));
      expect(await listRegistrationsForOrganizer(tx, event.id, {}, owner)).toEqual({ items: [saved], nextCursor: null });
      expect(await getRegistrationForOrganizer(tx, event.id, saved.id, owner)).toEqual(saved);
      expect(await tx.select().from(registrations).where(eq(registrations.id, saved.id))).toEqual(before);
      expect(await tx.select().from(attendees).where(eq(attendees.id, saved.attendee.id))).toEqual(profile);
      expect((await tx.select().from(events).where(eq(events.id, event.id)))[0]).toEqual({ ...event, status });
    });
  });
  it("returns an empty page for an authorized event without registrations", async () => {
    await isolated(async tx => {
      const owner = actor(); const event = await createEventForOrganizer(tx, eventInput(), owner);
      expect(await listRegistrationsForOrganizer(tx, event.id, {}, owner)).toEqual({ items: [], nextCursor: null });
    });
  });
  it("paginates by UUID without duplicates or rows from another event", async () => {
    await isolated(async tx => {
      const { owner, event, saved } = await fixture(tx); const all: Omit<typeof saved, "checkedInAt">[] = [saved];
      for (let i = 0; i < 4; i++) all.push(await registerAttendeeForOrganizer(tx, event.id,
        { fullName: `Person ${i}`, email: `${randomUUID()}@example.com` }, owner));
      const other = await createEventForOrganizer(tx, eventInput(), owner);
      await registerAttendeeForOrganizer(tx, other.id, { fullName: "Other", email: saved.attendee.email }, owner);
      const first = await listRegistrationsForOrganizer(tx, event.id, { limit: "2" }, owner);
      const second = await listRegistrationsForOrganizer(tx, event.id, { limit: "2", cursor: first.nextCursor }, owner);
      const third = await listRegistrationsForOrganizer(tx, event.id, { limit: "2", cursor: second.nextCursor }, owner);
      expect(first.items).toHaveLength(2); expect(second.items).toHaveLength(2); expect(third.items).toHaveLength(1);
      expect([...first.items, ...second.items, ...third.items]).toEqual(all.map(item => ({ ...item, checkedInAt: null })).sort((a, b) => a.id.localeCompare(b.id)));
      expect(third.nextCursor).toBeNull();
    });
  });
  it("returns no cursor on an exact full final page", async () => {
    await isolated(async tx => {
      const { owner, event, saved } = await fixture(tx);
      expect(await listRegistrationsForOrganizer(tx, event.id, { limit: "1" }, owner)).toEqual({ items: [saved], nextCursor: null });
    });
  });
  it("accepts a position without requiring that row to exist", async () => {
    await isolated(async tx => {
      const { owner, event, saved } = await fixture(tx);
      await tx.update(registrations).set({ id: "b4444444-4444-4444-8444-444444444444" }).where(eq(registrations.id, saved.id));
      const cursor = encodeRegistrationCursor(event.id, "a4444444-4444-4444-8444-444444444444");
      const page = await listRegistrationsForOrganizer(tx, event.id, { cursor }, owner);
      expect(page.items.map(row => row.id)).toEqual(["b4444444-4444-4444-8444-444444444444"]);
    });
  });
  it("returns cancelled registrations and their persisted source", async () => {
    await isolated(async tx => {
      const { owner, event, saved } = await fixture(tx);
      await tx.update(registrations).set({ status: "cancelled", source: "import" }).where(eq(registrations.id, saved.id));
      expect(await getRegistrationForOrganizer(tx, event.id, saved.id, owner)).toEqual({ ...saved, status: "cancelled", source: "import" });
      expect((await listRegistrationsForOrganizer(tx, event.id, {}, owner)).items[0].status).toBe("cancelled");
    });
  });
  it("does not reveal a registration from another authorized event", async () => {
    await isolated(async tx => {
      const { owner, event, saved } = await fixture(tx);
      const other = await createEventForOrganizer(tx, eventInput(), owner);
      for (const id of [saved.id, randomUUID()]) {
        await expect(getRegistrationForOrganizer(tx, other.id, id, owner)).rejects.toBeInstanceOf(RegistrationNotFoundError);
      }
      expect((await getRegistrationForOrganizer(tx, event.id, saved.id, owner)).id).toBe(saved.id);
    });
  });
  it("does not provision unknown actors and hides foreign or missing events", async () => {
    await isolated(async tx => {
      const { event, saved } = await fixture(tx); const outsider = actor();
      for (const id of [event.id, randomUUID()]) {
        await expect(listRegistrationsForOrganizer(tx, id, {}, outsider)).rejects.toBeInstanceOf(EventNotFoundError);
        await expect(getRegistrationForOrganizer(tx, id, saved.id, outsider)).rejects.toBeInstanceOf(EventNotFoundError);
      }
      expect(await tx.select().from(users).where(eq(users.externalSubject, key(outsider)))).toEqual([]);
    });
  });
  it("denies a known organizer with access only to another event", async () => {
    await isolated(async tx => {
      const { event, saved } = await fixture(tx); const outsider = actor();
      await createEventForOrganizer(tx, eventInput(), outsider);
      await expect(listRegistrationsForOrganizer(tx, event.id, {}, outsider)).rejects.toBeInstanceOf(EventNotFoundError);
      await expect(getRegistrationForOrganizer(tx, event.id, saved.id, outsider)).rejects.toBeInstanceOf(EventNotFoundError);
    });
  });
  it.each(["removed", "checkin_operator"])("denies assignment %s on both reads", async role => {
    await isolated(async tx => {
      const { owner, event, saved } = await fixture(tx);
      if (role === "removed") await tx.delete(eventStaff).where(eq(eventStaff.eventId, event.id));
      else await tx.update(eventStaff).set({ role }).where(eq(eventStaff.eventId, event.id));
      await expect(listRegistrationsForOrganizer(tx, event.id, {}, owner)).rejects.toBeInstanceOf(EventNotFoundError);
      await expect(getRegistrationForOrganizer(tx, event.id, saved.id, owner)).rejects.toBeInstanceOf(EventNotFoundError);
    });
  });
  it("denies disabled users without reactivation", async () => {
    await isolated(async tx => {
      const { owner, event, saved } = await fixture(tx);
      await tx.update(users).set({ status: "disabled" }).where(eq(users.externalSubject, key(owner)));
      await expect(listRegistrationsForOrganizer(tx, event.id, {}, owner)).rejects.toBeInstanceOf(AuthorizationError);
      await expect(getRegistrationForOrganizer(tx, event.id, saved.id, owner)).rejects.toBeInstanceOf(AuthorizationError);
      expect((await tx.select().from(users).where(eq(users.externalSubject, key(owner))))[0].status).toBe("disabled");
    });
  });
  it.each(([[], ["admin"], ["checkin_operator"]] as AuthenticatedUser["roles"][]).map(roles => ({ roles })))("requires global organizer: %j", async ({ roles }) => {
    await isolated(async tx => {
      const { owner, event, saved } = await fixture(tx);
      await expect(listRegistrationsForOrganizer(tx, event.id, {}, { ...owner, roles })).rejects.toBeInstanceOf(AuthorizationError);
      await expect(getRegistrationForOrganizer(tx, event.id, saved.id, { ...owner, roles })).rejects.toBeInstanceOf(AuthorizationError);
    });
  });
  it("normalizes identity and UUIDs without relying on subject or mixing tenants", async () => {
    await isolated(async tx => {
      const { owner, event, saved } = await fixture(tx);
      const changed = { ...owner, tenantId: owner.tenantId.toUpperCase(), objectId: owner.objectId.toUpperCase(), subject: "changed" };
      expect(await getRegistrationForOrganizer(tx, event.id.toUpperCase(), saved.id.toUpperCase(), changed)).toEqual(saved);
      await expect(listRegistrationsForOrganizer(tx, event.id, {}, { ...owner, tenantId: randomUUID() })).rejects.toBeInstanceOf(EventNotFoundError);
    });
  });
  it.each(["tenantId", "objectId"])("rejects invalid identity %s", async field => {
    await isolated(async tx => {
      const owner = { ...actor(), [field]: "bad" };
      await expect(listRegistrationsForOrganizer(tx, randomUUID(), {}, owner)).rejects.toBeInstanceOf(AuthenticationError);
      await expect(getRegistrationForOrganizer(tx, randomUUID(), randomUUID(), owner)).rejects.toBeInstanceOf(AuthenticationError);
    });
  });
  it("rejects invalid query and identifiers at the service boundary", async () => {
    await isolated(async tx => {
      const { owner, event, saved } = await fixture(tx);
      await expect(listRegistrationsForOrganizer(tx, event.id, { limit: "101" }, owner)).rejects.toBeInstanceOf(ZodError);
      await expect(listRegistrationsForOrganizer(tx, "bad", {}, owner)).rejects.toBeInstanceOf(ZodError);
      await expect(getRegistrationForOrganizer(tx, event.id, "bad", owner)).rejects.toBeInstanceOf(ZodError);
      await expect(listRegistrationsForOrganizer(tx, event.id, { cursor: encodeRegistrationCursor(randomUUID(), saved.id) }, owner)).rejects.toBeInstanceOf(ZodError);
    });
  });
});
