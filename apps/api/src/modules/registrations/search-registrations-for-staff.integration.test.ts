import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { AuthenticationError, AuthorizationError, type AuthenticatedUser } from "../../auth/verify-access-token.js";
import { parseDatabaseConfig } from "../../config.js";
import { attendees, checkIns, events, eventStaff, registrations, users } from "../../db/schema.js";
import { createEventForOrganizer } from "../events/create-event-for-organizer.js";
import { EventNotFoundError } from "../events/query-events-for-organizer.js";
import { registerAttendeeForOrganizer } from "./register-attendee-for-organizer.js";
import { listRegistrationsForOrganizer } from "./query-registrations-for-organizer.js";
import { encodeRegistrationSearchCursor } from "./registration-search-input.js";
import { searchRegistrationsForStaff as search } from "./search-registrations-for-staff.js";

const actor = (): AuthenticatedUser => ({ tenantId: randomUUID(), objectId: randomUUID(), subject: "search-test", roles: ["organizer"] });
const subject = (a: AuthenticatedUser) => `entra:${a.tenantId.toLowerCase()}:${a.objectId.toLowerCase()}`;
const eventInput = () => ({ name: "Search test", slug: `search-${randomUUID()}`, startsAt: "2027-08-27T14:00:00Z",
  endsAt: "2027-08-27T22:00:00Z", timezone: "America/Lima", location: "Test" });

