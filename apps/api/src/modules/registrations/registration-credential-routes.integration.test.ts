import { randomUUID, createHash } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import type { AuthenticatedUser } from "../../auth/verify-access-token.js";
import { parseDatabaseConfig } from "../../config.js";
import { attendees, events, eventStaff, qrCredentials, registrations, users } from "../../db/schema.js";
import { createEventForOrganizer } from "../events/create-event-for-organizer.js";
import { registerAttendeeForOrganizer } from "./register-attendee-for-organizer.js";
import { issueRegistrationCredentialForOrganizer } from "./issue-registration-credential-for-organizer.js";

describe("HTTP credential issuance with PostgreSQL", () => {
  const clients: Client[] = []; const databases: NodePgDatabase[] = [];
  const apps: ReturnType<typeof buildApp>[] = [];
  const eventIds: string[] = []; const userIds: string[] = []; const registrationIds: string[] = []; const attendeeIds: string[] = [];
  let db: NodePgDatabase;
  beforeAll(async () => {
    for (let i = 0; i < 3; i++) {
      const client = new Client({ connectionString: parseDatabaseConfig(process.env).databaseUrl, connectionTimeoutMillis: 5000, statement_timeout: 5000, query_timeout: 6000 });
      clients.push(client); await client.connect(); databases.push(drizzle(client));
    }
    db = databases[2];
  });
  afterEach(async () => {
    await Promise.all(apps.map(app => app.close())); apps.length = 0;
    await db.transaction(async tx => {
      if (registrationIds.length) { await tx.delete(qrCredentials).where(inArray(qrCredentials.registrationId, registrationIds)); await tx.delete(registrations).where(inArray(registrations.id, registrationIds)); }
      if (attendeeIds.length) await tx.delete(attendees).where(inArray(attendees.id, attendeeIds));
      if (eventIds.length) { await tx.delete(eventStaff).where(inArray(eventStaff.eventId, eventIds)); await tx.delete(events).where(inArray(events.id, eventIds)); }
      if (userIds.length) await tx.delete(users).where(inArray(users.id, userIds));
    });
    eventIds.length = userIds.length = registrationIds.length = attendeeIds.length = 0;
  });
  afterAll(async () => { await Promise.all(clients.map(c => c.end())); });
  async function seed() {
    const actor: AuthenticatedUser = { tenantId: randomUUID(), objectId: randomUUID(), subject: "http-test", roles: ["organizer"] };
    const event = await createEventForOrganizer(db, { name: "HTTP credential test", slug: `http-credential-${randomUUID()}`, startsAt: "2027-08-27T14:00:00Z", endsAt: "2027-08-27T22:00:00Z", timezone: "America/Lima", location: "Test" }, actor);
    eventIds.push(event.id);
    const [user] = await db.select().from(users).where(eq(users.externalSubject, `entra:${actor.tenantId}:${actor.objectId}`)); userIds.push(user.id);
    const registration = await registerAttendeeForOrganizer(db, event.id, { fullName: "Synthetic", email: `${randomUUID()}@example.invalid` }, actor);
    registrationIds.push(registration.id); attendeeIds.push(registration.attendee.id);
    return { actor, event, registration, user };
  }
  function appFor(actor: AuthenticatedUser, connection = databases[0]) {
    // Solo Entra se simula: HTTP, emisión y PostgreSQL son reales.
    const app = buildApp({ verifyAccessToken: async () => actor, createEvent: async () => { throw new Error("unused"); },
      issueRegistrationCredential: (e, r, a) => issueRegistrationCredentialForOrganizer(connection, e, r, a) });
    apps.push(app); return app;
  }
  const path = (e: string, r: string) => `/api/v1/events/${e}/registrations/${r}/qr`;
  const post = (app: ReturnType<typeof buildApp>, e: string, r: string) => app.inject({ method: "POST", url: path(e, r), headers: { authorization: "Bearer test-only" } });
  const rows = (id: string) => db.select().from(qrCredentials).where(eq(qrCredentials.registrationId, id));
  it.each(["draft", "active"] as const)("commits only the hash and returns one secret in %s", async status => {
    const f = await seed(); await db.update(events).set({ status }).where(eq(events.id, f.event.id));
    const app = appFor(f.actor); const r = await post(app, f.event.id, f.registration.id);
    expect(r.statusCode).toBe(201); expect(r.headers["cache-control"]).toBe("no-store");
    const value = r.json(); expect(Object.keys(value).sort()).toEqual(["id", "eventId", "registrationId", "status", "issuedAt", "token"].sort());
    expect(value.token).toMatch(/^oe1_[A-Za-z0-9_-]{43}$/); expect(new Date(value.issuedAt).toISOString()).toBe(value.issuedAt);
    const persisted = await rows(f.registration.id); expect(persisted).toHaveLength(1);
    expect(persisted[0].tokenHash).toBe(createHash("sha256").update(value.token).digest("hex"));
    expect(JSON.stringify(persisted)).not.toContain(value.token);
    expect((await post(app, f.event.id, f.registration.id)).statusCode).toBe(409);
    expect(await rows(f.registration.id)).toEqual(persisted);
  });
  it.each(["closed", "cancelled", "cancelled-registration"])("does not persist for %s", async mode => {
    const f = await seed();
    if (mode === "cancelled-registration") await db.update(registrations).set({ status: "cancelled" }).where(eq(registrations.id, f.registration.id));
    else await db.update(events).set({ status: mode as "closed" | "cancelled" }).where(eq(events.id, f.event.id));
    const r = await post(appFor(f.actor), f.event.id, f.registration.id);
    expect(r.statusCode).toBe(409); expect(r.json().code).toBe("CREDENTIAL_ISSUANCE_NOT_ALLOWED"); expect(r.headers["cache-control"]).toBe("no-store"); expect(await rows(f.registration.id)).toEqual([]);
  });
  it.each(["active", "revoked", "expired"] as const)("never replaces existing %s credential", async status => {
    const f = await seed(); const app = appFor(f.actor); expect((await post(app, f.event.id, f.registration.id)).statusCode).toBe(201);
    await db.update(qrCredentials).set({ status }).where(eq(qrCredentials.registrationId, f.registration.id)); const before = await rows(f.registration.id);
    const r = await post(app, f.event.id, f.registration.id); expect(r.statusCode).toBe(409); expect(r.json().code).toBe("REGISTRATION_CREDENTIAL_EXISTS"); expect(await rows(f.registration.id)).toEqual(before);
  });
  it.each(["disabled", "removed", "incompatible"])("denies local authorization %s without writes", async mode => {
    const f = await seed();
    if (mode === "disabled") await db.update(users).set({ status: "disabled" }).where(eq(users.id, f.user.id));
    if (mode === "removed") await db.delete(eventStaff).where(eq(eventStaff.eventId, f.event.id));
    if (mode === "incompatible") await db.update(eventStaff).set({ role: "checkin_operator" }).where(eq(eventStaff.eventId, f.event.id));
    const r = await post(appFor(f.actor), f.event.id, f.registration.id);
    expect(r.statusCode).toBe(mode === "disabled" ? 403 : 404); expect(r.headers["cache-control"]).toBe("no-store"); expect(await rows(f.registration.id)).toEqual([]);
  });
  it("isolates events and conceals foreign or missing inscriptions", async () => {
    const f = await seed(); const other = await seed(); const app = appFor(f.actor);
    const hidden = await post(app, other.event.id, other.registration.id);
    expect(hidden.statusCode).toBe(404); expect(hidden.json().code).toBe("EVENT_NOT_FOUND");
    for (const id of [other.registration.id, randomUUID()]) {
      const r = await post(app, f.event.id, id); expect(r.statusCode).toBe(404); expect(r.json().code).toBe("REGISTRATION_NOT_FOUND");
    }
    expect(await rows(f.registration.id)).toEqual([]); expect(await rows(other.registration.id)).toEqual([]);
  });
  it("does not provision an unknown identity", async () => {
    const f = await seed(); const stranger = { ...f.actor, objectId: randomUUID() }; const app = appFor(stranger);
    for (const id of [f.event.id, randomUUID()]) expect((await post(app, id, f.registration.id)).json().code).toBe("EVENT_NOT_FOUND");
    expect(await db.select().from(users).where(eq(users.externalSubject, `entra:${stranger.tenantId}:${stranger.objectId}`))).toEqual([]);
    expect(await rows(f.registration.id)).toEqual([]);
  });
  it.each(["same organizer", "different organizers"])("two independent HTTP requests yield 201 and 409: %s", async mode => {
    const f = await seed(); let second = f.actor;
    if (mode === "different organizers") {
      second = { ...f.actor, objectId: randomUUID() };
      const [user] = await db.insert(users).values({ externalSubject: `entra:${second.tenantId}:${second.objectId}` }).returning(); userIds.push(user.id);
      await db.insert(eventStaff).values({ eventId: f.event.id, userId: user.id, role: "organizer" });
    }
    const responses = await Promise.all([post(appFor(f.actor), f.event.id, f.registration.id), post(appFor(second, databases[1]), f.event.id, f.registration.id)]);
    expect(responses.map(r => r.statusCode).sort()).toEqual([201, 409]);
    const winner = responses.find(r => r.statusCode === 201)!; const loser = responses.find(r => r.statusCode === 409)!;
    expect(loser.json().code).toBe("REGISTRATION_CREDENTIAL_EXISTS"); expect(loser.body).not.toContain(winner.json().token);
    for (const r of responses) expect(r.headers["cache-control"]).toBe("no-store");
    const persisted = await rows(f.registration.id); expect(persisted).toHaveLength(1);
    expect(persisted[0].tokenHash).toBe(createHash("sha256").update(winner.json().token).digest("hex"));
  });
});
