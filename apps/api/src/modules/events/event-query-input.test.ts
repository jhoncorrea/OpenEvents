import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  encodeEventCursor,
  parseEventId,
  parseEventListInput,
} from "./event-query-input.js";

const id = "a4f7de46-61b4-4fb0-955f-cccbf6774705";
const encoded = (value: string) => Buffer.from(value).toString("base64url");

describe("event query validation", () => {
  it("defaults to twenty events without a cursor", () => {
    expect(parseEventListInput({})).toEqual({ limit: 20 });
  });

  it.each(["1", "20", "100"])("accepts a bounded page size: %s", (limit) => {
    expect(parseEventListInput({ limit })).toEqual({ limit: Number(limit) });
  });

  it.each([
    "0", "101", "1000", "-1", "1.5", "1e2", "01", " 20", "20 ", "", "abc",
    20, null, ["10", "20"],
  ])("rejects an invalid or repeated page size: %j", (limit) => {
    expect(() => parseEventListInput({ limit })).toThrow(ZodError);
  });

  it("decodes a versioned cursor and retains the requested page size", () => {
    expect(parseEventListInput({ limit: "5", cursor: encodeEventCursor(id) }))
      .toEqual({ limit: 5, afterId: id });
  });

  it("normalizes the ID when creating a cursor", () => {
    expect(encodeEventCursor(id.toUpperCase())).toBe(encoded(`v1:${id}`));
  });

  it.each([
    "", "%%%", "a".repeat(101), encoded(`v2:${id}`),
    encoded("v1:not-a-uuid"), encoded(`v1:${id.toUpperCase()}`),
    encoded(`v1:${id}`) + "=", encoded(`v1:${id}:extra`),
    null, [encoded(`v1:${id}`), encoded(`v1:${id}`)],
  ])("rejects a malformed or repeated cursor: %j", (cursor) => {
    expect(() => parseEventListInput({ cursor })).toThrow(ZodError);
  });

  it.each([
    { userId: id }, { role: "admin" }, { offset: "10" },
    { limit: "20", extra: "value" }, null, [], "limit=20",
  ])("rejects unsupported query input: %j", (query) => {
    expect(() => parseEventListInput(query)).toThrow(ZodError);
  });

  it("accepts and normalizes a valid event identifier", () => {
    expect(parseEventId(id.toUpperCase())).toBe(id);
  });

  it.each(["", "invalid", `${id} `, ` ${id}`, null, [id]])(
    "rejects an invalid event identifier: %j", (value) => {
      expect(() => parseEventId(value)).toThrow(ZodError);
    },
  );

  it("does not generate a cursor from an invalid identifier", () => {
    expect(() => encodeEventCursor("invalid")).toThrow(ZodError);
  });
});
