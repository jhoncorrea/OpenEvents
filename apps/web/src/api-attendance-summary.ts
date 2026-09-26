import { InteractionRequiredAuthError } from "@azure/msal-browser";
import type { EventQueryOptions } from "./api-event-queries";
import { EventQueryError, type EventQueryErrorKind } from "./event-query-error";

export interface AttendanceSummary {
  eventId: string; registered: number; confirmed: number; cancelled: number;
  checkedIn: number; cancelledCheckedIn: number; pending: number; observedAt: string;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseAttendanceSummary(value: unknown, eventId: string): AttendanceSummary {
  const fail = () => { throw new EventQueryError("invalid_response"); };
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
  const v = value as Record<string, unknown>;
  const fields = ["registered", "confirmed", "cancelled", "checkedIn", "cancelledCheckedIn", "pending"] as const;
  if (typeof v.eventId !== "string" || !uuid.test(v.eventId) || v.eventId !== eventId.toLowerCase() ||
    fields.some(key => typeof v[key] !== "number" || !Number.isSafeInteger(v[key]) || (v[key] as number) < 0) ||
    typeof v.observedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v.observedAt) ||
    !Number.isFinite(Date.parse(v.observedAt)) || new Date(v.observedAt).toISOString() !== v.observedAt) return fail();
  const { registered, confirmed, cancelled, checkedIn, cancelledCheckedIn, pending } = v as unknown as AttendanceSummary;
  if (registered !== confirmed + cancelled || checkedIn > registered || pending > confirmed ||
    cancelledCheckedIn > cancelled || cancelledCheckedIn > checkedIn ||
    confirmed - pending !== checkedIn - cancelledCheckedIn) return fail();
  return { eventId: v.eventId, registered, confirmed, cancelled, checkedIn, cancelledCheckedIn, pending, observedAt: v.observedAt };
}

export async function getAttendanceSummary(options: EventQueryOptions & { eventId: string; isCurrent?: () => boolean }): Promise<AttendanceSummary> {
  const checkCurrent = () => { if (options.signal?.aborted || options.isCurrent?.() === false) throw new EventQueryError("cancelled"); };
  checkCurrent();
  let url: URL;
  try {
    url = new URL(options.apiUrl);
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost")) ||
      url.username || url.password || url.search || url.hash || !options.apiScope.trim()) throw new Error();
  } catch { throw new EventQueryError("configuration"); }
  if (!uuid.test(options.eventId)) throw new EventQueryError("validation");
  const id = options.eventId.toLowerCase();
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/api/v1/events/${id}/attendance-summary`;
  let token: string;
  try { token = (await options.instance.acquireTokenSilent({ account: options.account, scopes: [options.apiScope] })).accessToken; }
  catch (error) { checkCurrent(); throw new EventQueryError(error instanceof InteractionRequiredAuthError ? "interaction_required" : "authentication"); }
  checkCurrent();
  if (!token?.trim()) throw new EventQueryError("authentication");
  const controller = new AbortController();
  const cancel = () => controller.abort();
  options.signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, 15000);
  const check = () => { checkCurrent(); if (controller.signal.aborted) throw new EventQueryError("unavailable"); };
  try {
    const response = await fetch(url.toString(), { method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store", credentials: "omit", redirect: "error", signal: controller.signal });
    check();
    const statuses: Partial<Record<number, EventQueryErrorKind>> = { 400: "validation", 401: "unauthorized", 403: "forbidden", 404: "not_found" };
    if (statuses[response.status]) throw new EventQueryError(statuses[response.status]!);
    if (response.status !== 200) throw new EventQueryError("unavailable");
    let value: unknown;
    try { value = await response.json(); } catch { check(); throw new EventQueryError("invalid_response"); }
    check();
    return parseAttendanceSummary(value, id);
  } catch (error) {
    check();
    if (error instanceof EventQueryError) throw error;
    throw new EventQueryError("unavailable");
  } finally { clearTimeout(timer); options.signal?.removeEventListener("abort", cancel); }
}
