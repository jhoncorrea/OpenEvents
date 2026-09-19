import { describe, expect, it } from "vitest";
import { parseCreateEventInput } from "./create-event-input.js";
import { mergeEventChanges, parseEditEventInput } from "./edit-event-input.js";

const persisted = parseCreateEventInput({
  name: "Evento original",
  slug: "evento-original",
  startsAt: "2027-08-27T14:00:00Z",
  endsAt: "2027-08-27T22:00:00Z",
  timezone: "America/Lima",
  location: "Lima",
});

describe("event edit input", () => {
  it("accepts a partial update and preserves omitted fields", () => {
    const changes = parseEditEventInput({ expectedVersion: 1, name: "  Corregido  " });
    expect(mergeEventChanges(persisted, changes)).toEqual({ ...persisted, name: "Corregido" });
    expect(persisted.name).toBe("Evento original");
  });

  it.each([undefined, null, {}, [], { expectedVersion: 1 },
    { name: "Nuevo" }, { expectedVersion: 1, name: undefined }])(
    "rejects missing changes or version: %j", (input) => {
      expect(() => parseEditEventInput(input)).toThrow();
    },
  );

  it.each([0, -1, 1.5, "1", null, Number.NaN, Infinity, 2_147_483_647])(
    "rejects an invalid expected version: %s", (expectedVersion) => {
      expect(() => parseEditEventInput({ expectedVersion, name: "Nuevo" })).toThrow();
    },
  );

  it.each(["id", "status", "createdAt", "version", "userId", "organizerId", "tenantId", "unexpected"])(
    "rejects caller-supplied %s", (field) => {
      expect(() => parseEditEventInput({ expectedVersion: 1, name: "Nuevo", [field]: "value" })).toThrow();
    },
  );

  it.each(["name", "slug", "timezone", "location", "startsAt", "endsAt"])(
    "rejects null for %s", (field) => {
      expect(() => parseEditEventInput({ expectedVersion: 1, [field]: null })).toThrow();
    },
  );

  it.each([
    { name: " " }, { name: "x".repeat(201) }, { slug: "Invalid Slug" },
    { location: " " }, { timezone: "+05:00" }, { timezone: "Not/AZone" },
    { startsAt: "2027-02-30T14:00:00Z" }, { endsAt: "not-a-date" },
  ])("rejects invalid editable fields: %j", (fields) => {
    expect(() => parseEditEventInput({ expectedVersion: 1, ...fields })).toThrow();
  });

  it.each([
    { startsAt: "2027-08-27T22:00:00Z" },
    { startsAt: "2027-08-28T14:00:00Z" },
    { endsAt: "2027-08-27T14:00:00Z" },
    { endsAt: "2027-08-26T22:00:00Z" },
  ])("validates dates against the preserved endpoint: %j", (fields) => {
    const changes = parseEditEventInput({ expectedVersion: 1, ...fields });
    expect(() => mergeEventChanges(persisted, changes)).toThrow();
  });

  it("allows moving both dates together beyond the previous interval", () => {
    const result = mergeEventChanges(persisted, parseEditEventInput({
      expectedVersion: 3,
      startsAt: "2027-09-01T14:00:00Z",
      endsAt: "2027-09-01T22:00:00Z",
    }));
    expect(result.startsAt.toISOString()).toBe("2027-09-01T14:00:00.000Z");
    expect(result.endsAt.toISOString()).toBe("2027-09-01T22:00:00.000Z");
  });

  it("does not reinterpret UTC instants when only the timezone changes", () => {
    const result = mergeEventChanges(persisted, parseEditEventInput({
      expectedVersion: 1, timezone: "Europe/Madrid",
    }));
    expect(result.startsAt).toEqual(persisted.startsAt);
    expect(result.endsAt).toEqual(persisted.endsAt);
    expect(result.timezone).toBe("Europe/Madrid");
    expect(result).not.toHaveProperty("expectedVersion");
  });
});
