import { searchRegistrationsForStaff } from "./search-registrations-for-staff.js";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";
import type { AccessTokenVerifier } from "../../auth/http-auth.js";
import type { AuthenticatedUser } from "../../auth/verify-access-token.js";
import { parseDatabaseConfig } from "../../config.js";
import { registrations, events, eventStaff, users } from "../../db/schema.js";
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

describe("HTTP registration search with PostgreSQL", () => {
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
          registrationSearch: (id, query, user) => searchRegistrationsForStaff(tx, id, query, user),
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
  async function seed(tx: NodePgDatabase, actor: AuthenticatedUser) {
    const event = await createEventForOrganizer(tx, input(), actor);
    const saved = await registerAttendeeForOrganizer(tx, event.id, { fullName: "Ana Search", email: "ana@example.com" }, actor);
    return { event, saved };
  }
  const url = (id: string, query = "q=Search") => `/api/v1/events/${id}/registrations/search?${query}`;
  it("searches persisted data, pages without duplicates and isolates events", async () => {
    await fixture(async ({ tx, app, actor }) => {
      const { event, saved } = await seed(tx, actor);
      const second = await registerAttendeeForOrganizer(tx, event.id, { fullName: "Search Second", email: "second@example.com" }, actor);
      await seed(tx, actor);
      const first = await app.inject({ url: url(event.id, "q=Search&limit=1"), headers });
      expect(first.statusCode).toBe(200); expect(first.headers["cache-control"]).toBe("no-store");
      const next = await app.inject({ url: url(event.id, `q=Search&limit=1&cursor=${first.json().nextCursor}`), headers });
      expect(next.statusCode).toBe(200); expect(next.json().nextCursor).toBeNull();
      expect([...first.json().items, ...next.json().items].map((r: { id: string }) => r.id).sort()).toEqual([saved.id, second.id].sort());
      expect((await app.inject({ url: url(event.id, "q=ANA%40EXAMPLE"), headers })).json().items[0].id).toBe(saved.id);
      expect((await app.inject({ url: url(event.id, "q=absent"), headers })).json()).toEqual({ items: [], nextCursor: null });
    });
  });
  it.each(["draft", "active", "closed", "cancelled"] as const)("returns cancelled registrations in %s without writes", async status => {
    await fixture(async ({ tx, app, actor }) => {
      const { event, saved } = await seed(tx, actor);
      await tx.update(events).set({ status }).where(eq(events.id, event.id));
      await tx.update(registrations).set({ status: "cancelled" }).where(eq(registrations.id, saved.id));
      const before = await tx.select().from(registrations).where(eq(registrations.eventId, event.id));
      const r = await app.inject({ url: url(event.id), headers });
      expect(r.statusCode).toBe(200); expect(r.json().items[0].status).toBe("cancelled");
      expect(await tx.select().from(registrations).where(eq(registrations.eventId, event.id))).toEqual(before);
    });
  });
  it("allows an assigned operator but preserves existing route permissions", async () => {
    await fixture(async ({ tx, app, actor, verify }) => {
      const { event, saved } = await seed(tx, actor);
      await tx.update(eventStaff).set({ role: "checkin_operator" }).where(eq(eventStaff.eventId, event.id));
      verify.mockResolvedValue({ ...actor, roles: ["checkin_operator"] });
      expect((await app.inject({ url: url(event.id), headers })).statusCode).toBe(200);
      expect((await app.inject({ url: `/api/v1/events/${event.id}/registrations/${saved.id}`, headers })).statusCode).toBe(403);
    });
  });
  it.each(["removed", "disabled", "incompatible"])("denies the next page after permissions become %s", async mode => {
    await fixture(async ({ tx, app, actor }) => {
      const { event } = await seed(tx, actor);
      await registerAttendeeForOrganizer(tx, event.id, { fullName: "Search Second", email: "second@example.com" }, actor);
      const first = await app.inject({ url: url(event.id, "q=Search&limit=1"), headers });
      expect(first.json().nextCursor).toBeTypeOf("string");
      if (mode === "removed") await tx.delete(eventStaff).where(eq(eventStaff.eventId, event.id));
      if (mode === "incompatible") await tx.update(eventStaff).set({ role: "checkin_operator" }).where(eq(eventStaff.eventId, event.id));
      if (mode === "disabled") await tx.update(users).set({ status: "disabled" }).where(eq(users.externalSubject, subject(actor)));
      const r = await app.inject({ url: url(event.id, `q=Search&cursor=${first.json().nextCursor}`), headers });
      expect(r.statusCode).toBe(mode === "disabled" ? 403 : 404); expect(r.headers["cache-control"]).toBe("no-store");
    });
  });
  it("rejects mixed cursors and treats wildcard text literally", async () => {
    await fixture(async ({ tx, app, actor }) => {
      const { event } = await seed(tx, actor); const other = await createEventForOrganizer(tx, input(), actor);
      await registerAttendeeForOrganizer(tx, event.id, { fullName: "Search Second", email: "second@example.com" }, actor);
      const first = await app.inject({ url: url(event.id, "q=Search&limit=1"), headers });
      for (const path of [url(other.id, `q=Search&cursor=${first.json().nextCursor}`), url(event.id, `q=Ana&cursor=${first.json().nextCursor}`)]) {
        expect((await app.inject({ url: path, headers })).statusCode).toBe(400);
      }
      expect((await app.inject({ url: url(event.id, "q=%25"), headers })).json().items).toEqual([]);
    });
  });
  it("hides unknown users and events without creating users", async () => {
    await fixture(async ({ tx, app, actor, verify }) => {
      const { event } = await seed(tx, actor); const outsider = identity(); verify.mockResolvedValue(outsider);
      for (const id of [event.id, randomUUID()]) expect((await app.inject({ url: url(id), headers })).statusCode).toBe(404);
      expect(await tx.select().from(users).where(eq(users.externalSubject, subject(outsider)))).toEqual([]);
    });
  });
});
