import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { parseApiEvent, type ApiEvent, type EventQueryOptions } from "./api-event-queries";
import type { CreateEventPayload } from "./event-form";
import { EventEditError, type EventEditErrorKind } from "./event-edit-error";

export { EventEditError, type EventEditErrorKind } from "./event-edit-error";
export type EditEventPayload = Partial<CreateEventPayload> & { expectedVersion: number };
export interface EventEditOptions extends EventQueryOptions { eventId: string; input: EditEventPayload }
const fields = ["name", "slug", "startsAt", "endsAt", "timezone", "location"] as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validUtc(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
  return new Date(value).toISOString() === value.replace(/(?:\.(\d{1,3}))?Z$/, (_, digits: string | undefined) => `.${(digits ?? "").padEnd(3, "0")}Z`);
}
function snapshot(input: unknown): EditEventPayload {
  const fail = () => { throw new EventEditError("validation"); };
  if (!record(input) || typeof input.expectedVersion !== "number" || !Number.isInteger(input.expectedVersion) ||
      input.expectedVersion < 1 || input.expectedVersion > 2147483646 ||
      Object.keys(input).some(key => key !== "expectedVersion" && !fields.some(field => field === key))) return fail();
  const data: EditEventPayload = { expectedVersion: input.expectedVersion };
  for (const field of fields) {
    const value = input[field];
    if (value === undefined) continue;
    if (typeof value !== "string" || !value.trim()) return fail();
    if ((field === "name" && value.trim().length > 200) || (field === "location" && value.trim().length > 500) ||
        (field === "slug" && (value.trim().length > 120 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.trim())))) return fail();
    if ((field === "startsAt" || field === "endsAt") && !validUtc(value)) return fail();
    if (field === "timezone") {
      if (value.trim().length > 100 || /^[+-]/.test(value.trim())) return fail();
      try { new Intl.DateTimeFormat("es-PE", { timeZone: value.trim() }).format(); } catch { return fail(); }
    }
    data[field] = value.trim();
  }
  if (Object.keys(data).length === 1 || (data.startsAt && data.endsAt && Date.parse(data.endsAt) <= Date.parse(data.startsAt))) return fail();
  return data;
}

export async function editApiEvent(options: EventEditOptions): Promise<ApiEvent> {
  const checkCancelled = () => { if (options.signal?.aborted) throw new EventEditError("cancelled"); };
  checkCancelled();
  let url: URL;
  try {
    url = new URL(options.apiUrl);
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost")) ||
        url.username || url.password || url.search || url.hash || !options.apiScope.trim()) throw new Error();
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/api/v1/events`;
  } catch { throw new EventEditError("configuration"); }
  if (!uuid.test(options.eventId)) throw new EventEditError("validation");
  const id = options.eventId.toLowerCase();
  url.pathname += `/${id}`;
  // Inmutable antes de esperar el token: un cambio del formulario no altera este envío.
  const data = snapshot(options.input);
  const body = JSON.stringify(data);
  let token: string;
  try {
    token = (await options.instance.acquireTokenSilent({ account: options.account, scopes: [options.apiScope] })).accessToken;
  } catch (error) {
    checkCancelled();
    throw new EventEditError(error instanceof InteractionRequiredAuthError ? "interaction_required" : "authentication");
  }
  checkCancelled();
  if (!token?.trim()) throw new EventEditError("authentication");
  const controller = new AbortController();
  const cancel = () => controller.abort();
  options.signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, 15000);
  const checkTimeout = () => { if (controller.signal.aborted) throw new EventEditError("uncertain"); };
  try {
    const response = await fetch(url.toString(), {
      method: "PATCH", headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" },
      body, cache: "no-store", credentials: "omit", redirect: "error", signal: controller.signal,
    });
    checkCancelled(); checkTimeout();
    const statuses: Partial<Record<number, EventEditErrorKind>> = { 400: "validation", 401: "unauthorized", 403: "forbidden", 404: "not_found" };
    const kind = statuses[response.status];
    if (kind) throw new EventEditError(kind);
    if (response.status !== 200 && response.status !== 409) throw new EventEditError("uncertain");
    const value: unknown = await response.json();
    checkCancelled(); checkTimeout();
    if (response.status === 409) {
      const conflicts: Record<string, EventEditErrorKind> = {
        EVENT_VERSION_CONFLICT: "version_conflict", EVENT_SLUG_CONFLICT: "slug_conflict", EVENT_NOT_EDITABLE: "not_editable",
      };
      const code = record(value) && typeof value.code === "string" ? value.code : "";
      throw new EventEditError(Object.hasOwn(conflicts, code) ? conflicts[code] : "uncertain");
    }
    const updated = parseApiEvent(value);
    if (updated.id !== id || updated.status !== "draft" || updated.version !== data.expectedVersion + 1) throw new EventEditError("uncertain");
    return updated;
  } catch (error) {
    checkCancelled();
    if (error instanceof EventEditError) throw error;
    // Ni un error de red ni una respuesta ilegible prueban que la escritura no ocurrió.
    throw new EventEditError("uncertain");
  } finally {
    clearTimeout(timer); options.signal?.removeEventListener("abort", cancel);
  }
}
