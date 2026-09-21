import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  AuthenticationError, AuthorizationError, type AuthenticatedUser,
} from "../../auth/verify-access-token.js";
import { parseDatabaseConfig } from "../../config.js";
import { events, eventStaff, users } from "../../db/schema.js";
import { createEventForOrganizer } from "./create-event-for-organizer.js";
import { encodeEventCursor } from "./event-query-input.js";
import {
  EventNotFoundError, getEventForOperator, listEventsForOperator,
} from "./query-events-for-operator.js";

function actor(): AuthenticatedUser {
  return { tenantId: randomUUID(), objectId: randomUUID(), subject: "test", roles: ["checkin_operator"] };
}
function subject(user: AuthenticatedUser) {
  return `entra:${user.tenantId.toLowerCase()}:${user.objectId.toLowerCase()}`;
}
async function create(tx: NodePgDatabase, user: AuthenticatedUser) {
  const event = await createEventForOrganizer(tx, {
    name: "Query test", slug: `query-${randomUUID()}`,
    startsAt: "2027-08-27T14:00:00Z", endsAt: "2027-08-27T22:00:00Z",
    timezone: "America/Lima", location: "Test venue",
  }, { ...user, roles: ["organizer"] });
  await tx.update(eventStaff).set({ role: "checkin_operator" }).where(eq(eventStaff.eventId, event.id));
  return { id: event.id, name: event.name, startsAt: event.startsAt, endsAt: event.endsAt,
    timezone: event.timezone, location: event.location, status: event.status };
}

