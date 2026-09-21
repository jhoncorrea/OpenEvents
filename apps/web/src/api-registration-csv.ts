import { InteractionRequiredAuthError } from "@azure/msal-browser";
import type { EventQueryOptions } from "./api-event-queries";
import { parseRegistrationInput } from "./api-registrations";
import { CsvImportError, csvDiagnosticLabels, type CsvDiagnostic, type CsvErrorKind } from "./csv-import-error";

export interface CsvReceipt {
  importId: string; completedAt: string;
  result: { eventId: string; count: number; items: {
    id: string; eventId: string; status: "confirmed"; source: "csv"; createdAt: string;
    attendee: { id: string; fullName: string; email: string };
  }[] };
}
export type CsvLookup = { status: "completed"; receipt: CsvReceipt } | { status: "not_observed" };
interface Options extends EventQueryOptions { eventId: string; key: string; isCurrent?: () => boolean }
export const csvUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function record(v: unknown): v is Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v); }
function utc(v: unknown): v is string { return typeof v === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v; }
function id(v: unknown): v is string { return typeof v === "string" && csvUuid.test(v); }
function invalid(): never { throw new CsvImportError("uncertain"); }
function receipt(v: unknown, eventId: string): CsvReceipt {
  if (!record(v) || !id(v.importId) || !utc(v.completedAt) || !record(v.result)) return invalid();
  const r = v.result;
  if (r.eventId !== eventId || typeof r.count !== "number" || !Number.isInteger(r.count) || r.count < 1 || r.count > 500 || !Array.isArray(r.items) || r.items.length !== r.count) return invalid();
  const items = r.items.map(item => {
    if (!record(item) || !id(item.id) || item.eventId !== eventId || item.status !== "confirmed" || item.source !== "csv" || !utc(item.createdAt) || !record(item.attendee) || !id(item.attendee.id)) return invalid();
    let normalized;
    try { normalized = parseRegistrationInput({ fullName: item.attendee.fullName, email: item.attendee.email }); } catch { return invalid(); }
    if (normalized.fullName !== item.attendee.fullName || normalized.email !== item.attendee.email) return invalid();
    return { id: item.id.toLowerCase(), eventId, status: "confirmed" as const, source: "csv" as const, createdAt: item.createdAt,
      attendee: { id: item.attendee.id.toLowerCase(), ...normalized } };
  });
  if (new Set(items.map(i => i.id)).size !== items.length || new Set(items.map(i => i.attendee.id)).size !== items.length || new Set(items.map(i => i.attendee.email)).size !== items.length) return invalid();
  return { importId: v.importId.toLowerCase(), completedAt: v.completedAt, result: { eventId, count: r.count, items } };
}
function diagnostics(v: Record<string, unknown>): CsvImportError {
  if (!Array.isArray(v.errors) || v.errors.length < 1 || v.errors.length > 100 || typeof v.truncated !== "boolean") return invalid();
  const errors: CsvDiagnostic[] = v.errors.map(e => {
    if (!record(e) || typeof e.code !== "string" || !Object.hasOwn(csvDiagnosticLabels, e.code)) return invalid();
    const d: CsvDiagnostic = { code: e.code };
    for (const field of ["record", "line", "firstRecord"] as const) {
      if (e[field] !== undefined) {
        if (typeof e[field] !== "number" || !Number.isSafeInteger(e[field]) || e[field] < 1) return invalid();
        d[field] = e[field];
      }
    }
    if (e.field !== undefined) { if (e.field !== "fullName" && e.field !== "email") return invalid(); d.field = e.field; }
    return d;
  });
  return new CsvImportError("validation", errors, v.truncated);
}
async function request(options: Options, input?: Uint8Array): Promise<CsvLookup> {
  const current = () => { if (options.signal?.aborted || options.isCurrent?.() === false) throw new CsvImportError("cancelled"); };
  current();
  let url: URL;
  try {
    url = new URL(options.apiUrl);
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost")) || url.username || url.password || url.search || url.hash || !options.apiScope.trim()) throw new Error();
  } catch { throw new CsvImportError("configuration"); }
  if (!csvUuid.test(options.eventId) || !csvUuid.test(options.key) || (input !== undefined && (input.byteLength === 0 || input.byteLength > 1048576))) throw new CsvImportError("validation");
  const eventId = options.eventId.toLowerCase(), key = options.key.toLowerCase();
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/api/v1/events/${eventId}/registrations/imports`;
  // Copiar antes de esperar MSAL para que el llamador no altere el archivo enviado.
  const bytes = input === undefined ? undefined : Uint8Array.from(input);
  let token: string;
  try { token = (await options.instance.acquireTokenSilent({ account: options.account, scopes: [options.apiScope] })).accessToken; }
  catch (error) { current(); throw new CsvImportError(error instanceof InteractionRequiredAuthError ? "interaction_required" : "authentication"); }
  current(); if (!token?.trim()) throw new CsvImportError("authentication");
  const controller = new AbortController(), abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 15000);
  const check = () => { current(); if (controller.signal.aborted) throw new CsvImportError("uncertain"); };
  try {
    const response = await fetch(url.toString(), { method: bytes ? "POST" : "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Idempotency-Key": key, ...(bytes ? { "Content-Type": "text/csv" } : {}) },
      body: bytes, signal: controller.signal, cache: "no-store", credentials: "omit", redirect: "error" });
    check();
    const auth: Record<number, CsvErrorKind> = { 401: "unauthorized", 403: "forbidden", 404: "not_found" };
    if (auth[response.status]) throw new CsvImportError(auth[response.status]);
    if (![200, 400, 409, 413, 415].includes(response.status)) return invalid();
    const data: unknown = await response.json(); check();
    if (!record(data)) return invalid();
    if (response.status === 200) {
      if (data.status === "not_observed" && bytes === undefined) return { status: "not_observed" };
      if (data.status !== "completed") return invalid();
      return { status: "completed", receipt: receipt(data.receipt, eventId) };
    }
    if (response.status === 400 && data.code === "INVALID_REGISTRATION_CSV") throw diagnostics(data);
    const codes: Record<number, Record<string, CsvErrorKind>> = {
      400: { INVALID_REGISTRATION_CSV_REQUEST: "validation" }, 413: { PAYLOAD_TOO_LARGE: "validation" }, 415: { UNSUPPORTED_MEDIA_TYPE: "validation" },
      409: { REGISTRATION_EMAIL_CONFLICT: "duplicate", EVENT_REGISTRATION_NOT_ALLOWED: "not_allowed", REGISTRATION_CSV_KEY_CONFLICT: "key_conflict" },
    };
    if (typeof data.code === "string" && Object.hasOwn(codes[response.status] ?? {}, data.code)) throw new CsvImportError(codes[response.status][data.code]);
    return invalid();
  } catch (error) { current(); if (error instanceof CsvImportError) throw error; throw new CsvImportError("uncertain"); }
  finally { clearTimeout(timer); options.signal?.removeEventListener("abort", abort); }
}
export function importApiRegistrationCsv(options: Options & { bytes: Uint8Array }): Promise<CsvLookup> { return request(options, options.bytes); }
export function queryApiRegistrationCsv(options: Options): Promise<CsvLookup> { return request(options); }
