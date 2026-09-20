import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AuthorizationError, type AuthenticatedUser } from "../../auth/verify-access-token.js";
import { parseDatabaseConfig } from "../../config.js";
import { attendees, events, eventStaff, registrations, users } from "../../db/schema.js";
import { createEventForOrganizer } from "../events/create-event-for-organizer.js";
import { EventNotFoundError } from "../events/query-events-for-organizer.js";
import { registerAttendeeForOrganizer, RegistrationEmailConflictError, EventRegistrationNotAllowedError } from "./register-attendee-for-organizer.js";

describe("concurrent attendee registration", () => {
  const clients: Client[] = []; const databases: NodePgDatabase[] = [];
  const eventIds: string[] = []; const identities: string[] = []; const emails: string[] = [];
  let inspection: NodePgDatabase; let workerPid: number; let lockerPid: number;
  const subject = (a: AuthenticatedUser) => `entra:${a.tenantId}:${a.objectId}`;
  function actor(): AuthenticatedUser {
    const result: AuthenticatedUser = { tenantId: randomUUID(), objectId: randomUUID(), subject: "registration-race", roles: ["organizer"] };
    identities.push(subject(result)); return result;
  }
  function input() {
    const email = `race-${randomUUID()}@example.invalid`; emails.push(email);
    return { fullName: "Race attendee", email };
  }
  async function create(owner: AuthenticatedUser) {
    const event = await createEventForOrganizer(inspection, { name: "Registration race", slug: `race-${randomUUID()}`,
      startsAt: "2027-08-27T14:00:00Z", endsAt: "2027-08-27T22:00:00Z", timezone: "America/Lima", location: "Test" }, owner);
    eventIds.push(event.id); return event;
  }
  beforeAll(async () => {
    const { databaseUrl } = parseDatabaseConfig(process.env);
    for (let i = 0; i < 3; i++) {
      const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000, query_timeout: 6000, statement_timeout: 5000 });
      clients.push(client); await client.connect(); databases.push(drizzle(client));
    }
    inspection = databases[2];
    workerPid = (await clients[0].query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    lockerPid = (await clients[1].query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  });
  afterEach(async () => {
    // Solo registros de esta prueba, con UUID y correos aleatorios propios.
    await inspection.transaction(async tx => {
      if (eventIds.length) {
        await tx.delete(registrations).where(inArray(registrations.eventId, eventIds));
        await tx.delete(eventStaff).where(inArray(eventStaff.eventId, eventIds));
        await tx.delete(events).where(inArray(events.id, eventIds));
      }
      if (emails.length) await tx.delete(attendees).where(inArray(attendees.email, emails));
      if (identities.length) await tx.delete(users).where(inArray(users.externalSubject, identities));
    });
    eventIds.length = 0; identities.length = 0; emails.length = 0;
  });
  afterAll(async () => { await Promise.all(clients.map(c => c.end())); });

  it.each(["same organizer", "different organizers"])("keeps exactly one normalized-email winner: %s", async mode => {
    const first = actor(); const second = mode === "same organizer" ? first : actor(); const event = await create(first);
    if (mode === "different organizers") {
      const [user] = await inspection.insert(users).values({ externalSubject: subject(second) }).returning();
      await inspection.insert(eventStaff).values({ eventId: event.id, userId: user.id, role: "organizer" });
    }
    const data = input(); const proposals = [data, { fullName: "Other proposal", email: ` ${data.email.toUpperCase()} ` }];
    const results = await Promise.allSettled([
      registerAttendeeForOrganizer(databases[0], event.id, proposals[0], first),
      registerAttendeeForOrganizer(databases[1], event.id, proposals[1], second),
    ]);
    const winners = results.filter(r => r.status === "fulfilled"); const losers = results.filter(r => r.status === "rejected");
    expect(winners).toHaveLength(1); expect(losers).toHaveLength(1);
    expect(losers[0].reason).toBeInstanceOf(RegistrationEmailConflictError);
    const winner = winners[0].value;
    expect(await inspection.select().from(attendees).where(eq(attendees.email, data.email)))
      .toEqual([{ ...winner.attendee, createdAt: expect.any(Date) }]);
    expect(await inspection.select().from(registrations).where(eq(registrations.eventId, event.id)))
      .toEqual([{ id: winner.id, eventId: event.id, attendeeId: winner.attendee.id, status: "confirmed", source: "manual",
        emailNormalized: data.email, createdAt: winner.createdAt }]);
  });
  it("accepts different emails concurrently in the same event", async () => {
    const owner = actor(); const event = await create(owner); const proposals = [input(), input()];
    const results = await Promise.all(proposals.map((data, i) => registerAttendeeForOrganizer(databases[i], event.id, data, owner)));
    expect(new Set(results.map(r => r.id)).size).toBe(2);
    expect(await inspection.select().from(registrations).where(eq(registrations.eventId, event.id))).toHaveLength(2);
  });
  it("accepts the same email concurrently in different events without sharing a profile", async () => {
    const owners = [actor(), actor()]; const first = await create(owners[0]); const second = await create(owners[1]); const data = input();
    const results = await Promise.all([first, second].map((event, i) => registerAttendeeForOrganizer(databases[i], event.id, data, owners[i])));
    expect(results[0].attendee.id).not.toBe(results[1].attendee.id);
    expect(await inspection.select().from(attendees).where(eq(attendees.email, data.email))).toHaveLength(2);
  });
  async function waitForLock() {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const result = await clients[2].query('SELECT $2::int = ANY(pg_blocking_pids($1::int)) AS blocked', [workerPid, lockerPid]);
      if (result.rows[0].blocked) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error("The registration did not reach the expected database lock");
  }
  it.each(["closed event", "disabled user", "removed assignment"])("denies registration after waiting for a concurrent %s change", async mode => {
    const owner = actor(); const event = await create(owner); const data = input();
    const [user] = await inspection.select().from(users).where(eq(users.externalSubject, subject(owner)));
    await clients[1].query('BEGIN'); let lockOpen = true;
    let pending: ReturnType<typeof registerAttendeeForOrganizer> | undefined;
    try {
      if (mode === "closed event") await clients[1].query("UPDATE event SET status = 'closed' WHERE id = $1", [event.id]);
      else if (mode === "disabled user") await clients[1].query("UPDATE \"user\" SET status = 'disabled' WHERE id = $1", [user.id]);
      else await clients[1].query('DELETE FROM event_staff WHERE event_id = $1 AND user_id = $2', [event.id, user.id]);
      pending = registerAttendeeForOrganizer(databases[0], event.id, data, owner);
      void pending.catch(() => undefined);
      await waitForLock();
      await clients[1].query('COMMIT'); lockOpen = false;
      const ErrorType = mode === "closed event" ? EventRegistrationNotAllowedError : mode === "disabled user" ? AuthorizationError : EventNotFoundError;
      await expect(pending).rejects.toBeInstanceOf(ErrorType);
      expect(await inspection.select().from(attendees).where(eq(attendees.email, data.email))).toEqual([]);
      expect(await inspection.select().from(registrations).where(eq(registrations.eventId, event.id))).toEqual([]);
    } finally {
      if (lockOpen) await clients[1].query('ROLLBACK');
      await pending?.catch(() => undefined);
    }
  });
});
