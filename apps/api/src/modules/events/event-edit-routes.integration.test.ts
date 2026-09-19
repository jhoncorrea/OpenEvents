import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";
import type { AccessTokenVerifier } from "../../auth/http-auth.js";
import type { AuthenticatedUser } from "../../auth/verify-access-token.js";
import { parseDatabaseConfig } from "../../config.js";
import { events, eventStaff, users } from "../../db/schema.js";
import { createEventForOrganizer } from "./create-event-for-organizer.js";
import { editEventForOrganizer } from "./edit-event-for-organizer.js";
import { getEventForOrganizer, listEventsForOrganizer } from "./query-events-for-organizer.js";

const identity = (): AuthenticatedUser => ({ tenantId: randomUUID(), objectId: randomUUID(), subject: "http-edit", roles: ["organizer"] });
const subject = (actor: AuthenticatedUser) => `entra:${actor.tenantId}:${actor.objectId}`;
const input = () => ({ name: "Original", slug: `http-edit-${randomUUID()}`,
  startsAt: "2027-08-27T14:00:00Z", endsAt: "2027-08-27T22:00:00Z", timezone: "America/Lima", location: "Lima" });
const headers = { authorization: "Bearer test-token" };
type Fixture = { tx: NodePgDatabase; app: ReturnType<typeof buildApp>; actor: AuthenticatedUser;
  verify: ReturnType<typeof vi.fn<AccessTokenVerifier>> };

