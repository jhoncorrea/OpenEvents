import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";
import type { AccessTokenVerifier } from "../../auth/http-auth.js";
import { AuthenticationError, AuthorizationError, type AuthenticatedUser } from "../../auth/verify-access-token.js";
import { EventNotFoundError } from "./query-events-for-organizer.js";
import type { AttendanceSummaryOperation } from "./attendance-summary-routes.js";

const id = "a4444444-4444-4444-8444-444444444444";
const url = `/api/v1/events/${id}/attendance-summary`;
const actor: AuthenticatedUser = { tenantId: id, objectId: id, subject: "private", roles: ["organizer"] };
const summary = { eventId: id, registered: 5, confirmed: 4, cancelled: 1, checkedIn: 3, cancelledCheckedIn: 1, pending: 2,
  observedAt: new Date("2026-09-26T16:00:00.000Z") };
const headers = { authorization: "Bearer secret-token" };
describe("attendance summary HTTP", () => {
  let app: ReturnType<typeof buildApp>;
  let verify: ReturnType<typeof vi.fn<AccessTokenVerifier>>;
  let summarize: ReturnType<typeof vi.fn<AttendanceSummaryOperation>>;
  beforeEach(() => {
    verify = vi.fn<AccessTokenVerifier>().mockResolvedValue(actor);
    summarize = vi.fn<AttendanceSummaryOperation>().mockResolvedValue(summary);
    app = buildApp({ verifyAccessToken: verify, createEvent: vi.fn(), attendanceSummary: summarize });
  });
  afterEach(async () => { await app.close(); vi.restoreAllMocks(); });
  it.each(["organizer", "checkin_operator"] as const)("reads as %s using verified identity", async role => {
    const user = { ...actor, roles: [role] }; verify.mockResolvedValue(user);
    const response = await app.inject({ url: url.replace(id, id.toUpperCase()), headers });
    expect(response.statusCode).toBe(200); expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual({ ...summary, observedAt: summary.observedAt.toISOString() });
    expect(summarize).toHaveBeenCalledExactlyOnceWith(id, user); expect(verify).toHaveBeenCalledExactlyOnceWith("secret-token");
  });
  it("authenticates before validating input", async () => {
    const response = await app.inject({ url: url.replace(id, "bad") + "?actor=private" });
    expect(response.statusCode).toBe(401); expect(response.headers["www-authenticate"]).toBe("Bearer");
    expect(response.headers["cache-control"]).toBe("no-store"); expect(summarize).not.toHaveBeenCalled();
  });
  it.each([{ roles: [] }, { roles: ["admin"] }] as { roles: AuthenticatedUser["roles"] }[])("does not allow roles $roles", async ({ roles }) => {
    verify.mockResolvedValue({ ...actor, roles });
    const response = await app.inject({ url, headers }); expect(response.statusCode).toBe(403);
    expect(response.headers["cache-control"]).toBe("no-store"); expect(summarize).not.toHaveBeenCalled();
  });
  it.each(["?limit=1", "?eventId=private", "?status=confirmed", "?x=1&x=2", "?actor=admin"])("rejects extra query %s", async suffix => {
    const response = await app.inject({ url: url + suffix, headers }); expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("INVALID_ATTENDANCE_SUMMARY_QUERY"); expect(response.headers["cache-control"]).toBe("no-store"); expect(summarize).not.toHaveBeenCalled();
  });
  it("rejects an invalid event ID", async () => {
    const response = await app.inject({ url: url.replace(id, "invalid"), headers });
    expect(response.statusCode).toBe(400); expect(summarize).not.toHaveBeenCalled();
  });
  it("rejects a GET body", async () => {
    const response = await app.inject({ url, headers: { ...headers, "content-length": "3" }, payload: "abc" });
    expect(response.statusCode).toBe(400); expect(response.headers["cache-control"]).toBe("no-store"); expect(summarize).not.toHaveBeenCalled();
  });
  it.each([
    [new AuthenticationError(), 401], [new AuthorizationError(), 403], [new EventNotFoundError(), 404],
    [new Error("secret SQL"), 500], [Object.assign(new Error("secret detail"), { statusCode: 418 }), 500],
  ] as const)("maps an operation failure to %s / %s", async (error, status) => {
    summarize.mockRejectedValue(error); const response = await app.inject({ url, headers });
    expect(response.statusCode).toBe(status); expect(response.headers["cache-control"]).toBe("no-store"); expect(response.body).not.toContain("secret");
  });
  it.each([new AuthenticationError(), new Error("secret-verifier")])("handles verifier failure without invoking operation", async error => {
    verify.mockRejectedValue(error); const response = await app.inject({ url, headers });
    expect(response.statusCode).toBe(error instanceof AuthenticationError ? 401 : 500);
    expect(response.headers["cache-control"]).toBe("no-store"); expect(response.body).not.toContain("secret"); expect(summarize).not.toHaveBeenCalled();
  });
  it("does not treat invalid operation output as a client error or empty result", async () => {
    summarize.mockResolvedValue({ ...summary, pending: -1 }); const response = await app.inject({ url, headers });
    expect(response.statusCode).toBe(500); expect(response.json().code).toBe("INTERNAL_SERVER_ERROR");
  });
  it("strips private fields", async () => {
    summarize.mockResolvedValue({ ...summary, ...{ performedBy: "private-operator", token: "private-token" } });
    const response = await app.inject({ url, headers }); expect(response.statusCode).toBe(200); expect(response.body).not.toContain("private");
  });
  it.each(["HEAD", "POST", "PATCH"] as const)("does not calculate through %s", async method => {
    const response = await app.inject({ method, url, headers }); expect(response.statusCode).toBe(404); expect(summarize).not.toHaveBeenCalled();
  });
  it("allows the existing CORS preflight without calculating", async () => {
    const response = await app.inject({ method: "OPTIONS", url, headers: { origin: "http://localhost:5173", "access-control-request-method": "GET", "access-control-request-headers": "authorization" } });
    expect(response.statusCode).toBe(204); expect(summarize).not.toHaveBeenCalled();
  });
  it("logs a fixed code without identity, URL, response or original exception", async () => {
    await app.close(); const chunks: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation(chunk => { chunks.push(String(chunk)); return true; });
    app = buildApp({ logger: true, verifyAccessToken: verify, createEvent: vi.fn(), attendanceSummary: summarize });
    await app.inject({ url, headers }); summarize.mockRejectedValue(new Error("secret-exception")); await app.inject({ url, headers });
    await app.inject({ url: url + "?private-query=true", headers }); await app.close();
    const logs = chunks.join(""); expect(logs).toContain("ATTENDANCE_SUMMARY_FAILED");
    for (const secret of ["secret-token", "secret-exception", "private", id, "2026-09-26T16:00:00.000Z"]) expect(logs).not.toContain(secret);
  });
});
