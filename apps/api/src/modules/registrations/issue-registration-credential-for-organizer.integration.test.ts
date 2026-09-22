import { randomUUID, createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { AuthenticationError, AuthorizationError, type AuthenticatedUser } from "../../auth/verify-access-token.js";
import { parseDatabaseConfig } from "../../config.js";
import { events, eventStaff, qrCredentials, registrations, users } from "../../db/schema.js";
import { createEventForOrganizer } from "../events/create-event-for-organizer.js";
import { EventNotFoundError } from "../events/query-events-for-organizer.js";
import { registerAttendeeForOrganizer } from "./register-attendee-for-organizer.js";
import { RegistrationNotFoundError } from "./query-registrations-for-organizer.js";
import { createRegistrationCredentialToken } from "./registration-credential-token.js";
import { issueRegistrationCredentialForOrganizer as issue, CredentialIssuanceFailedError, CredentialIssuanceNotAllowedError, RegistrationCredentialExistsError } from "./issue-registration-credential-for-organizer.js";
vi.mock("./registration-credential-token.js", async original => {
  const module = await original<typeof import("./registration-credential-token.js")>();
  return { createRegistrationCredentialToken: vi.fn(module.createRegistrationCredentialToken) };
});
const actor = (): AuthenticatedUser => ({ tenantId: randomUUID(), objectId: randomUUID(), subject: "untrusted-sub", roles: ["organizer"] });
const subject = (a: AuthenticatedUser) => `entra:${a.tenantId.toLowerCase()}:${a.objectId.toLowerCase()}`;
async function fixture(tx: NodePgDatabase, owner = actor()) {
  const event = await createEventForOrganizer(tx, { name: "Credential test", slug: `credential-${randomUUID()}`, startsAt: "2027-08-27T14:00:00Z", endsAt: "2027-08-27T22:00:00Z", timezone: "America/Lima", location: "Test" }, owner);
  const registration = await registerAttendeeForOrganizer(tx, event.id, { fullName: "Synthetic person", email: `${randomUUID()}@example.invalid` }, owner);
  return { owner, event, registration };
}
describe("authorized credential issuance persistence", () => {
  let client: Client; let db: NodePgDatabase;
  beforeAll(async () => {
    client = new Client({ connectionString: parseDatabaseConfig(process.env).databaseUrl, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
    await client.connect(); db = drizzle(client);
  });
  afterEach(() => vi.clearAllMocks());
  afterAll(async () => { await client?.end(); });
  async function isolated(run: (tx: NodePgDatabase) => Promise<void>) {
    const rollback = new Error("rollback fixture");
    try { await db.transaction(async tx => { await run(tx); throw rollback; }); }
    catch (error) { if (error !== rollback) throw error; }
  }
  async function empty(tx: NodePgDatabase, id: string) {
    expect(await tx.select().from(qrCredentials).where(eq(qrCredentials.registrationId, id))).toEqual([]);
  }
  it.each(["draft", "active"] as const)("issues in %s, stores only hash, preserves event and registration", async status => isolated(async tx => {
    const f = await fixture(tx); await tx.update(events).set({ status }).where(eq(events.id, f.event.id));
    const before = await tx.select().from(registrations).where(eq(registrations.id, f.registration.id));
    const result = await issue(tx, f.event.id.toUpperCase(), f.registration.id.toUpperCase(), { ...f.owner, tenantId: f.owner.tenantId.toUpperCase(), objectId: f.owner.objectId.toUpperCase(), subject: "changed" });
    expect(result).toEqual({ id: expect.any(String), eventId: f.event.id, registrationId: f.registration.id, status: "active", issuedAt: expect.any(Date), token: expect.stringMatching(/^oe1_[A-Za-z0-9_-]{43}$/) });
    const rows = await tx.select().from(qrCredentials).where(eq(qrCredentials.registrationId, f.registration.id));
    expect(rows).toEqual([{ id: result.id, registrationId: f.registration.id, tokenHash: createHash("sha256").update(result.token).digest("hex"), status: "active", issuedAt: result.issuedAt, revokedAt: null }]);
    expect(JSON.stringify(rows)).not.toContain(result.token);
    expect(await tx.select().from(registrations).where(eq(registrations.id, f.registration.id))).toEqual(before);
    expect((await tx.select().from(events).where(eq(events.id, f.event.id)))[0].version).toBe(f.event.version);
  }));
  it.each(["closed", "cancelled"] as const)("rejects event %s without generating a token", async status => isolated(async tx => {
    const f = await fixture(tx); await tx.update(events).set({ status }).where(eq(events.id, f.event.id));
    await expect(issue(tx, f.event.id, f.registration.id, f.owner)).rejects.toBeInstanceOf(CredentialIssuanceNotAllowedError);
    await empty(tx, f.registration.id); expect(createRegistrationCredentialToken).not.toHaveBeenCalled();
  }));
  it("rejects a cancelled registration without reactivation", async () => isolated(async tx => {
    const f = await fixture(tx); await tx.update(registrations).set({ status: "cancelled" }).where(eq(registrations.id, f.registration.id));
    await expect(issue(tx, f.event.id, f.registration.id, f.owner)).rejects.toBeInstanceOf(CredentialIssuanceNotAllowedError); await empty(tx, f.registration.id);
  }));
  it.each(["active", "revoked", "expired"] as const)("preserves existing %s credentials on retries", async status => isolated(async tx => {
    const f = await fixture(tx); const saved = await issue(tx, f.event.id, f.registration.id, f.owner);
    await tx.update(qrCredentials).set({ status }).where(eq(qrCredentials.id, saved.id));
    const before = await tx.select().from(qrCredentials).where(eq(qrCredentials.id, saved.id));
    vi.mocked(createRegistrationCredentialToken).mockClear();
    await expect(issue(tx, f.event.id, f.registration.id, f.owner)).rejects.toBeInstanceOf(RegistrationCredentialExistsError);
    expect(await tx.select().from(qrCredentials).where(eq(qrCredentials.id, saved.id))).toEqual(before); expect(createRegistrationCredentialToken).not.toHaveBeenCalled();
  }));
  it.each(([[], ["admin"], ["checkin_operator"]] as AuthenticatedUser["roles"][]).map(roles => ({ roles })))("rejects incompatible global roles $roles", async ({ roles }) => isolated(async tx => {
    const f = await fixture(tx); await expect(issue(tx, f.event.id, f.registration.id, { ...f.owner, roles })).rejects.toBeInstanceOf(AuthorizationError); await empty(tx, f.registration.id);
  }));
  it("accepts dual roles with an organizer assignment", async () => isolated(async tx => {
    const f = await fixture(tx); expect((await issue(tx, f.event.id, f.registration.id, { ...f.owner, roles: ["organizer", "checkin_operator"] })).status).toBe("active");
  }));
  it.each(["checkin_operator", "admin"])("does not inherit local %s assignment", async role => isolated(async tx => {
    const f = await fixture(tx); await tx.update(eventStaff).set({ role }).where(eq(eventStaff.eventId, f.event.id));
    await expect(issue(tx, f.event.id, f.registration.id, f.owner)).rejects.toBeInstanceOf(EventNotFoundError); await empty(tx, f.registration.id);
  }));
  it("does not provision an unknown identity or disclose a foreign event", async () => isolated(async tx => {
    const f = await fixture(tx); const outsider = actor();
    for (const id of [f.event.id, randomUUID()]) await expect(issue(tx, id, f.registration.id, outsider)).rejects.toBeInstanceOf(EventNotFoundError);
    expect(await tx.select().from(users).where(eq(users.externalSubject, subject(outsider)))).toEqual([]); await empty(tx, f.registration.id);
  }));
  it("does not authorize a matching object ID in another tenant", async () => isolated(async tx => {
    const f = await fixture(tx); await expect(issue(tx, f.event.id, f.registration.id, { ...f.owner, tenantId: randomUUID() })).rejects.toBeInstanceOf(EventNotFoundError); await empty(tx, f.registration.id);
  }));
  it("denies disabled users and removed assignments", async () => isolated(async tx => {
    const f = await fixture(tx); await tx.update(users).set({ status: "disabled" }).where(eq(users.externalSubject, subject(f.owner)));
    await expect(issue(tx, f.event.id, f.registration.id, f.owner)).rejects.toBeInstanceOf(AuthorizationError);
    await tx.update(users).set({ status: "active" }).where(eq(users.externalSubject, subject(f.owner)));
    await tx.delete(eventStaff).where(eq(eventStaff.eventId, f.event.id));
    await expect(issue(tx, f.event.id, f.registration.id, f.owner)).rejects.toBeInstanceOf(EventNotFoundError); await empty(tx, f.registration.id);
  }));
  it("rejects foreign and missing registrations even with access to both events", async () => isolated(async tx => {
    const f = await fixture(tx); const other = await fixture(tx, f.owner);
    for (const id of [other.registration.id, randomUUID()]) await expect(issue(tx, f.event.id, id, f.owner)).rejects.toBeInstanceOf(RegistrationNotFoundError);
    await empty(tx, other.registration.id);
  }));
  it.each(["event", "registration", "identity"])("validates %s before database access", async field => {
    const f = actor(); const fake = { transaction: vi.fn() };
    await expect(issue(fake as unknown as NodePgDatabase, field === "event" ? "bad" : randomUUID(), field === "registration" ? "bad" : randomUUID(), field === "identity" ? { ...f, objectId: "bad" } : f)).rejects.toBeInstanceOf(field === "identity" ? AuthenticationError : ZodError);
    expect(fake.transaction).not.toHaveBeenCalled();
  });
  it("handles an injected hash collision without changing either registration credential", async () => isolated(async tx => {
    const f = await fixture(tx); const other = await fixture(tx, f.owner); const saved = await issue(tx, f.event.id, f.registration.id, f.owner);
    vi.mocked(createRegistrationCredentialToken).mockReturnValueOnce({ token: saved.token, tokenHash: createHash("sha256").update(saved.token).digest("hex") });
    await expect(issue(tx, other.event.id, other.registration.id, other.owner)).rejects.toBeInstanceOf(CredentialIssuanceFailedError);
    await empty(tx, other.registration.id); expect(await tx.select().from(qrCredentials).where(eq(qrCredentials.id, saved.id))).toHaveLength(1);
  }));
  it("sanitizes randomness failure without writing or attaching the original error", async () => isolated(async tx => {
    const f = await fixture(tx); vi.mocked(createRegistrationCredentialToken).mockImplementationOnce(() => { throw new Error("secret source detail"); });
    await expect(issue(tx, f.event.id, f.registration.id, f.owner)).rejects.toEqual(new CredentialIssuanceFailedError()); await empty(tx, f.registration.id);
  }));
  it("rolls back an insert rejected by a database trigger and can subsequently issue", async () => isolated(async tx => {
    const f = await fixture(tx);
    // Transaction-local fixture: DDL and function disappear on outer rollback.
    const suffix = randomUUID().replaceAll("-", ""); const name = `credential_test_${suffix}`;
    await tx.execute(sql.raw(`CREATE FUNCTION pg_temp.${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.registration_id = '${f.registration.id}'::uuid THEN RAISE EXCEPTION 'private trigger detail'; END IF; RETURN NEW; END $$`));
    await tx.execute(sql.raw(`CREATE TRIGGER ${name} AFTER INSERT ON qr_credential FOR EACH ROW EXECUTE FUNCTION pg_temp.${name}()`));
    await expect(issue(tx, f.event.id, f.registration.id, f.owner)).rejects.toEqual(new CredentialIssuanceFailedError()); await empty(tx, f.registration.id);
    await tx.execute(sql.raw(`DROP TRIGGER ${name} ON qr_credential`));
    expect((await issue(tx, f.event.id, f.registration.id, f.owner)).status).toBe("active");
  }));
  it("supports an additional assigned organizer without using the creator identity", async () => isolated(async tx => {
    const f = await fixture(tx); const second = actor(); const [user] = await tx.insert(users).values({ externalSubject: subject(second) }).returning();
    await tx.insert(eventStaff).values({ eventId: f.event.id, userId: user.id, role: "organizer" });
    expect((await issue(tx, f.event.id, f.registration.id, second)).registrationId).toBe(f.registration.id);
    expect(await tx.select().from(eventStaff).where(and(eq(eventStaff.eventId, f.event.id), eq(eventStaff.userId, user.id)))).toHaveLength(1);
  }));
});
