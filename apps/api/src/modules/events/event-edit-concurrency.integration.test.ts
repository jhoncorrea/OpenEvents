import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { AuthenticatedUser } from "../../auth/verify-access-token.js";
import { parseDatabaseConfig } from "../../config.js";
import { events, eventStaff, users } from "../../db/schema.js";
import { createEventForOrganizer } from "./create-event-for-organizer.js";
import { EventSlugConflictError } from "./create-event.js";
import { editEventForOrganizer, EventVersionConflictError } from "./edit-event-for-organizer.js";

describe("concurrent event editing", () => {
  const clients: Client[] = [];
  const databases: NodePgDatabase[] = [];
  const eventIds: string[] = [];
  const identities: string[] = [];
  let inspection: NodePgDatabase;

  const subject = (actor: AuthenticatedUser) => `entra:${actor.tenantId}:${actor.objectId}`;
  function actor(): AuthenticatedUser {
    const result: AuthenticatedUser = { tenantId: randomUUID(), objectId: randomUUID(),
      subject: "concurrent-edit", roles: ["organizer"] };
    identities.push(subject(result));
    return result;
  }

  async function create(owner: AuthenticatedUser) {
    const result = await createEventForOrganizer(inspection, {
      name: "Original", slug: `edit-race-${randomUUID()}`,
      startsAt: "2027-08-27T14:00:00Z", endsAt: "2027-08-27T22:00:00Z",
      timezone: "America/Lima", location: "Original venue",
    }, owner);
    eventIds.push(result.id);
    return result;
  }

  beforeAll(async () => {
    const { databaseUrl } = parseDatabaseConfig(process.env);
    for (let i = 0; i < 3; i += 1) {
      const client = new Client({ connectionString: databaseUrl,
        connectionTimeoutMillis: 5000, statement_timeout: 5000, query_timeout: 6000 });
      clients.push(client);
      await client.connect();
      databases.push(drizzle(client));
    }
    inspection = databases[2];
  });

  afterEach(async () => {
    // Commits reales para que las conexiones vean los cambios. Se limpian
    // solo UUID/identidades de esta prueba, aunque el slug haya cambiado.
    await inspection.transaction(async tx => {
      if (eventIds.length) {
        await tx.delete(eventStaff).where(inArray(eventStaff.eventId, eventIds));
        await tx.delete(events).where(inArray(events.id, eventIds));
      }
      if (identities.length) await tx.delete(users).where(inArray(users.externalSubject, identities));
    });
    eventIds.length = 0; identities.length = 0;
  });
  afterAll(async () => { await Promise.all(clients.map(client => client.end())); });

  it.each(["same organizer", "different organizers"])(
    "accepts exactly one edit of the same version: %s", async mode => {
      const firstActor = actor();
      const secondActor = mode === "same organizer" ? firstActor : actor();
      const original = await create(firstActor);
      if (mode === "different organizers") {
        const [secondUser] = await inspection.insert(users)
          .values({ externalSubject: subject(secondActor) }).returning();
        await inspection.insert(eventStaff).values({
          eventId: original.id, userId: secondUser.id, role: "organizer",
        });
      }
      const edits = [
        { expectedVersion: 1, name: "First edit", location: "First venue" },
        { expectedVersion: 1, name: "Second edit", location: "Second venue" },
      ];
      const results = await Promise.allSettled([
        editEventForOrganizer(databases[0], original.id, edits[0], firstActor),
        editEventForOrganizer(databases[1], original.id, edits[1], secondActor),
      ]);
      const winners = results.filter(result => result.status === "fulfilled");
      const losers = results.filter(result => result.status === "rejected");
      expect(winners).toHaveLength(1); expect(losers).toHaveLength(1);
      expect(losers[0].reason).toBeInstanceOf(EventVersionConflictError);
      const winner = winners[0].value;
      const winnerIndex = results.findIndex(result => result.status === "fulfilled");
      expect(winner).toEqual({ ...original, name: edits[winnerIndex].name,
        location: edits[winnerIndex].location, version: 2 });
      expect(await inspection.select().from(events).where(eq(events.id, original.id))).toEqual([winner]);
      const assignments = await inspection.select().from(eventStaff).where(eq(eventStaff.eventId, original.id));
      expect(assignments).toHaveLength(mode === "same organizer" ? 1 : 2);
      expect(assignments.every(assignment => assignment.role === "organizer")).toBe(true);
    },
  );

  it("keeps one slug winner and rolls back every field and version of the loser", async () => {
    const owners = [actor(), actor()];
    const originals = [await create(owners[0]), await create(owners[1])];
    const slug = `contested-edit-${randomUUID()}`;
    const results = await Promise.allSettled(originals.map((original, index) =>
      editEventForOrganizer(databases[index], original.id,
        { expectedVersion: 1, slug, name: `Changed ${index}` }, owners[index]),
    ));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    for (const [index, result] of results.entries()) {
      const saved = await inspection.select().from(events).where(eq(events.id, originals[index].id));
      if (result.status === "fulfilled") {
        expect(saved).toEqual([{ ...originals[index], name: `Changed ${index}`, slug, version: 2 }]);
      } else {
        expect(result.reason).toBeInstanceOf(EventSlugConflictError);
        expect(saved).toEqual([originals[index]]);
      }
    }
    expect(await inspection.select().from(events).where(eq(events.slug, slug))).toHaveLength(1);
  });
});
