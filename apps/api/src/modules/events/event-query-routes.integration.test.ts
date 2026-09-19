import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";
import type { AccessTokenVerifier } from "../../auth/http-auth.js";
import type { AuthenticatedUser } from "../../auth/verify-access-token.js";
import { parseDatabaseConfig } from "../../config.js";
import { eventStaff, users } from "../../db/schema.js";
import { createEventForOrganizer } from "./create-event-for-organizer.js";
import { getEventForOrganizer, listEventsForOrganizer } from "./query-events-for-organizer.js";
import { encodeEventCursor } from "./event-query-input.js";

function identity(): AuthenticatedUser {
  return { tenantId: randomUUID(), objectId: randomUUID(), subject: "http-query-test", roles: ["organizer"] };
}
function subject(actor: AuthenticatedUser) {
  return `entra:${actor.tenantId}:${actor.objectId}`;
}
function input() {
  return { name: "HTTP query test", slug: `http-query-${randomUUID()}`,
    startsAt: "2027-08-27T14:00:00Z", endsAt: "2027-08-27T22:00:00Z",
    timezone: "America/Lima", location: "Test venue" };
}
const headers = { authorization: "Bearer test-token" };
type Fixture = { tx: NodePgDatabase; app: ReturnType<typeof buildApp>;
  actor: AuthenticatedUser; verify: ReturnType<typeof vi.fn<AccessTokenVerifier>> };

