import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { parseDatabaseConfig } from "../config.js";

// Esquema aislado y transacción revertida: nunca altera tablas del esquema público.
const migration = readFileSync("drizzle/0003_registration_event_email.sql", "utf8");
describe("registration email migration", () => {
  let client: Client;
  beforeAll(async () => {
    client = new Client({ connectionString: parseDatabaseConfig(process.env).databaseUrl, connectionTimeoutMillis: 5000, query_timeout: 5000 });
    await client.connect();
  });
  afterAll(async () => { await client?.end(); });
  beforeEach(async () => {
    await client.query("BEGIN");
    const schema = `migration35_${randomUUID().replaceAll("-", "")}`;
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}"`);
    await client.query(`CREATE TABLE attendee (id uuid PRIMARY KEY, full_name text NOT NULL, email text NOT NULL);
      CREATE TABLE registration (id uuid PRIMARY KEY, event_id uuid NOT NULL, attendee_id uuid NOT NULL REFERENCES attendee(id), status text NOT NULL DEFAULT 'confirmed');`);
  });
  afterEach(async () => { await client.query("ROLLBACK"); });
  async function seed(email: string, eventId = randomUUID()) {
    const attendeeId = randomUUID(); const id = randomUUID();
    await client.query('INSERT INTO attendee VALUES ($1, $2, $3)', [attendeeId, "Original name", email]);
    await client.query('INSERT INTO registration (id, event_id, attendee_id) VALUES ($1, $2, $3)', [id, eventId, attendeeId]);
    return { id, attendeeId, eventId };
  }
  it("migrates an empty registration table", async () => {
    await client.query(migration);
    expect((await client.query('SELECT email_normalized FROM registration')).rows).toEqual([]);
  });
  it("backfills keys without rewriting attendee profiles or registration IDs", async () => {
    const row = await seed("  Ana.Maria+VIP@EXAMPLE.invalid  ");
    await client.query(migration);
    expect((await client.query(`SELECT r.id, r.attendee_id, r.email_normalized, a.email, a.full_name
      FROM registration r JOIN attendee a ON a.id = r.attendee_id`)).rows).toEqual([{
      id: row.id, attendee_id: row.attendeeId, email_normalized: "ana.maria+vip@example.invalid",
      email: "  Ana.Maria+VIP@EXAMPLE.invalid  ", full_name: "Original name",
    }]);
  });
  it("allows equal normalized email in different events", async () => {
    await seed("ANA@example.invalid"); await seed("ana@example.invalid");
    await client.query(migration);
    expect((await client.query('SELECT email_normalized FROM registration')).rows).toHaveLength(2);
  });
  it("fails generically on legacy duplicates and permits complete rollback", async () => {
    const { eventId } = await seed("ANA@example.invalid"); await seed(" ana@example.invalid ", eventId);
    await client.query("SAVEPOINT before_migration");
    await expect(client.query(migration)).rejects.toMatchObject({ message: "Registration email migration requires review of duplicate event emails." });
    await client.query("ROLLBACK TO SAVEPOINT before_migration");
    expect((await client.query('SELECT id FROM registration')).rows).toHaveLength(2);
    expect((await client.query("SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'registration' AND column_name = 'email_normalized'")).rows).toHaveLength(0);
  });
  it.each(["", "  ", "invalid", "á@example.invalid"])("fails safely on unsupported legacy email %j", async email => {
    await seed(email);
    await expect(client.query(migration)).rejects.toMatchObject({ message: "Registration email migration requires review of legacy email data." });
  });
});
