import { describe, expect, it } from "vitest";
import type { ApiEvent } from "./api-event-queries";
import { applyEditTimezone, buildEventEdit, eventEditValues, rebaseEventEdit } from "./edit-event-form";

const event: ApiEvent = { id: "a4444444-4444-4444-8444-444444444444", name: "Evento", slug: "evento", location: "Lima",
  timezone: "America/Lima", startsAt: "2027-08-27T14:00:25.123Z", endsAt: "2027-08-27T22:00:45.456Z",
  createdAt: "2026-09-19T12:00:00Z", status: "draft", version: 3 };
describe("editing event values", () => {
  it("preserves seconds and milliseconds and does not submit unchanged data", () => {
    const values = eventEditValues(event);
    expect(values.startsAt).toBe("2027-08-27T09:00:25.123");
    expect(buildEventEdit(event, values)).toEqual({ success: true, changed: [], data: { expectedVersion: 3 } });
  });
  it("sends only changed normalized fields with the base version", () => {
    const result = buildEventEdit(event, { ...eventEditValues(event), name: " Nuevo ", location: " Lima " });
    expect(result).toEqual({ success: true, changed: ["name"], data: { expectedVersion: 3, name: "Nuevo" } });
  });
  it("converts edited local dates to UTC", () => {
    const result = buildEventEdit(event, { ...eventEditValues(event), startsAt: "2027-08-27T10:01:02.345" });
    expect(result).toMatchObject({ success: true, data: { startsAt: "2027-08-27T15:01:02.345Z" } });
  });
  it("applies a zone without moving the persisted instants", () => {
    const values = applyEditTimezone(eventEditValues(event), "Europe/Madrid", event)!;
    expect(values.startsAt).toBe("2027-08-27T16:00:25.123");
    expect(buildEventEdit(event, values)).toEqual({ success: true, changed: ["timezone"], data: { expectedVersion: 3, timezone: "Europe/Madrid" } });
  });
  it("preserves an edited instant when changing its display timezone", () => {
    const values = applyEditTimezone({ ...eventEditValues(event), startsAt: "2027-08-27T10:00" }, "UTC", event)!;
    expect(buildEventEdit(event, values)).toMatchObject({ success: true, data: { startsAt: "2027-08-27T15:00:00.000Z", timezone: "UTC" } });
  });
  it.each(["Bad/Zone", "+05:00", ""])("rejects an invalid zone without changing values: %s", zone => {
    const values = eventEditValues(event);
    expect(applyEditTimezone(values, zone, event)).toBeNull(); expect(values).toEqual(eventEditValues(event));
  });
  it.each(["2027-03-14T02:30", "2027-11-07T01:30"])("rejects newly entered nonexistent or ambiguous local time %s", startsAt => {
    const base = { ...event, timezone: "America/New_York", endsAt: "2027-12-01T22:00:00Z" };
    expect(buildEventEdit(base, { ...eventEditValues(base), startsAt })).toMatchObject({ success: false, errors: { startsAt: expect.any(String) } });
  });
  it("allows a name edit on an existing resolved DST fold and a timezone change", () => {
    const base = { ...event, startsAt: "2027-11-07T06:30:00Z", endsAt: "2027-11-07T08:00:00Z", timezone: "America/New_York" };
    expect(buildEventEdit(base, { ...eventEditValues(base), name: "Nuevo" })).toMatchObject({ success: true, data: { name: "Nuevo" }, changed: ["name"] });
    const values = applyEditTimezone(eventEditValues(base), "UTC", base)!;
    expect(values.startsAt).toBe("2027-11-07T06:30:00.000");
    expect(buildEventEdit(base, values)).toMatchObject({ success: true, changed: ["timezone"] });
  });
  it("keeps the instant when the target timezone has an ambiguous hour", () => {
    const base = { ...event, startsAt: "2027-11-07T06:30:00Z", endsAt: "2027-11-07T08:00:00Z", timezone: "UTC" };
    const values = applyEditTimezone(eventEditValues(base), "America/New_York", base)!;
    expect(buildEventEdit(base, values)).toMatchObject({ success: true, changed: ["timezone"] });
  });
  it.each([
    { field: "name", value: " " }, { field: "slug", value: "Bad slug" }, { field: "location", value: "x".repeat(501) },
    { field: "timezone", value: "Bad/Zone" }, { field: "startsAt", value: "2027-02-30T09:00" }, { field: "endsAt", value: "2027-08-27T08:00" },
  ])("validates $field without creating a partial payload", ({ field, value }) => {
    expect(buildEventEdit(event, { ...eventEditValues(event), [field]: value })).toMatchObject({ success: false, errors: { [field]: expect.any(String) } });
  });
  it("permits a valid sub-minute interval", () => {
    expect(buildEventEdit(event, { ...eventEditValues(event), endsAt: "2027-08-27T09:00:25.124" })).toMatchObject({ success: true });
  });
  it("cannot edit a version beyond the API maximum", () => {
    expect(buildEventEdit({ ...event, version: 2147483647 }, { ...eventEditValues(event), name: "Nuevo" })).toMatchObject({ success: false });
  });
  it("rebases only explicitly selected changes and keeps other current data", () => {
    const latest = { ...event, version: 4, name: "Cambio ajeno", location: "Cusco" };
    const values = rebaseEventEdit(latest, { expectedVersion: 3, name: "Mi cambio", location: "Arequipa" }, ["name"]);
    expect(values).toMatchObject({ name: "Mi cambio", location: "Cusco" });
    expect(buildEventEdit(latest, values)).toEqual({ success: true, changed: ["name"], data: { expectedVersion: 4, name: "Mi cambio" } });
  });
  it("revalidates a combined date interval after rebasing", () => {
    const latest = { ...event, version: 4, endsAt: "2027-08-27T15:00:00Z" };
    const values = rebaseEventEdit(latest, { expectedVersion: 3, startsAt: "2027-08-27T16:00:00Z" }, ["startsAt"]);
    expect(buildEventEdit(latest, values)).toMatchObject({ success: false, errors: { endsAt: expect.any(String) } });
  });
});
