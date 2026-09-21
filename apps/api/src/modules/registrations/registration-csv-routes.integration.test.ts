import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import type { AuthenticatedUser } from "../../auth/verify-access-token.js";
import { parseDatabaseConfig } from "../../config.js";
import { events, eventStaff, registrations, registrationCsvImports, users, attendees } from "../../db/schema.js";
import { createEventForOrganizer } from "../events/create-event-for-organizer.js";
import { importRegistrationCsvIdempotently, queryRegistrationCsvImport } from "./registration-csv-idempotency.js";

describe("CSV HTTP with real PostgreSQL", () => {
  const client = new Client({ connectionString: parseDatabaseConfig(process.env).databaseUrl, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
  const db = drizzle(client), schema = `issue49_${randomUUID().replaceAll("-", "")}`;
  let created = false;
  const apps: ReturnType<typeof buildApp>[] = [];
  beforeAll(async () => {
    await client.connect(); await client.query(`CREATE SCHEMA "${schema}"`); created = true;
    await client.query(`SET search_path TO "${schema}"`);
    for (const file of readdirSync("drizzle").filter(f => /^\d+.*\.sql$/.test(f)).sort()) {
      await client.query(readFileSync(`drizzle/${file}`, "utf8").replaceAll('"public"', `"${schema}"`));
    }
  });
  afterAll(async () => {
    try {
      for (const app of apps) await app.close();
      if (created && /^issue49_[a-f0-9]{32}$/.test(schema)) await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally { await client.end(); }
  });
  async function seed() {
    const actor: AuthenticatedUser = { tenantId: randomUUID(), objectId: randomUUID(), subject: "synthetic", roles: ["organizer"] };
    const event = await createEventForOrganizer(db, { name: "CSV HTTP", slug: `csv-${randomUUID()}`, startsAt: "2027-08-27T14:00:00Z",
      endsAt: "2027-08-27T22:00:00Z", timezone: "America/Lima", location: "Synthetic" }, actor);
    const [user] = await db.select().from(users).where(eq(users.externalSubject, `entra:${actor.tenantId}:${actor.objectId}`));
    const app = buildApp({ verifyAccessToken: async () => actor, createEvent: async input => createEventForOrganizer(db, input, actor),
      registrationCsv: { import: (id, key, bytes, a) => importRegistrationCsvIdempotently(db, id, key, bytes, a),
        get: (id, key, a) => queryRegistrationCsvImport(db, id, key, a) } });
    apps.push(app);
    const url = `/api/v1/events/${event.id}/registrations/imports`;
    const headers = { authorization: "Bearer synthetic", "idempotency-key": randomUUID(), "content-type": "text/csv" };
    const payload = Buffer.from("fullName,email\nPersona Uno,uno@example.invalid\nPersona Dos,dos@example.invalid");
    return { app, event, user, actor, url, headers, payload };
  }
  async function counts(id: string, n: number, receipts: number) {
    expect(await db.select().from(registrations).where(eq(registrations.eventId, id))).toHaveLength(n);
    expect(await db.select().from(registrationCsvImports).where(eq(registrationCsvImports.eventId, id))).toHaveLength(receipts);
  }
  it("imports, queries and replays the same receipt without duplicate rows", async () => {
    const s = await seed(); const first = await s.app.inject({ method: "POST", ...s });
    expect(first.statusCode).toBe(200); expect(first.json().receipt.result.count).toBe(2);
    const replay = await s.app.inject({ method: "POST", ...s });
    const found = await s.app.inject({ url: s.url, headers: s.headers });
    expect(replay.json()).toEqual(first.json()); expect(found.json()).toEqual(first.json()); await counts(s.event.id, 2, 1);
  });
  it("returns not_observed before import without creating a receipt", async () => {
    const s = await seed(); const r = await s.app.inject({ url: s.url, headers: s.headers });
    expect(r.statusCode).toBe(200); expect(r.json()).toEqual({ status: "not_observed" }); await counts(s.event.id, 0, 0);
  });
  it("rejects changed bytes under the same key", async () => {
    const s = await seed(); await s.app.inject({ method: "POST", ...s });
    const r = await s.app.inject({ method: "POST", ...s, payload: Buffer.concat([s.payload, Buffer.from("\n")]) });
    expect(r.statusCode).toBe(409); expect(r.json().code).toBe("REGISTRATION_CSV_KEY_CONFLICT"); await counts(s.event.id, 2, 1);
  });
  it("validates UTF-8 without replacement decoding and does not reserve the key", async () => {
    const s = await seed(); const r = await s.app.inject({ method: "POST", ...s, payload: Buffer.from([255]) });
    expect(r.statusCode).toBe(400); expect(r.json().errors[0].code).toBe("INVALID_UTF8"); await counts(s.event.id, 0, 0);
    expect((await s.app.inject({ method: "POST", ...s })).statusCode).toBe(200);
  });
  it("rejects duplicate emails without a partial batch", async () => {
    const s = await seed(); const r = await s.app.inject({ method: "POST", ...s, payload: "fullName,email\nUno,same@example.invalid\nDos,same@example.invalid" });
    expect(r.statusCode).toBe(400); expect(r.json().errors[0].code).toBe("DUPLICATE_EMAIL"); await counts(s.event.id, 0, 0);
  });
  it("rejects a new key for existing emails without extra attendees", async () => {
    const s = await seed(); await s.app.inject({ method: "POST", ...s });
    const before = await db.select().from(attendees);
    const r = await s.app.inject({ method: "POST", ...s, headers: { ...s.headers, "idempotency-key": randomUUID() },
      payload: "fullName,email\nNuevo,aaa@example.invalid\nDuplicado,uno@example.invalid" });
    expect(r.statusCode).toBe(409); expect(r.json().code).toBe("REGISTRATION_EMAIL_CONFLICT");
    expect(await db.select().from(attendees)).toHaveLength(before.length); await counts(s.event.id, 2, 1);
  });
  it.each(["closed", "cancelled"] as const)("recovers history in %s but denies a new import", async status => {
    const s = await seed(); const original = await s.app.inject({ method: "POST", ...s });
    await db.update(events).set({ status }).where(eq(events.id, s.event.id));
    expect((await s.app.inject({ method: "POST", ...s })).json()).toEqual(original.json());
    expect((await s.app.inject({ url: s.url, headers: s.headers })).json()).toEqual(original.json());
    const r = await s.app.inject({ method: "POST", ...s, headers: { ...s.headers, "idempotency-key": randomUUID() } });
    expect(r.statusCode).toBe(409); expect(r.json().code).toBe("EVENT_REGISTRATION_NOT_ALLOWED"); await counts(s.event.id, 2, 1);
  });
  it("rechecks assignment for lookup and replay", async () => {
    const s = await seed(); await s.app.inject({ method: "POST", ...s });
    await db.delete(eventStaff).where(eq(eventStaff.eventId, s.event.id));
    expect((await s.app.inject({ method: "POST", ...s })).statusCode).toBe(404);
    expect((await s.app.inject({ url: s.url, headers: s.headers })).statusCode).toBe(404); await counts(s.event.id, 2, 1);
  });
  it("denies a disabled local organizer", async () => {
    const s = await seed(); await db.update(users).set({ status: "disabled" }).where(eq(users.id, s.user.id));
    expect((await s.app.inject({ method: "POST", ...s })).statusCode).toBe(403); await counts(s.event.id, 0, 0);
  });
  it("does not reveal another organizer's event or receipt", async () => {
    const s = await seed(), other = await seed(); await s.app.inject({ method: "POST", ...s });
    const r = await other.app.inject({ url: s.url, headers: s.headers });
    expect(r.statusCode).toBe(404); expect(r.json().code).toBe("EVENT_NOT_FOUND");
  });
  it("bounds error diagnostics at one hundred", async () => {
    const s = await seed(); const r = await s.app.inject({ method: "POST", ...s,
      payload: "fullName,email\n" + Array.from({ length: 120 }, () => "Persona,invalid").join("\n") });
    expect(r.statusCode).toBe(400); expect(r.json().errors).toHaveLength(100); expect(r.json().truncated).toBe(true); await counts(s.event.id, 0, 0);
  });
});
