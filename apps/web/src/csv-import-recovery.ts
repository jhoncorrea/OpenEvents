import { csvUuid } from "./api-registration-csv";
export interface CsvRecovery { key: string; hash: string }
const name = (account: string, event: string) => `openevents:csv:v1:${JSON.stringify([account, event.toLowerCase()])}`;
function parse(raw: string): CsvRecovery {
  const value = JSON.parse(raw);
  if (!value || typeof value.key !== "string" || !csvUuid.test(value.key) || typeof value.hash !== "string" || !/^[a-f0-9]{64}$/.test(value.hash)) throw new Error("Invalid recovery metadata");
  return { key: value.key.toLowerCase(), hash: value.hash };
}
export function readCsvRecovery(account: string, event: string): CsvRecovery | null {
  const raw = sessionStorage.getItem(name(account, event)); return raw === null ? null : parse(raw);
}
export function writeCsvRecovery(account: string, event: string, value: CsvRecovery): void {
  const serialized = JSON.stringify(parse(JSON.stringify(value))), storageKey = name(account, event);
  sessionStorage.setItem(storageKey, serialized);
  if (sessionStorage.getItem(storageKey) !== serialized) throw new Error("Recovery not persisted");
}
export function clearCsvRecovery(account: string, event: string): void {
  sessionStorage.removeItem(name(account, event));
  if (sessionStorage.getItem(name(account, event)) !== null) throw new Error("Recovery not removed");
}
export async function csvHash(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}
