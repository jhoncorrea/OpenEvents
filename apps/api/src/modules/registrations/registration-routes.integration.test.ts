import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";
import type { AccessTokenVerifier } from "../../auth/http-auth.js";
import type { AuthenticatedUser } from "../../auth/verify-access-token.js";
import { parseDatabaseConfig } from "../../config.js";
import { attendees, registrations, events, eventStaff, users } from "../../db/schema.js";
import { createEventForOrganizer } from "../events/create-event-for-organizer.js";
import { registerAttendeeForOrganizer } from "./register-attendee-for-organizer.js";
import { getEventForOrganizer, listEventsForOrganizer } from "../events/query-events-for-organizer.js";

const identity = (): AuthenticatedUser => ({ tenantId: randomUUID(), objectId: randomUUID(), subject: "http-edit", roles: ["organizer"] });
const subject = (actor: AuthenticatedUser) => `entra:${actor.tenantId}:${actor.objectId}`;
const input = () => ({ name: "Original", slug: `http-edit-${randomUUID()}`,
  startsAt: "2027-08-27T14:00:00Z", endsAt: "2027-08-27T22:00:00Z", timezone: "America/Lima", location: "Lima" });
const headers = { authorization: "Bearer test-token" };
type Fixture = { tx: NodePgDatabase; app: ReturnType<typeof buildApp>; actor: AuthenticatedUser;
  verify: ReturnType<typeof vi.fn<AccessTokenVerifier>> };

