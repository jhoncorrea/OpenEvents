import { InteractionRequiredAuthError } from "@azure/msal-browser";
import type { EventQueryOptions } from "./api-event-queries";
import { RegistrationError, type RegistrationErrorKind } from "./registration-error";

export { RegistrationError, type RegistrationErrorKind } from "./registration-error";
export interface RegistrationPayload { fullName: string; email: string }
export interface ApiRegistration {
  id: string; eventId: string; status: "confirmed"; source: "manual"; createdAt: string;
  attendee: { id: string; fullName: string; email: string };
}
export interface RegistrationOptions extends EventQueryOptions { eventId: string; input: RegistrationPayload }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Misma política que register-attendee-input (API): ASCII, puntos y + conservados.
const emailPattern = /^(?:[A-Za-z0-9_'+-]+\.)*[A-Za-z0-9_'+-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function parseRegistrationInput(input: unknown): RegistrationPayload {
  if (!record(input) || Object.keys(input).some(key => key !== "fullName" && key !== "email") ||
      typeof input.fullName !== "string" || typeof input.email !== "string") throw new RegistrationError("validation");
  const fullName = input.fullName.trim(); const email = input.email.trim();
  if (!fullName || fullName.length > 200 || /[\p{Cc}\p{Cf}]/u.test(fullName) ||
      email.length > 254 || !emailPattern.test(email) || email.split("@")[0].length > 64) throw new RegistrationError("validation");
  return { fullName, email: email.toLowerCase() };
}
function validUtc(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function parseResponse(value: unknown, eventId: string, input: RegistrationPayload): ApiRegistration {
  if (!record(value) || typeof value.id !== "string" || !uuid.test(value.id) || value.eventId !== eventId ||
      value.status !== "confirmed" || value.source !== "manual" || !validUtc(value.createdAt) ||
      !record(value.attendee) || typeof value.attendee.id !== "string" || !uuid.test(value.attendee.id) ||
      value.attendee.fullName !== input.fullName || value.attendee.email !== input.email) throw new RegistrationError("uncertain");
  return { id: value.id, eventId, status: "confirmed", source: "manual", createdAt: value.createdAt,
    attendee: { id: value.attendee.id, fullName: input.fullName, email: input.email } };
}

export async function registerApiAttendee(options: RegistrationOptions): Promise<ApiRegistration> {
  const signal = options.signal;
  const checkCancelled = () => { if (signal?.aborted) throw new RegistrationError("cancelled"); };
  checkCancelled();
  let url: URL;
  try {
    url = new URL(options.apiUrl);
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost")) ||
        url.username || url.password || url.search || url.hash || !options.apiScope.trim()) throw new Error();
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/api/v1/events`;
  } catch { throw new RegistrationError("configuration"); }
  if (!uuid.test(options.eventId)) throw new RegistrationError("validation");
  const id = options.eventId.toLowerCase();
  url.pathname += `/${id}/registrations`;
  // Capturar la propuesta antes de esperar la autorización; no registrar datos personales.
  const input = parseRegistrationInput(options.input);
  const body = JSON.stringify(input);
  let token: string;
  try {
    token = (await options.instance.acquireTokenSilent({ account: options.account, scopes: [options.apiScope] })).accessToken;
  } catch (error) {
    checkCancelled();
    throw new RegistrationError(error instanceof InteractionRequiredAuthError ? "interaction_required" : "authentication");
  }
  checkCancelled();
  if (!token?.trim()) throw new RegistrationError("authentication");
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, 15000);
  const checkTimeout = () => { if (controller.signal.aborted) throw new RegistrationError("uncertain"); };
  try {
    const response = await fetch(url.toString(), {
      method: "POST", headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" },
      body, cache: "no-store", credentials: "omit", redirect: "error", signal: controller.signal,
    });
    checkCancelled(); checkTimeout();
    const errors: Partial<Record<number, RegistrationErrorKind>> = {
      400: "validation", 413: "validation", 415: "validation", 401: "unauthorized", 403: "forbidden", 404: "not_found",
    };
    const kind = errors[response.status];
    if (kind) throw new RegistrationError(kind);
    if (response.status !== 201 && response.status !== 409) throw new RegistrationError("uncertain");
    const value: unknown = await response.json();
    checkCancelled(); checkTimeout();
    if (response.status === 409) {
      const code = record(value) ? value.code : null;
      throw new RegistrationError(code === "REGISTRATION_EMAIL_CONFLICT" ? "duplicate" :
        code === "EVENT_REGISTRATION_NOT_ALLOWED" ? "not_allowed" : "uncertain");
    }
    return parseResponse(value, id, input);
  } catch (error) {
    checkCancelled();
    if (error instanceof RegistrationError) throw error;
    // Una respuesta ilegible o un fallo de transporte no demuestra rollback.
    throw new RegistrationError("uncertain");
  } finally {
    clearTimeout(timer); signal?.removeEventListener("abort", cancel);
  }
}
