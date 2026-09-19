import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { AuthenticatedUser } from "../../auth/verify-access-token.js";
import { parseDatabaseConfig } from "../../config.js";
import { events, eventStaff, users } from "../../db/schema.js";
import { EventSlugConflictError } from "./create-event.js";
import { createEventForOrganizer } from "./create-event-for-organizer.js";

describe("concurrent event organizer assignment", () => {
  const clients: Client[] = [];
  let firstDb: NodePgDatabase;
  let secondDb: NodePgDatabase;
  let inspectionDb: NodePgDatabase;
  const testSlugs: string[] = [];
  const testIdentities: string[] = [];

  function actor(): AuthenticatedUser {
    const result: AuthenticatedUser = {
      tenantId: randomUUID(),
      objectId: randomUUID(),
      subject: "concurrency-test-subject",
      roles: ["organizer"],
    };
    testIdentities.push(`entra:${result.tenantId}:${result.objectId}`);
    return result;
  }

  function body() {
    const slug = `test-concurrent-${randomUUID()}`;
    testSlugs.push(slug);
    return {
      name: "Concurrent creation test",
      slug,
      startsAt: "2027-08-27T14:00:00Z",
      endsAt: "2027-08-27T22:00:00Z",
      timezone: "America/Lima",
      location: "Test venue",
    };
  }

  beforeAll(async () => {
    const { databaseUrl } = parseDatabaseConfig(process.env);
    // Dos conexiones ejecutan las operaciones; una tercera verifica y limpia.
    for (let index = 0; index < 3; index += 1) {
      const client = new Client({
        connectionString: databaseUrl,
        connectionTimeoutMillis: 5000,
        statement_timeout: 5000,
        query_timeout: 6000,
      });
      clients.push(client);
      await client.connect();
    }
    firstDb = drizzle(clients[0]);
    secondDb = drizzle(clients[1]);
    inspectionDb = drizzle(clients[2]);
  });

  afterEach(async () => {
    // Estas pruebas necesitan commits reales entre conexiones.
    // Solo eliminamos filas identificadas por los UUID de esta prueba.
    await inspectionDb.transaction(async (tx) => {
      if (testSlugs.length > 0) {
        const created = await tx.select({ id: events.id }).from(events)
          .where(inArray(events.slug, testSlugs));
        if (created.length > 0) {
          const ids = created.map((event) => event.id);
          await tx.delete(eventStaff).where(inArray(eventStaff.eventId, ids));
          await tx.delete(events).where(inArray(events.id, ids));
        }
      }
      if (testIdentities.length > 0) {
        await tx.delete(users).where(inArray(users.externalSubject, testIdentities));
      }
    });
    testSlugs.length = 0;
    testIdentities.length = 0;
  });

  afterAll(async () => {
    await Promise.all(clients.map((client) => client.end()));
  });

  it("creates two events for one new identity without duplicating the user", async () => {
    const organizer = actor();
    const first = body();
    const second = body();
    // allSettled espera ambas operaciones incluso si una falla,
    // evitando que la limpieza compita con una operación pendiente.
    const results = await Promise.allSettled([
      createEventForOrganizer(firstDb, first, organizer),
      createEventForOrganizer(secondDb, second, organizer),
    ]);
    expect(results.map((result) => result.status)).toEqual(["fulfilled", "fulfilled"]);
    const savedUsers = await inspectionDb.select().from(users)
      .where(inArray(users.externalSubject, testIdentities));
    expect(savedUsers).toHaveLength(1);
    const savedEvents = await inspectionDb.select().from(events)
      .where(inArray(events.slug, testSlugs));
    expect(savedEvents).toHaveLength(2);
    const assignments = await inspectionDb.select().from(eventStaff)
      .where(inArray(eventStaff.eventId, savedEvents.map((event) => event.id)));
    expect(assignments).toHaveLength(2);
    for (const assignment of assignments) {
      expect(assignment.userId).toBe(savedUsers[0].id);
      expect(assignment.role).toBe("organizer");
    }
  });

  it.each(["same identity", "different identities"] as const)(
    "keeps one event and its correct owner when a slug is contested: %s",
    async (scenario) => {
      const firstActor = actor();
      const secondActor = scenario === "same identity" ? firstActor : actor();
      const actors = [firstActor, secondActor];
      const input = body();
      const results = await Promise.allSettled([
        createEventForOrganizer(firstDb, input, firstActor),
        createEventForOrganizer(secondDb, input, secondActor),
      ]);
      const successes = results.filter((result) => result.status === "fulfilled");
      const failures = results.filter((result) => result.status === "rejected");
      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);
      expect(failures[0].reason).toBeInstanceOf(EventSlugConflictError);
      const winner = actors[results.findIndex((result) => result.status === "fulfilled")];
      const savedEvents = await inspectionDb.select().from(events)
        .where(eq(events.slug, input.slug));
      expect(savedEvents).toHaveLength(1);
      const savedUsers = await inspectionDb.select().from(users)
        .where(inArray(users.externalSubject, testIdentities));
      expect(savedUsers).toHaveLength(1);
      expect(savedUsers[0].externalSubject)
        .toBe(`entra:${winner.tenantId}:${winner.objectId}`);
      const assignments = await inspectionDb.select().from(eventStaff)
        .where(eq(eventStaff.eventId, savedEvents[0].id));
      expect(assignments).toHaveLength(1);
      expect(assignments[0]).toMatchObject({
        userId: savedUsers[0].id, role: "organizer",
      });
    },
  );
});
