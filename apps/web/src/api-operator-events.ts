import { EventQueryError, type EventQueryErrorKind } from "./event-query-error";
import { InteractionRequiredAuthError, type AccountInfo, type IPublicClientApplication } from "@azure/msal-browser";

export interface OperatorEvent {
  id: string; name: string; startsAt: string; endsAt: string;
  timezone: string; location: string;
  status: "draft" | "active" | "closed" | "cancelled";
}
export interface OperatorEventPage { items: OperatorEvent[]; nextCursor: string | null }
export { EventQueryError, type EventQueryErrorKind } from "./event-query-error";
export interface OperatorEventQueryOptions {
  instance: IPublicClientApplication; account: AccountInfo;
  apiScope: string; apiUrl: string; signal?: AbortSignal; isCurrent?: () => boolean;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cursorPattern = /^[A-Za-z0-9_-]{1,100}$/;
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function utc(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value.replace(/(?:\.(\d{1,3}))?Z$/, (_, digits: string | undefined) => `.${(digits ?? "").padEnd(3, "0")}Z`);
}
export function parseOperatorEvent(value: unknown): OperatorEvent {
  const fail = () => { throw new EventQueryError("invalid_response"); };
  if (!record(value)) return fail();
  if (typeof value.id !== "string" || !uuid.test(value.id) ||
      typeof value.name !== "string" || !value.name.trim() || value.name.length > 200 ||
      typeof value.location !== "string" || !value.location.trim() || value.location.length > 500 ||
      typeof value.timezone !== "string" || !value.timezone.trim() || value.timezone.length > 100 || /^[+-]/.test(value.timezone) ||
      !utc(value.startsAt) || !utc(value.endsAt) ||
      Date.parse(value.endsAt) <= Date.parse(value.startsAt) ||
      !["draft", "active", "closed", "cancelled"].includes(String(value.status))) return fail();
  try { new Intl.DateTimeFormat("es-PE", { timeZone: value.timezone }).format(); }
  catch { return fail(); }
  return { id: value.id.toLowerCase(), name: value.name,
    location: value.location, timezone: value.timezone, startsAt: value.startsAt,
    endsAt: value.endsAt, status: value.status as OperatorEvent["status"] };
}
function baseUrl(options: OperatorEventQueryOptions): URL {
  try {
    const url = new URL(options.apiUrl);
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost")) ||
        url.username || url.password || url.search || url.hash || !options.apiScope.trim()) throw new Error();
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/api/v1/operator/events`;
    return url;
  } catch { throw new EventQueryError("configuration"); }
}
async function read(url: URL, options: OperatorEventQueryOptions): Promise<unknown> {
  const checkCancelled = () => { if (options.signal?.aborted || options.isCurrent?.() === false) throw new EventQueryError("cancelled"); };
  checkCancelled();
  let token: string;
  try {
    token = (await options.instance.acquireTokenSilent({ account: options.account, scopes: [options.apiScope] })).accessToken;
  } catch (error) {
    checkCancelled();
    throw new EventQueryError(error instanceof InteractionRequiredAuthError ? "interaction_required" : "authentication");
  }
  checkCancelled();
  if (!token?.trim()) throw new EventQueryError("authentication");
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
    if (controller.signal.aborted) throw new EventQueryError("unavailable");
    const statuses: Record<number, EventQueryErrorKind> = { 400: "validation", 401: "unauthorized", 403: "forbidden", 404: "not_found" };
    if (statuses[response.status]) throw new EventQueryError(statuses[response.status]);
    if (response.status !== 200) throw new EventQueryError("unavailable");
    let data: unknown;
    try { data = await response.json(); }
    catch { throw new EventQueryError(controller.signal.aborted ? "unavailable" : "invalid_response"); }
    checkCancelled();
    if (controller.signal.aborted) throw new EventQueryError("unavailable");
    return data;
  } catch (error) {
    checkCancelled();
    if (error instanceof EventQueryError) throw error;
    throw new EventQueryError("unavailable");
  } finally {
    clearTimeout(timer); options.signal?.removeEventListener("abort", cancel);
  }
}
export async function listOperatorEvents(options: OperatorEventQueryOptions & { limit?: number; cursor?: string }): Promise<OperatorEventPage> {
  const url = baseUrl(options); const limit = options.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 ||
      (options.cursor !== undefined && !cursorPattern.test(options.cursor))) throw new EventQueryError("validation");
  url.searchParams.set("limit", String(limit));
  if (options.cursor !== undefined) url.searchParams.set("cursor", options.cursor);
  const data = await read(url, options);
  if (!record(data) || !Array.isArray(data.items) || data.items.length > limit ||
      !(data.nextCursor === null || (typeof data.nextCursor === "string" && cursorPattern.test(data.nextCursor)))) {
    throw new EventQueryError("invalid_response");
  }
  const items = data.items.map(parseOperatorEvent);
  if (new Set(items.map(event => event.id)).size !== items.length ||
      items.some((item,index) => index > 0 && item.id <= items[index-1].id) ||
      (data.nextCursor !== null && (items.length !== limit || data.nextCursor === options.cursor))) {
    throw new EventQueryError("invalid_response");
  }
  return { items, nextCursor: data.nextCursor };
}
export async function getOperatorEvent(options: OperatorEventQueryOptions & { eventId: string }): Promise<OperatorEvent> {
  const url = baseUrl(options);
  if (!uuid.test(options.eventId)) throw new EventQueryError("validation");
  url.pathname += `/${options.eventId.toLowerCase()}`;
  const event = parseOperatorEvent(await read(url, options));
  if (event.id !== options.eventId.toLowerCase()) throw new EventQueryError("invalid_response");
  return event;
}
