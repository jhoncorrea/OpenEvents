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
  EventNotFoundError, getEventForOrganizer, listEventsForOrganizer,
} from "./query-events-for-organizer.js";

function actor(): AuthenticatedUser {
  return { tenantId: randomUUID(), objectId: randomUUID(), subject: "test", roles: ["organizer"] };
}
function subject(user: AuthenticatedUser) {
  return `entra:${user.tenantId.toLowerCase()}:${user.objectId.toLowerCase()}`;
}
function create(tx: NodePgDatabase, user: AuthenticatedUser) {
  return createEventForOrganizer(tx, {
    name: "Query test", slug: `query-${randomUUID()}`,
    startsAt: "2027-08-27T14:00:00Z", endsAt: "2027-08-27T22:00:00Z",
    timezone: "America/Lima", location: "Test venue",
  }, user);
}

describe("organizer event queries with PostgreSQL", () => {
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

  it("returns only assigned events and their complete detail", async () => {
    await rollback(async (tx) => {
      const a = actor(); const b = actor();
      const own = await create(tx, a); const other = await create(tx, b);
      expect(await listEventsForOrganizer(tx, {}, a)).toEqual({ items: [own], nextCursor: null });
      expect(await getEventForOrganizer(tx, own.id, a)).toEqual(own);
      await expect(getEventForOrganizer(tx, other.id, a)).rejects.toBeInstanceOf(EventNotFoundError);
      await expect(getEventForOrganizer(tx, randomUUID(), a)).rejects.toBeInstanceOf(EventNotFoundError);
    });
  });

  it("does not provision an unknown local identity", async () => {
    await rollback(async (tx) => {
      const a = actor(); const event = await create(tx, actor());
      expect(await listEventsForOrganizer(tx, {}, a)).toEqual({ items: [], nextCursor: null });
      await expect(getEventForOrganizer(tx, event.id, a)).rejects.toBeInstanceOf(EventNotFoundError);
      expect(await tx.select().from(users).where(eq(users.externalSubject, subject(a)))).toEqual([]);
    });
  });

  it("returns an empty page for a local user without assignments", async () => {
    await rollback(async (tx) => {
      const a = actor();
      await tx.insert(users).values({ externalSubject: subject(a) });
      expect(await listEventsForOrganizer(tx, {}, a)).toEqual({ items: [], nextCursor: null });
    });
  });

  it("rejects a disabled local organizer for both queries", async () => {
    await rollback(async (tx) => {
      const a = actor(); const event = await create(tx, a);
      await tx.update(users).set({ status: "disabled" }).where(eq(users.externalSubject, subject(a)));
      await expect(listEventsForOrganizer(tx, {}, a)).rejects.toBeInstanceOf(AuthorizationError);
      await expect(getEventForOrganizer(tx, event.id, a)).rejects.toBeInstanceOf(AuthorizationError);
      const [saved] = await tx.select().from(users).where(eq(users.externalSubject, subject(a)));
      expect(saved.status).toBe("disabled");
    });
  });

  it.each<{ label: string; roles: AuthenticatedUser["roles"] }>([
    { label: "no roles", roles: [] }, { label: "admin", roles: ["admin"] },
    { label: "operator", roles: ["checkin_operator"] },
  ])("rejects $label even with an organizer assignment", async ({ roles }) => {
    await rollback(async (tx) => {
      const a = actor(); const event = await create(tx, a);
      const denied = { ...a, roles };
      await expect(listEventsForOrganizer(tx, {}, denied)).rejects.toBeInstanceOf(AuthorizationError);
      await expect(getEventForOrganizer(tx, event.id, denied)).rejects.toBeInstanceOf(AuthorizationError);
    });
  });

  it("requires organizer at the event level as well as in the token", async () => {
    await rollback(async (tx) => {
      const a = actor(); const event = await create(tx, a);
      await tx.update(eventStaff).set({ role: "checkin_operator" }).where(eq(eventStaff.eventId, event.id));
      expect(await listEventsForOrganizer(tx, {}, a)).toEqual({ items: [], nextCursor: null });
      await expect(getEventForOrganizer(tx, event.id, a)).rejects.toBeInstanceOf(EventNotFoundError);
    });
  });

  it("normalizes identity casing and ignores changes to sub", async () => {
    await rollback(async (tx) => {
      const a = actor(); const event = await create(tx, a);
      const updated = { ...a, tenantId: a.tenantId.toUpperCase(), objectId: a.objectId.toUpperCase(), subject: "changed" };
      expect(await getEventForOrganizer(tx, event.id.toUpperCase(), updated)).toEqual(event);
      expect((await listEventsForOrganizer(tx, {}, updated)).items).toEqual([event]);
    });
  });

  it("isolates equal object IDs in different tenants", async () => {
    await rollback(async (tx) => {
      const a = actor(); const b = { ...a, tenantId: randomUUID() };
      const first = await create(tx, a); const second = await create(tx, b);
      expect((await listEventsForOrganizer(tx, {}, b)).items).toEqual([second]);
      await expect(getEventForOrganizer(tx, first.id, b)).rejects.toBeInstanceOf(EventNotFoundError);
    });
  });

  it("paginates in stable ID order without duplicates and ends with null", async () => {
    await rollback(async (tx) => {
      const a = actor();
      const expected = [await create(tx, a), await create(tx, a), await create(tx, a)]
        .sort((left, right) => left.id.localeCompare(right.id));
      await create(tx, actor());
      const first = await listEventsForOrganizer(tx, { limit: "2" }, a);
      expect(first.items).toEqual(expected.slice(0, 2));
      expect(first.nextCursor).toBe(encodeEventCursor(expected[1].id));
      const second = await listEventsForOrganizer(tx, { limit: "2", cursor: first.nextCursor }, a);
      expect(second).toEqual({ items: expected.slice(2), nextCursor: null });
      expect(await listEventsForOrganizer(tx, { cursor: encodeEventCursor(expected[2].id) }, a))
        .toEqual({ items: [], nextCursor: null });
    });
  });

  it("returns null when a page exactly fits the limit", async () => {
    await rollback(async (tx) => {
      const a = actor(); const event = await create(tx, a);
      expect(await listEventsForOrganizer(tx, { limit: "1" }, a)).toEqual({ items: [event], nextCursor: null });
    });
  });

  it("does not grant access through a cursor from another organizer", async () => {
    await rollback(async (tx) => {
      const a = actor(); const own = await create(tx, a); const other = await create(tx, actor());
      const page = await listEventsForOrganizer(tx, { cursor: encodeEventCursor(other.id) }, a);
      expect(page.items).toEqual(own.id > other.id ? [own] : []);
      expect(page.nextCursor).toBeNull();
    });
  });

  it("does not expose an event after its assignment is removed", async () => {
    await rollback(async (tx) => {
      const a = actor(); const event = await create(tx, a);
      await tx.delete(eventStaff).where(eq(eventStaff.eventId, event.id));
      expect((await listEventsForOrganizer(tx, {}, a)).items).toEqual([]);
      await expect(getEventForOrganizer(tx, event.id, a)).rejects.toBeInstanceOf(EventNotFoundError);
    });
  });

  it("returns persisted statuses without restricting queries to drafts", async () => {
    await rollback(async (tx) => {
      const a = actor(); const event = await create(tx, a);
      await tx.update(events).set({ status: "closed" }).where(eq(events.id, event.id));
      expect((await getEventForOrganizer(tx, event.id, a)).status).toBe("closed");
      expect((await listEventsForOrganizer(tx, {}, a)).items[0].status).toBe("closed");
    });
  });

  it("rejects invalid identity and query inputs", async () => {
    await rollback(async (tx) => {
      const a = actor(); const invalid = { ...a, objectId: "invalid" };
      await expect(listEventsForOrganizer(tx, {}, invalid)).rejects.toBeInstanceOf(AuthenticationError);
      await expect(getEventForOrganizer(tx, randomUUID(), invalid)).rejects.toBeInstanceOf(AuthenticationError);
      await expect(listEventsForOrganizer(tx, { limit: "101" }, a)).rejects.toBeInstanceOf(ZodError);
      await expect(getEventForOrganizer(tx, "invalid", a)).rejects.toBeInstanceOf(ZodError);
    });
  });
});
