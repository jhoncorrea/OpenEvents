import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";
import { AuthenticationError, AuthorizationError, type AuthenticatedUser } from "../../auth/verify-access-token.js";
import { EventNotFoundError } from "../events/query-events-for-organizer.js";
import { RegistrationCsvValidationError } from "./import-registration-csv-for-organizer.js";
import { EventRegistrationNotAllowedError, RegistrationEmailConflictError } from "./register-attendee-for-organizer.js";
import { RegistrationCsvKeyConflictError, RegistrationCsvStoredResultError, type RegistrationCsvReceipt } from "./registration-csv-idempotency.js";
import { type RegistrationCsvOperations } from "./registration-csv-routes.js";
import { validateRegistrationCsv } from "./validate-registration-csv.js";

const id = "a3333333-3333-4333-8333-333333333333", key = "b4444444-4444-4444-8444-444444444444";
const actor: AuthenticatedUser = { tenantId: id, objectId: key, subject: "verified", roles: ["organizer"] };
const url = `/api/v1/events/${id}/registrations/imports`;
const headers = { authorization: "Bearer test", "idempotency-key": key, "content-type": "text/csv" };
const payload = Buffer.from("\ufefffullName,email\r\nPersona,persona@example.invalid\r\n");
const receipt: RegistrationCsvReceipt = { importId: key, completedAt: new Date("2026-09-21T12:00:00Z"), result: {
  eventId: id, count: 1, items: [{ id: key, eventId: id, status: "confirmed", source: "csv", createdAt: new Date("2026-09-21T12:00:00Z"),
    attendee: { id: key, fullName: "Persona", email: "persona@example.invalid" } }],
} };
describe("CSV HTTP adapter", () => {
  let app: ReturnType<typeof buildApp>;
  let run: ReturnType<typeof vi.fn<RegistrationCsvOperations["import"]>>;
  let get: ReturnType<typeof vi.fn<RegistrationCsvOperations["get"]>>;
  let verify: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    run = vi.fn<RegistrationCsvOperations["import"]>().mockResolvedValue(receipt);
    get = vi.fn<RegistrationCsvOperations["get"]>().mockResolvedValue({ status: "completed", receipt });
    verify = vi.fn().mockResolvedValue(actor);
    app = buildApp({ verifyAccessToken: verify, createEvent: vi.fn(), registrationCsv: { import: run, get } });
  });
  afterEach(async () => { await app.close(); });
  it("preserves BOM and CRLF bytes, normalizes IDs and forwards verified identity", async () => {
    const r = await app.inject({ method: "POST", url: url.replace(id, id.toUpperCase()), headers: { ...headers, "idempotency-key": key.toUpperCase() }, payload });
    expect(r.statusCode).toBe(200); expect(r.headers["cache-control"]).toBe("no-store");
    expect(run).toHaveBeenCalledExactlyOnceWith(id, key, payload, actor);
    expect(r.json()).toEqual(JSON.parse(JSON.stringify({ status: "completed", receipt })));
  });
  it("returns the same shape for lookup and does not expose extra receipt fields", async () => {
    get.mockResolvedValue({ status: "completed", receipt: { ...receipt, ...{ contentHash: "private", requestedBy: "private" } } });
    const r = await app.inject({ url, headers });
    expect(r.statusCode).toBe(200); expect(r.json()).toEqual(JSON.parse(JSON.stringify({ status: "completed", receipt })));
    expect(get).toHaveBeenCalledExactlyOnceWith(id, key, actor); expect(run).not.toHaveBeenCalled();
  });
  it("returns not_observed without declaring failure", async () => {
    get.mockResolvedValue({ status: "not_observed" });
    const r = await app.inject({ url, headers });
    expect(r.statusCode).toBe(200); expect(r.json()).toEqual({ status: "not_observed" });
  });
  it.each(["GET", "POST"] as const)("authenticates before input parsing: %s", async method => {
    const r = await app.inject({ method, url, headers: { "content-type": "application/json" }, ...(method === "POST" ? { payload: "{" } : {}) });
    expect(r.statusCode).toBe(401); expect(r.headers["www-authenticate"]).toBe("Bearer");
    expect(r.headers["cache-control"]).toBe("no-store"); expect(run).not.toHaveBeenCalled(); expect(get).not.toHaveBeenCalled();
  });
  it.each([{ roles: [] }, { roles: ["admin"] }, { roles: ["checkin_operator"] }])("rejects global roles $roles", async ({ roles }) => {
    verify.mockResolvedValue({ ...actor, roles });
    expect((await app.inject({ method: "POST", url, headers, payload })).statusCode).toBe(403);
    expect(run).not.toHaveBeenCalled();
  });
  it.each([undefined, "bad", `${key}, ${key}`])("rejects invalid or duplicate key %s", async value => {
    const h: Record<string, string> = { ...headers };
    if (value === undefined) delete h["idempotency-key"]; else h["idempotency-key"] = value;
    const r = await app.inject({ method: "POST", url, headers: h, payload });
    expect(r.statusCode).toBe(400); expect(run).not.toHaveBeenCalled();
  });
  it.each(["?limit=1", "?actor=admin", "?key=secret"]) ("rejects query parameters %s", async suffix => {
    expect((await app.inject({ url: url + suffix, headers })).statusCode).toBe(400); expect(get).not.toHaveBeenCalled();
  });
  it("rejects malformed event UUID", async () => {
    expect((await app.inject({ url: url.replace(id, "bad"), headers })).statusCode).toBe(400); expect(get).not.toHaveBeenCalled();
  });
  it.each([undefined, "application/json", "text/plain", "multipart/form-data; boundary=x", "text/csv; charset=utf-16", "text/csv; charset=utf-8; x=y"])("rejects media %s", async media => {
    const r = await app.inject({ method: "POST", url, headers: { ...headers, "content-type": media }, payload });
    expect(r.statusCode).toBe(415); expect(run).not.toHaveBeenCalled();
  });
  it.each(["text/csv", "text/csv; charset=utf-8", 'TEXT/CSV; charset="UTF-8"'])("accepts media %s", async media => {
    expect((await app.inject({ method: "POST", url, headers: { ...headers, "content-type": media }, payload })).statusCode).toBe(200);
  });
  it("rejects encoded bodies", async () => {
    expect((await app.inject({ method: "POST", url, headers: { ...headers, "content-encoding": "gzip" }, payload })).statusCode).toBe(415);
    expect(run).not.toHaveBeenCalled();
  });
  it("enforces byte limit before invoking import", async () => {
    const r = await app.inject({ method: "POST", url, headers, payload: Buffer.alloc(1048577) });
    expect(r.statusCode).toBe(413); expect(r.json().code).toBe("PAYLOAD_TOO_LARGE"); expect(run).not.toHaveBeenCalled();
    expect(r.headers["cache-control"]).toBe("no-store");
  });
  it("passes exact limit without decoding", async () => {
    const bytes = Buffer.alloc(1048576, 255);
    expect((await app.inject({ method: "POST", url, headers, payload: bytes })).statusCode).toBe(200);
    expect(Buffer.from(run.mock.calls[0][2]).equals(bytes)).toBe(true);
  });
  it("passes empty input to domain validation", async () => {
    await app.inject({ method: "POST", url, headers }); expect(run.mock.calls[0][2]).toEqual(Buffer.alloc(0));
  });
  it("returns located CSV errors from the real validator without CSV data", async () => {
    const invalid = validateRegistrationCsv(Buffer.from("fullName,email\nPersona,invalid-secret"));
    if (invalid.valid) throw new Error("Expected invalid fixture");
    run.mockRejectedValue(new RegistrationCsvValidationError(invalid));
    const r = await app.inject({ method: "POST", url, headers, payload });
    expect(r.statusCode).toBe(400); expect(r.json()).toMatchObject({ code: "INVALID_REGISTRATION_CSV", truncated: false,
      errors: [{ code: "INVALID_EMAIL", record: 1, line: 2, field: "email" }] });
    expect(r.body).not.toContain("invalid-secret");
  });
  it.each([
    [new AuthenticationError(), 401, "UNAUTHORIZED"], [new AuthorizationError(), 403, "FORBIDDEN"],
    [new EventNotFoundError(), 404, "EVENT_NOT_FOUND"], [new RegistrationCsvKeyConflictError(), 409, "REGISTRATION_CSV_KEY_CONFLICT"],
    [new RegistrationEmailConflictError(), 409, "REGISTRATION_EMAIL_CONFLICT"], [new EventRegistrationNotAllowedError(), 409, "EVENT_REGISTRATION_NOT_ALLOWED"],
    [new RegistrationCsvStoredResultError(), 500, "INTERNAL_SERVER_ERROR"], [new Error("SQL private secret"), 500, "INTERNAL_SERVER_ERROR"],
  ])("maps domain failure %s", async (error, status, code) => {
    run.mockRejectedValue(error); get.mockRejectedValue(error);
    for (const method of ["POST", "GET"] as const) {
      const r = await app.inject({ method, url, headers, ...(method === "POST" ? { payload } : {}) });
      expect(r.statusCode).toBe(status); expect(r.json().code).toBe(code); expect(r.headers["cache-control"]).toBe("no-store");
      expect(r.body).not.toContain("private");
    }
  });
  it("does not change the JSON parser of other routes", async () => {
    const r = await app.inject({ method: "POST", url: "/api/check-ins", payload: { code: "invalid" } });
    expect(r.statusCode).toBe(404); expect(r.json().status).toBe("invalid");
  });
  it("allows browser preflight for the key header", async () => {
    const r = await app.inject({ method: "OPTIONS", url, headers: { origin: "http://localhost:5173", "access-control-request-method": "POST",
      "access-control-request-headers": "authorization,content-type,idempotency-key" } });
    expect(r.statusCode).toBe(204); expect(r.headers["access-control-allow-headers"]).toContain("idempotency-key");
  });
  it.each([new AuthenticationError(), new AuthorizationError()])("rejects verifier failures before import: %s", async error => {
    verify.mockRejectedValue(error);
    const r = await app.inject({ method: "POST", url, headers, payload });
    expect(r.statusCode).toBe(error instanceof AuthenticationError ? 401 : 403); expect(run).not.toHaveBeenCalled();
  });
  it("rejects a GET body", async () => {
    const r = await app.inject({ url, headers: { ...headers, "content-length": "3" }, payload: "abc" });
    expect(r.statusCode).toBe(400); expect(get).not.toHaveBeenCalled();
  });
  it("sanitizes a mismatched content length", async () => {
    const r = await app.inject({ method: "POST", url, headers: { ...headers, "content-length": "1" }, payload });
    expect(r.statusCode).toBe(400); expect(run).not.toHaveBeenCalled(); expect(r.body).not.toContain("persona@example.invalid");
  });
  it("logs only a fixed code on unexpected failures", async () => {
    const log = vi.spyOn(app.log, "error"); run.mockRejectedValue(new Error("SQL password private"));
    await app.inject({ method: "POST", url, headers, payload });
    expect(log).toHaveBeenCalledExactlyOnceWith({ code: "REGISTRATION_CSV_FAILED" }, "No se pudo completar la operación CSV.");
  });
});
