import { describe, expect, it } from "vitest";
import { parseRegisterAttendeeInput } from "./register-attendee-input.js";

const valid = { fullName: "Ana María O'Connor", email: "ana@example.invalid" };
describe("manual attendee registration input", () => {
  it("keeps Unicode names and normalizes outer whitespace and email case", () => {
    expect(parseRegisterAttendeeInput({ fullName: "  Ana María O'Connor  ", email: "  Ana@EXAMPLE.invalid  " }))
      .toEqual(valid);
  });
  it("preserves dots and plus addressing", () => {
    expect(parseRegisterAttendeeInput({ ...valid, email: "Ana.Maria+VIP@example.invalid" }).email)
      .toBe("ana.maria+vip@example.invalid");
  });
  it("accepts boundary lengths", () => {
    const email = "a".repeat(64) + "@" + "b".repeat(63) + "." + "c".repeat(63) + "." + "d".repeat(61);
    expect(email.length).toBe(254);
    expect(parseRegisterAttendeeInput({ fullName: "a".repeat(200), email })).toEqual({ fullName: "a".repeat(200), email });
  });
  it.each([undefined, null, [], "text", 1])("rejects a non-object body %j", input => {
    expect(() => parseRegisterAttendeeInput(input)).toThrow();
  });
  it.each(["", "   ", "a".repeat(201), "Ana\nMaría", "Ana\u0000", "Ana\u202e", 42, null])("rejects invalid names %j", fullName => {
    expect(() => parseRegisterAttendeeInput({ ...valid, fullName })).toThrow();
  });
  it.each(["", " ", "ana", "ana@", "@example.invalid", "ana@@example.invalid", "ana @example.invalid", "ana..maria@example.invalid", "a@-example.invalid", "ana@ex ample.invalid", "ana\n@example.invalid", "ana\u0000@example.invalid", "á@example.invalid", "ana@ejémplo.invalid", "a".repeat(65)+"@example.invalid", "a@"+"b".repeat(250)+".com", 42, null])("rejects invalid emails %j", email => {
    expect(() => parseRegisterAttendeeInput({ ...valid, email })).toThrow();
  });
  it.each(["fullName", "email"])("requires %s", field => {
    const input: Record<string, unknown> = { ...valid }; delete input[field];
    expect(() => parseRegisterAttendeeInput(input)).toThrow();
  });
  it.each(["id", "eventId", "attendeeId", "userId", "status", "source", "emailNormalized", "createdAt", "roles"])("rejects caller-supplied %s", field => {
    expect(() => parseRegisterAttendeeInput({ ...valid, [field]: "caller" })).toThrow();
  });
  it("does not mutate its input", () => {
    const input = Object.freeze({ fullName: " Ana ", email: "ANA@example.invalid" });
    parseRegisterAttendeeInput(input); expect(input.email).toBe("ANA@example.invalid");
  });
});
