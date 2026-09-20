import { randomUUID } from "node:crypto";
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
import { parseDatabaseConfig } from "../config.js";

describe("PostgreSQL schema constraints", () => {
  let client: Client;

  let userId: string;
  let eventId: string;
  let attendeeId: string;
  let registrationId: string;

  beforeAll(async () => {
    const { databaseUrl } = parseDatabaseConfig(process.env);

    client = new Client({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 5000,
      query_timeout: 5000,
    });

    await client.connect();
  });

  afterAll(async () => {
    if (client) {
      await client.end();
    }
  });

  beforeEach(async () => {
    await client.query("BEGIN");

    userId = randomUUID();
    eventId = randomUUID();
    attendeeId = randomUUID();
    registrationId = randomUUID();

    await client.query(
      `INSERT INTO "user"
        (id, external_subject, email, display_name)
       VALUES ($1, $2, $3, $4)`,
      [
        userId,
        `test-${userId}`,
        "operator@example.invalid",
        "Test operator",
      ],
    );

    await client.query(
      `INSERT INTO "event"
        (id, name, slug, starts_at, ends_at, timezone, location)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        eventId,
        "Test event",
        `test-${eventId}`,
        "2027-08-27T14:00:00Z",
        "2027-08-27T22:00:00Z",
        "America/Lima",
        "Test venue",
      ],
    );

    await client.query(
      `INSERT INTO attendee (id, full_name, email)
       VALUES ($1, $2, $3)`,
      [
        attendeeId,
        "Test attendee",
        "attendee@example.invalid",
      ],
    );

    await client.query(
      `INSERT INTO registration
        (id, event_id, attendee_id, source, email_normalized)
       VALUES ($1, $2, $3, $4, 'attendee@example.invalid')`,
      [registrationId, eventId, attendeeId, "test"],
    );
  });

  afterEach(async () => {
    await client.query("ROLLBACK");
  });

  it("initializes an event version to one", async () => {
    const result = await client.query(
      'SELECT version FROM "event" WHERE id = $1', [eventId],
    );
    expect(result.rows).toEqual([{ version: 1 }]);
  });

  it.each([0, -1])("rejects nonpositive event version %s", async (version) => {
    await expect(client.query(
      'UPDATE "event" SET version = $1 WHERE id = $2', [version, eventId],
    )).rejects.toMatchObject({ code: "23514", constraint: "event_version_positive" });
  });

  it("rejects a null event version", async () => {
    await expect(client.query(
      'UPDATE "event" SET version = NULL WHERE id = $1', [eventId],
    )).rejects.toMatchObject({ code: "23502" });
  });

  it("rejects a duplicate registration for the same event", async () => {
    await expect(
      client.query(
        `INSERT INTO registration
          (event_id, attendee_id, source, email_normalized)
         VALUES ($1, $2, $3, 'different@example.invalid')`,
        [eventId, attendeeId, "test"],
      ),
    ).rejects.toMatchObject({
      code: "23505",
      constraint: "registration_event_attendee_unique",
    });
  });

  it("rejects a second check-in for the same registration", async () => {
    const insert = () =>
      client.query(
        `INSERT INTO check_in
          (registration_id, performed_by, source)
         VALUES ($1, $2, $3)`,
        [registrationId, userId, "test"],
      );

    await insert();

    await expect(insert()).rejects.toMatchObject({
      code: "23505",
      constraint: "check_in_registration_unique",
    });
  });

  it("rejects a check-in for a nonexistent registration", async () => {
    await expect(
      client.query(
        `INSERT INTO check_in
          (registration_id, performed_by, source)
         VALUES ($1, $2, $3)`,
        [randomUUID(), userId, "test"],
      ),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "check_in_registration_id_registration_id_fk",
    });
  });

  it("rejects duplicate staff assignments", async () => {
    const insert = () =>
      client.query(
        `INSERT INTO event_staff (event_id, user_id, role)
         VALUES ($1, $2, $3)`,
        [eventId, userId, "operator"],
      );

    await insert();

    await expect(insert()).rejects.toMatchObject({
      code: "23505",
      constraint: "event_staff_pkey",
    });
  });

    it("rejects a second QR credential for the same registration", async () => {
    await client.query(
      `INSERT INTO qr_credential (registration_id, token_hash)
       VALUES ($1, $2)`,
      [registrationId, `hash-${randomUUID()}`],
    );

    await expect(
      client.query(
        `INSERT INTO qr_credential (registration_id, token_hash)
         VALUES ($1, $2)`,
        [registrationId, `hash-${randomUUID()}`],
      ),
    ).rejects.toMatchObject({
      code: "23505",
      constraint: "qr_credential_registration_unique",
    });
  });

  it("rejects a repeated QR token hash across registrations", async () => {
    const secondAttendeeId = randomUUID();
    const secondRegistrationId = randomUUID();
    const tokenHash = `hash-${randomUUID()}`;

    await client.query(
      `INSERT INTO attendee (id, full_name, email)
       VALUES ($1, $2, $3)`,
      [
        secondAttendeeId,
        "Second test attendee",
        "second@example.invalid",
      ],
    );

    await client.query(
      `INSERT INTO registration
        (id, event_id, attendee_id, source, email_normalized)
       VALUES ($1, $2, $3, $4, 'second@example.invalid')`,
      [secondRegistrationId, eventId, secondAttendeeId, "test"],
    );

    await client.query(
      `INSERT INTO qr_credential (registration_id, token_hash)
       VALUES ($1, $2)`,
      [registrationId, tokenHash],
    );

    await expect(
      client.query(
        `INSERT INTO qr_credential (registration_id, token_hash)
         VALUES ($1, $2)`,
        [secondRegistrationId, tokenHash],
      ),
    ).rejects.toMatchObject({
      code: "23505",
      constraint: "qr_credential_token_hash_unique",
    });
  });

  it.each([
    "2027-08-27T13:00:00Z",
    "2027-08-27T14:00:00Z",
  ])("rejects an event ending at or before its start: %s", async (endsAt) => {
    await expect(
      client.query(
        `UPDATE "event" SET ends_at = $1 WHERE id = $2`,
        [endsAt, eventId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "event_dates_check",
    });
  });

  it("rejects an unsupported event status", async () => {
    await expect(
      client.query(
        `UPDATE "event" SET status = $1 WHERE id = $2`,
        ["unsupported", eventId],
      ),
    ).rejects.toMatchObject({
      code: "22P02",
    });
  });

  it("prevents deleting an attendee with a registration", async () => {
    await expect(
      client.query(
        `DELETE FROM attendee WHERE id = $1`,
        [attendeeId],
      ),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "registration_attendee_id_attendee_id_fk",
    });
  });


  it("rejects another attendee with the same email key in the same event", async () => {
    const otherId = randomUUID();
    await client.query('INSERT INTO attendee (id, full_name, email) VALUES ($1, $2, $3)',
      [otherId, "Other name", "ATTENDEE@example.invalid"]);
    await expect(client.query(
      "INSERT INTO registration (event_id, attendee_id, source, email_normalized) VALUES ($1, $2, 'manual', 'attendee@example.invalid')",
      [eventId, otherId],
    )).rejects.toMatchObject({ code: "23505", constraint: "registration_event_email_unique" });
  });

  it("allows the same email key in another event", async () => {
    const otherEventId = randomUUID();
    await client.query(`INSERT INTO event (id, name, slug, starts_at, ends_at, timezone, location)
      SELECT $1, name, $2, starts_at, ends_at, timezone, location FROM event WHERE id = $3`,
      [otherEventId, `test-${otherEventId}`, eventId]);
    const result = await client.query(`INSERT INTO registration (event_id, attendee_id, source, email_normalized)
      VALUES ($1, $2, 'manual', 'attendee@example.invalid') RETURNING event_id`, [otherEventId, attendeeId]);
    expect(result.rows).toEqual([{ event_id: otherEventId }]);
  });

  it.each(["ANA@example.invalid", " ana@example.invalid", "ana@example.invalid ", "ana", "á@example.invalid", "a".repeat(250) + "@test.invalid"])("rejects a noncanonical registration email key %s", async key => {
      await expect(client.query('UPDATE registration SET email_normalized = $1 WHERE id = $2', [key, registrationId]))
        .rejects.toMatchObject({ code: "23514", constraint: "registration_email_normalized_check" });
    });

  it("requires a registration email key", async () => {
    await expect(client.query('UPDATE registration SET email_normalized = NULL WHERE id = $1', [registrationId]))
      .rejects.toMatchObject({ code: "23502" });
  });

  it("keeps the email key reserved when the registration is cancelled", async () => {
    await client.query("UPDATE registration SET status = 'cancelled' WHERE id = $1", [registrationId]);
    const otherId = randomUUID();
    await client.query('INSERT INTO attendee (id, full_name, email) VALUES ($1, $2, $3)', [otherId, "Other", "attendee@example.invalid"]);
    await expect(client.query(`INSERT INTO registration (event_id, attendee_id, source, email_normalized)
      VALUES ($1, $2, 'manual', 'attendee@example.invalid')`, [eventId, otherId]))
      .rejects.toMatchObject({ code: "23505", constraint: "registration_event_email_unique" });
  });

});
