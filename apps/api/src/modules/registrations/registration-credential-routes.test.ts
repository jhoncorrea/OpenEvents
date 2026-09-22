import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";
import { AuthenticationError, AuthorizationError, type AuthenticatedUser } from "../../auth/verify-access-token.js";
import { EventNotFoundError } from "../events/query-events-for-organizer.js";
import { RegistrationNotFoundError } from "./query-registrations-for-organizer.js";
import { CredentialIssuanceFailedError, CredentialIssuanceNotAllowedError, RegistrationCredentialExistsError } from "./issue-registration-credential-for-organizer.js";
import type { IssueRegistrationCredentialOperation } from "./registration-credential-routes.js";
const eventId = "a3333333-3333-4333-8333-333333333333";
const registrationId = "b4444444-4444-4444-8444-444444444444";
const actor: AuthenticatedUser = { tenantId: eventId, objectId: registrationId, subject: "verified", roles: ["organizer"] };
const url = `/api/v1/events/${eventId}/registrations/${registrationId}/qr`;
const headers = { authorization: "Bearer sensitive-bearer" };
const issued = { id: eventId, eventId, registrationId, status: "active" as const, issuedAt: new Date("2026-09-22T17:00:00-05:00"), token: "opaque-secret" };
describe("credential issuance HTTP", () => {
  let app: ReturnType<typeof buildApp>; let issue: ReturnType<typeof vi.fn<IssueRegistrationCredentialOperation>>; let verify: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    issue = vi.fn<IssueRegistrationCredentialOperation>().mockResolvedValue(issued);
    verify = vi.fn().mockResolvedValue(actor);
    app = buildApp({ verifyAccessToken: verify, createEvent: vi.fn(), issueRegistrationCredential: issue });
  });
  afterEach(async () => { await app.close(); vi.restoreAllMocks(); });
  it("forwards only verified actor and normalized IDs, projects result and UTC date", async () => {
    issue.mockResolvedValue({ ...issued, ...{ tokenHash: "private-hash", attendee: "private-person" } });
    const r = await app.inject({ method: "POST", url: url.replace(eventId, eventId.toUpperCase()).replace(registrationId, registrationId.toUpperCase()), headers });
    expect(r.statusCode).toBe(201); expect(r.headers["cache-control"]).toBe("no-store");
    expect(verify).toHaveBeenCalledExactlyOnceWith("sensitive-bearer");
    expect(issue).toHaveBeenCalledExactlyOnceWith(eventId, registrationId, actor);
    expect(r.json()).toEqual({ ...issued, issuedAt: "2026-09-22T22:00:00.000Z" });
    expect(JSON.stringify(r.headers)).not.toContain(issued.token);
  });
  it("accepts explicit content-length zero without Content-Type", async () => {
    expect((await app.inject({ method: "POST", url, headers: { ...headers, "content-length": "0" } })).statusCode).toBe(201);
  });
  it("accepts organizer with additional roles", async () => {
    verify.mockResolvedValue({ ...actor, roles: ["organizer", "checkin_operator", "admin"] });
    expect((await app.inject({ method: "POST", url, headers })).statusCode).toBe(201);
  });
  it.each(["", "Basic secret", "Bearer", "Bearer a b"])("rejects malformed authorization %s before validation", async authorization => {
    const r = await app.inject({ method: "POST", url: url + "?actor=forged", headers: { authorization }, payload: "malformed" });
    expect(r.statusCode).toBe(401); expect(r.headers["www-authenticate"]).toBe("Bearer");
    expect(r.headers["cache-control"]).toBe("no-store"); expect(issue).not.toHaveBeenCalled(); expect(verify).not.toHaveBeenCalled();
  });
  it.each([{ roles: [] }, { roles: ["admin"] }, { roles: ["checkin_operator"] }])("denies roles $roles", async ({ roles }) => {
    verify.mockResolvedValue({ ...actor, roles });
    const r = await app.inject({ method: "POST", url, headers });
    expect(r.statusCode).toBe(403); expect(r.headers["cache-control"]).toBe("no-store"); expect(issue).not.toHaveBeenCalled();
  });
  it.each(["?actor=forged", "?token=secret", "?x=1&x=2", "?q="])("rejects query %s", async query => {
    const r = await app.inject({ method: "POST", url: url + query, headers });
    expect(r.statusCode).toBe(400); expect(r.json().code).toBe("INVALID_CREDENTIAL_INPUT"); expect(r.headers["cache-control"]).toBe("no-store"); expect(issue).not.toHaveBeenCalled();
  });
  it.each([eventId, registrationId])("rejects invalid UUID in %s", async id => {
    const r = await app.inject({ method: "POST", url: url.replace(id, "invalid"), headers });
    expect(r.statusCode).toBe(400); expect(issue).not.toHaveBeenCalled();
  });
  it.each(["{}", "null", "[]", '{"token":"private-body"}', "broken-json", "x".repeat(2048)])("rejects body without reflecting content: %#", async payload => {
    const r = await app.inject({ method: "POST", url, headers: { ...headers, "content-type": "application/json" }, payload });
    expect(r.statusCode).toBe(400); expect(r.headers["cache-control"]).toBe("no-store"); expect(issue).not.toHaveBeenCalled(); expect(r.body).not.toContain("private-body");
  });
  it.each(["application/json", "text/plain", "application/octet-stream"])("rejects empty typed request %s", async type => {
    const r = await app.inject({ method: "POST", url, headers: { ...headers, "content-type": type, "content-length": "0" } });
    expect(r.statusCode).toBe(415); expect(r.headers["cache-control"]).toBe("no-store"); expect(issue).not.toHaveBeenCalled();
  });
  it("rejects chunked framing even without body", async () => {
    const r = await app.inject({ method: "POST", url, headers: { ...headers, "transfer-encoding": "chunked" } });
    expect(r.statusCode).toBe(400); expect(r.headers["cache-control"]).toBe("no-store"); expect(issue).not.toHaveBeenCalled();
  });
  it.each([
    { error: new AuthenticationError(), status: 401, code: "UNAUTHORIZED" },
    { error: new AuthorizationError(), status: 403, code: "FORBIDDEN" },
    { error: new EventNotFoundError(), status: 404, code: "EVENT_NOT_FOUND" },
    { error: new RegistrationNotFoundError(), status: 404, code: "REGISTRATION_NOT_FOUND" },
    { error: new CredentialIssuanceNotAllowedError(), status: 409, code: "CREDENTIAL_ISSUANCE_NOT_ALLOWED" },
    { error: new RegistrationCredentialExistsError(), status: 409, code: "REGISTRATION_CREDENTIAL_EXISTS" },
    { error: new CredentialIssuanceFailedError(), status: 500, code: "INTERNAL_SERVER_ERROR" },
    { error: Object.assign(new Error("private SQL token"), { statusCode: 400 }), status: 500, code: "INTERNAL_SERVER_ERROR" },
  ])("maps operation error $code safely", async ({ error, status, code }) => {
    issue.mockRejectedValue(error);
    const r = await app.inject({ method: "POST", url, headers });
    expect(r.statusCode).toBe(status); expect(r.json().code).toBe(code); expect(r.headers["cache-control"]).toBe("no-store");
    expect(r.body).not.toContain("private"); expect(r.body).not.toContain(issued.token);
    if (status === 401) expect(r.headers["www-authenticate"]).toBe("Bearer");
  });
  it.each([{ error: new AuthenticationError(), status: 401 }, { error: new AuthorizationError(), status: 403 },
    { error: new Error("verifier-secret"), status: 500 }])("maps verifier error $status", async ({ error, status }) => {
    verify.mockRejectedValue(error); const r = await app.inject({ method: "POST", url, headers });
    expect(r.statusCode).toBe(status); expect(r.headers["cache-control"]).toBe("no-store"); expect(issue).not.toHaveBeenCalled(); expect(r.body).not.toContain("verifier-secret");
  });
  it.each(["GET", "HEAD", "PUT", "PATCH", "DELETE"] as const)("does not issue on %s", async method => {
    expect((await app.inject({ method, url, headers })).statusCode).toBe(404); expect(issue).not.toHaveBeenCalled();
  });
  it("supports CORS preflight without issuance", async () => {
    const r = await app.inject({ method: "OPTIONS", url, headers: { origin: "http://localhost:5173", "access-control-request-method": "POST", "access-control-request-headers": "authorization" } });
    expect(r.statusCode).toBe(204); expect(issue).not.toHaveBeenCalled();
  });
  it("does not log secrets in success, rejection or unexpected failure", async () => {
    await app.close(); const chunks: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation(chunk => { chunks.push(String(chunk)); return true; });
    app = buildApp({ logger: true, verifyAccessToken: verify, createEvent: vi.fn(), issueRegistrationCredential: issue });
    issue.mockResolvedValue({ ...issued, ...{ tokenHash: "private-hash", attendee: "private-person" } });
    await app.inject({ method: "POST", url, headers });
    await app.inject({ method: "POST", url: url + "?token=private-query", headers });
    await app.inject({ method: "POST", url, headers, payload: "private-body" });
    issue.mockRejectedValue(new Error("original-secret")); await app.inject({ method: "POST", url, headers });
    verify.mockRejectedValue(new Error("verifier-secret")); await app.inject({ method: "POST", url, headers });
    await app.close(); const logs = chunks.join("");
    expect(logs).toContain("CREDENTIAL_ISSUANCE_FAILED"); expect(logs).toContain("AUTHENTICATION_SERVICE_ERROR");
    for (const secret of [issued.token, "sensitive-bearer", "private-", "original-secret", "verifier-secret", url]) expect(logs).not.toContain(secret);
  });
});
