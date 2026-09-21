import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { encodeRegistrationSearchCursor, parseRegistrationSearchInput } from "./registration-search-input.js";

const event = "a4444444-4444-4444-8444-444444444444";
const id = "b4444444-4444-4444-8444-444444444444";
describe("registration search input", () => {
  it("trims exterior spaces, preserves accents and interior spaces, and defaults to 20", () => {
    expect(parseRegistrationSearchInput(event, { q: "  José  Pérez  " })).toEqual({ q: "José  Pérez", limit: 20 });
  });
  it.each(["1", "20", "100"])("accepts limit %s", limit => {
    expect(parseRegistrationSearchInput(event, { q: "a", limit }).limit).toBe(Number(limit));
  });
  it.each([undefined, null, {}, { q: "" }, { q: "   " }, { q: 1 }, { q: ["a"] },
    { q: "a".repeat(101) }, { q: " ".repeat(201) }, { q: "a\nb" }, { q: "a\u0000" }, { q: "a\t" },
    { q: "a", extra: true }, { q: "a", limit: 2 }, { q: "a", limit: "0" }, { q: "a", limit: "101" },
    { q: "a", limit: "01" }, { q: "a", limit: "1.5" }, { q: "a", cursor: "" },
    { q: "a", cursor: "x".repeat(241) }, { q: "a", cursor: "====" }])("rejects invalid input %#", input => {
    expect(() => parseRegistrationSearchInput(event, input)).toThrow(ZodError);
  });
  it("roundtrips a cursor and does not include the plain query", () => {
    const cursor = encodeRegistrationSearchCursor(event.toUpperCase(), " Alice ", id.toUpperCase());
    expect(parseRegistrationSearchInput(event, { q: "Alice", cursor, limit: "100" }))
      .toEqual({ q: "Alice", afterId: id, limit: 100 });
    expect(Buffer.from(cursor, "base64url").toString()).not.toContain("Alice");
  });
  it("rejects mixing events, terms, cursor versions or noncanonical encoding", () => {
    const cursor = encodeRegistrationSearchCursor(event, "Alice", id);
    for (const input of [{ q: "alice", cursor }, { q: "Bob", cursor }, { q: "Alice", cursor: cursor + "=" },
      { q: "Alice", cursor: Buffer.from(`search:v2:${event}:bad:${id}`).toString("base64url") }]) {
      expect(() => parseRegistrationSearchInput(event, input)).toThrow(ZodError);
    }
    expect(() => parseRegistrationSearchInput(id, { q: "Alice", cursor })).toThrow(ZodError);
    expect(() => parseRegistrationSearchInput("bad", { q: "Alice" })).toThrow(ZodError);
  });
});
