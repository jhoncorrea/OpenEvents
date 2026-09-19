import { sql } from "drizzle-orm";
import {
  check,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const userStatus = pgEnum("user_status", [
  "active",
  "disabled",
]);

export const eventStatus = pgEnum("event_status", [
  "draft",
  "active",
  "closed",
  "cancelled",
]);

export const users = pgTable("user", {
  id: uuid("id").defaultRandom().primaryKey(),

  externalSubject: text("external_subject")
    .notNull()
    .unique("user_external_subject_unique"),

  email: text("email"),
  displayName: text("display_name"),

  status: userStatus("status").notNull().default("active"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const events = pgTable(
  "event",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    name: text("name").notNull(),
    slug: text("slug").notNull().unique("event_slug_unique"),

    startsAt: timestamp("starts_at", { withTimezone: true })
      .notNull(),

    endsAt: timestamp("ends_at", { withTimezone: true })
      .notNull(),

    timezone: text("timezone").notNull(),
    location: text("location").notNull(),

    status: eventStatus("status").notNull().default("draft"),

    version: integer("version").notNull().default(1),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("event_version_positive", sql`${table.version} > 0`),
    check(
      "event_dates_check",
      sql`${table.endsAt} > ${table.startsAt}`,
    ),
  ],
);

export const attendees = pgTable("attendee", {
  id: uuid("id").defaultRandom().primaryKey(),

  fullName: text("full_name").notNull(),
  email: text("email").notNull(),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const eventStaff = pgTable(
  "event_staff",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "restrict" }),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    role: text("role").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "event_staff_pkey",
      columns: [table.eventId, table.userId],
    }),
  ],
);

export const registrationStatus = pgEnum("registration_status", [
  "confirmed",
  "cancelled",
]);

export const qrCredentialStatus = pgEnum("qr_credential_status", [
  "active",
  "revoked",
  "expired",
]);

export const registrations = pgTable(
  "registration",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "restrict" }),

    attendeeId: uuid("attendee_id")
      .notNull()
      .references(() => attendees.id, { onDelete: "restrict" }),

    status: registrationStatus("status")
      .notNull()
      .default("confirmed"),

    source: text("source").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("registration_event_attendee_unique").on(
      table.eventId,
      table.attendeeId,
    ),
  ],
);

export const qrCredentials = pgTable("qr_credential", {
  id: uuid("id").defaultRandom().primaryKey(),

  registrationId: uuid("registration_id")
    .notNull()
    .references(() => registrations.id, { onDelete: "restrict" })
    .unique("qr_credential_registration_unique"),

  tokenHash: text("token_hash")
    .notNull()
    .unique("qr_credential_token_hash_unique"),

  status: qrCredentialStatus("status")
    .notNull()
    .default("active"),

  issuedAt: timestamp("issued_at", { withTimezone: true })
    .notNull()
    .defaultNow(),

  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const checkIns = pgTable("check_in", {
  id: uuid("id").defaultRandom().primaryKey(),

  registrationId: uuid("registration_id")
    .notNull()
    .references(() => registrations.id, { onDelete: "restrict" })
    .unique("check_in_registration_unique"),

  performedBy: uuid("performed_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),

  checkedInAt: timestamp("checked_in_at", { withTimezone: true })
    .notNull()
    .defaultNow(),

  source: text("source").notNull(),
});

export const auditLogs = pgTable("audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),

  eventId: uuid("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "restrict" }),

  actorId: uuid("actor_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),

  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),

  metadata: jsonb("metadata")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),

  occurredAt: timestamp("occurred_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});