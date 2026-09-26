import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { buildApp } from "../../app.js";
import { AuthenticationError, AuthorizationError, type AuthenticatedUser } from "../../auth/verify-access-token.js";
import { parseDatabaseConfig } from "../../config.js";
import { checkIns, events, eventStaff, registrations, users } from "../../db/schema.js";
import { createEventForOrganizer } from "./create-event-for-organizer.js";
import { EventNotFoundError } from "./query-events-for-organizer.js";
import { queryAttendanceSummary as query } from "./query-attendance-summary.js";
import { registerAttendeeForOrganizer } from "../registrations/register-attendee-for-organizer.js";
import { issueRegistrationCredentialForOrganizer } from "../registrations/issue-registration-credential-for-organizer.js";
import { registerCheckInForOperator } from "../registrations/register-check-in-for-operator.js";

const actor = (roles: AuthenticatedUser["roles"] = ["organizer"]): AuthenticatedUser => ({ tenantId: randomUUID(), objectId: randomUUID(), subject: "ignored", roles });
const subject = (a: AuthenticatedUser) => `entra:${a.tenantId.toLowerCase()}:${a.objectId.toLowerCase()}`;
const input = () => ({ name: "Summary fixture", slug: `summary-${randomUUID()}`, startsAt: "2027-08-27T14:00:00Z", endsAt: "2027-08-27T22:00:00Z", timezone: "America/Lima", location: "Synthetic" });
const zeros = { registered: 0, confirmed: 0, cancelled: 0, checkedIn: 0, cancelledCheckedIn: 0, pending: 0 };

