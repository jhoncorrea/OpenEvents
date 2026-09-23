import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import type { AuthenticatedUser } from "../../auth/verify-access-token.js";
import { parseDatabaseConfig } from "../../config.js";
import { auditLogs, checkIns, events, eventStaff, qrCredentials, registrations, users } from "../../db/schema.js";
import { createEventForOrganizer } from "../events/create-event-for-organizer.js";
import { issueRegistrationCredentialForOrganizer } from "./issue-registration-credential-for-organizer.js";
import { registerAttendeeForOrganizer } from "./register-attendee-for-organizer.js";
import { registerCheckInForOperator } from "./register-check-in-for-operator.js";

async function fixture(tx: NodePgDatabase) {
  const owner: AuthenticatedUser = { tenantId: randomUUID(), objectId: randomUUID(), subject: "fixture", roles: ["organizer"] };
  const event = await createEventForOrganizer(tx, { name: "HTTP check-in", slug: `http-check-in-${randomUUID()}`, startsAt: "2027-08-27T14:00:00Z", endsAt: "2027-08-27T22:00:00Z", timezone: "America/Lima", location: "Test" }, owner);
  const registration = await registerAttendeeForOrganizer(tx, event.id, { fullName: "Synthetic attendee", email: `${randomUUID()}@example.invalid` }, owner);
  const credential = await issueRegistrationCredentialForOrganizer(tx, event.id, registration.id, owner);
  const operator: AuthenticatedUser = { ...owner, objectId: randomUUID(), roles: ["checkin_operator"] };
  const [user] = await tx.insert(users).values({ externalSubject: `entra:${operator.tenantId}:${operator.objectId}` }).returning();
  await tx.insert(eventStaff).values({ eventId: event.id, userId: user.id, role: "checkin_operator" });
  await tx.update(events).set({ status: "active" }).where(eq(events.id, event.id));
  const app = buildApp({ verifyAccessToken: async () => operator, createEvent: async input => createEventForOrganizer(tx, input, owner),
    checkIn: (id, code, source, actor) => registerCheckInForOperator(tx, id, code, source, actor) });
  const request = (code = credential.token, source = "qr", id = event.id) => app.inject({ method: "POST", url: `/api/v1/events/${id}/check-ins`, headers: { authorization: "Bearer fixture", "content-type": "application/json" }, payload: { code, source } });
  return { event, registration, credential, operator, user, app, request };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
describe("check-in HTTP with real PostgreSQL", () => {
  let client: Client; let db: NodePgDatabase;
  beforeAll(async () => { client = new Client({ connectionString: parseDatabaseConfig(process.env).databaseUrl, connectionTimeoutMillis: 5000, statement_timeout: 5000 }); await client.connect(); db = drizzle(client); });
  afterAll(async () => { await client?.end(); });
  async function isolated(run: (tx: NodePgDatabase, f: Fixture) => Promise<void>) {
    const rollback = new Error("rollback fixture");
    try { await db.transaction(async tx => { const f = await fixture(tx); try { await run(tx, f); } finally { await f.app.close(); } throw rollback; }); }
    catch (error) { if (error !== rollback) throw error; }
  }
  async function empty(tx: NodePgDatabase, f: Fixture) {
    expect(await tx.select().from(checkIns).where(eq(checkIns.registrationId, f.registration.id))).toEqual([]);
    expect(await tx.select().from(auditLogs).where(eq(auditLogs.eventId, f.event.id))).toEqual([]);
  }
  it("returns accepted then original duplicate, retaining one ingress and audit", async () => isolated(async (tx, f) => {
    const first = await f.request(); expect(first.statusCode).toBe(201); expect(first.headers["cache-control"]).toBe("no-store");
    const second = await f.request(f.credential.token, "manual"); expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({ ...first.json(), status: "duplicate" });
    const rows = await tx.select().from(checkIns).where(eq(checkIns.registrationId, f.registration.id));
    expect(rows).toHaveLength(1); expect(rows[0].performedBy).toBe(f.user.id); expect(rows[0].source).toBe("qr");
    expect(first.json()).toEqual({ status: "accepted", checkIn: { id: rows[0].id, registrationId: f.registration.id, checkedInAt: rows[0].checkedInAt.toISOString(), source: "qr" } });
    expect(await tx.select().from(auditLogs).where(eq(auditLogs.eventId, f.event.id))).toHaveLength(1);
    for (const secret of [f.credential.token, f.user.id, f.registration.attendee.email]) expect(first.body).not.toContain(secret);
  }));
  it.each(["empty", "malformed", "missing", "foreign", "revoked", "expired", "cancelled"])("returns minimal invalid for %s", async mode => isolated(async (tx, f) => {
    let code = f.credential.token;
    if (mode === "empty") code = "";
    if (mode === "malformed") code += " ";
    if (mode === "missing") code = `oe1_${Buffer.alloc(32).toString("base64url")}`;
    if (mode === "foreign") { const other = await fixture(tx); code = other.credential.token; await other.app.close(); }
    if (mode === "revoked" || mode === "expired") await tx.update(qrCredentials).set({ status: mode }).where(eq(qrCredentials.id, f.credential.id));
    if (mode === "cancelled") await tx.update(registrations).set({ status: "cancelled" }).where(eq(registrations.id, f.registration.id));
    const r = await f.request(code); expect(r.statusCode).toBe(404); expect(r.json()).toEqual({ status: "invalid" }); expect(r.headers["cache-control"]).toBe("no-store"); await empty(tx, f);
  }));
  it.each(["draft", "closed", "cancelled"] as const)("returns event conflict for %s", async status => isolated(async (tx, f) => {
    await tx.update(events).set({ status }).where(eq(events.id, f.event.id));
    const r = await f.request(); expect(r.statusCode).toBe(409); expect(r.json().code).toBe("CHECK_IN_NOT_ALLOWED"); await empty(tx, f);
  }));
  it.each(["disabled", "removed", "wrong-role", "unknown", "other-tenant", "missing-event"])("denies %s before recording", async mode => isolated(async (tx, f) => {
    if (mode === "disabled") await tx.update(users).set({ status: "disabled" }).where(eq(users.id, f.user.id));
    if (mode === "removed") await tx.delete(eventStaff).where(eq(eventStaff.userId, f.user.id));
    if (mode === "wrong-role") await tx.update(eventStaff).set({ role: "organizer" }).where(eq(eventStaff.userId, f.user.id));
    if (mode === "unknown") f.operator.objectId = randomUUID();
    if (mode === "other-tenant") f.operator.tenantId = randomUUID();
    const r = await f.request(f.credential.token, "qr", mode === "missing-event" ? randomUUID() : f.event.id);
    expect(r.statusCode).toBe(mode === "disabled" ? 403 : 404); expect(r.json().code).toBe(mode === "disabled" ? "FORBIDDEN" : "EVENT_NOT_FOUND"); await empty(tx, f);
  }));
  it("revalidates assignment on a duplicate attempt", async () => isolated(async (tx, f) => {
    expect((await f.request()).statusCode).toBe(201); await tx.delete(eventStaff).where(eq(eventStaff.userId, f.user.id));
    expect((await f.request()).statusCode).toBe(404);
    expect(await tx.select().from(checkIns).where(eq(checkIns.registrationId, f.registration.id))).toHaveLength(1);
    expect(await tx.select().from(auditLogs).where(eq(auditLogs.eventId, f.event.id))).toHaveLength(1);
  }));
});