describe("POST registration with PostgreSQL", () => {
  let client: Client;
  let db: NodePgDatabase;
  beforeAll(async () => {
    client = new Client({ connectionString: parseDatabaseConfig(process.env).databaseUrl,
      connectionTimeoutMillis: 5000, statement_timeout: 5000, query_timeout: 6000 });
    await client.connect(); db = drizzle(client);
  });
  afterAll(async () => { if (client) await client.end(); });
  async function fixture(run: (f: Fixture) => Promise<void>) {
    const rollback = new Error("Rollback HTTP edit test");
    try {
      await db.transaction(async tx => {
        const actor = identity();
        // El verificador de Entra es simulado; rutas, operaciones y BD son reales.
        const verify = vi.fn<AccessTokenVerifier>().mockResolvedValue(actor);
        const app = buildApp({ verifyAccessToken: verify,
          createEvent: (body, user) => createEventForOrganizer(tx, body, user),
          registerAttendee: (id, body, user) => registerAttendeeForOrganizer(tx, id, body, user),
          eventQueries: { list: (query, user) => listEventsForOrganizer(tx, query, user),
            get: (id, user) => getEventForOrganizer(tx, id, user) } });
        try { await run({ tx, app, actor, verify }); }
        finally { await app.close(); }
        throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
  }
  const body = { fullName: " Ana Pérez ", email: " ANA@EXAMPLE.COM " };
  const post = (app: ReturnType<typeof buildApp>, id: string, payload: Record<string, unknown> = body) =>
    app.inject({ method: "POST", url: `/api/v1/events/${id}/registrations`, headers, payload });

  it.each(["draft", "active"] as const)("persists the exact response for %s", async status => {
    await fixture(async ({ app, tx, actor }) => {
      const event = await createEventForOrganizer(tx, input(), actor);
      await tx.update(events).set({ status }).where(eq(events.id, event.id));
      const response = await post(app, event.id);
      expect(response.statusCode).toBe(201); expect(response.headers["cache-control"]).toBe("no-store");
      const [stored] = await tx.select().from(registrations).where(eq(registrations.eventId, event.id));
      const [person] = await tx.select().from(attendees).where(eq(attendees.id, stored.attendeeId));
      expect(response.json()).toEqual({ id: stored.id, eventId: event.id, status: "confirmed", source: "manual",
        createdAt: stored.createdAt.toISOString(), attendee: { id: person.id, fullName: "Ana Pérez", email: "ana@example.com" } });
      expect(stored.emailNormalized).toBe("ana@example.com");
      expect((await tx.select().from(events).where(eq(events.id, event.id)))[0].version).toBe(event.version);
    });
  });
  it("returns duplicate conflict without an orphan or exposing the original profile", async () => {
    await fixture(async ({ app, tx, actor }) => {
      const event = await createEventForOrganizer(tx, input(), actor);
      const first = await post(app, event.id);
      const before = await tx.select().from(attendees);
      const duplicate = await post(app, event.id, { fullName: "Different", email: "ana@example.com" });
      expect(first.statusCode).toBe(201); expect(duplicate.statusCode).toBe(409);
      expect(duplicate.json().code).toBe("REGISTRATION_EMAIL_CONFLICT");
      expect(duplicate.body).not.toContain("Ana"); expect(duplicate.body).not.toContain("ana@example.com");
      expect(await tx.select().from(attendees)).toEqual(before);
      expect(await tx.select().from(registrations).where(eq(registrations.eventId, event.id))).toHaveLength(1);
    });
  });
  it("creates independent profiles for the same email in different events", async () => {
    await fixture(async ({ app, tx, actor }) => {
      const first = await createEventForOrganizer(tx, input(), actor);
      const second = await createEventForOrganizer(tx, input(), actor);
      const a = await post(app, first.id);
      const b = await post(app, second.id, { fullName: "Independent", email: "ana@example.com" });
      expect(a.statusCode).toBe(201); expect(b.statusCode).toBe(201);
      expect(a.json().attendee.id).not.toBe(b.json().attendee.id);
      expect(a.json().attendee.fullName).toBe("Ana Pérez"); expect(b.json().attendee.fullName).toBe("Independent");
    });
  });
  it.each(["closed", "cancelled"] as const)("rejects %s without writes", async status => {
    await fixture(async ({ app, tx, actor }) => {
      const event = await createEventForOrganizer(tx, input(), actor);
      await tx.update(events).set({ status }).where(eq(events.id, event.id));
      const before = await tx.select().from(attendees);
      const response = await post(app, event.id);
      expect(response.statusCode).toBe(409); expect(response.json().code).toBe("EVENT_REGISTRATION_NOT_ALLOWED");
      expect(await tx.select().from(attendees)).toEqual(before);
    });
  });
  it("returns identical 404 for foreign and missing events without provisioning", async () => {
    await fixture(async ({ app, tx, actor, verify }) => {
      const event = await createEventForOrganizer(tx, input(), actor);
      const outsider = identity(); verify.mockResolvedValue(outsider);
      const before = await tx.select().from(attendees);
      const foreign = await post(app, event.id); const missing = await post(app, randomUUID());
      expect(foreign.statusCode).toBe(404); expect(missing.statusCode).toBe(404); expect(foreign.json()).toEqual(missing.json());
      expect(await tx.select().from(users).where(eq(users.externalSubject, subject(outsider)))).toEqual([]);
      expect(await tx.select().from(attendees)).toEqual(before);
    });
  });
  it.each(["disabled", "admin", "removed", "operator"] as const)("rejects authorization case %s", async mode => {
    await fixture(async ({ app, tx, actor, verify }) => {
      const event = await createEventForOrganizer(tx, input(), actor);
      if (mode === "disabled") await tx.update(users).set({ status: "disabled" }).where(eq(users.externalSubject, subject(actor)));
      if (mode === "admin") verify.mockResolvedValue({ ...actor, roles: ["admin"] });
      if (mode === "removed") await tx.delete(eventStaff).where(eq(eventStaff.eventId, event.id));
      if (mode === "operator") await tx.update(eventStaff).set({ role: "operator" }).where(eq(eventStaff.eventId, event.id));
      const before = await tx.select().from(attendees);
      expect((await post(app, event.id)).statusCode).toBe(mode === "disabled" || mode === "admin" ? 403 : 404);
      expect(await tx.select().from(attendees)).toEqual(before);
    });
  });
  it.each([{ ...body, status: "confirmed" }, { ...body, userId: "caller" }, { ...body, source: "csv" }, { fullName: "Ana", email: "invalid" }])(
    "rejects invalid body %j without writes", async payload => {
      await fixture(async ({ app, tx, actor }) => {
        const event = await createEventForOrganizer(tx, input(), actor);
        const before = await tx.select().from(attendees);
        expect((await post(app, event.id, payload)).statusCode).toBe(400);
        expect(await tx.select().from(attendees)).toEqual(before);
      });
    });
  it("authenticates before parsing malformed JSON", async () => {
    await fixture(async ({ app, verify }) => {
      const response = await app.inject({ method: "POST", url: "/api/v1/events/invalid/registrations",
        headers: { "content-type": "application/json" }, payload: '{"email":' });
      expect(response.statusCode).toBe(401); expect(verify).not.toHaveBeenCalled();
    });
  });
  it("hides a real write failure and rolls back both records", async () => {
    await fixture(async ({ app, tx, actor }) => {
      const event = await createEventForOrganizer(tx, input(), actor);
      await tx.execute(sql`ALTER TABLE registration ADD CONSTRAINT issue35_http_failure CHECK (source <> 'manual') NOT VALID`);
      const before = await tx.select().from(attendees); const log = vi.spyOn(app.log, "error");
      const response = await post(app, event.id);
      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({ code: "INTERNAL_SERVER_ERROR", message: "No se pudo registrar al asistente. Inténtalo más tarde." });
      expect(log).toHaveBeenCalledExactlyOnceWith({ code: "REGISTRATION_FAILED" }, "No se pudo registrar al asistente.");
      expect(await tx.select().from(attendees)).toEqual(before);
      expect(await tx.select().from(registrations).where(eq(registrations.eventId, event.id))).toEqual([]);
    });
  });
});
