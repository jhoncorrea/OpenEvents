import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  encodeRegistrationCursor,
  parseRegistrationEventId,
  parseRegistrationId,
  parseRegistrationListInput,
} from "./registration-query-input.js";

const eventId = "a4444444-4444-4444-8444-444444444444";
const registrationId = "b5555555-5555-4555-8555-555555555555";
const otherEvent = "c6666666-6666-4666-8666-666666666666";
const encoded = (text: string) => Buffer.from(text, "utf8").toString("base64url");
const cursor = encodeRegistrationCursor(eventId, registrationId);

describe("registration query validation", () => {
  it("defaults to twenty registrations without a cursor", () => {
    expect(parseRegistrationListInput(eventId, {})).toEqual({ limit: 20 });
  });
  it.each(["1", "20", "100"])("accepts bounded limit %s", limit => {
    expect(parseRegistrationListInput(eventId, { limit })).toEqual({ limit: Number(limit) });
  });
  it.each(["0", "101", "1000", "-1", "1.5", "1e2", "01", " 20", "20 ", "", "abc", 20, null, ["10", "20"]])(
    "rejects invalid or repeated limit %j", limit => {
      expect(() => parseRegistrationListInput(eventId, { limit })).toThrow(ZodError);
    },
  );
  it("decodes the position with a custom page size", () => {
    expect(parseRegistrationListInput(eventId, { limit: "5", cursor })).toEqual({ limit: 5, afterId: registrationId });
  });
  it("accepts a cursor with the default page size and an uppercase route ID", () => {
    expect(parseRegistrationListInput(eventId.toUpperCase(), { cursor })).toEqual({ limit: 20, afterId: registrationId });
  });
  it("normalizes identifiers when encoding", () => {
    expect(encodeRegistrationCursor(eventId.toUpperCase(), registrationId.toUpperCase())).toBe(cursor);
  });
  it("rejects a valid cursor belonging to another event", () => {
    expect(() => parseRegistrationListInput(otherEvent, { cursor })).toThrow(ZodError);
  });
  it.each([
    "", "%%%", "a".repeat(151), null, [cursor, cursor], cursor + "=",
    encoded(`v1:${registrationId}`), encoded(`reg:v2:${eventId}:${registrationId}`),
    encoded(`reg:v1:${eventId}:invalid`), encoded(`reg:v1:${eventId}:${registrationId}:extra`),
    encoded(`reg:v1:${eventId.toUpperCase()}:${registrationId}`),
    encoded(`reg:v1:${eventId}:${registrationId.toUpperCase()}`),
    encoded(`reg:v1:${eventId}:${registrationId}\n`),
    encoded(`reg:v1:${eventId}`),
  ])("rejects malformed or noncanonical cursor %j", value => {
    expect(() => parseRegistrationListInput(eventId, { cursor: value })).toThrow(ZodError);
  });
  it.each([
    { userId: eventId }, { role: "admin" }, { offset: "10" }, { email: "someone@example.com" },
    { search: "name" }, { status: "confirmed" }, { limit: "20", extra: "value" }, null, [], "limit=20",
  ])("rejects unsupported query %j", input => {
    expect(() => parseRegistrationListInput(eventId, input)).toThrow(ZodError);
  });
  it("normalizes both route identifiers", () => {
    expect(parseRegistrationEventId(eventId.toUpperCase())).toBe(eventId);
    expect(parseRegistrationId(registrationId.toUpperCase())).toBe(registrationId);
  });
  it.each(["", "invalid", ` ${eventId}`, `${eventId} `, null, [eventId], 123])(
    "rejects invalid route identifiers %j", value => {
      expect(() => parseRegistrationEventId(value)).toThrow(ZodError);
      expect(() => parseRegistrationId(value)).toThrow(ZodError);
      expect(() => parseRegistrationListInput(value, {})).toThrow(ZodError);
    },
  );
  it("does not encode invalid identifiers", () => {
    expect(() => encodeRegistrationCursor("invalid", registrationId)).toThrow(ZodError);
    expect(() => encodeRegistrationCursor(eventId, "invalid")).toThrow(ZodError);
  });
});
