import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";
import type { AuthenticatedUser } from "../../auth/verify-access-token.js";
import { parseDatabaseConfig } from "../../config.js";
import { eventStaff, users } from "../../db/schema.js";
import { createEventForOrganizer } from "./create-event-for-organizer.js";
import { getEventForOperator, listEventsForOperator } from "./query-events-for-operator.js";
import { getEventForOrganizer, listEventsForOrganizer } from "./query-events-for-organizer.js";
const headers = { authorization: "Bearer fixture-token" };
function identity(): AuthenticatedUser {
  return { tenantId: randomUUID(), objectId: randomUUID(), subject: "untrusted-sub", roles: ["checkin_operator"] };
}
async function assigned(tx: NodePgDatabase, actor: AuthenticatedUser) {
  const event = await createEventForOrganizer(tx, { name: "Operator fixture", slug: `operator-${randomUUID()}`,
    startsAt: "2027-08-27T14:00:00Z", endsAt: "2027-08-27T22:00:00Z", timezone: "America/Lima", location: "Fixture venue" },
    { ...actor, roles: ["organizer"] });
  await tx.update(eventStaff).set({ role: "checkin_operator" }).where(eq(eventStaff.eventId, event.id));
  return event;
}
type Fixture = { tx: NodePgDatabase; actor: AuthenticatedUser; app: ReturnType<typeof buildApp> };
describe("operator HTTP reads with PostgreSQL", () => {
  let client: Client; let db: NodePgDatabase;
  beforeAll(async () => {
    client = new Client({ connectionString: parseDatabaseConfig(process.env).databaseUrl, connectionTimeoutMillis: 5000, query_timeout: 5000 });
    await client.connect(); db = drizzle(client);
  });
  afterAll(async () => { if (client) await client.end(); });
  async function fixture(run: (value: Fixture) => Promise<void>) {
    const marker = new Error("Rollback operator fixtures");
    try { await db.transaction(async tx => {
      const actor = identity();
      const app = buildApp({ verifyAccessToken: vi.fn().mockImplementation(async () => actor),
        createEvent: (body, user) => createEventForOrganizer(tx, body, user),
        operatorEventQueries: { list: (query,user) => listEventsForOperator(tx,query,user), get: (id,user) => getEventForOperator(tx,id,user) },
        eventQueries: { list: (query,user) => listEventsForOrganizer(tx,query,user), get: (id,user) => getEventForOrganizer(tx,id,user) } });
      try { await run({tx,actor,app}); } finally { await app.close(); }
      throw marker;
    }); } catch (error) { if (error !== marker) throw error; }
  }
  it("returns only operational fields and identical missing/foreign 404", async () => {
    await fixture(async ({tx,actor,app}) => {
      const own = await assigned(tx,actor); const other = await assigned(tx,identity());
      const response = await app.inject({url:"/api/v1/operator/events",headers});
      expect(response.statusCode).toBe(200); expect(response.headers["cache-control"]).toBe("no-store");
      const detail = await app.inject({url:`/api/v1/operator/events/${own.id}`,headers});
      expect(detail.json()).toEqual({id:own.id,name:own.name,startsAt:own.startsAt.toISOString(),endsAt:own.endsAt.toISOString(),timezone:own.timezone,location:own.location,status:own.status});
      expect(response.json()).toEqual({items:[detail.json()],nextCursor:null});
      const denied = await app.inject({url:`/api/v1/operator/events/${other.id}`,headers});
      const absent = await app.inject({url:`/api/v1/operator/events/${randomUUID()}`,headers});
      expect(denied.statusCode).toBe(404); expect(absent.statusCode).toBe(404); expect(denied.json()).toEqual(absent.json());
    });
  });
  it("paginates and honors revocation before the next page and detail", async () => {
    await fixture(async ({tx,actor,app}) => {
      const rows = [await assigned(tx,actor),await assigned(tx,actor),await assigned(tx,actor)].sort((a,b)=>a.id.localeCompare(b.id));
      const first = await app.inject({url:"/api/v1/operator/events?limit=1",headers});
      expect(first.json().items.map((e:{id:string})=>e.id)).toEqual([rows[0].id]);
      await tx.delete(eventStaff).where(eq(eventStaff.eventId,rows[1].id));
      const second = await app.inject({url:`/api/v1/operator/events?limit=1&cursor=${first.json().nextCursor}`,headers});
      expect(second.json().items.map((e:{id:string})=>e.id)).toEqual([rows[2].id]); expect(second.json().nextCursor).toBeNull();
      expect((await app.inject({url:`/api/v1/operator/events/${rows[1].id}`,headers})).statusCode).toBe(404);
    });
  });
  it("does not provision unknown identities", async () => {
    await fixture(async ({tx,actor,app}) => {
      expect((await app.inject({url:"/api/v1/operator/events",headers})).json()).toEqual({items:[],nextCursor:null});
      expect((await app.inject({url:`/api/v1/operator/events/${randomUUID()}`,headers})).statusCode).toBe(404);
      expect(await tx.select().from(users).where(eq(users.externalSubject,`entra:${actor.tenantId}:${actor.objectId}`))).toEqual([]);
    });
  });
  it("denies organizer-only assignments even with both token roles", async () => {
    await fixture(async ({tx,actor,app}) => {
      const event = await assigned(tx,actor); actor.roles=["organizer","checkin_operator"];
      await tx.update(eventStaff).set({role:"organizer"}).where(eq(eventStaff.eventId,event.id));
      expect((await app.inject({url:"/api/v1/operator/events",headers})).json()).toEqual({items:[],nextCursor:null});
      expect((await app.inject({url:`/api/v1/operator/events/${event.id}`,headers})).statusCode).toBe(404);
      expect((await app.inject({url:`/api/v1/events/${event.id}`,headers})).statusCode).toBe(200);
    });
  });
  it("does not broaden organizer routes or event creation", async () => {
    await fixture(async ({tx,actor,app}) => {
      const event = await assigned(tx,actor);
      for (const url of ["/api/v1/events",`/api/v1/events/${event.id}`]) expect((await app.inject({url,headers})).statusCode).toBe(403);
      expect((await app.inject({method:"POST",url:"/api/v1/events",headers,payload:{}})).statusCode).toBe(403);
    });
  });
  it.each(["disabled","role"])("reauthorizes after %s change", async change => {
    await fixture(async ({tx,actor,app}) => {
      const event = await assigned(tx,actor);
      expect((await app.inject({url:"/api/v1/operator/events",headers})).statusCode).toBe(200);
      if(change==="role") actor.roles=["organizer"]; else await tx.update(users).set({status:"disabled"}).where(eq(users.externalSubject,`entra:${actor.tenantId}:${actor.objectId}`));
      for (const url of ["/api/v1/operator/events",`/api/v1/operator/events/${event.id}`]) {
        const response=await app.inject({url,headers});expect(response.statusCode).toBe(403);expect(response.headers["cache-control"]).toBe("no-store");
      }
    });
  });
});
