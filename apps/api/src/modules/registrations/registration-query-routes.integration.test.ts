import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";
import type { AccessTokenVerifier } from "../../auth/http-auth.js";
import type { AuthenticatedUser } from "../../auth/verify-access-token.js";
import { parseDatabaseConfig } from "../../config.js";
import { attendees, registrations, events, eventStaff, users } from "../../db/schema.js";
import { createEventForOrganizer } from "../events/create-event-for-organizer.js";
import { registerAttendeeForOrganizer } from "./register-attendee-for-organizer.js";
import { getRegistrationForOrganizer, listRegistrationsForOrganizer } from "./query-registrations-for-organizer.js";
import { getEventForOrganizer, listEventsForOrganizer } from "../events/query-events-for-organizer.js";

const identity = (): AuthenticatedUser => ({ tenantId: randomUUID(), objectId: randomUUID(), subject: "http-query", roles: ["organizer"] });
const subject = (actor: AuthenticatedUser) => `entra:${actor.tenantId}:${actor.objectId}`;
const input = () => ({ name: "Original", slug: `http-query-${randomUUID()}`,
  startsAt: "2027-08-27T14:00:00Z", endsAt: "2027-08-27T22:00:00Z", timezone: "America/Lima", location: "Lima" });
const headers = { authorization: "Bearer test-token" };
type Fixture = { tx: NodePgDatabase; app: ReturnType<typeof buildApp>; actor: AuthenticatedUser;
  verify: ReturnType<typeof vi.fn<AccessTokenVerifier>> };

