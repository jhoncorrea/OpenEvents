import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  AuthenticationError,
  AuthorizationError,
  type AuthenticatedUser,
} from "../../auth/verify-access-token.js";
import { parseDatabaseConfig } from "../../config.js";
import { events, eventStaff, users } from "../../db/schema.js";
import { EventSlugConflictError } from "./create-event.js";
import { createEventForOrganizer } from "./create-event-for-organizer.js";

function identity(): AuthenticatedUser {
  return {
    tenantId: randomUUID(),
    objectId: randomUUID(),
    subject: "test-subject",
    roles: ["organizer"],
  };
}

function input() {
  return {
    name: "Organizer assignment test",
    slug: `test-${randomUUID()}`,
    startsAt: "2027-08-27T14:00:00Z",
    endsAt: "2027-08-27T22:00:00Z",
    timezone: "America/Lima",
    location: "Test venue",
  };
}

function key(user: AuthenticatedUser): string {
  return `entra:${user.tenantId.toLowerCase()}:${user.objectId.toLowerCase()}`;
}

describe("createEventForOrganizer persistence", () => {
  let client: Client;
  let db: NodePgDatabase;

  beforeAll(async () => {
    const { databaseUrl } = parseDatabaseConfig(process.env);
    client = new Client({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 5000,
      query_timeout: 5000,
    });
    await client.connect();
    db = drizzle(client);
  });

  afterAll(async () => {
    if (client) await client.end();
  });

  // Drizzle debe gestionar la transacción exterior para que la operación
  // use un SAVEPOINT, en lugar de abrir otro BEGIN sobre la misma conexión.
  async function withRollback(
    run: (transaction: NodePgDatabase) => Promise<void>,
  ): Promise<void> {
    const rollbackMarker = new Error("Rollback test data");
    try {
      await db.transaction(async (transaction) => {
        await run(transaction);
        throw rollbackMarker;
      });
    } catch (error) {
      if (error !== rollbackMarker) throw error;
    }
  }

  it("creates a local identity and assigns the persisted draft event", async () => {
    await withRollback(async (tx) => {
      const actor = identity();
      const event = await createEventForOrganizer(tx, input(), actor);
      const savedUsers = await tx.select().from(users)
        .where(eq(users.externalSubject, key(actor)));
      expect(savedUsers).toHaveLength(1);
      expect(savedUsers[0]).toMatchObject({
        externalSubject: key(actor), email: null,
        displayName: null, status: "active",
      });
      expect(event.status).toBe("draft");
      expect(await tx.select().from(events).where(eq(events.id, event.id)))
        .toEqual([event]);
      expect(await tx.select().from(eventStaff)
        .where(eq(eventStaff.eventId, event.id)))
        .toEqual([expect.objectContaining({
          eventId: event.id, userId: savedUsers[0].id, role: "organizer",
        })]);
    });
  });

  it("reuses the identity even if sub changes and preserves its profile", async () => {
    await withRollback(async (tx) => {
      const actor = identity();
      const [existing] = await tx.insert(users).values({
        externalSubject: key(actor),
        email: "organizer@example.test", displayName: "Existing organizer",
      }).returning();
      await createEventForOrganizer(tx, input(), actor);
      await createEventForOrganizer(tx, input(), { ...actor, subject: "other-sub" });
      expect(await tx.select().from(users)
        .where(eq(users.externalSubject, key(actor)))).toEqual([existing]);
      expect(await tx.select().from(eventStaff)
        .where(eq(eventStaff.userId, existing.id))).toHaveLength(2);
    });
  });

  it("keeps equal object IDs in different tenants separate", async () => {
    await withRollback(async (tx) => {
      const first = identity();
      const second = { ...first, tenantId: randomUUID() };
      await createEventForOrganizer(tx, input(), first);
      await createEventForOrganizer(tx, input(), second);
      const [a] = await tx.select().from(users).where(eq(users.externalSubject, key(first)));
      const [b] = await tx.select().from(users).where(eq(users.externalSubject, key(second)));
      expect(a.id).not.toBe(b.id);
    });
  });

  it("normalizes UUID casing without creating another user", async () => {
    await withRollback(async (tx) => {
      const actor = identity();
      const first = await createEventForOrganizer(tx, input(), actor);
      const second = await createEventForOrganizer(tx, input(), {
        ...actor, tenantId: actor.tenantId.toUpperCase(),
        objectId: actor.objectId.toUpperCase(),
      });
      const [a] = await tx.select().from(eventStaff).where(eq(eventStaff.eventId, first.id));
      const [b] = await tx.select().from(eventStaff).where(eq(eventStaff.eventId, second.id));
      expect(a.userId).toBe(b.userId);
    });
  });

  it("rejects a disabled user without changing their status or creating an event", async () => {
    await withRollback(async (tx) => {
      const actor = identity();
      const body = input();
      const [existing] = await tx.insert(users).values({
        externalSubject: key(actor), status: "disabled",
      }).returning();
      await expect(createEventForOrganizer(tx, body, actor))
        .rejects.toBeInstanceOf(AuthorizationError);
      expect(await tx.select().from(events).where(eq(events.slug, body.slug))).toEqual([]);
      expect(await tx.select().from(users).where(eq(users.id, existing.id))).toEqual([existing]);
      expect(await tx.select().from(eventStaff).where(eq(eventStaff.userId, existing.id))).toEqual([]);
    });
  });

  it.each<{ label: string; roles: AuthenticatedUser["roles"] }>([
    { label: "no roles", roles: [] },
    { label: "admin only", roles: ["admin"] },
    { label: "operator only", roles: ["checkin_operator"] },
  ])(
    "rejects $label without provisioning a user",
    async ({ roles }) => {
      await withRollback(async (tx) => {
        const actor = { ...identity(), roles };
        await expect(createEventForOrganizer(tx, input(), actor))
          .rejects.toBeInstanceOf(AuthorizationError);
        expect(await tx.select().from(users).where(eq(users.externalSubject, key(actor)))).toEqual([]);
      });
    },
  );

  it("rejects malformed identity claims", async () => {
    await withRollback(async (tx) => {
      const body = input();
      await expect(createEventForOrganizer(tx, body, { ...identity(), objectId: "invalid" }))
        .rejects.toBeInstanceOf(AuthenticationError);
      expect(await tx.select().from(events).where(eq(events.slug, body.slug))).toEqual([]);
    });
  });

  it("rolls back provisioning when input validation fails", async () => {
    await withRollback(async (tx) => {
      const actor = identity();
      await expect(createEventForOrganizer(tx, { ...input(), name: "" }, actor))
        .rejects.toBeInstanceOf(ZodError);
      expect(await tx.select().from(users).where(eq(users.externalSubject, key(actor)))).toEqual([]);
    });
  });

  it("preserves the original owner and rolls back a new user after a slug conflict", async () => {
    await withRollback(async (tx) => {
      const owner = identity();
      const other = identity();
      const body = input();
      const event = await createEventForOrganizer(tx, body, owner);
      const originalStaff = await tx.select().from(eventStaff).where(eq(eventStaff.eventId, event.id));
      await expect(createEventForOrganizer(tx, body, other)).rejects.toBeInstanceOf(EventSlugConflictError);
      expect(await tx.select().from(users).where(eq(users.externalSubject, key(other)))).toEqual([]);
      expect(await tx.select().from(events).where(eq(events.id, event.id))).toEqual([event]);
      expect(await tx.select().from(eventStaff).where(eq(eventStaff.eventId, event.id))).toEqual(originalStaff);
    });
  });

  it("rolls back the event and user after a real PostgreSQL assignment failure", async () => {
    await withRollback(async (tx) => {
      // Restricción exclusiva de esta transacción de prueba. NOT VALID
      // conserva filas existentes; el rollback exterior elimina la restricción.
      await tx.execute(sql`ALTER TABLE event_staff ADD CONSTRAINT issue25_test_reject_assignment
        CHECK (role <> 'organizer') NOT VALID`);
      const actor = identity();
      const body = input();
      await expect(createEventForOrganizer(tx, body, actor)).rejects.toMatchObject({
        cause: { code: "23514", constraint: "issue25_test_reject_assignment" },
      });
      expect(await tx.select().from(events).where(eq(events.slug, body.slug))).toEqual([]);
      expect(await tx.select().from(users).where(eq(users.externalSubject, key(actor)))).toEqual([]);
    });
  });
});
