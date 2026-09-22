import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AuthorizationError, type AuthenticatedUser } from "../../auth/verify-access-token.js";
import { parseDatabaseConfig } from "../../config.js";
import { attendees, events, eventStaff, qrCredentials, registrations, users } from "../../db/schema.js";
import { createEventForOrganizer } from "../events/create-event-for-organizer.js";
import { EventNotFoundError } from "../events/query-events-for-organizer.js";
import { registerAttendeeForOrganizer } from "./register-attendee-for-organizer.js";
import { issueRegistrationCredentialForOrganizer as issue, CredentialIssuanceNotAllowedError, RegistrationCredentialExistsError } from "./issue-registration-credential-for-organizer.js";

describe("credential issuance concurrency", () => {
  const clients: Client[] = []; const databases: NodePgDatabase[] = [];
  const eventIds: string[] = []; const userIds: string[] = []; const registrationIds: string[] = []; const attendeeIds: string[] = [];
  let inspect: NodePgDatabase; let workerPid: number; let lockerPid: number;
  async function fixture() {
    const owner: AuthenticatedUser = { tenantId: randomUUID(), objectId: randomUUID(), subject: "test", roles: ["organizer"] };
    const event = await createEventForOrganizer(inspect, { name: "Credential race", slug: `credential-race-${randomUUID()}`, startsAt: "2027-08-27T14:00:00Z", endsAt: "2027-08-27T22:00:00Z", timezone: "America/Lima", location: "Test" }, owner);
    eventIds.push(event.id);
    const [user] = await inspect.select().from(users).where(eq(users.externalSubject, `entra:${owner.tenantId}:${owner.objectId}`)); userIds.push(user.id);
    const registration = await registerAttendeeForOrganizer(inspect, event.id, { fullName: "Synthetic race", email: `${randomUUID()}@example.invalid` }, owner);
    registrationIds.push(registration.id); attendeeIds.push(registration.attendee.id);
    return { owner, event, registration, user };
  }
  beforeAll(async () => {
    for (let i = 0; i < 3; i++) {
      const client = new Client({ connectionString: parseDatabaseConfig(process.env).databaseUrl, connectionTimeoutMillis: 5000, query_timeout: 6000, statement_timeout: 5000 }); clients.push(client); await client.connect(); databases.push(drizzle(client));
    }
    inspect = databases[2]; workerPid = (await clients[0].query("SELECT pg_backend_pid() AS pid")).rows[0].pid; lockerPid = (await clients[1].query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
  });
  afterEach(async () => {
    await inspect.transaction(async tx => {
      if (registrationIds.length) { await tx.delete(qrCredentials).where(inArray(qrCredentials.registrationId, registrationIds)); await tx.delete(registrations).where(inArray(registrations.id, registrationIds)); }
      if (attendeeIds.length) await tx.delete(attendees).where(inArray(attendees.id, attendeeIds));
      if (eventIds.length) { await tx.delete(eventStaff).where(inArray(eventStaff.eventId, eventIds)); await tx.delete(events).where(inArray(events.id, eventIds)); }
      if (userIds.length) await tx.delete(users).where(inArray(users.id, userIds));
    });
    eventIds.length = userIds.length = registrationIds.length = attendeeIds.length = 0;
  });
  afterAll(async () => { await Promise.all(clients.map(c => c.end())); });
  it.each(["same organizer", "different organizers"])("persists one winner and one explicit conflict: %s", async mode => {
    const f = await fixture(); let second = f.owner;
    if (mode === "different organizers") {
      second = { ...f.owner, objectId: randomUUID() };
      const [user] = await inspect.insert(users).values({ externalSubject: `entra:${second.tenantId}:${second.objectId}` }).returning(); userIds.push(user.id);
      await inspect.insert(eventStaff).values({ eventId: f.event.id, userId: user.id, role: "organizer" });
    }
    const results = await Promise.allSettled([issue(databases[0], f.event.id, f.registration.id, f.owner), issue(databases[1], f.event.id, f.registration.id, second)]);
    const winners = results.filter(r => r.status === "fulfilled"); const losers = results.filter(r => r.status === "rejected");
    expect(winners).toHaveLength(1); expect(losers).toHaveLength(1); expect(losers[0].reason).toBeInstanceOf(RegistrationCredentialExistsError);
    expect(await inspect.select().from(qrCredentials).where(eq(qrCredentials.registrationId, f.registration.id))).toHaveLength(1);
  });
  it("allows independent inscriptions to issue concurrently", async () => {
    const f = await fixture(); const other = await registerAttendeeForOrganizer(inspect, f.event.id, { fullName: "Other synthetic", email: `${randomUUID()}@example.invalid` }, f.owner);
    registrationIds.push(other.id); attendeeIds.push(other.attendee.id);
    const issued = await Promise.all([issue(databases[0], f.event.id, f.registration.id, f.owner), issue(databases[1], f.event.id, other.id, f.owner)]);
    expect(new Set(issued.map(x => x.token)).size).toBe(2);
  });
  async function waitForLock() {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      if ((await clients[2].query('SELECT $2::int = ANY(pg_blocking_pids($1::int)) AS blocked', [workerPid, lockerPid])).rows[0].blocked) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error("Issuance did not reach expected lock");
  }
  it.each(["event", "registration", "user", "assignment"])("rechecks a concurrent %s change after waiting", async mode => {
    const f = await fixture(); await clients[1].query("BEGIN"); let open = true; let pending: ReturnType<typeof issue> | undefined;
    try {
      if (mode === "event") await clients[1].query("UPDATE event SET status = 'closed' WHERE id = $1", [f.event.id]);
      if (mode === "registration") await clients[1].query("UPDATE registration SET status = 'cancelled' WHERE id = $1", [f.registration.id]);
      if (mode === "user") await clients[1].query('UPDATE "user" SET status = \'disabled\' WHERE id = $1', [f.user.id]);
      if (mode === "assignment") await clients[1].query('DELETE FROM event_staff WHERE event_id = $1 AND user_id = $2', [f.event.id, f.user.id]);
      pending = issue(databases[0], f.event.id, f.registration.id, f.owner); void pending.catch(() => undefined);
      await waitForLock(); await clients[1].query("COMMIT"); open = false;
      await expect(pending).rejects.toBeInstanceOf(mode === "user" ? AuthorizationError : mode === "assignment" ? EventNotFoundError : CredentialIssuanceNotAllowedError);
      expect(await inspect.select().from(qrCredentials).where(eq(qrCredentials.registrationId, f.registration.id))).toEqual([]);
    } finally { if (open) await clients[1].query("ROLLBACK"); await pending?.catch(() => undefined); }
  });
});