describe("GET registrations with PostgreSQL", () => {
  let client: Client;
  let db: NodePgDatabase;
  beforeAll(async () => {
    client = new Client({ connectionString: parseDatabaseConfig(process.env).databaseUrl,
      connectionTimeoutMillis: 5000, statement_timeout: 5000, query_timeout: 6000 });
    await client.connect(); db = drizzle(client);
  });
  afterAll(async () => { if (client) await client.end(); });
  async function fixture(run: (f: Fixture) => Promise<void>) {
    const rollback = new Error("Rollback HTTP query test");
    try {
      await db.transaction(async tx => {
        const actor = identity();
        // El verificador de Entra es simulado; rutas, operaciones y BD son reales.
        const verify = vi.fn<AccessTokenVerifier>().mockResolvedValue(actor);
        const app = buildApp({ verifyAccessToken: verify,
          createEvent: (body, user) => createEventForOrganizer(tx, body, user),
          registerAttendee: (id, body, user) => registerAttendeeForOrganizer(tx, id, body, user),
          registrationQueries: { list: (id, query, user) => listRegistrationsForOrganizer(tx, id, query, user),
            get: (id, registrationId, user) => getRegistrationForOrganizer(tx, id, registrationId, user) },
          eventQueries: { list: (query, user) => listEventsForOrganizer(tx, query, user),
            get: (id, user) => getEventForOrganizer(tx, id, user) } });
        try { await run({ tx, app, actor, verify }); }
        finally { await app.close(); }
        throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
  }
  const body = { fullName: " Ana Pérez ", email: " ANA@EXAMPLE.COM " };
  const post = (app: ReturnType<typeof buildApp>, id: string, payload: Record<string, unknown> = body) =>
    app.inject({ method: "POST", url: `/api/v1/events/${id}/registrations`, headers, payload });

  const listUrl = (id: string) => `/api/v1/events/${id}/registrations`;
  it("creates, lists and reads the same persisted registration through HTTP", async () => {
    await fixture(async ({ app, tx, actor }) => {
      const created = await app.inject({ method: "POST", url: "/api/v1/events", headers, payload: input() });
      expect(created.statusCode).toBe(201);
      const eventId = created.json().id;
      const registration = await post(app, eventId); expect(registration.statusCode).toBe(201);
      const page = await app.inject({ url: listUrl(eventId), headers });
      const detail = await app.inject({ url: `${listUrl(eventId)}/${registration.json().id}`, headers });
      expect(page.statusCode).toBe(200); expect(detail.statusCode).toBe(200);
      expect(page.json()).toEqual({ items: [{ ...registration.json(), checkedInAt: null }], nextCursor: null });
      expect(detail.json()).toEqual({ ...registration.json(), checkedInAt: null });
      expect(page.headers["cache-control"]).toBe("no-store"); expect(detail.headers["cache-control"]).toBe("no-store");
      expect(detail.body).not.toContain("emailNormalized");
      expect(await tx.select().from(users).where(eq(users.externalSubject, subject(actor)))).toHaveLength(1);
    });
  });
  it("returns an empty list without changing event or assignments", async () => {
    await fixture(async ({ app, tx, actor }) => {
      const event = await createEventForOrganizer(tx, input(), actor);
      const staff = await tx.select().from(eventStaff).where(eq(eventStaff.eventId, event.id));
      const response = await app.inject({ url: listUrl(event.id), headers });
      expect(response.statusCode).toBe(200); expect(response.json()).toEqual({ items: [], nextCursor: null });
      expect(await tx.select().from(events).where(eq(events.id, event.id))).toEqual([event]);
      expect(await tx.select().from(eventStaff).where(eq(eventStaff.eventId, event.id))).toEqual(staff);
    });
  });
  it("paginates without duplicates or leaking the same email from another event", async () => {
    await fixture(async ({ app, tx, actor }) => {
      const event = await createEventForOrganizer(tx, input(), actor);
      const other = await createEventForOrganizer(tx, input(), actor);
      const first = await post(app, event.id);
      const second = await post(app, event.id, { fullName: "Second", email: "second@example.com" });
      const foreign = await post(app, other.id, { fullName: "Other event", email: "ana@example.com" });
      expect([first.statusCode, second.statusCode, foreign.statusCode]).toEqual([201, 201, 201]);
      const page1 = await app.inject({ url: `${listUrl(event.id)}?limit=1`, headers });
      expect(page1.statusCode).toBe(200); expect(page1.json().nextCursor).toEqual(expect.any(String));
      const page2 = await app.inject({ url: `${listUrl(event.id)}?limit=1&cursor=${page1.json().nextCursor}`, headers });
      expect(page2.statusCode).toBe(200); expect(page2.json().nextCursor).toBeNull();
      const ids = [...page1.json().items, ...page2.json().items].map((item: { id: string }) => item.id);
      expect(ids).toEqual([first.json().id, second.json().id].sort()); expect(ids).not.toContain(foreign.json().id);
      const wrongCursor = await app.inject({ url: `${listUrl(other.id)}?cursor=${page1.json().nextCursor}`, headers });
      expect(wrongCursor.statusCode).toBe(400);
    });
  });
  it.each(["draft", "active", "closed", "cancelled"] as const)("reads both routes for event state %s", async status => {
    await fixture(async ({ app, tx, actor }) => {
      const event = await createEventForOrganizer(tx, input(), actor); const saved = await post(app, event.id);
      await tx.update(events).set({ status }).where(eq(events.id, event.id));
      for (const url of [listUrl(event.id), `${listUrl(event.id)}/${saved.json().id}`]) {
        expect((await app.inject({ url, headers })).statusCode).toBe(200);
      }
    });
  });
  it("returns cancelled registrations with their actual status", async () => {
    await fixture(async ({ app, tx, actor }) => {
      const event = await createEventForOrganizer(tx, input(), actor); const saved = await post(app, event.id);
      await tx.update(registrations).set({ status: "cancelled" }).where(eq(registrations.id, saved.json().id));
      const page = await app.inject({ url: listUrl(event.id), headers });
      const detail = await app.inject({ url: `${listUrl(event.id)}/${saved.json().id}`, headers });
      expect(page.json().items[0].status).toBe("cancelled"); expect(detail.json().status).toBe("cancelled");
    });
  });
  it("uses identical 404 bodies for foreign and nonexistent events without provisioning", async () => {
    await fixture(async ({ app, tx, actor, verify }) => {
      const event = await createEventForOrganizer(tx, input(), actor); const saved = await post(app, event.id);
      const outsider = identity(); verify.mockResolvedValue(outsider);
      for (const suffix of ["", `/${saved.json().id}`]) {
        const foreign = await app.inject({ url: listUrl(event.id) + suffix, headers });
        const missing = await app.inject({ url: listUrl(randomUUID()) + suffix, headers });
        expect(foreign.statusCode).toBe(404); expect(missing.statusCode).toBe(404);
        expect(foreign.json()).toEqual(missing.json()); expect(foreign.body).not.toContain("ana@example.com");
      }
      expect(await tx.select().from(users).where(eq(users.externalSubject, subject(outsider)))).toEqual([]);
    });
  });
  it("does not accept a registration belonging to another authorized event", async () => {
    await fixture(async ({ app, tx, actor }) => {
      const event = await createEventForOrganizer(tx, input(), actor);
      const other = await createEventForOrganizer(tx, input(), actor); const saved = await post(app, other.id);
      const foreign = await app.inject({ url: `${listUrl(event.id)}/${saved.json().id}`, headers });
      const missing = await app.inject({ url: `${listUrl(event.id)}/${randomUUID()}`, headers });
      expect(foreign.statusCode).toBe(404); expect(missing.statusCode).toBe(404);
      expect(foreign.json()).toEqual(missing.json()); expect(foreign.json().code).toBe("REGISTRATION_NOT_FOUND");
    });
  });
  it("returns 403 for disabled users on both routes", async () => {
    await fixture(async ({ app, tx, actor }) => {
      const event = await createEventForOrganizer(tx, input(), actor); const saved = await post(app, event.id);
      await tx.update(users).set({ status: "disabled" }).where(eq(users.externalSubject, subject(actor)));
      for (const url of [listUrl(event.id), `${listUrl(event.id)}/${saved.json().id}`]) {
        expect((await app.inject({ url, headers })).statusCode).toBe(403);
      }
    });
  });
  it.each(["removed", "checkin_operator"])("denies a changed assignment: %s", async role => {
    await fixture(async ({ app, tx, actor }) => {
      const event = await createEventForOrganizer(tx, input(), actor); const saved = await post(app, event.id);
      if (role === "removed") await tx.delete(eventStaff).where(eq(eventStaff.eventId, event.id));
      else await tx.update(eventStaff).set({ role }).where(eq(eventStaff.eventId, event.id));
      for (const url of [listUrl(event.id), `${listUrl(event.id)}/${saved.json().id}`]) {
        expect((await app.inject({ url, headers })).statusCode).toBe(404);
      }
    });
  });
  it.each(([[], ["admin"], ["checkin_operator"]] as AuthenticatedUser["roles"][]).map(roles => ({ roles })))("rejects roles %j even with an organizer assignment", async ({ roles }) => {
    await fixture(async ({ app, tx, actor, verify }) => {
      const event = await createEventForOrganizer(tx, input(), actor); const saved = await post(app, event.id);
      verify.mockResolvedValue({ ...actor, roles });
      for (const url of [listUrl(event.id), `${listUrl(event.id)}/${saved.json().id}`]) {
        expect((await app.inject({ url, headers })).statusCode).toBe(403);
      }
    });
  });
  it("authenticates before validating malformed route and query values", async () => {
    await fixture(async ({ app, verify }) => {
      for (const url of ["/api/v1/events/bad/registrations?limit=bad", "/api/v1/events/bad/registrations/bad"]) {
        const response = await app.inject({ url });
        expect(response.statusCode).toBe(401); expect(response.headers["cache-control"]).toBe("no-store");
      }
      expect(verify).not.toHaveBeenCalled();
    });
  });
  it("rejects invalid queries without modifying stored attendees or registrations", async () => {
    await fixture(async ({ app, tx, actor }) => {
      const event = await createEventForOrganizer(tx, input(), actor); const saved = await post(app, event.id);
      const rows = await tx.select().from(registrations).where(eq(registrations.eventId, event.id));
      const people = await tx.select().from(attendees).where(eq(attendees.id, saved.json().attendee.id));
      for (const suffix of ["?limit=101", "?limit=1&limit=2", "?email=private@example.com", "/bad"]) {
        const response = await app.inject({ url: listUrl(event.id) + suffix, headers });
        expect(response.statusCode).toBe(400); expect(response.body).not.toContain("private@example.com");
      }
      expect(await tx.select().from(registrations).where(eq(registrations.eventId, event.id))).toEqual(rows);
      expect(await tx.select().from(attendees).where(eq(attendees.id, saved.json().attendee.id))).toEqual(people);
    });
  });
});
