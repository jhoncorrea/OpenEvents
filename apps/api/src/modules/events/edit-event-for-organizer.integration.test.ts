import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { AuthenticationError, AuthorizationError, type AuthenticatedUser } from "../../auth/verify-access-token.js";
import { parseDatabaseConfig } from "../../config.js";
import { events, eventStaff, users } from "../../db/schema.js";
import { createEventForOrganizer } from "./create-event-for-organizer.js";
import { EventSlugConflictError } from "./create-event.js";
import { EventNotFoundError } from "./query-events-for-organizer.js";
import { editEventForOrganizer, EventNotEditableError, EventVersionConflictError } from "./edit-event-for-organizer.js";

const identity = (): AuthenticatedUser => ({ tenantId: randomUUID(), objectId: randomUUID(), subject: "edit-test", roles: ["organizer"] });
const subject = (a: AuthenticatedUser) => `entra:${a.tenantId.toLowerCase()}:${a.objectId.toLowerCase()}`;
const body = () => ({ name: "Original", slug: `edit-${randomUUID()}`, startsAt: "2027-08-27T14:00:00Z",
  endsAt: "2027-08-27T22:00:00Z", timezone: "America/Lima", location: "Lima" });

describe("editEventForOrganizer persistence", () => {
  let client: Client;
  let db: NodePgDatabase;
  beforeAll(async () => {
    client = new Client({ connectionString: parseDatabaseConfig(process.env).databaseUrl,
      connectionTimeoutMillis: 5000, query_timeout: 6000, statement_timeout: 5000 });
    await client.connect(); db = drizzle(client);
  });
  afterAll(async () => { if (client) await client.end(); });
  async function isolated(run: (tx: NodePgDatabase) => Promise<void>) {
    const rollback = new Error("Rollback edit test");
    try { await db.transaction(async tx => { await run(tx); throw rollback; }); }
    catch (error) { if (error !== rollback) throw error; }
  }

  it("persists partial changes, increments the version and preserves identity and assignment", async () => {
    await isolated(async tx => {
      const actor = identity(); const original = await createEventForOrganizer(tx, body(), actor);
      const before = await tx.select().from(eventStaff).where(eq(eventStaff.eventId, original.id));
      const updated = await editEventForOrganizer(tx, original.id, { expectedVersion: 1, name: "  Nuevo  " }, actor);
      expect(updated).toEqual({ ...original, name: "Nuevo", version: 2 });
      expect(await tx.select().from(events).where(eq(events.id, original.id))).toEqual([updated]);
      expect(await tx.select().from(eventStaff).where(eq(eventStaff.eventId, original.id))).toEqual(before);
    });
  });

  it("rejects a stale edit and preserves the latest successful changes", async () => {
    await isolated(async tx => {
      const actor = identity(); const original = await createEventForOrganizer(tx, body(), actor);
      const saved = await editEventForOrganizer(tx, original.id, { expectedVersion: 1, location: "Cusco" }, actor);
      await expect(editEventForOrganizer(tx, original.id, { expectedVersion: 1, name: "Stale" }, actor)).rejects.toBeInstanceOf(EventVersionConflictError);
      expect(await tx.select().from(events).where(eq(events.id, original.id))).toEqual([saved]);
      const next = await editEventForOrganizer(tx, original.id, { expectedVersion: 2, name: "Fresh" }, actor);
      expect(next).toMatchObject({ name: "Fresh", location: "Cusco", version: 3 });
    });
  });

  it.each(["active", "closed", "cancelled"] as const)("rejects a %s event without changing it", async status => {
    await isolated(async tx => {
      const actor = identity(); const original = await createEventForOrganizer(tx, body(), actor);
      await tx.update(events).set({ status }).where(eq(events.id, original.id));
      await expect(editEventForOrganizer(tx, original.id, { expectedVersion: 1, name: "Denied" }, actor)).rejects.toBeInstanceOf(EventNotEditableError);
      expect(await tx.select().from(events).where(eq(events.id, original.id))).toEqual([{ ...original, status }]);
    });
  });

  it("uses the same not-found error for foreign and missing events without provisioning an unknown actor", async () => {
    await isolated(async tx => {
      const owner = identity(); const other = identity(); const original = await createEventForOrganizer(tx, body(), owner);
      for (const id of [original.id, randomUUID()]) {
        await expect(editEventForOrganizer(tx, id, { expectedVersion: 1, name: "Denied" }, other)).rejects.toBeInstanceOf(EventNotFoundError);
      }
      expect(await tx.select().from(users).where(eq(users.externalSubject, subject(other)))).toEqual([]);
      expect(await tx.select().from(events).where(eq(events.id, original.id))).toEqual([original]);
    });
  });

  it("denies a known organizer assigned only to another event", async () => {
    await isolated(async tx => {
      const owner = identity(); const other = identity(); const original = await createEventForOrganizer(tx, body(), owner);
      await createEventForOrganizer(tx, body(), other);
      await expect(editEventForOrganizer(tx, original.id, { expectedVersion: 1, name: "Denied" }, other)).rejects.toBeInstanceOf(EventNotFoundError);
    });
  });

  it("rejects a disabled local organizer", async () => {
    await isolated(async tx => {
      const actor = identity(); const original = await createEventForOrganizer(tx, body(), actor);
      await tx.update(users).set({ status: "disabled" }).where(eq(users.externalSubject, subject(actor)));
      await expect(editEventForOrganizer(tx, original.id, { expectedVersion: 1, name: "Denied" }, actor)).rejects.toBeInstanceOf(AuthorizationError);
      expect(await tx.select().from(events).where(eq(events.id, original.id))).toEqual([original]);
    });
  });

  it.each(([[], ["admin"], ["checkin_operator"]] as AuthenticatedUser["roles"][]).map(roles => ({ roles })))("requires the global organizer role: %j", async ({ roles }) => {
    await isolated(async tx => {
      const actor = identity(); const original = await createEventForOrganizer(tx, body(), actor);
      await expect(editEventForOrganizer(tx, original.id, { expectedVersion: 1, name: "Denied" }, { ...actor, roles })).rejects.toBeInstanceOf(AuthorizationError);
    });
  });

  it.each(["operator", "removed"])("denies an assignment that is %s", async mode => {
    await isolated(async tx => {
      const actor = identity(); const original = await createEventForOrganizer(tx, body(), actor);
      if (mode === "removed") await tx.delete(eventStaff).where(eq(eventStaff.eventId, original.id));
      else await tx.update(eventStaff).set({ role: "checkin_operator" }).where(eq(eventStaff.eventId, original.id));
      await expect(editEventForOrganizer(tx, original.id, { expectedVersion: 1, name: "Denied" }, actor)).rejects.toBeInstanceOf(EventNotFoundError);
    });
  });

  it("normalizes identity casing and ignores changes to sub", async () => {
    await isolated(async tx => {
      const actor = identity(); const original = await createEventForOrganizer(tx, body(), actor);
      const updated = await editEventForOrganizer(tx, original.id, { expectedVersion: 1, name: "Allowed" }, {
        ...actor, tenantId: actor.tenantId.toUpperCase(), objectId: actor.objectId.toUpperCase(), subject: "changed",
      });
      expect(updated.version).toBe(2);
      await expect(editEventForOrganizer(tx, original.id, { expectedVersion: 2, name: "Denied" }, { ...actor, tenantId: randomUUID() })).rejects.toBeInstanceOf(EventNotFoundError);
    });
  });

  it("rejects malformed identity claims", async () => {
    await isolated(async tx => {
      await expect(editEventForOrganizer(tx, randomUUID(), { expectedVersion: 1, name: "Denied" }, { ...identity(), objectId: "invalid" })).rejects.toBeInstanceOf(AuthenticationError);
    });
  });

  it("rolls back an invalid merged date interval without advancing the version", async () => {
    await isolated(async tx => {
      const actor = identity(); const original = await createEventForOrganizer(tx, body(), actor);
      await expect(editEventForOrganizer(tx, original.id, { expectedVersion: 1, startsAt: "2027-08-28T14:00:00Z" }, actor)).rejects.toBeInstanceOf(ZodError);
      expect(await tx.select().from(events).where(eq(events.id, original.id))).toEqual([original]);
    });
  });

  it("rolls back all fields and version after a real slug conflict", async () => {
    await isolated(async tx => {
      const actor = identity(); const original = await createEventForOrganizer(tx, body(), actor);
      const occupied = await createEventForOrganizer(tx, body(), actor);
      await expect(editEventForOrganizer(tx, original.id, { expectedVersion: 1, name: "Must roll back", slug: occupied.slug }, actor)).rejects.toBeInstanceOf(EventSlugConflictError);
      expect(await tx.select().from(events).where(eq(events.id, original.id))).toEqual([original]);
      expect(await tx.select().from(events).where(eq(events.id, occupied.id))).toEqual([occupied]);
    });
  });

  it("increments the version even for an accepted edit with unchanged values", async () => {
    await isolated(async tx => {
      const actor = identity(); const original = await createEventForOrganizer(tx, body(), actor);
      expect(await editEventForOrganizer(tx, original.id, { expectedVersion: 1, name: original.name }, actor)).toEqual({ ...original, version: 2 });
    });
  });
});
