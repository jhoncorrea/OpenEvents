import { describe, expect, it } from "vitest";
import { serializeAttendanceSummary } from "./attendance-summary.js";

const eventId = "a4444444-4444-4444-8444-444444444444";
const empty = { eventId, registered: 0, confirmed: 0, cancelled: 0, checkedIn: 0, cancelledCheckedIn: 0, pending: 0,
  observedAt: new Date("2026-09-26T16:00:00.000Z") };
describe("attendance summary contract", () => {
  it("serializes an empty event without NaN or percentages", () => {
    expect(serializeAttendanceSummary(empty, eventId)).toEqual({ ...empty, observedAt: "2026-09-26T16:00:00.000Z" });
  });
  it("preserves history of cancelled registrations without counting them as pending", () => {
    const value = { ...empty, registered: 10, confirmed: 6, cancelled: 4, checkedIn: 5, cancelledCheckedIn: 2, pending: 3 };
    expect(serializeAttendanceSummary(value, eventId)).toEqual({ ...value, observedAt: empty.observedAt.toISOString() });
  });
  it("projects only public metrics and normalizes the event ID", () => {
    const value = { ...empty, eventId: eventId.toUpperCase(), attendees: ["private"], performedBy: "private", token: "secret" };
    expect(serializeAttendanceSummary(value, eventId)).toEqual({ ...empty, observedAt: empty.observedAt.toISOString() });
  });
  it.each(["registered", "confirmed", "cancelled", "checkedIn", "cancelledCheckedIn", "pending"])("rejects invalid %s", field => {
    for (const value of [-1, 1.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "0", null, undefined]) {
      expect(() => serializeAttendanceSummary({ ...empty, [field]: value }, eventId)).toThrow("Invalid attendance summary");
    }
  });
  it.each([
    { registered: 1 }, { checkedIn: 1 }, { pending: 1 }, { cancelledCheckedIn: 1 },
    { registered: 3, confirmed: 2, cancelled: 1, checkedIn: 3, pending: 0, cancelledCheckedIn: 0 },
    { registered: 2, confirmed: 1, cancelled: 1, checkedIn: 1, pending: 1, cancelledCheckedIn: 2 },
  ])("rejects incoherent counters %j", values => {
    expect(() => serializeAttendanceSummary({ ...empty, ...values }, eventId)).toThrow("Invalid attendance summary");
  });
  it.each([null, undefined, {}, { ...empty, observedAt: new Date(NaN) }, { ...empty, observedAt: "2026-09-26T16:00:00.000Z" },
    { ...empty, eventId: "b4444444-4444-4444-8444-444444444444" }])("rejects malformed or foreign output", value => {
    expect(() => serializeAttendanceSummary(value, eventId)).toThrow("Invalid attendance summary");
  });
});