describe("PATCH event with PostgreSQL", () => {
  let client: Client;
  let db: NodePgDatabase;
  beforeAll(async () => {
    client = new Client({ connectionString: parseDatabaseConfig(process.env).databaseUrl,
      connectionTimeoutMillis: 5000, statement_timeout: 5000, query_timeout: 6000 });
    await client.connect(); db = drizzle(client);
  });
  afterAll(async () => { if (client) await client.end(); });
  async function fixture(run: (f: Fixture) => Promise<void>) {
    const rollback = new Error("Rollback HTTP edit test");
    try {
      await db.transaction(async tx => {
        const actor = identity();
        // El verificador de Entra es simulado; rutas, operaciones y BD son reales.
        const verify = vi.fn<AccessTokenVerifier>().mockResolvedValue(actor);
        const app = buildApp({ verifyAccessToken: verify,
          createEvent: (body, user) => createEventForOrganizer(tx, body, user),
          editEvent: (id, body, user) => editEventForOrganizer(tx, id, body, user),
          eventQueries: { list: (query, user) => listEventsForOrganizer(tx, query, user),
            get: (id, user) => getEventForOrganizer(tx, id, user) } });
        try { await run({ tx, app, actor, verify }); }
        finally { await app.close(); }
        throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
  }
  const patch = (app: ReturnType<typeof buildApp>, id: string, payload: Record<string, unknown>) =>
    app.inject({ method: "PATCH", url: `/api/v1/events/${id}`, headers, payload });

  it("creates, edits and reads the same updated event through HTTP", async () => {
    await fixture(async ({ app, tx }) => {
      const created = await app.inject({ method: "POST", url: "/api/v1/events", headers, payload: input() });
      expect(created.statusCode).toBe(201);
      const original = created.json(); expect(original.version).toBe(1);
      const response = await patch(app, original.id, { expectedVersion: original.version, name: "Corregido", location: "Cusco" });
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      const updated = { ...original, name: "Corregido", location: "Cusco", version: 2 };
      expect(response.json()).toEqual(updated);
      expect((await app.inject({ url: `/api/v1/events/${original.id}`, headers })).json()).toEqual(updated);
      expect((await app.inject({ url: "/api/v1/events", headers })).json()).toEqual({ items: [updated], nextCursor: null });
      const [persisted] = await tx.select().from(events).where(eq(events.id, original.id));
      expect(persisted).toMatchObject({ name: "Corregido", location: "Cusco", version: 2 });
    });
  });
  it("returns version conflict and preserves the first edit", async () => {
    await fixture(async ({ app, tx, actor }) => {
      const original = await createEventForOrganizer(tx, input(), actor);
      expect((await patch(app, original.id, { expectedVersion: 1, name: "First" })).statusCode).toBe(200);
      const stale = await patch(app, original.id, { expectedVersion: 1, name: "Stale" });
      expect(stale.statusCode).toBe(409); expect(stale.json().code).toBe("EVENT_VERSION_CONFLICT");
      expect(await tx.select().from(events).where(eq(events.id, original.id))).toEqual([{ ...original, name: "First", version: 2 }]);
    });
  });
  it("returns slug conflict and rolls back fields and version", async () => {
    await fixture(async ({ app, tx, actor }) => {
      const original = await createEventForOrganizer(tx, input(), actor);
      const other = await createEventForOrganizer(tx, input(), actor);
      const response = await patch(app, original.id, { expectedVersion: 1, slug: other.slug, name: "Must roll back" });
      expect(response.statusCode).toBe(409); expect(response.json().code).toBe("EVENT_SLUG_CONFLICT");
      expect(await tx.select().from(events).where(eq(events.id, original.id))).toEqual([original]);
    });
  });
  it.each(["active", "closed", "cancelled"] as const)("returns not editable for %s", async status => {
    await fixture(async ({ app, tx, actor }) => {
      const original = await createEventForOrganizer(tx, input(), actor);
      await tx.update(events).set({ status }).where(eq(events.id, original.id));
      const response = await patch(app, original.id, { expectedVersion: 1, name: "Denied" });
      expect(response.statusCode).toBe(409); expect(response.json().code).toBe("EVENT_NOT_EDITABLE");
      expect(await tx.select().from(events).where(eq(events.id, original.id))).toEqual([{ ...original, status }]);
    });
  });
  it("returns identical 404 bodies for foreign and missing events without provisioning", async () => {
    await fixture(async ({ app, tx, actor, verify }) => {
      const original = await createEventForOrganizer(tx, input(), actor);
      const outsider = identity(); verify.mockResolvedValue(outsider);
      const denied = await patch(app, original.id, { expectedVersion: 1, name: "Denied" });
      const missing = await patch(app, randomUUID(), { expectedVersion: 1, name: "Denied" });
      expect(denied.statusCode).toBe(404); expect(missing.statusCode).toBe(404);
      expect(denied.json()).toEqual(missing.json());
      expect(await tx.select().from(users).where(eq(users.externalSubject, subject(outsider)))).toEqual([]);
      expect(await tx.select().from(events).where(eq(events.id, original.id))).toEqual([original]);
    });
  });
  it("returns 403 for a disabled local organizer", async () => {
    await fixture(async ({ app, tx, actor }) => {
      const original = await createEventForOrganizer(tx, input(), actor);
      await tx.update(users).set({ status: "disabled" }).where(eq(users.externalSubject, subject(actor)));
      expect((await patch(app, original.id, { expectedVersion: 1, name: "Denied" })).statusCode).toBe(403);
      expect(await tx.select().from(events).where(eq(events.id, original.id))).toEqual([original]);
    });
  });
  it("returns 403 for admin without global organizer even with an assignment", async () => {
    await fixture(async ({ app, tx, actor, verify }) => {
      const original = await createEventForOrganizer(tx, input(), actor);
      verify.mockResolvedValue({ ...actor, roles: ["admin"] });
      expect((await patch(app, original.id, { expectedVersion: 1, name: "Denied" })).statusCode).toBe(403);
      expect(await tx.select().from(events).where(eq(events.id, original.id))).toEqual([original]);
    });
  });
  it("rejects editing after assignment removal", async () => {
    await fixture(async ({ app, tx, actor }) => {
      const original = await createEventForOrganizer(tx, input(), actor);
      await tx.delete(eventStaff).where(eq(eventStaff.eventId, original.id));
      expect((await patch(app, original.id, { expectedVersion: 1, name: "Denied" })).statusCode).toBe(404);
      expect(await tx.select().from(events).where(eq(events.id, original.id))).toEqual([original]);
    });
  });
  it.each([
    { expectedVersion: 1, startsAt: "2027-08-28T14:00:00Z" },
    { expectedVersion: 1, name: "Denied", status: "active" },
    { expectedVersion: 1, name: "Denied", userId: "caller" },
    { name: "Missing version" },
  ])("returns 400 and preserves the event for %j", async body => {
    await fixture(async ({ app, tx, actor }) => {
      const original = await createEventForOrganizer(tx, input(), actor);
      const response = await patch(app, original.id, body);
      expect(response.statusCode).toBe(400);
      expect(await tx.select().from(events).where(eq(events.id, original.id))).toEqual([original]);
    });
  });
  it("requires authentication before validating malformed input", async () => {
    await fixture(async ({ app, verify }) => {
      const response = await app.inject({ method: "PATCH", url: "/api/v1/events/invalid", payload: {} });
      expect(response.statusCode).toBe(401); expect(verify).not.toHaveBeenCalled();
    });
  });
  it("hides a real write failure and rolls back the edit", async () => {
    await fixture(async ({ app, tx, actor }) => {
      const original = await createEventForOrganizer(tx, input(), actor);
      // Restricción temporal en la transacción de prueba; el rollback la retira.
      await tx.execute(sql`ALTER TABLE event ADD CONSTRAINT issue31_reject_update CHECK (version = 1) NOT VALID`);
      const log = vi.spyOn(app.log, "error");
      const response = await patch(app, original.id, { expectedVersion: 1, name: "Must roll back" });
      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({ code: "INTERNAL_SERVER_ERROR", message: "No se pudo editar el evento. Inténtalo más tarde." });
      expect(log).toHaveBeenCalledExactlyOnceWith({ code: "EVENT_EDIT_FAILED" }, "No se pudo editar el evento.");
      expect(await tx.select().from(events).where(eq(events.id, original.id))).toEqual([original]);
    });
  });
});