describe("event query HTTP routes with PostgreSQL", () => {
  let client: Client;
  let db: NodePgDatabase;
  beforeAll(async () => {
    client = new Client({ connectionString: parseDatabaseConfig(process.env).databaseUrl,
      connectionTimeoutMillis: 5000, query_timeout: 5000 });
    await client.connect(); db = drizzle(client);
  });
  afterAll(async () => { if (client) await client.end(); });
  async function fixture(run: (value: Fixture) => Promise<void>) {
    const marker = new Error("Rollback HTTP query fixtures");
    try {
      await db.transaction(async (tx) => {
        const actor = identity();
        // Solo se simula el verificador de Entra: HTTP y persistencia son reales.
        const verify = vi.fn<AccessTokenVerifier>().mockResolvedValue(actor);
        const app = buildApp({ verifyAccessToken: verify,
          createEvent: (body, user) => createEventForOrganizer(tx, body, user),
          eventQueries: {
            list: (query, user) => listEventsForOrganizer(tx, query, user),
            get: (id, user) => getEventForOrganizer(tx, id, user),
          } });
        try { await run({ tx, app, actor, verify }); }
        finally { await app.close(); }
        throw marker;
      });
    } catch (error) { if (error !== marker) throw error; }
  }

  it("retrieves the exact event created through HTTP", async () => {
    await fixture(async ({ app }) => {
      const created = await app.inject({ method: "POST", url: "/api/v1/events", headers, payload: input() });
      expect(created.statusCode).toBe(201);
      const event = created.json();
      const detail = await app.inject({ url: `/api/v1/events/${event.id}`, headers });
      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toEqual(event);
      expect(detail.headers["cache-control"]).toBe("no-store");
      const list = await app.inject({ url: "/api/v1/events", headers });
      expect(list.statusCode).toBe(200);
      expect(list.json()).toEqual({ items: [event], nextCursor: null });
      expect(list.headers["cache-control"]).toBe("no-store");
    });
  });

  it("isolates organizers and uses identical 404 bodies for foreign and missing events", async () => {
    await fixture(async ({ tx, app, actor }) => {
      const own = await createEventForOrganizer(tx, input(), actor);
      const foreign = await createEventForOrganizer(tx, input(), identity());
      const list = await app.inject({ url: "/api/v1/events", headers });
      expect(list.json().items.map((event: { id: string }) => event.id)).toEqual([own.id]);
      const denied = await app.inject({ url: `/api/v1/events/${foreign.id}`, headers });
      const missing = await app.inject({ url: `/api/v1/events/${randomUUID()}`, headers });
      expect(denied.statusCode).toBe(404); expect(missing.statusCode).toBe(404);
      expect(denied.json()).toEqual(missing.json());
      expect(denied.json()).toEqual({ code: "EVENT_NOT_FOUND", message: "No se encontró el evento." });
    });
  });

  it("returns no events for an unknown local identity without provisioning it", async () => {
    await fixture(async ({ tx, app, actor }) => {
      const list = await app.inject({ url: "/api/v1/events", headers });
      expect(list.statusCode).toBe(200);
      expect(list.json()).toEqual({ items: [], nextCursor: null });
      expect((await app.inject({ url: `/api/v1/events/${randomUUID()}`, headers })).statusCode).toBe(404);
      expect(await tx.select().from(users).where(eq(users.externalSubject, subject(actor)))).toEqual([]);
    });
  });

  it("paginates authorized events through the returned cursor", async () => {
    await fixture(async ({ tx, app, actor }) => {
      const events = [await createEventForOrganizer(tx, input(), actor),
        await createEventForOrganizer(tx, input(), actor), await createEventForOrganizer(tx, input(), actor)]
        .sort((a, b) => a.id.localeCompare(b.id));
      await createEventForOrganizer(tx, input(), identity());
      const first = await app.inject({ url: "/api/v1/events?limit=2", headers });
      expect(first.statusCode).toBe(200);
      expect(first.json().items.map((event: { id: string }) => event.id)).toEqual(events.slice(0, 2).map(e => e.id));
      expect(first.json().nextCursor).toBe(encodeEventCursor(events[1].id));
      const second = await app.inject({ url: `/api/v1/events?limit=2&cursor=${first.json().nextCursor}`, headers });
      expect(second.statusCode).toBe(200);
      expect(second.json().items.map((event: { id: string }) => event.id)).toEqual([events[2].id]);
      expect(second.json().nextCursor).toBeNull();
    });
  });

  it("rejects disabled accounts on both routes", async () => {
    await fixture(async ({ tx, app, actor }) => {
      const event = await createEventForOrganizer(tx, input(), actor);
      await tx.update(users).set({ status: "disabled" }).where(eq(users.externalSubject, subject(actor)));
      for (const url of ["/api/v1/events", `/api/v1/events/${event.id}`]) {
        const response = await app.inject({ url, headers });
        expect(response.statusCode).toBe(403);
        expect(response.json().code).toBe("FORBIDDEN");
      }
    });
  });

  it("rejects missing tokens before invalid query parameters", async () => {
    await fixture(async ({ app, verify }) => {
      for (const url of ["/api/v1/events?limit=bad", "/api/v1/events/invalid"]) {
        const response = await app.inject({ url });
        expect(response.statusCode).toBe(401);
        expect(response.headers["www-authenticate"]).toBe("Bearer");
      }
      expect(verify).not.toHaveBeenCalled();
    });
  });

  it("rejects an admin token even when the account is assigned as organizer", async () => {
    await fixture(async ({ tx, app, actor, verify }) => {
      const event = await createEventForOrganizer(tx, input(), actor);
      verify.mockResolvedValue({ ...actor, roles: ["admin"] });
      for (const url of ["/api/v1/events", `/api/v1/events/${event.id}`]) {
        expect((await app.inject({ url, headers })).statusCode).toBe(403);
      }
    });
  });

  it("stops returning an event after its assignment is removed", async () => {
    await fixture(async ({ tx, app, actor }) => {
      const event = await createEventForOrganizer(tx, input(), actor);
      await tx.delete(eventStaff).where(eq(eventStaff.eventId, event.id));
      expect((await app.inject({ url: "/api/v1/events", headers })).json().items).toEqual([]);
      expect((await app.inject({ url: `/api/v1/events/${event.id}`, headers })).statusCode).toBe(404);
    });
  });

  it("does not treat an operator assignment as organizer permission", async () => {
    await fixture(async ({ tx, app, actor }) => {
      const event = await createEventForOrganizer(tx, input(), actor);
      await tx.update(eventStaff).set({ role: "checkin_operator" }).where(eq(eventStaff.eventId, event.id));
      expect((await app.inject({ url: "/api/v1/events", headers })).json().items).toEqual([]);
      expect((await app.inject({ url: `/api/v1/events/${event.id}`, headers })).statusCode).toBe(404);
    });
  });

  it("rejects repeated limits and caller-supplied identity", async () => {
    await fixture(async ({ app }) => {
      for (const url of ["/api/v1/events?limit=2&limit=3", "/api/v1/events?userId=other",
        "/api/v1/events?limit=101", "/api/v1/events?cursor=invalid"]) {
        const response = await app.inject({ url, headers });
        expect(response.statusCode).toBe(400);
        expect(response.json().code).toBe("INVALID_EVENT_QUERY");
      }
    });
  });

  it("preserves isolation even when a cursor comes from another organizer", async () => {
    await fixture(async ({ tx, app, actor }) => {
      const own = await createEventForOrganizer(tx, input(), actor);
      const foreign = await createEventForOrganizer(tx, input(), identity());
      const response = await app.inject({ url: `/api/v1/events?cursor=${encodeEventCursor(foreign.id)}`, headers });
      expect(response.statusCode).toBe(200);
      expect(response.json().items.map((event: { id: string }) => event.id))
        .toEqual(own.id > foreign.id ? [own.id] : []);
    });
  });

  it("hides a real PostgreSQL read failure on both routes", async () => {
    await fixture(async ({ tx, app, actor }) => {
      const event = await createEventForOrganizer(tx, input(), actor);
      // Cambio visible solo dentro de esta transacción; el rollback lo revierte.
      // Fuerza que la consulta real falle por una columna inexistente.
      await tx.execute(sql`ALTER TABLE event RENAME COLUMN name TO issue27_test_hidden_name`);
      const log = vi.spyOn(app.log, "error");
      for (const url of ["/api/v1/events", `/api/v1/events/${event.id}`]) {
        const response = await app.inject({ url, headers });
        expect(response.statusCode).toBe(500);
        expect(response.json()).toEqual({ code: "INTERNAL_SERVER_ERROR",
          message: "No se pudieron consultar los eventos. Inténtalo más tarde." });
        expect(response.body).not.toContain("column");
      }
      expect(log).toHaveBeenCalledTimes(2);
      for (const call of log.mock.calls) {
        expect(call).toEqual([{ code: "EVENT_QUERY_FAILED" }, "No se pudieron consultar los eventos."]);
      }
    });
  });
});
