import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";
import type { AccessTokenVerifier } from "../../auth/http-auth.js";
import type { AuthenticatedUser } from "../../auth/verify-access-token.js";
import { parseDatabaseConfig } from "../../config.js";
import { auditLogs, events, eventStaff, users } from "../../db/schema.js";
import { createEventForOrganizer } from "./create-event-for-organizer.js";
import { activateEventForOrganizer, closeEventForOrganizer } from "./change-event-state-for-organizer.js";
import type { QueriedEvent } from "./query-events-for-organizer.js";

const identity = (): AuthenticatedUser => ({ tenantId: randomUUID(), objectId: randomUUID(), subject: "ignored", roles: ["organizer"] });
const headers = { authorization: "Bearer synthetic-test-token" };
describe("event lifecycle HTTP with committed PostgreSQL", () => {
  let client: Client; let observer: Client; let db: NodePgDatabase; let read: NodePgDatabase;
  let app: ReturnType<typeof buildApp>; let actor: AuthenticatedUser; let event: QueriedEvent; let userId: string;
  let verify: ReturnType<typeof vi.fn<AccessTokenVerifier>>;
  beforeAll(async () => {
    const config = { connectionString: parseDatabaseConfig(process.env).databaseUrl, connectionTimeoutMillis: 5000, statement_timeout: 5000 };
    client = new Client(config); observer = new Client(config);
    await client.connect(); await observer.connect(); db = drizzle(client); read = drizzle(observer);
  });
  afterAll(async () => { await client?.end(); await observer?.end(); });
  beforeEach(async () => {
    actor = identity(); verify = vi.fn<AccessTokenVerifier>().mockResolvedValue(actor);
    event = await createEventForOrganizer(db, { name: "Lifecycle HTTP fixture", slug: `lifecycle-${randomUUID()}`,
      startsAt: "2027-08-27T14:00:00Z", endsAt: "2027-08-27T22:00:00Z", timezone: "America/Lima", location: "Lima" }, actor);
    const [user] = await db.select().from(users).where(eq(users.externalSubject, `entra:${actor.tenantId}:${actor.objectId}`)); userId = user.id;
    app = buildApp({ verifyAccessToken: verify, createEvent: vi.fn(), eventLifecycle: {
      activate: (id, input, user) => activateEventForOrganizer(db, id, input, user),
      close: (id, input, user) => closeEventForOrganizer(db, id, input, user),
    } });
  });
  afterEach(async () => {
    await app.close();
    await db.transaction(async tx => {
      await tx.delete(auditLogs).where(eq(auditLogs.eventId, event.id));
      await tx.delete(eventStaff).where(eq(eventStaff.eventId, event.id));
      await tx.delete(events).where(eq(events.id, event.id));
      await tx.delete(users).where(eq(users.id, userId));
    });
  });
  const post = (action: string, expectedVersion = 1, id?: string) => app.inject({ method: "POST",
    url: `/api/v1/events/${id ?? event.id}/${action}`, headers, payload: { expectedVersion } });
  const rows = () => read.select().from(auditLogs).where(eq(auditLogs.eventId, event.id));
  it("returns only after activation and closure are visible to an independent connection", async () => {
    const active = await post("activate"); expect(active.statusCode).toBe(200);
    expect(active.json()).toEqual({ ...JSON.parse(JSON.stringify(event)), status: "active", version: 2 });
    expect(await read.select().from(events).where(eq(events.id, event.id))).toEqual([{ ...event, status: "active", version: 2 }]);
    expect(await rows()).toHaveLength(1);
    const closed = await post("close", 2); expect(closed.statusCode).toBe(200);
    expect(closed.json()).toEqual({ ...JSON.parse(JSON.stringify(event)), status: "closed", version: 3 });
    expect(await read.select().from(events).where(eq(events.id, event.id))).toEqual([{ ...event, status: "closed", version: 3 }]);
    const audits = await rows(); expect(audits).toHaveLength(2);
    expect(audits.map(a => a.action).sort()).toEqual(["event.activated", "event.closed"]);
    for (const a of audits) expect(a).toMatchObject({ actorId: userId, eventId: event.id, entityId: event.id, entityType: "event" });
  });
  describe.each(["activate", "close"] as const)("%s", action => {
    beforeEach(async () => {
      if (action === "close") { await db.update(events).set({ status: "active" }).where(eq(events.id, event.id)); event = { ...event, status: "active" }; }
    });
    it("rejects stale versions without a transition or audit", async () => {
      const r = await post(action, 2); expect(r.statusCode).toBe(409); expect(r.json().code).toBe("EVENT_VERSION_CONFLICT");
      expect(await rows()).toEqual([]); expect(await read.select().from(events).where(eq(events.id, event.id))).toEqual([event]);
    });
    it("rejects a repeat with state precedence and only one audit", async () => {
      expect((await post(action)).statusCode).toBe(200);
      const repeat = await post(action); expect(repeat.statusCode).toBe(409); expect(repeat.json().code).toBe("EVENT_TRANSITION_NOT_ALLOWED");
      expect(await rows()).toHaveLength(1);
      expect((await read.select().from(events).where(eq(events.id, event.id)))[0].version).toBe(2);
    });
    it.each(["draft", "active", "closed", "cancelled"] as const)("maps state %s", async status => {
      await db.update(events).set({ status }).where(eq(events.id, event.id));
      const r = await post(action); const allowed = status === (action === "activate" ? "draft" : "active");
      expect(r.statusCode).toBe(allowed ? 200 : 409); expect(r.headers["cache-control"]).toBe("no-store");
      if (!allowed) expect(r.json().code).toBe("EVENT_TRANSITION_NOT_ALLOWED");
      expect(await rows()).toHaveLength(allowed ? 1 : 0);
    });
    it.each(["disabled", "removed", "operator", "admin", "unknown"])("denies local permission %s", async mode => {
      if (mode === "disabled") await db.update(users).set({ status: "disabled" }).where(eq(users.id, userId));
      if (mode === "removed") await db.delete(eventStaff).where(eq(eventStaff.eventId, event.id));
      if (mode === "operator" || mode === "admin") await db.update(eventStaff).set({ role: mode === "operator" ? "checkin_operator" : "admin" }).where(eq(eventStaff.eventId, event.id));
      if (mode === "unknown") verify.mockResolvedValue(identity());
      const r = await post(action); expect(r.statusCode).toBe(mode === "disabled" ? 403 : 404);
      expect(await rows()).toEqual([]); expect(await read.select().from(events).where(eq(events.id, event.id))).toEqual([event]);
    });
    it("returns the same inaccessible response for foreign and absent events without provisioning", async () => {
      const outsider = identity(); verify.mockResolvedValue(outsider);
      const foreign = await post(action); const absent = await post(action, 1, randomUUID());
      expect(foreign.statusCode).toBe(404); expect(absent.statusCode).toBe(404); expect(foreign.json()).toEqual(absent.json());
      expect(await read.select().from(users).where(eq(users.externalSubject, `entra:${outsider.tenantId}:${outsider.objectId}`))).toEqual([]);
      expect(await rows()).toEqual([]);
    });
  });
});
