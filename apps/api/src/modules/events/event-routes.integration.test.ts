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

function validInput() {
  return {
    name: "HTTP integration test event",
    slug: `http-test-${randomUUID()}`,
    startsAt: "2027-08-27T14:00:00Z",
    endsAt: "2027-08-27T22:00:00Z",
    timezone: "America/Lima",
    location: "Test venue",
  };
}

type Fixture = {
  tx: NodePgDatabase;
  app: ReturnType<typeof buildApp>;
  organizer: AuthenticatedUser;
  externalSubject: string;
  verifyAccessToken: ReturnType<typeof vi.fn<AccessTokenVerifier>>;
};

describe("POST /api/v1/events with PostgreSQL", () => {
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

  async function withFixture(run: (fixture: Fixture) => Promise<void>): Promise<void> {
    const rollbackMarker = new Error("Rollback HTTP test data");
    try {
      // La operación abre un SAVEPOINT dentro de esta transacción Drizzle.
      await db.transaction(async (tx) => {
        const organizer: AuthenticatedUser = {
          tenantId: randomUUID(), objectId: randomUUID(),
          subject: "http-test-organizer", roles: ["organizer"],
        };
        const externalSubject = `entra:${organizer.tenantId}:${organizer.objectId}`;
        const verifyAccessToken = vi.fn<AccessTokenVerifier>().mockResolvedValue(organizer);
        const app = buildApp({
          verifyAccessToken,
          createEvent: (input, actor) => createEventForOrganizer(tx, input, actor),
        });
        try {
          await run({ tx, app, organizer, externalSubject, verifyAccessToken });
        } finally {
          await app.close();
        }
        throw rollbackMarker;
      });
    } catch (error) {
      if (error !== rollbackMarker) throw error;
    }
  }

  function post(app: Fixture["app"], payload: Record<string, unknown>) {
    return app.inject({
      method: "POST", url: "/api/v1/events",
      headers: { authorization: "Bearer integration-test-token" },
      payload,
    });
  }

  async function expectNoNewRows(tx: NodePgDatabase, slug: string, externalSubject: string) {
    expect(await tx.select().from(events).where(eq(events.slug, slug))).toEqual([]);
    expect(await tx.select().from(users).where(eq(users.externalSubject, externalSubject))).toEqual([]);
  }

  it("returns 201 and persists the event with its verified organizer", async () => {
    await withFixture(async ({ tx, app, externalSubject }) => {
      const input = validInput();
      const response = await post(app, input);
      expect(response.statusCode).toBe(201);
      expect(response.headers["cache-control"]).toBe("no-store");
      const saved = await tx.select().from(events).where(eq(events.slug, input.slug));
      expect(saved).toHaveLength(1);
      const event = saved[0];
      expect(event).toMatchObject({
        ...input, startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt), status: "draft",
      });
      expect(response.json()).toEqual({
        ...event, startsAt: event.startsAt.toISOString(),
        endsAt: event.endsAt.toISOString(), createdAt: event.createdAt.toISOString(),
      });
      const localUsers = await tx.select().from(users).where(eq(users.externalSubject, externalSubject));
      expect(localUsers).toHaveLength(1);
      expect(localUsers[0]).toMatchObject({ email: null, displayName: null, status: "active" });
      expect(await tx.select().from(eventStaff).where(eq(eventStaff.eventId, event.id)))
        .toEqual([expect.objectContaining({ userId: localUsers[0].id, role: "organizer" })]);
    });
  });

  it("returns 409 and preserves the original event and assignment", async () => {
    await withFixture(async ({ tx, app }) => {
      const input = validInput();
      expect((await post(app, input)).statusCode).toBe(201);
      const original = await tx.select().from(events).where(eq(events.slug, input.slug));
      const staff = await tx.select().from(eventStaff).where(eq(eventStaff.eventId, original[0].id));
      const response = await post(app, { ...input, name: "Conflicting event" });
      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe("EVENT_SLUG_CONFLICT");
      expect(await tx.select().from(events).where(eq(events.slug, input.slug))).toEqual(original);
      expect(await tx.select().from(eventStaff).where(eq(eventStaff.eventId, original[0].id))).toEqual(staff);
    });
  });

  it.each(["invalid dates", "caller-supplied status", "caller-supplied creator"] as const)(
    "returns 400 without provisioning a user or event: %s",
    async (scenario) => {
      await withFixture(async ({ tx, app, externalSubject }) => {
        const input = validInput();
        const payload = scenario === "invalid dates"
          ? { ...input, endsAt: input.startsAt }
          : scenario === "caller-supplied status"
            ? { ...input, status: "active" }
            : { ...input, userId: randomUUID() };
        const response = await post(app, payload);
        expect(response.statusCode).toBe(400);
        expect(response.json().code).toBe("INVALID_EVENT_INPUT");
        await expectNoNewRows(tx, input.slug, externalSubject);
      });
    },
  );

  it("returns 401 without provisioning when no token is supplied", async () => {
    await withFixture(async ({ tx, app, externalSubject, verifyAccessToken }) => {
      const input = validInput();
      const response = await app.inject({ method: "POST", url: "/api/v1/events", payload: input });
      expect(response.statusCode).toBe(401);
      expect(response.headers["www-authenticate"]).toBe("Bearer");
      expect(verifyAccessToken).not.toHaveBeenCalled();
      await expectNoNewRows(tx, input.slug, externalSubject);
    });
  });

  it("returns 403 without provisioning for admin without organizer", async () => {
    await withFixture(async ({ tx, app, organizer, externalSubject, verifyAccessToken }) => {
      verifyAccessToken.mockResolvedValue({ ...organizer, roles: ["admin"] });
      const input = validInput();
      expect((await post(app, input)).statusCode).toBe(403);
      await expectNoNewRows(tx, input.slug, externalSubject);
    });
  });

  it("returns 403 for a disabled local organizer without changing their record", async () => {
    await withFixture(async ({ tx, app, externalSubject }) => {
      const [existing] = await tx.insert(users).values({ externalSubject, status: "disabled" }).returning();
      const input = validInput();
      const logError = vi.spyOn(app.log, "error");
      const response = await post(app, input);
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({
        code: "FORBIDDEN", message: "No tienes los permisos necesarios para esta operación.",
      });
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(logError).not.toHaveBeenCalled();
      expect(await tx.select().from(users).where(eq(users.id, existing.id))).toEqual([existing]);
      expect(await tx.select().from(events).where(eq(events.slug, input.slug))).toEqual([]);
      expect(await tx.select().from(eventStaff).where(eq(eventStaff.userId, existing.id))).toEqual([]);
    });
  });

  it("returns a generic 500 for a real PostgreSQL write failure", async () => {
    await withFixture(async ({ tx, app, externalSubject }) => {
      await tx.execute(sql`SET TRANSACTION READ ONLY`);
      const input = validInput();
      const response = await post(app, input);
      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        code: "INTERNAL_SERVER_ERROR", message: "No se pudo crear el evento. Inténtalo más tarde.",
      });
      await expectNoNewRows(tx, input.slug, externalSubject);
    });
  });

  it("returns a generic 500 and rolls back creation if assignment fails", async () => {
    await withFixture(async ({ tx, app, externalSubject }) => {
      // Restricción temporal de prueba, eliminada por el rollback exterior.
      await tx.execute(sql`ALTER TABLE event_staff ADD CONSTRAINT issue25_http_reject_assignment
        CHECK (role <> 'organizer') NOT VALID`);
      const logError = vi.spyOn(app.log, "error");
      const input = validInput();
      const response = await post(app, input);
      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        code: "INTERNAL_SERVER_ERROR", message: "No se pudo crear el evento. Inténtalo más tarde.",
      });
      expect(logError).toHaveBeenCalledExactlyOnceWith(
        { code: "EVENT_CREATION_FAILED" }, "No se pudo crear el evento.",
      );
      await expectNoNewRows(tx, input.slug, externalSubject);
    });
  });
});
