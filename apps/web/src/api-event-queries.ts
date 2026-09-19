import { EventQueryError, type EventQueryErrorKind } from "./event-query-error";
import { InteractionRequiredAuthError, type AccountInfo, type IPublicClientApplication } from "@azure/msal-browser";

export interface ApiEvent {
  id: string; name: string; slug: string; startsAt: string; endsAt: string;
  timezone: string; location: string; createdAt: string;
  status: "draft" | "active" | "closed" | "cancelled";
}
export interface ApiEventPage { items: ApiEvent[]; nextCursor: string | null }
export { EventQueryError, type EventQueryErrorKind } from "./event-query-error";
export interface EventQueryOptions {
  instance: IPublicClientApplication; account: AccountInfo;
  apiScope: string; apiUrl: string; signal?: AbortSignal;
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
function parseEvent(value: unknown): ApiEvent {
  const fail = () => { throw new EventQueryError("invalid_response"); };
  if (!record(value)) return fail();
  if (typeof value.id !== "string" || !uuid.test(value.id) ||
      typeof value.name !== "string" || !value.name.trim() || value.name.length > 200 ||
      typeof value.slug !== "string" || value.slug.length > 120 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug) ||
      typeof value.location !== "string" || !value.location.trim() || value.location.length > 500 ||
      typeof value.timezone !== "string" || !value.timezone.trim() || value.timezone.length > 100 || /^[+-]/.test(value.timezone) ||
      !utc(value.startsAt) || !utc(value.endsAt) || !utc(value.createdAt) ||
      Date.parse(value.endsAt) <= Date.parse(value.startsAt) ||
      !["draft", "active", "closed", "cancelled"].includes(String(value.status))) return fail();
  try { new Intl.DateTimeFormat("es-PE", { timeZone: value.timezone }).format(); }
  catch { return fail(); }
  return { id: value.id.toLowerCase(), name: value.name, slug: value.slug,
    location: value.location, timezone: value.timezone, startsAt: value.startsAt,
    endsAt: value.endsAt, createdAt: value.createdAt, status: value.status as ApiEvent["status"] };
}
function baseUrl(options: EventQueryOptions): URL {
  try {
    const url = new URL(options.apiUrl);
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost")) ||
        url.username || url.password || url.search || url.hash || !options.apiScope.trim()) throw new Error();
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/api/v1/events`;
    return url;
  } catch { throw new EventQueryError("configuration"); }
}
async function read(url: URL, options: EventQueryOptions): Promise<unknown> {
  const checkCancelled = () => { if (options.signal?.aborted) throw new EventQueryError("cancelled"); };
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
    const statuses: Record<number, EventQueryErrorKind> = { 400: "validation", 401: "unauthorized", 403: "forbidden", 404: "not_found" };
    if (statuses[response.status]) throw new EventQueryError(statuses[response.status]);
    if (response.status !== 200) throw new EventQueryError("unavailable");
    let data: unknown;
    try { data = await response.json(); }
    catch { throw new EventQueryError(controller.signal.aborted ? "unavailable" : "invalid_response"); }
    checkCancelled();
    return data;
  } catch (error) {
    checkCancelled();
    if (error instanceof EventQueryError) throw error;
    throw new EventQueryError("unavailable");
  } finally {
    clearTimeout(timer); options.signal?.removeEventListener("abort", cancel);
  }
}
export async function listApiEvents(options: EventQueryOptions & { limit?: number; cursor?: string }): Promise<ApiEventPage> {
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
  const items = data.items.map(parseEvent);
  if (new Set(items.map(event => event.id)).size !== items.length ||
      (data.nextCursor !== null && (items.length === 0 || data.nextCursor === options.cursor))) {
    throw new EventQueryError("invalid_response");
  }
  return { items, nextCursor: data.nextCursor };
}
export async function getApiEvent(options: EventQueryOptions & { eventId: string }): Promise<ApiEvent> {
  const url = baseUrl(options);
  if (!uuid.test(options.eventId)) throw new EventQueryError("validation");
  url.pathname += `/${options.eventId.toLowerCase()}`;
  const event = parseEvent(await read(url, options));
  if (event.id !== options.eventId.toLowerCase()) throw new EventQueryError("invalid_response");
  return event;
}