describe("operator event queries with PostgreSQL", () => {
  let client: Client;
  let db: NodePgDatabase;
  beforeAll(async () => {
    client = new Client({ connectionString: parseDatabaseConfig(process.env).databaseUrl,
      connectionTimeoutMillis: 5000, query_timeout: 5000 });
    await client.connect();
    db = drizzle(client);
  });
  afterAll(async () => { if (client) await client.end(); });

  async function rollback(run: (tx: NodePgDatabase) => Promise<void>) {
    const marker = new Error("Rollback query fixtures");
    try {
      await db.transaction(async (tx) => { await run(tx); throw marker; });
    } catch (error) { if (error !== marker) throw error; }
  }

  it("returns only assigned events and their operational detail", async () => {
    await rollback(async (tx) => {
      const a = actor(); const b = actor();
      const own = await create(tx, a); const other = await create(tx, b);
      expect(await listEventsForOperator(tx, {}, a)).toEqual({ items: [own], nextCursor: null });
      expect(await getEventForOperator(tx, own.id, a)).toEqual(own);
      await expect(getEventForOperator(tx, other.id, a)).rejects.toBeInstanceOf(EventNotFoundError);
      await expect(getEventForOperator(tx, randomUUID(), a)).rejects.toBeInstanceOf(EventNotFoundError);
    });
  });

  it("does not provision an unknown local identity", async () => {
    await rollback(async (tx) => {
      const a = actor(); const event = await create(tx, actor());
      expect(await listEventsForOperator(tx, {}, a)).toEqual({ items: [], nextCursor: null });
      await expect(getEventForOperator(tx, event.id, a)).rejects.toBeInstanceOf(EventNotFoundError);
      expect(await tx.select().from(users).where(eq(users.externalSubject, subject(a)))).toEqual([]);
    });
  });

  it("returns an empty page for a local user without assignments", async () => {
    await rollback(async (tx) => {
      const a = actor();
      await tx.insert(users).values({ externalSubject: subject(a) });
      expect(await listEventsForOperator(tx, {}, a)).toEqual({ items: [], nextCursor: null });
    });
  });

  it("rejects a disabled local operator for both queries", async () => {
    await rollback(async (tx) => {
      const a = actor(); const event = await create(tx, a);
      await tx.update(users).set({ status: "disabled" }).where(eq(users.externalSubject, subject(a)));
      await expect(listEventsForOperator(tx, {}, a)).rejects.toBeInstanceOf(AuthorizationError);
      await expect(getEventForOperator(tx, event.id, a)).rejects.toBeInstanceOf(AuthorizationError);
      const [saved] = await tx.select().from(users).where(eq(users.externalSubject, subject(a)));
      expect(saved.status).toBe("disabled");
    });
  });

  it.each<{ label: string; roles: AuthenticatedUser["roles"] }>([
    { label: "no roles", roles: [] }, { label: "admin", roles: ["admin"] },
    { label: "organizer", roles: ["organizer"] },
  ])("rejects $label even with an operator assignment", async ({ roles }) => {
    await rollback(async (tx) => {
      const a = actor(); const event = await create(tx, a);
      const denied = { ...a, roles };
      await expect(listEventsForOperator(tx, {}, denied)).rejects.toBeInstanceOf(AuthorizationError);
      await expect(getEventForOperator(tx, event.id, denied)).rejects.toBeInstanceOf(AuthorizationError);
    });
  });

  it("requires operator at the event level as well as in the token", async () => {
    await rollback(async (tx) => {
      const a = actor(); const event = await create(tx, a);
      await tx.update(eventStaff).set({ role: "organizer" }).where(eq(eventStaff.eventId, event.id));
      expect(await listEventsForOperator(tx, {}, a)).toEqual({ items: [], nextCursor: null });
      await expect(getEventForOperator(tx, event.id, a)).rejects.toBeInstanceOf(EventNotFoundError);
    });
  });

  it("normalizes identity casing and ignores changes to sub", async () => {
    await rollback(async (tx) => {
      const a = actor(); const event = await create(tx, a);
      const updated = { ...a, tenantId: a.tenantId.toUpperCase(), objectId: a.objectId.toUpperCase(), subject: "changed" };
      expect(await getEventForOperator(tx, event.id.toUpperCase(), updated)).toEqual(event);
      expect((await listEventsForOperator(tx, {}, updated)).items).toEqual([event]);
    });
  });

  it("isolates equal object IDs in different tenants", async () => {
    await rollback(async (tx) => {
      const a = actor(); const b = { ...a, tenantId: randomUUID() };
      const first = await create(tx, a); const second = await create(tx, b);
      expect((await listEventsForOperator(tx, {}, b)).items).toEqual([second]);
      await expect(getEventForOperator(tx, first.id, b)).rejects.toBeInstanceOf(EventNotFoundError);
    });
  });

  it("paginates in stable ID order without duplicates and ends with null", async () => {
    await rollback(async (tx) => {
      const a = actor();
      const expected = [await create(tx, a), await create(tx, a), await create(tx, a)]
        .sort((left, right) => left.id.localeCompare(right.id));
      await create(tx, actor());
      const first = await listEventsForOperator(tx, { limit: "2" }, a);
      expect(first.items).toEqual(expected.slice(0, 2));
      expect(first.nextCursor).toBe(encodeEventCursor(expected[1].id));
      const second = await listEventsForOperator(tx, { limit: "2", cursor: first.nextCursor }, a);
      expect(second).toEqual({ items: expected.slice(2), nextCursor: null });
      expect(await listEventsForOperator(tx, { cursor: encodeEventCursor(expected[2].id) }, a))
        .toEqual({ items: [], nextCursor: null });
    });
  });

  it("returns null when a page exactly fits the limit", async () => {
    await rollback(async (tx) => {
      const a = actor(); const event = await create(tx, a);
      expect(await listEventsForOperator(tx, { limit: "1" }, a)).toEqual({ items: [event], nextCursor: null });
    });
  });

  it("does not grant access through a cursor from another operator", async () => {
    await rollback(async (tx) => {
      const a = actor(); const own = await create(tx, a); const other = await create(tx, actor());
      const page = await listEventsForOperator(tx, { cursor: encodeEventCursor(other.id) }, a);
      expect(page.items).toEqual(own.id > other.id ? [own] : []);
      expect(page.nextCursor).toBeNull();
    });
  });

  it("does not expose an event after its assignment is removed", async () => {
    await rollback(async (tx) => {
      const a = actor(); const event = await create(tx, a);
      await tx.delete(eventStaff).where(eq(eventStaff.eventId, event.id));
      expect((await listEventsForOperator(tx, {}, a)).items).toEqual([]);
      await expect(getEventForOperator(tx, event.id, a)).rejects.toBeInstanceOf(EventNotFoundError);
    });
  });

  it("returns persisted statuses without restricting queries to drafts", async () => {
    await rollback(async (tx) => {
      const a = actor(); const event = await create(tx, a);
      await tx.update(events).set({ status: "closed" }).where(eq(events.id, event.id));
      expect((await getEventForOperator(tx, event.id, a)).status).toBe("closed");
      expect((await listEventsForOperator(tx, {}, a)).items[0].status).toBe("closed");
    });
  });

  it("rejects invalid identity and query inputs", async () => {
    await rollback(async (tx) => {
      const a = actor(); const invalid = { ...a, objectId: "invalid" };
      await expect(listEventsForOperator(tx, {}, invalid)).rejects.toBeInstanceOf(AuthenticationError);
      await expect(getEventForOperator(tx, randomUUID(), invalid)).rejects.toBeInstanceOf(AuthenticationError);
      await expect(listEventsForOperator(tx, { limit: "101" }, a)).rejects.toBeInstanceOf(ZodError);
      await expect(getEventForOperator(tx, "invalid", a)).rejects.toBeInstanceOf(ZodError);
    });
  });
  it("reauthorizes assignments and active status between cursor pages", async () => {
    await rollback(async tx => {
      const a = actor(); const rows = [await create(tx, a), await create(tx, a)].sort((x,y) => x.id.localeCompare(y.id));
      const first = await listEventsForOperator(tx, { limit: "1" }, a);
      expect(first.items[0].id).toBe(rows[0].id);
      await tx.update(eventStaff).set({ role: "organizer" }).where(eq(eventStaff.eventId, rows[1].id));
      expect(await listEventsForOperator(tx, { cursor: first.nextCursor }, a)).toEqual({ items: [], nextCursor: null });
      await expect(getEventForOperator(tx, rows[1].id, a)).rejects.toBeInstanceOf(EventNotFoundError);
      await tx.update(users).set({ status: "disabled" }).where(eq(users.externalSubject, subject(a)));
      await expect(listEventsForOperator(tx, { cursor: first.nextCursor }, a)).rejects.toBeInstanceOf(AuthorizationError);
    });
  });
  it("keeps operator assignments separate even with both global roles", async () => {
    await rollback(async tx => {
      const a = { ...actor(), roles: ["organizer", "checkin_operator"] as AuthenticatedUser["roles"] };
      const own = await create(tx, a); const organizerOnly = await create(tx, a);
      await tx.update(eventStaff).set({ role: "organizer" }).where(eq(eventStaff.eventId, organizerOnly.id));
      expect((await listEventsForOperator(tx, {}, a)).items).toEqual([own]);
      await expect(getEventForOperator(tx, organizerOnly.id, a)).rejects.toBeInstanceOf(EventNotFoundError);
    });
  });

});
