// @vitest-environment jsdom
import { webcrypto, createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { csvHash, readCsvRecovery, writeCsvRecovery, clearCsvRecovery } from "./csv-import-recovery";
const event = "a4444444-4444-4444-8444-444444444444", value = { key: event, hash: "a".repeat(64) };
beforeEach(() => sessionStorage.clear());
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("isolates recovery by account and event and stores no extra properties", () => {
  writeCsvRecovery("a", event, { ...value, ...{ csv: "private", token: "secret" } });
  expect(readCsvRecovery("a", event.toUpperCase())).toEqual(value);
  expect(readCsvRecovery("b", event)).toBeNull(); expect(readCsvRecovery("a", "other")).toBeNull();
  expect(JSON.parse(sessionStorage.getItem(sessionStorage.key(0)!)!)).toEqual(value);
  clearCsvRecovery("b", event); expect(readCsvRecovery("a", event)).toEqual(value);
  clearCsvRecovery("a", event); expect(readCsvRecovery("a", event)).toBeNull();
});
it("hashes original bytes including BOM and line endings", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const a = new TextEncoder().encode("\ufeffa\r\nb"), b = new TextEncoder().encode("a\nb");
  expect(await csvHash(a)).toBe(createHash("sha256").update(a).digest("hex")); expect(await csvHash(a)).not.toBe(await csvHash(b));
});
it("does not treat unavailable storage as absence", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error(); });
  expect(() => readCsvRecovery("a", event)).toThrow();
});
