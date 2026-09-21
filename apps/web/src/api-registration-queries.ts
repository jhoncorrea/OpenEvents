import { InteractionRequiredAuthError } from "@azure/msal-browser";
import type { EventQueryOptions } from "./api-event-queries";
import { RegistrationQueryError, type RegistrationQueryErrorKind } from "./registration-query-error";
export { RegistrationQueryError } from "./registration-query-error";

export interface QueriedRegistration {
  id: string; eventId: string; status: "confirmed" | "cancelled"; source: string; createdAt: string;
  attendee: { id: string; fullName: string; email: string };
}
export interface RegistrationPage { items: QueriedRegistration[]; nextCursor: string | null }
export interface RegistrationQueryOptions extends EventQueryOptions { eventId: string; isCurrent?: () => boolean }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// El cursor es opaco para la web; la API valida su contenido y vínculo al evento.
const cursorPattern = /^[A-Za-z0-9_-]{1,150}$/;
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && !/[\p{Cc}\p{Cf}]/u.test(value);
}
function utc(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function parseRegistration(value: unknown, eventId: string): QueriedRegistration {
  if (!record(value) || typeof value.id !== "string" || !uuid.test(value.id) ||
      typeof value.eventId !== "string" || value.eventId.toLowerCase() !== eventId ||
      (value.status !== "confirmed" && value.status !== "cancelled") || !text(value.source) ||
      !utc(value.createdAt) || !record(value.attendee) ||
      typeof value.attendee.id !== "string" || !uuid.test(value.attendee.id) ||
      !text(value.attendee.fullName) || value.attendee.fullName.length > 200 ||
      !text(value.attendee.email) || value.attendee.email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.attendee.email)) throw new RegistrationQueryError("invalid_response");
  return { id: value.id.toLowerCase(), eventId, status: value.status, source: value.source, createdAt: value.createdAt,
    attendee: { id: value.attendee.id.toLowerCase(), fullName: value.attendee.fullName, email: value.attendee.email } };
}
function baseUrl(options: RegistrationQueryOptions): URL {
  try {
    const url = new URL(options.apiUrl);
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost")) ||
        url.username || url.password || url.search || url.hash || !options.apiScope.trim()) throw new Error();
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/api/v1/events`;
    if (!uuid.test(options.eventId)) throw new RegistrationQueryError("validation");
    url.pathname += `/${options.eventId.toLowerCase()}/registrations`;
    return url;
  } catch (error) {
    if (error instanceof RegistrationQueryError) throw error;
    throw new RegistrationQueryError("configuration");
  }
}
async function read(url: URL, options: RegistrationQueryOptions): Promise<unknown> {
  const checkCancelled = () => { if (options.signal?.aborted || options.isCurrent?.() === false) throw new RegistrationQueryError("cancelled"); };
  checkCancelled();
  let token: string;
  try {
    token = (await options.instance.acquireTokenSilent({ account: options.account, scopes: [options.apiScope] })).accessToken;
  } catch (error) {
    checkCancelled();
    throw new RegistrationQueryError(error instanceof InteractionRequiredAuthError ? "interaction_required" : "authentication");
  }
  checkCancelled();
  if (!token?.trim()) throw new RegistrationQueryError("authentication");
  const controller = new AbortController();
  const cancel = () => controller.abort();
  options.signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, 15000);
  try {
    const response = await fetch(url.toString(), {
      method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store", credentials: "omit", redirect: "error", signal: controller.signal,
    });
    checkCancelled();
    if (controller.signal.aborted) throw new RegistrationQueryError("unavailable");
    const statuses: Record<number, RegistrationQueryErrorKind> = { 400: "validation", 401: "unauthorized", 403: "forbidden", 404: "not_found" };
    if (statuses[response.status]) throw new RegistrationQueryError(statuses[response.status]);
    if (response.status !== 200) throw new RegistrationQueryError("unavailable");
    let data: unknown;
    try { data = await response.json(); }
    catch { throw new RegistrationQueryError(controller.signal.aborted ? "unavailable" : "invalid_response"); }
    checkCancelled();
    if (controller.signal.aborted) throw new RegistrationQueryError("unavailable");
    return data;
  } catch (error) {
    checkCancelled();
    if (error instanceof RegistrationQueryError) throw error;
    throw new RegistrationQueryError("unavailable");
  } finally {
    clearTimeout(timer); options.signal?.removeEventListener("abort", cancel);
  }
}
async function readPage(options: RegistrationQueryOptions & { limit?: number; cursor?: string }, q?: string): Promise<RegistrationPage> {
  const pageCursorPattern = q === undefined ? cursorPattern : /^[A-Za-z0-9_-]{1,240}$/;
  const url = baseUrl(options); const limit = options.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 ||
      (options.cursor !== undefined && !pageCursorPattern.test(options.cursor))) throw new RegistrationQueryError("validation");
  if (q !== undefined) { url.pathname += "/search"; url.searchParams.set("q", q); }
  url.searchParams.set("limit", String(limit));
  if (options.cursor !== undefined) url.searchParams.set("cursor", options.cursor);
  const data = await read(url, options);
  if (!record(data) || !Array.isArray(data.items) || data.items.length > limit ||
      !(data.nextCursor === null || (typeof data.nextCursor === "string" && pageCursorPattern.test(data.nextCursor)))) {
    throw new RegistrationQueryError("invalid_response");
  }
  const items = data.items.map(item => parseRegistration(item, options.eventId.toLowerCase()));
  if (new Set(items.map(item => item.id)).size !== items.length ||
      (data.nextCursor !== null && (items.length !== limit || data.nextCursor === options.cursor)) ||
      items.some((item, index) => index > 0 && item.id <= items[index - 1].id)) {
    throw new RegistrationQueryError("invalid_response");
  }
  return { items, nextCursor: data.nextCursor };
}
export async function getApiRegistration(options: RegistrationQueryOptions & { registrationId: string }): Promise<QueriedRegistration> {
  const url = baseUrl(options);
  if (!uuid.test(options.registrationId)) throw new RegistrationQueryError("validation");
  url.pathname += `/${options.registrationId.toLowerCase()}`;
  const registration = parseRegistration(await read(url, options), options.eventId.toLowerCase());
  if (registration.id !== options.registrationId.toLowerCase()) throw new RegistrationQueryError("invalid_response");
  return registration;
}

export function normalizeRegistrationSearch(value: string): string {
  if (typeof value !== "string" || value.length > 200 || ![...value].every(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127) ||
      value.trim().length < 1 || value.trim().length > 100) throw new RegistrationQueryError("validation");
  return value.trim();
}
export function listApiRegistrations(options: RegistrationQueryOptions & { limit?: number; cursor?: string }): Promise<RegistrationPage> {
  return readPage(options);
}
export async function searchApiRegistrations(options: RegistrationQueryOptions & { q: string; limit?: number; cursor?: string }): Promise<RegistrationPage> {
  return readPage(options, normalizeRegistrationSearch(options.q));
}
