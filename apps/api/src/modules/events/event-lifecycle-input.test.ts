import { describe, expect, it } from "vitest";
import { parseEventLifecycleInput } from "./event-lifecycle-input.js";

describe("event lifecycle input", () => {
  it.each([1, 2, 2_147_483_646])("accepts version %s", expectedVersion => {
    expect(parseEventLifecycleInput({ expectedVersion })).toEqual({ expectedVersion });
  });
  it.each([undefined, null, {}, [], 1, "1", { expectedVersion: "1" }, { expectedVersion: 0 }, { expectedVersion: -1 },
    { expectedVersion: 1.5 }, { expectedVersion: 2_147_483_647 }, { expectedVersion: Infinity }, { expectedVersion: NaN },
    { expectedVersion: 1, status: "active" }, { expectedVersion: 1, actor: "forged" }])("rejects invalid input %#", input => {
    expect(() => parseEventLifecycleInput(input)).toThrow();
  });
});
