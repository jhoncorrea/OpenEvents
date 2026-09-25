import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuthenticatedUser } from "../../auth/verify-access-token.js";
import { parseDatabaseConfig } from "../../config.js";
import { checkIns, events, eventStaff, registrations, users } from "../../db/schema.js";
import { createEventForOrganizer } from "../events/create-event-for-organizer.js";
import { registerAttendeeForOrganizer } from "./register-attendee-for-organizer.js";
import { issueRegistrationCredentialForOrganizer } from "./issue-registration-credential-for-organizer.js";
import { registerCheckInForOperator } from "./register-check-in-for-operator.js";
import { getRegistrationForOrganizer, listRegistrationsForOrganizer } from "./query-registrations-for-organizer.js";
import { searchRegistrationsForStaff } from "./search-registrations-for-staff.js";

const actor = (roles: AuthenticatedUser["roles"]): AuthenticatedUser => ({ tenantId: randomUUID(), objectId: randomUUID(), subject: "attendance-test", roles });
const subject = (a: AuthenticatedUser) => `entra:${a.tenantId}:${a.objectId}`;
describe("persisted registration attendance", () => {
  let client: Client; let db: NodePgDatabase;
  beforeAll(async () => {
    client = new Client({ connectionString: parseDatabaseConfig(process.env).databaseUrl, connectionTimeoutMillis: 5000 });
    await client.connect(); db = drizzle(client);
  });
  afterAll(async () => { await client?.end(); });
  async function isolated(work: (tx: NodePgDatabase) => Promise<void>) {
    const rollback = new Error("rollback attendance fixture");
    try { await db.transaction(async tx => { await work(tx); throw rollback; }); }
    catch (error) { if (error !== rollback) throw error; }
  }
  async function fixture(tx: NodePgDatabase) {
    const owner = actor(["organizer"]); const operator = actor(["checkin_operator"]);
    const event = await createEventForOrganizer(tx, { name: "Attendance test", slug: `attendance-${randomUUID()}`,
      startsAt: "2027-08-27T14:00:00Z", endsAt: "2027-08-27T22:00:00Z", timezone: "America/Lima", location: "Test" }, owner);
    const saved = await registerAttendeeForOrganizer(tx, event.id, { fullName: "Attendance person", email: `${randomUUID()}@example.invalid` }, owner);
    const credential = await issueRegistrationCredentialForOrganizer(tx, event.id, saved.id, owner);
    const [user] = await tx.insert(users).values({ externalSubject: subject(operator) }).returning();
    await tx.insert(eventStaff).values({ eventId: event.id, userId: user.id, role: "checkin_operator" });
    await tx.update(events).set({ status: "active" }).where(eq(events.id, event.id));
    return { owner, operator, user, event, saved, credential };
  }
  it.each(["manual", "qr"])("queries the original %s check-in after duplicate and cancellation", async source => {
    await isolated(async tx => {
      const f = await fixture(tx);
      const read = async () => [await getRegistrationForOrganizer(tx, f.event.id, f.saved.id, f.owner),
        ...(await listRegistrationsForOrganizer(tx, f.event.id, {}, f.owner)).items,
        ...(await searchRegistrationsForStaff(tx, f.event.id, { q: "Attendance" }, f.operator)).items];
      expect((await read()).map(row => row.checkedInAt)).toEqual([null, null, null]);
      const first = await registerCheckInForOperator(tx, f.event.id, f.credential.token, source, f.operator);
      expect(first.status).toBe("accepted"); if (first.status === "invalid") throw new Error("Expected check-in");
      const duplicate = await registerCheckInForOperator(tx, f.event.id, f.credential.token, source, f.operator);
      expect(duplicate.status).toBe("duplicate");
      for (const status of ["confirmed", "cancelled"] as const) {
        await tx.update(registrations).set({ status }).where(eq(registrations.id, f.saved.id));
        const rows = await read(); expect(rows).toHaveLength(3);
        for (const row of rows) {
          expect(row.checkedInAt).toEqual(first.checkIn.checkedInAt); expect(row.status).toBe(status);
          expect(row).not.toHaveProperty("performedBy"); expect(row).not.toHaveProperty("checkIn");
        }
      }
      expect(await tx.select().from(checkIns).where(eq(checkIns.registrationId, f.saved.id))).toEqual([first.checkIn]);
    });
  });
  it("does not attach attendance to another registration sharing the attendee", async () => {
    await isolated(async tx => {
      const f = await fixture(tx);
      await registerCheckInForOperator(tx, f.event.id, f.credential.token, "qr", f.operator);
      const other = await createEventForOrganizer(tx, { name: "Other attendance", slug: `other-${randomUUID()}`, startsAt: "2027-08-27T14:00:00Z", endsAt: "2027-08-27T22:00:00Z", timezone: "America/Lima", location: "Other" }, f.owner);
      const saved = await registerAttendeeForOrganizer(tx, other.id, { fullName: f.saved.attendee.fullName, email: f.saved.attendee.email }, f.owner);
      expect((await getRegistrationForOrganizer(tx, other.id, saved.id, f.owner)).checkedInAt).toBeNull();
      await expect(searchRegistrationsForStaff(tx, other.id, { q: "Attendance" }, f.operator)).rejects.toMatchObject({ code: "EVENT_NOT_FOUND" });
      await tx.delete(eventStaff).where(eq(eventStaff.userId, f.user.id));
      await expect(searchRegistrationsForStaff(tx, f.event.id, { q: "Attendance" }, f.operator)).rejects.toMatchObject({ code: "EVENT_NOT_FOUND" });
    });
  });
});
