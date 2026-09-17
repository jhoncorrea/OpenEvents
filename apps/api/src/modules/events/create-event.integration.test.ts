import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { ZodError } from "zod";
import { parseDatabaseConfig } from "../../config.js";
import { events } from "../../db/schema.js";
import {
  createEvent,
  EventSlugConflictError,
} from "./create-event.js";

function validInput() {
  return {
    name: "Integration test event",
    slug: `test-${randomUUID()}`,
    startsAt: "2027-08-27T14:00:00Z",
    endsAt: "2027-08-27T22:00:00Z",
    timezone: "America/Lima",
    location: "Test venue",
  };
}

describe("createEvent persistence", () => {
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
    if (client) {
      await client.end();
    }
  });

  beforeEach(async () => {
    await client.query("BEGIN");
  });

  afterEach(async () => {
    await client.query("ROLLBACK");
  });

  it("creates one draft event and retrieves it by UUID", async () => {
    const input = validInput();

    const created = await createEvent(db, input);

    expect(created.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(created.status).toBe("draft");
    expect(created.createdAt).toBeInstanceOf(Date);

    const saved = await db
      .select()
      .from(events)
      .where(eq(events.id, created.id));

    expect(saved).toEqual([created]);

    expect(saved[0]).toMatchObject({
      name: input.name,
      slug: input.slug,
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
      timezone: input.timezone,
      location: input.location,
      status: "draft",
    });

    const matchingSlug = await db
      .select()
      .from(events)
      .where(eq(events.slug, input.slug));

    expect(matchingSlug).toHaveLength(1);
  });

  it("rejects a duplicate slug without changing the existing event", async () => {
    const input = validInput();
    const first = await createEvent(db, input);

    await expect(
      createEvent(db, {
        ...input,
        name: "Another event with the same slug",
      }),
    ).rejects.toBeInstanceOf(EventSlugConflictError);

    const saved = await db
      .select()
      .from(events)
      .where(eq(events.slug, input.slug));

    expect(saved).toEqual([first]);
  });

  it("rejects invalid input without inserting an event", async () => {
    const input = validInput();

    await expect(
      createEvent(db, {
        ...input,
        endsAt: input.startsAt,
      }),
    ).rejects.toBeInstanceOf(ZodError);

    const saved = await db
      .select()
      .from(events)
      .where(eq(events.slug, input.slug));

    expect(saved).toHaveLength(0);
  });

  it("rejects a caller-supplied status without inserting an event", async () => {
    const input = validInput();

    await expect(
      createEvent(db, {
        ...input,
        status: "active",
      }),
    ).rejects.toBeInstanceOf(ZodError);

    const saved = await db
      .select()
      .from(events)
      .where(eq(events.slug, input.slug));

    expect(saved).toHaveLength(0);
  });

  it("does not classify other database failures as slug conflicts", async () => {
    // Restrict this test transaction to read-only operations.
    await client.query("SET TRANSACTION READ ONLY");

    let receivedError: unknown;

    try {
      await createEvent(db, validInput());
    } catch (error) {
      receivedError = error;
    }

    expect(receivedError).toBeInstanceOf(Error);
    expect(receivedError).not.toBeInstanceOf(EventSlugConflictError);

    // Drizzle wraps the original PostgreSQL error in cause.
    expect(receivedError).toMatchObject({
      cause: {
        code: "25006",
      },
    });
  });
});