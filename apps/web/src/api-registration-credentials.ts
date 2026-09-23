import { InteractionRequiredAuthError } from "@azure/msal-browser";
import type { EventQueryOptions } from "./api-event-queries";
import { CredentialError } from "./credential-error";
export { CredentialError } from "./credential-error";
export interface IssuedCredential { id: string; eventId: string; registrationId: string; status: "active"; issuedAt: string; token: string }
export interface CredentialOptions extends EventQueryOptions { eventId: string; registrationId: string; isCurrent: () => boolean }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function record(v: unknown): v is Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v); }
export function parseIssuedCredential(v: unknown, eventId: string, registrationId: string): IssuedCredential {
  // 32 bytes tienen 43 caracteres base64url; los dos bits bajos del último carácter son cero.
  if (!record(v) || Object.keys(v).some(k => !["id", "eventId", "registrationId", "status", "issuedAt", "token"].includes(k)) ||
    typeof v.id !== "string" || !uuid.test(v.id) || v.eventId !== eventId || v.registrationId !== registrationId || v.status !== "active" ||
    typeof v.issuedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v.issuedAt) || !Number.isFinite(Date.parse(v.issuedAt)) || new Date(v.issuedAt).toISOString() !== v.issuedAt ||
    typeof v.token !== "string" || !/^oe1_[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(v.token)) throw new CredentialError("uncertain");
  return { id: v.id, eventId, registrationId, status: "active", issuedAt: v.issuedAt, token: v.token };
}
export async function issueApiRegistrationCredential(options: CredentialOptions): Promise<IssuedCredential> {
  let sent = false;
  const current = () => { if (options.signal?.aborted || !options.isCurrent()) throw new CredentialError(sent ? "uncertain" : "cancelled_before_send"); };
  current();
  let url: URL;
  try {
    url = new URL(options.apiUrl);
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost")) || url.username || url.password || url.search || url.hash || !options.apiScope.trim()) throw new Error();
  } catch { throw new CredentialError("configuration"); }
  if (!uuid.test(options.eventId) || !uuid.test(options.registrationId)) throw new CredentialError("validation");
  const eventId = options.eventId.toLowerCase(), registrationId = options.registrationId.toLowerCase();
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/api/v1/events/${eventId}/registrations/${registrationId}/qr`;
  let token: string;
  try { token = (await options.instance.acquireTokenSilent({ account: options.account, scopes: [options.apiScope] })).accessToken; }
  catch (e) { current(); throw new CredentialError(e instanceof InteractionRequiredAuthError ? "interaction_required" : "authentication"); }
  current(); if (!token?.trim()) throw new CredentialError("authentication");
  const controller = new AbortController(); const cancel = () => controller.abort();
  options.signal?.addEventListener("abort", cancel, { once: true }); const timer = setTimeout(cancel, 15000);
  const fresh = () => { current(); if (controller.signal.aborted) throw new CredentialError("uncertain"); };
  try {
    current(); sent = true;
    const response = await fetch(url.toString(), { method: "POST", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store", credentials: "omit", redirect: "error", signal: controller.signal });
    fresh();
    if (response.status === 401) throw new CredentialError("unauthorized");
    if (response.status === 403) throw new CredentialError("forbidden");
    if ([400, 413, 415].includes(response.status)) throw new CredentialError("validation");
    if (![201, 404, 409].includes(response.status)) throw new CredentialError("uncertain");
    const v: unknown = await response.json(); fresh();
    if (response.status === 201) return parseIssuedCredential(v, eventId, registrationId);
    const code = record(v) ? v.code : undefined;
    if (response.status === 404 && code === "EVENT_NOT_FOUND") throw new CredentialError("event_not_found");
    if (response.status === 404 && code === "REGISTRATION_NOT_FOUND") throw new CredentialError("registration_not_found");
    if (response.status === 409 && code === "REGISTRATION_CREDENTIAL_EXISTS") throw new CredentialError("exists");
    if (response.status === 409 && code === "CREDENTIAL_ISSUANCE_NOT_ALLOWED") throw new CredentialError("not_allowed");
    throw new CredentialError("uncertain");
  } catch (e) { fresh(); if (e instanceof CredentialError) throw e; throw new CredentialError("uncertain"); }
  finally { clearTimeout(timer); options.signal?.removeEventListener("abort", cancel); }
}