describe("staff registration search with PostgreSQL", () => {
  let client: Client; let db: NodePgDatabase;
  beforeAll(async () => {
    client = new Client({ connectionString: parseDatabaseConfig(process.env).databaseUrl,
      connectionTimeoutMillis: 5000, query_timeout: 6000, statement_timeout: 5000 });
    await client.connect(); db = drizzle(client);
  });
  afterAll(async () => { await client?.end(); });
  async function isolated(run: (tx: NodePgDatabase) => Promise<void>) {
    const rollback = new Error("Rollback search test");
    try { await db.transaction(async tx => { await run(tx); throw rollback; }); }
    catch (error) { if (error !== rollback) throw error; }
  }
  async function fixture(tx: NodePgDatabase) {
    const owner = actor(); const event = await createEventForOrganizer(tx, eventInput(), owner);
    const saved = await registerAttendeeForOrganizer(tx, event.id,
      { fullName: "José Search", email: `match-${randomUUID()}@example.com` }, owner);
    return { owner, event, saved: { ...saved, checkedInAt: null as Date | null } };
  }
  it.each(["sEaRcH", "MATCH-", "  Search  ", "José"])("matches a partial name or email: %s", async q => {
    await isolated(async tx => {
      const { owner, event, saved } = await fixture(tx);
      expect(await search(tx, event.id, { q }, owner)).toEqual({ items: [saved], nextCursor: null });
    });
  });
  it.each(["absent", "Jose", "José  Search", "' OR 1=1 --", "%", "_", "!", "\\"])("does not expand or fold %s", async q => {
    await isolated(async tx => {
      const { owner, event } = await fixture(tx);
      expect(await search(tx, event.id, { q }, owner)).toEqual({ items: [], nextCursor: null });
    });
  });
  it("finds literal wildcard, escape and backslash characters", async () => {
    await isolated(async tx => {
      const { owner, event, saved } = await fixture(tx);
      await tx.update(attendees).set({ fullName: "Literal %_!\\ Person" }).where(eq(attendees.id, saved.attendee.id));
      for (const q of ["%", "_", "!", "\\", "%_!\\"]) {
        expect((await search(tx, event.id, { q }, owner)).items.map(row => row.id)).toEqual([saved.id]);
      }
    });
  });
  it.each(["draft", "active", "closed", "cancelled"] as const)("reads %s including cancelled registrations without writes", async status => {
    await isolated(async tx => {
      const { owner, event, saved } = await fixture(tx);
      await tx.update(events).set({ status }).where(eq(events.id, event.id));
      await tx.update(registrations).set({ status: "cancelled", source: "csv" }).where(eq(registrations.id, saved.id));
      const snapshot = async () => ({ r: await tx.select().from(registrations).where(eq(registrations.eventId, event.id)),
        a: await tx.select().from(attendees).where(eq(attendees.id, saved.attendee.id)),
        c: await tx.select().from(checkIns).where(eq(checkIns.registrationId, saved.id)),
        e: await tx.select().from(events).where(eq(events.id, event.id)) });
      const before = await snapshot();
      expect((await search(tx, event.id, { q: "Search" }, owner)).items).toEqual([{ ...saved, status: "cancelled", source: "csv" }]);
      expect(await snapshot()).toEqual(before);
    });
  });
  it("paginates matches only, isolates events and binds the cursor to the search", async () => {
    await isolated(async tx => {
      const { owner, event, saved } = await fixture(tx); const expected: Omit<typeof saved, "checkedInAt">[] = [saved];
      for (let i = 0; i < 4; i++) expected.push(await registerAttendeeForOrganizer(tx, event.id,
        { fullName: `Search person ${i}`, email: `${randomUUID()}@example.com` }, owner));
      await registerAttendeeForOrganizer(tx, event.id, { fullName: "Excluded", email: `${randomUUID()}@example.com` }, owner);
      const other = await createEventForOrganizer(tx, eventInput(), owner);
      await registerAttendeeForOrganizer(tx, other.id, { fullName: "Search other", email: saved.attendee.email }, owner);
      const first = await search(tx, event.id, { q: "Search", limit: "2" }, owner);
      const second = await search(tx, event.id, { q: "Search", limit: "2", cursor: first.nextCursor }, owner);
      const third = await search(tx, event.id, { q: "Search", limit: "2", cursor: second.nextCursor }, owner);
      expect([first.items.length, second.items.length, third.items.length]).toEqual([2, 2, 1]);
      expect([...first.items, ...second.items, ...third.items]).toEqual(expected.map(item => ({ ...item, checkedInAt: null })).sort((a, b) => a.id.localeCompare(b.id)));
      expect(third.nextCursor).toBeNull();
      await expect(search(tx, other.id, { q: "Search", cursor: first.nextCursor }, owner)).rejects.toBeInstanceOf(ZodError);
      await expect(search(tx, event.id, { q: "other", cursor: first.nextCursor }, owner)).rejects.toBeInstanceOf(ZodError);
    });
  });
  it("allows an absent cursor position and has no cursor on an exact final page", async () => {
    await isolated(async tx => {
      const { owner, event, saved } = await fixture(tx);
      await tx.update(registrations).set({ id: "b4444444-4444-4444-8444-444444444444" }).where(eq(registrations.id, saved.id));
      const cursor = encodeRegistrationSearchCursor(event.id, "Search", "a4444444-4444-4444-8444-444444444444");
      const result = await search(tx, event.id, { q: "Search", cursor, limit: "1" }, owner);
      expect(result.items).toHaveLength(1); expect(result.nextCursor).toBeNull();
    });
  });
  it.each([
    { roles: ["organizer"], assignment: "organizer", allowed: true },
    { roles: ["checkin_operator"], assignment: "checkin_operator", allowed: true },
    { roles: ["organizer", "checkin_operator"], assignment: "checkin_operator", allowed: true },
    { roles: ["checkin_operator"], assignment: "organizer", allowed: false },
    { roles: ["organizer"], assignment: "checkin_operator", allowed: false },
    { roles: ["organizer", "checkin_operator"], assignment: "admin", allowed: false },
  ])("requires a compatible pair: $roles / $assignment", async ({ roles, assignment, allowed }) => {
    await isolated(async tx => {
      const { owner, event, saved } = await fixture(tx);
      await tx.update(eventStaff).set({ role: assignment }).where(eq(eventStaff.eventId, event.id));
      const staff = { ...owner, roles: roles as AuthenticatedUser["roles"] };
      if (allowed) expect((await search(tx, event.id, { q: "Search" }, staff)).items).toEqual([saved]);
      else await expect(search(tx, event.id, { q: "Search" }, staff)).rejects.toBeInstanceOf(EventNotFoundError);
      if (assignment === "checkin_operator") await expect(listRegistrationsForOrganizer(tx, event.id, {}, staff)).rejects.toThrow();
    });
  });
  it.each(([[], ["admin"]] as AuthenticatedUser["roles"][]).map(roles => ({ roles })))("denies unsupported global roles %#", async ({ roles }) => {
    await isolated(async tx => {
      const { owner, event } = await fixture(tx);
      await expect(search(tx, event.id, { q: "Search" }, { ...owner, roles }))
        .rejects.toBeInstanceOf(AuthorizationError);
    });
  });
  it.each(["removed", "disabled", "changed"])("rechecks permissions between pages: %s", async change => {
    await isolated(async tx => {
      const { owner, event } = await fixture(tx);
      await registerAttendeeForOrganizer(tx, event.id, { fullName: "Search second", email: `${randomUUID()}@example.com` }, owner);
      const first = await search(tx, event.id, { q: "Search", limit: "1" }, owner);
      expect(first.nextCursor).not.toBeNull();
      if (change === "removed") await tx.delete(eventStaff).where(eq(eventStaff.eventId, event.id));
      if (change === "disabled") await tx.update(users).set({ status: "disabled" }).where(eq(users.externalSubject, subject(owner)));
      if (change === "changed") await tx.update(eventStaff).set({ role: "checkin_operator" }).where(eq(eventStaff.eventId, event.id));
      await expect(search(tx, event.id, { q: "Search", cursor: first.nextCursor }, owner))
        .rejects.toBeInstanceOf(change === "disabled" ? AuthorizationError : EventNotFoundError);
    });
  });
  it("hides missing/foreign events, unknown users and tenant mismatches without provisioning", async () => {
    await isolated(async tx => {
      const { owner, event } = await fixture(tx); const stranger = actor();
      for (const a of [stranger, { ...owner, tenantId: randomUUID() }]) {
        await expect(search(tx, event.id, { q: "Search" }, a)).rejects.toBeInstanceOf(EventNotFoundError);
        expect(await tx.select().from(users).where(eq(users.externalSubject, subject(a)))).toEqual([]);
      }
      await createEventForOrganizer(tx, eventInput(), stranger);
      for (const id of [event.id, randomUUID()]) await expect(search(tx, id, { q: "Search" }, stranger)).rejects.toBeInstanceOf(EventNotFoundError);
      expect((await search(tx, event.id.toUpperCase(), { q: "Search" }, { ...owner,
        tenantId: owner.tenantId.toUpperCase(), objectId: owner.objectId.toUpperCase(), subject: "irrelevant" })).items).toHaveLength(1);
    });
  });
  it("rejects invalid identity and service inputs", async () => {
    await isolated(async tx => {
      const { owner, event } = await fixture(tx);
      for (const field of ["tenantId", "objectId"]) await expect(search(tx, event.id, { q: "Search" }, { ...owner, [field]: "bad" })).rejects.toBeInstanceOf(AuthenticationError);
      await expect(search(tx, event.id, { q: "" }, owner)).rejects.toBeInstanceOf(ZodError);
      await expect(search(tx, "bad", { q: "Search" }, owner)).rejects.toBeInstanceOf(ZodError);
    });
  });
});
