import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { type EventQueryOptions } from "./api-event-queries";
import { CheckInError, type CheckInErrorKind } from "./check-in-error";
export type CheckInResult = { status: "invalid" } | { status: "accepted" | "duplicate"; checkIn: {
  id: string; registrationId: string; checkedInAt: string; source: "manual" | "qr";
} };
export interface CheckInOptions extends EventQueryOptions {
  eventId: string; code: string; source?: "manual" | "qr"; isCurrent?: () => boolean;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export async function registerApiCheckIn(options: CheckInOptions): Promise<CheckInResult> {
  const checkCancelled = () => { if (options.signal?.aborted || options.isCurrent?.() === false) throw new CheckInError("cancelled"); };
  checkCancelled();
  let url: URL;
  try {
    url = new URL(options.apiUrl);
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost")) ||
        url.username || url.password || url.search || url.hash || !options.apiScope.trim()) throw new Error();
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/api/v1/events`;
  } catch { throw new CheckInError("configuration"); }
  if (!uuid.test(options.eventId)) throw new CheckInError("validation");
  const id = options.eventId.toLowerCase();
  url.pathname += `/${id}/check-ins`;
  if (typeof options.code !== "string" || options.code.length < 1 || options.code.length > 256) throw new CheckInError("validation");
  // Capturar el secreto exacto antes de esperar el token; nunca normalizarlo.
  const source = options.source === undefined ? "manual" : options.source;
  if (source !== "manual" && source !== "qr") throw new CheckInError("validation");
  const body = JSON.stringify({ code: options.code, source });
  let token: string;
  try {
    token = (await options.instance.acquireTokenSilent({ account: options.account, scopes: [options.apiScope] })).accessToken;
  } catch (error) {
    checkCancelled();
    throw new CheckInError(error instanceof InteractionRequiredAuthError ? "interaction_required" : "authentication");
  }
  checkCancelled();
  if (!token?.trim()) throw new CheckInError("authentication");
  const controller = new AbortController();
  const cancel = () => controller.abort();
  options.signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, 15000);
  const checkTimeout = () => { if (controller.signal.aborted) throw new CheckInError("uncertain"); };
  try {
    const response = await fetch(url.toString(), {
      method: "POST", headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" },
      body, cache: "no-store", credentials: "omit", redirect: "error", signal: controller.signal,
    });
    checkCancelled(); checkTimeout();
    const statuses: Partial<Record<number, CheckInErrorKind>> = { 400: "validation", 413: "validation", 401: "unauthorized", 403: "forbidden" };
    const kind = statuses[response.status];
    if (kind) throw new CheckInError(kind);
    if (![201, 409, 404].includes(response.status)) throw new CheckInError("uncertain");
    const value: unknown = await response.json();
    checkCancelled(); checkTimeout();
    if (!record(value)) throw new CheckInError("uncertain");
    if (response.status === 404) {
      if (value.code === "EVENT_NOT_FOUND") throw new CheckInError("not_found");
      if (value.status === "invalid" && Object.keys(value).length === 1) return { status: "invalid" };
      throw new CheckInError("uncertain");
    }
    if (response.status === 409 && value.code === "CHECK_IN_NOT_ALLOWED") throw new CheckInError("not_active");
    const status = response.status === 201 ? "accepted" : "duplicate";
    const saved = value.checkIn;
    if (value.status !== status || !record(saved) || typeof saved.id !== "string" || !uuid.test(saved.id) ||
        typeof saved.registrationId !== "string" || !uuid.test(saved.registrationId) ||
        typeof saved.checkedInAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(saved.checkedInAt) ||
        !Number.isFinite(Date.parse(saved.checkedInAt)) || new Date(saved.checkedInAt).toISOString() !== saved.checkedInAt ||
        (saved.source !== "manual" && saved.source !== "qr") || (status === "accepted" && saved.source !== source)) throw new CheckInError("uncertain");
    return { status, checkIn: { id: saved.id, registrationId: saved.registrationId, checkedInAt: saved.checkedInAt, source: saved.source } };
  } catch (error) {
    checkCancelled();
    if (error instanceof CheckInError) throw error;
    // Ni un error de red ni una respuesta ilegible prueban que la escritura no ocurrió.
    throw new CheckInError("uncertain");
  } finally {
    clearTimeout(timer); options.signal?.removeEventListener("abort", cancel);
  }
}