describe("attendance summary with PostgreSQL", () => {
  let client: Client; let db: NodePgDatabase;
  beforeAll(async () => {
    client = new Client({ connectionString: parseDatabaseConfig(process.env).databaseUrl, connectionTimeoutMillis: 5000, query_timeout: 6000, statement_timeout: 5000 });
    await client.connect(); db = drizzle(client);
  });
  afterAll(async () => { await client?.end(); });
  async function isolated(work: (tx: NodePgDatabase) => Promise<void>) {
    const rollback = new Error("Rollback summary fixture");
    try { await db.transaction(async tx => { await work(tx); throw rollback; }); }
    catch (error) { if (error !== rollback) throw error; }
  }
  async function fixture(tx: NodePgDatabase) {
    const owner = actor(); const event = await createEventForOrganizer(tx, input(), owner);
    const [ownerUser] = await tx.select().from(users).where(eq(users.externalSubject, subject(owner)));
    const operator = actor(["checkin_operator"]);
    const [operatorUser] = await tx.insert(users).values({ externalSubject: subject(operator) }).returning();
    await tx.insert(eventStaff).values({ eventId: event.id, userId: operatorUser.id, role: "checkin_operator" });
    return { owner, event, ownerUser, operator, operatorUser };
  }
  async function registration(tx: NodePgDatabase, eventId: string, owner: AuthenticatedUser) {
    return registerAttendeeForOrganizer(tx, eventId, { fullName: "Synthetic summary person", email: `${randomUUID()}@example.invalid` }, owner);
  }
  it.each(["draft", "active", "closed", "cancelled"] as const)("returns zeros for an empty %s event without writes", async status => {
    await isolated(async tx => {
      const f = await fixture(tx); await tx.update(events).set({ status }).where(eq(events.id, f.event.id));
      const before = await tx.select().from(events).where(eq(events.id, f.event.id));
      const lower = Date.now(); const result = await query(tx, f.event.id, f.owner);
      expect(result).toEqual({ eventId: f.event.id, ...zeros, observedAt: expect.any(Date) });
      expect(result.observedAt.getTime()).toBeGreaterThanOrEqual(lower - 1000);
      expect(result.observedAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
      expect(await tx.select().from(events).where(eq(events.id, f.event.id))).toEqual(before);
    });
  });
  it("counts all four registration/attendance combinations and ignores another event", async () => {
    await isolated(async tx => {
      const f = await fixture(tx); const pending = await registration(tx, f.event.id, f.owner);
      const entered = await registration(tx, f.event.id, f.owner); const cancelled = await registration(tx, f.event.id, f.owner);
      const cancelledEntered = await registration(tx, f.event.id, f.owner);
      for (const row of [entered, cancelledEntered]) await tx.insert(checkIns).values({ registrationId: row.id, performedBy: f.operatorUser.id, source: "qr" });
      for (const row of [cancelled, cancelledEntered]) await tx.update(registrations).set({ status: "cancelled" }).where(eq(registrations.id, row.id));
      const other = await createEventForOrganizer(tx, input(), f.owner); const foreign = await registration(tx, other.id, f.owner);
      await tx.insert(checkIns).values({ registrationId: foreign.id, performedBy: f.ownerUser.id, source: "manual" });
      const before = await tx.select().from(registrations).where(eq(registrations.eventId, f.event.id));
      const expected = { eventId: f.event.id, registered: 4, confirmed: 2, cancelled: 2, checkedIn: 2, cancelledCheckedIn: 1, pending: 1, observedAt: expect.any(Date) };
      expect(await query(tx, f.event.id, f.owner)).toEqual(expected); expect(await query(tx, f.event.id, f.operator)).toEqual(expected);
      expect(await query(tx, other.id, f.owner)).toMatchObject({ registered: 1, checkedIn: 1, pending: 0 });
      expect(await tx.select().from(registrations).where(eq(registrations.eventId, f.event.id))).toEqual(before);
      expect(pending.id).not.toBe(foreign.id);
    });
  });
  it.each(["manual", "qr"])("updates after %s ingress and preserves counts on duplicate and later cancellation", async source => {
    await isolated(async tx => {
      const f = await fixture(tx); const saved = await registration(tx, f.event.id, f.owner);
      const credential = await issueRegistrationCredentialForOrganizer(tx, f.event.id, saved.id, f.owner);
      await tx.update(events).set({ status: "active" }).where(eq(events.id, f.event.id));
      expect(await query(tx, f.event.id, f.operator)).toMatchObject({ registered: 1, checkedIn: 0, pending: 1 });
      expect((await registerCheckInForOperator(tx, f.event.id, credential.token, source, f.operator)).status).toBe("accepted");
      const snapshot = await query(tx, f.event.id, f.operator); expect(snapshot).toMatchObject({ registered: 1, checkedIn: 1, pending: 0, cancelledCheckedIn: 0 });
      expect((await registerCheckInForOperator(tx, f.event.id, credential.token, source, f.operator)).status).toBe("duplicate");
      expect(await query(tx, f.event.id, f.operator)).toEqual({ ...snapshot, observedAt: expect.any(Date) });
      await tx.update(registrations).set({ status: "cancelled" }).where(eq(registrations.id, saved.id));
      expect(await query(tx, f.event.id, f.operator)).toMatchObject({ registered: 1, confirmed: 0, cancelled: 1, checkedIn: 1, cancelledCheckedIn: 1, pending: 0 });
      expect(await tx.select().from(checkIns).where(eq(checkIns.registrationId, saved.id))).toHaveLength(1);
    });
  });
  it("does not count cancelled people as pending or credentials as attendance", async () => {
    await isolated(async tx => {
      const f = await fixture(tx); const saved = await registration(tx, f.event.id, f.owner);
      await issueRegistrationCredentialForOrganizer(tx, f.event.id, saved.id, f.owner);
      expect(await query(tx, f.event.id, f.owner)).toMatchObject({ registered: 1, checkedIn: 0, pending: 1 });
      await tx.update(registrations).set({ status: "cancelled" }).where(eq(registrations.id, saved.id));
      expect(await query(tx, f.event.id, f.owner)).toMatchObject({ registered: 1, confirmed: 0, cancelled: 1, checkedIn: 0, pending: 0 });
    });
  });
  it("normalizes identity and event UUIDs, ignoring the untrusted subject claim", async () => {
    await isolated(async tx => {
      const f = await fixture(tx);
      expect(await query(tx, f.event.id.toUpperCase(), { ...f.owner, tenantId: f.owner.tenantId.toUpperCase(), objectId: f.owner.objectId.toUpperCase(), subject: "another-person" })).toMatchObject({ eventId: f.event.id, ...zeros });
    });
  });
  it.each([{ roles: [] }, { roles: ["admin"] }] as { roles: AuthenticatedUser["roles"] }[])("rejects global roles $roles", async ({ roles }) => {
    await isolated(async tx => { const f = await fixture(tx); await expect(query(tx, f.event.id, { ...f.owner, roles })).rejects.toBeInstanceOf(AuthorizationError); });
  });
  it.each(["tenantId", "objectId"])("rejects malformed identity %s", async field => {
    await isolated(async tx => { const f = await fixture(tx); await expect(query(tx, f.event.id, { ...f.owner, [field]: "invalid" })).rejects.toBeInstanceOf(AuthenticationError); });
  });
  it.each(["invalid", "", null])("rejects malformed event %s", async id => {
    await isolated(async tx => { const f = await fixture(tx); await expect(query(tx, id, f.owner)).rejects.toBeInstanceOf(ZodError); });
  });
  it("does not provision unknown users or reveal missing/foreign events", async () => {
    await isolated(async tx => {
      const f = await fixture(tx); const outsider = actor();
      for (const id of [f.event.id, randomUUID()]) await expect(query(tx, id, outsider)).rejects.toBeInstanceOf(EventNotFoundError);
      expect(await tx.select().from(users).where(eq(users.externalSubject, subject(outsider)))).toEqual([]);
      await expect(query(tx, randomUUID(), f.owner)).rejects.toBeInstanceOf(EventNotFoundError);
    });
  });
  it.each(["disabled", "unassigned", "wrong-local-role", "wrong-global-role"])("rechecks access after %s", async action => {
    await isolated(async tx => {
      const f = await fixture(tx); await query(tx, f.event.id, f.operator);
      if (action === "disabled") await tx.update(users).set({ status: "disabled" }).where(eq(users.id, f.operatorUser.id));
      if (action === "unassigned") await tx.delete(eventStaff).where(eq(eventStaff.userId, f.operatorUser.id));
      if (action === "wrong-local-role") await tx.update(eventStaff).set({ role: "organizer" }).where(eq(eventStaff.userId, f.operatorUser.id));
      const user = action === "wrong-global-role" ? { ...f.operator, roles: ["organizer"] as AuthenticatedUser["roles"] } : f.operator;
      await expect(query(tx, f.event.id, user)).rejects.toBeInstanceOf(action === "disabled" ? AuthorizationError : EventNotFoundError);
    });
  });
  it.each(["owner", "operator"] as const)("serves real PostgreSQL values over HTTP for %s", async role => {
    await isolated(async tx => {
      const f = await fixture(tx); await registration(tx, f.event.id, f.owner);
      const app = buildApp({ verifyAccessToken: vi.fn().mockResolvedValue(f[role]), createEvent: vi.fn(), attendanceSummary: (id, who) => query(tx, id, who) });
      try {
        const response = await app.inject({ url: `/api/v1/events/${f.event.id}/attendance-summary`, headers: { authorization: "Bearer synthetic" } });
        expect(response.statusCode).toBe(200); expect(response.headers["cache-control"]).toBe("no-store");
        expect(response.json()).toEqual({ eventId: f.event.id, registered: 1, confirmed: 1, cancelled: 0, checkedIn: 0, pending: 1, cancelledCheckedIn: 0, observedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/) });
        expect(response.body).not.toContain("Synthetic summary person");
        const foreign = await app.inject({ url: `/api/v1/events/${randomUUID()}/attendance-summary`, headers: { authorization: "Bearer synthetic" } });
        expect(foreign.statusCode).toBe(404); expect(foreign.headers["cache-control"]).toBe("no-store");
      } finally { await app.close(); }
    });
  });
});
