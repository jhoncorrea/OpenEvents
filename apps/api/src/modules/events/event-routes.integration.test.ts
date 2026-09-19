import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  drizzle,
  type NodePgDatabase,
} from "drizzle-orm/node-postgres";
import { Client } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { buildApp } from "../../app.js";
import type { AccessTokenVerifier } from "../../auth/http-auth.js";
import type { AuthenticatedUser } from "../../auth/verify-access-token.js";
import { parseDatabaseConfig } from "../../config.js";
import { events } from "../../db/schema.js";
import { createEvent } from "./create-event.js";

const organizer: AuthenticatedUser = {
  tenantId: "22222222-2222-4222-8222-222222222222",
  objectId: "11111111-1111-4111-8111-111111111111",
  subject: "integration-test-organizer",
  roles: ["organizer"],
};

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

describe("POST /api/v1/events with PostgreSQL", () => {
  let client: Client;
  let db: NodePgDatabase;
  let app: ReturnType<typeof buildApp>;
  let verifyAccessToken: ReturnType<typeof vi.fn<AccessTokenVerifier>>;

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

    verifyAccessToken = vi
      .fn<AccessTokenVerifier>()
      .mockResolvedValue(organizer);

    app = buildApp({
      verifyAccessToken,
      createEvent: (input) => createEvent(db, input),
    });
  });

  afterEach(async () => {
    try {
      if (app) {
        await app.close();
      }
    } finally {
      if (client) {
        await client.query("ROLLBACK");
      }
    }
  });

  it("returns 201 and persists the event returned by HTTP", async () => {
    const input = validInput();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/events",
      headers: { authorization: "Bearer integration-test-token" },
      payload: input,
    });

    expect(response.statusCode).toBe(201);

    const body = response.json<{ id: string }>();
    const saved = await db
      .select()
      .from(events)
      .where(eq(events.id, body.id));

    expect(saved).toHaveLength(1);

    const event = saved[0];

    if (!event) {
      throw new Error("The event was not persisted.");
    }

    expect(event).toMatchObject({
      name: input.name,
      slug: input.slug,
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
      timezone: input.timezone,
      location: input.location,
      status: "draft",
    });

    expect(response.json()).toEqual({
      id: event.id,
      name: event.name,
      slug: event.slug,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      timezone: event.timezone,
      location: event.location,
      status: event.status,
      createdAt: event.createdAt.toISOString(),
    });
  });

  it("returns 409 for a duplicate slug and preserves the original event", async () => {
    const input = validInput();

    const firstResponse = await app.inject({
      method: "POST",
      url: "/api/v1/events",
      headers: { authorization: "Bearer integration-test-token" },
      payload: input,
    });

    expect(firstResponse.statusCode).toBe(201);

    const original = await db
      .select()
      .from(events)
      .where(eq(events.slug, input.slug));

    expect(original).toHaveLength(1);

    const duplicateResponse = await app.inject({
      method: "POST",
      url: "/api/v1/events",
      headers: { authorization: "Bearer integration-test-token" },
      payload: {
        ...input,
        name: "Another event with the same slug",
      },
    });

    expect(duplicateResponse.statusCode).toBe(409);
    expect(duplicateResponse.json().code).toBe("EVENT_SLUG_CONFLICT");

    const saved = await db
      .select()
      .from(events)
      .where(eq(events.slug, input.slug));

    expect(saved).toEqual(original);
  });

  it("returns 400 for invalid dates without inserting an event", async () => {
    const input = validInput();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/events",
      headers: { authorization: "Bearer integration-test-token" },
      payload: {
        ...input,
        endsAt: input.startsAt,
      },
    });

    expect(response.statusCode).toBe(400);

    const saved = await db
      .select()
      .from(events)
      .where(eq(events.slug, input.slug));

    expect(saved).toHaveLength(0);
  });

  it("returns 400 for a caller-supplied status without inserting an event", async () => {
    const input = validInput();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/events",
      headers: { authorization: "Bearer integration-test-token" },
      payload: {
        ...input,
        status: "active",
      },
    });

    expect(response.statusCode).toBe(400);

    const saved = await db
      .select()
      .from(events)
      .where(eq(events.slug, input.slug));

    expect(saved).toHaveLength(0);
  });

  it("returns 401 without inserting an event when no token is supplied", async () => {
    const input = validInput();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/events",
      payload: input,
    });

    expect(response.statusCode).toBe(401);
    expect(verifyAccessToken).not.toHaveBeenCalled();

    const saved = await db
      .select()
      .from(events)
      .where(eq(events.slug, input.slug));

    expect(saved).toHaveLength(0);
  });

  it("returns 403 without inserting an event for admin without organizer", async () => {
    const input = validInput();
    verifyAccessToken.mockResolvedValue({
      ...organizer,
      roles: ["admin"],
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/events",
      headers: { authorization: "Bearer integration-test-token" },
      payload: input,
    });

    expect(response.statusCode).toBe(403);

    const saved = await db
      .select()
      .from(events)
      .where(eq(events.slug, input.slug));

    expect(saved).toHaveLength(0);
  });

  it("returns a generic 500 for a real PostgreSQL write failure", async () => {
    await client.query("SET TRANSACTION READ ONLY");

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/events",
      headers: { authorization: "Bearer integration-test-token" },
      payload: validInput(),
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      code: "INTERNAL_SERVER_ERROR",
      message: "No se pudo crear el evento. Inténtalo más tarde.",
    });
  });
});