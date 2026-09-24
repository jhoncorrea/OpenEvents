import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { parseApiEvent, type ApiEvent, type EventQueryOptions } from "./api-event-queries";
import { EventLifecycleError, type EventLifecycleErrorKind } from "./event-lifecycle-error";
export type EventLifecycleAction = "activate" | "close";
export interface EventLifecycleOptions extends EventQueryOptions {
  eventId: string; action: EventLifecycleAction; input: { expectedVersion: number }; isCurrent?: () => boolean;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export async function changeApiEventState(options: EventLifecycleOptions): Promise<ApiEvent> {
  const checkCancelled = () => { if (options.signal?.aborted || options.isCurrent?.() === false) throw new EventLifecycleError("cancelled"); };
  checkCancelled();
  let url: URL;
  try {
    url = new URL(options.apiUrl);
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost")) ||
        url.username || url.password || url.search || url.hash || !options.apiScope.trim()) throw new Error();
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/api/v1/events`;
  } catch { throw new EventLifecycleError("configuration"); }
  if (!uuid.test(options.eventId)) throw new EventLifecycleError("validation");
  const id = options.eventId.toLowerCase();
  if (!["activate", "close"].includes(options.action)) throw new EventLifecycleError("validation");
  const action = options.action;
  url.pathname += `/${id}/${action}`;
  // Inmutable antes de esperar el token: un cambio del formulario no altera este envío.
  if (!record(options.input) || Object.keys(options.input).some(k => k !== "expectedVersion") ||
      !Number.isInteger(options.input.expectedVersion) || options.input.expectedVersion < 1 || options.input.expectedVersion > 2147483646) throw new EventLifecycleError("validation");
  const data = { expectedVersion: options.input.expectedVersion };
  const body = JSON.stringify(data);
  let token: string;
  try {
    token = (await options.instance.acquireTokenSilent({ account: options.account, scopes: [options.apiScope] })).accessToken;
  } catch (error) {
    checkCancelled();
    throw new EventLifecycleError(error instanceof InteractionRequiredAuthError ? "interaction_required" : "authentication");
  }
  checkCancelled();
  if (!token?.trim()) throw new EventLifecycleError("authentication");
  const controller = new AbortController();
  const cancel = () => controller.abort();
  options.signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, 15000);
  const checkTimeout = () => { if (controller.signal.aborted) throw new EventLifecycleError("uncertain"); };
  try {
    const response = await fetch(url.toString(), {
      method: "POST", headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" },
      body, cache: "no-store", credentials: "omit", redirect: "error", signal: controller.signal,
    });
    checkCancelled(); checkTimeout();
    const statuses: Partial<Record<number, EventLifecycleErrorKind>> = { 400: "validation", 401: "unauthorized", 403: "forbidden", 404: "not_found" };
    const kind = statuses[response.status];
    if (kind) throw new EventLifecycleError(kind);
    if (response.status !== 200 && response.status !== 409) throw new EventLifecycleError("uncertain");
    const value: unknown = await response.json();
    checkCancelled(); checkTimeout();
    if (response.status === 409) {
      const conflicts: Record<string, EventLifecycleErrorKind> = {
        EVENT_VERSION_CONFLICT: "version_conflict", EVENT_TRANSITION_NOT_ALLOWED: "transition_conflict",
      };
      const code = record(value) && typeof value.code === "string" ? value.code : "";
      throw new EventLifecycleError(Object.hasOwn(conflicts, code) ? conflicts[code] : "uncertain");
    }
    const updated = parseApiEvent(value);
    if (updated.id !== id || updated.status !== (action === "activate" ? "active" : "closed") || updated.version !== data.expectedVersion + 1) throw new EventLifecycleError("uncertain");
    return updated;
  } catch (error) {
    checkCancelled();
    if (error instanceof EventLifecycleError) throw error;
    // Ni un error de red ni una respuesta ilegible prueban que la escritura no ocurrió.
    throw new EventLifecycleError("uncertain");
  } finally {
    clearTimeout(timer); options.signal?.removeEventListener("abort", cancel);
  }
}
