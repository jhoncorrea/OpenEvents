import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z, ZodError } from "zod";
import { createAuthGuard, type AccessTokenVerifier } from "../../auth/http-auth.js";
import { AuthenticationError, AuthorizationError, type AuthenticatedUser } from "../../auth/verify-access-token.js";
import { EventNotFoundError } from "../events/query-events-for-organizer.js";
import { RegistrationCsvValidationError } from "./import-registration-csv-for-organizer.js";
import { EventRegistrationNotAllowedError, RegistrationEmailConflictError } from "./register-attendee-for-organizer.js";
import { RegistrationCsvKeyConflictError, type RegistrationCsvLookup, type RegistrationCsvReceipt } from "./registration-csv-idempotency.js";
import { REGISTRATION_CSV_LIMITS } from "./validate-registration-csv.js";

export interface RegistrationCsvOperations {
  import: (eventId: string, key: string, bytes: Uint8Array, actor: AuthenticatedUser) => Promise<RegistrationCsvReceipt>;
  get: (eventId: string, key: string, actor: AuthenticatedUser) => Promise<RegistrationCsvLookup>;
}
const uuid = z.string().uuid().transform(value => value.toLowerCase());
type Params = { eventId: string };
function input(request: FastifyRequest<{ Params: Params }>) {
  z.strictObject({}).parse(request.query);
  return { eventId: uuid.parse(request.params.eventId), key: uuid.parse(request.headers["idempotency-key"]) };
}
function serialize(receipt: RegistrationCsvReceipt) {
  return { importId: receipt.importId, completedAt: receipt.completedAt.toISOString(), result: {
    eventId: receipt.result.eventId, count: receipt.result.count,
    items: receipt.result.items.map(item => ({ id: item.id, eventId: item.eventId, status: item.status,
      source: item.source, createdAt: item.createdAt.toISOString(),
      attendee: { id: item.attendee.id, fullName: item.attendee.fullName, email: item.attendee.email } })),
  } };
}
function fail(reply: FastifyReply, status: number, code: string, message: string) {
  return reply.header("Cache-Control", "no-store").code(status).send({ code, message });
}
function handleError(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof AuthenticationError) return fail(reply.header("WWW-Authenticate", "Bearer"), 401, "UNAUTHORIZED", "Se requiere un token de acceso válido.");
  if (error instanceof AuthorizationError) return fail(reply, 403, "FORBIDDEN", "No tienes los permisos necesarios para esta operación.");
  if (error instanceof EventNotFoundError) return fail(reply, 404, "EVENT_NOT_FOUND", "No se encontró el evento.");
  if (error instanceof ZodError) return fail(reply, 400, "INVALID_REGISTRATION_CSV_REQUEST", "Los parámetros de importación no son válidos.");
  if (error instanceof RegistrationCsvKeyConflictError) return fail(reply, 409, "REGISTRATION_CSV_KEY_CONFLICT", "La clave de importación ya se utilizó con otro contenido.");
  if (error instanceof RegistrationEmailConflictError) return fail(reply, 409, "REGISTRATION_EMAIL_CONFLICT", "Ya existe una inscripción con ese correo en el evento.");
  if (error instanceof EventRegistrationNotAllowedError) return fail(reply, 409, "EVENT_REGISTRATION_NOT_ALLOWED", "El evento no admite nuevas inscripciones.");
  if (error instanceof RegistrationCsvValidationError) {
    if (error.result.errors.some(item => item.code === "FILE_TOO_LARGE")) return fail(reply, 413, "PAYLOAD_TOO_LARGE", "El archivo supera el límite de tamaño.");
    return reply.code(400).send({ code: "INVALID_REGISTRATION_CSV", message: "El archivo CSV no es válido.",
      errors: error.result.errors.slice(0, REGISTRATION_CSV_LIMITS.errors).map(item => ({
        code: item.code, message: item.message, record: item.record, line: item.line,
        field: item.field, firstRecord: item.firstRecord,
      })), truncated: error.result.truncated || error.result.errors.length > REGISTRATION_CSV_LIMITS.errors });
  }
  const code = (error as { code?: string } | null)?.code;
  if (code === "FST_ERR_CTP_BODY_TOO_LARGE") return fail(reply, 413, "PAYLOAD_TOO_LARGE", "El archivo supera el límite de tamaño.");
  if (code === "FST_ERR_CTP_INVALID_CONTENT_LENGTH") return fail(reply, 400, "INVALID_REGISTRATION_CSV_REQUEST", "La longitud del cuerpo no es válida.");
  // Nunca registrar el error original, cuerpo, clave ni comprobante.
  request.log.error({ code: "REGISTRATION_CSV_FAILED" }, "No se pudo completar la operación CSV.");
  return fail(reply, 500, "INTERNAL_SERVER_ERROR", "No se pudo completar la operación CSV. Inténtalo más tarde.");
}

export function registerRegistrationCsvRoutes(app: FastifyInstance, verify: AccessTokenVerifier, operations: RegistrationCsvOperations): void {
  // Encapsular el parser evita cambiar JSON o text/plain en las rutas existentes.
  app.register(async scoped => {
    scoped.removeAllContentTypeParsers();
    scoped.addContentTypeParser("*", { parseAs: "buffer" }, (_request, body, done) => done(null, body));
    const guard = createAuthGuard(verify, ["organizer"]);
    const onRequest = async (request: FastifyRequest<{ Params: Params }>, reply: FastifyReply) => {
      await guard(request, reply);
      if (reply.sent) return;
      input(request);
      if (request.method === "POST") {
        const media = request.headers["content-type"];
        if (typeof media !== "string" || !/^text\/csv(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(media)
          || request.headers["content-encoding"] !== undefined) {
          return fail(reply, 415, "UNSUPPORTED_MEDIA_TYPE", "Envía text/csv en UTF-8 sin Content-Encoding.");
        }
      } else if (request.headers["transfer-encoding"] !== undefined
        || (request.headers["content-length"] !== undefined && request.headers["content-length"] !== "0")) {
        return fail(reply, 400, "INVALID_REGISTRATION_CSV_REQUEST", "La consulta no admite cuerpo.");
      }
    };
    const url = "/api/v1/events/:eventId/registrations/imports";
    scoped.post<{ Params: Params }>(url, { onRequest, bodyLimit: REGISTRATION_CSV_LIMITS.bytes, errorHandler: handleError }, async (request, reply) => {
      const { eventId, key } = input(request);
      const actor = request.authenticatedUser;
      if (!actor) throw new AuthenticationError();
      const bytes = request.body === undefined ? Buffer.alloc(0) : request.body;
      if (!Buffer.isBuffer(bytes)) return fail(reply, 400, "INVALID_REGISTRATION_CSV_REQUEST", "El cuerpo debe ser un archivo CSV.");
      // El servicio no distingue creación de replay. 200 expresa resultado confirmado en ambos.
      const receipt = await operations.import(eventId, key, bytes, actor);
      return reply.code(200).send({ status: "completed", receipt: serialize(receipt) });
    });
    scoped.get<{ Params: Params }>(url, { onRequest, errorHandler: handleError }, async (request, reply) => {
      const { eventId, key } = input(request);
      const actor = request.authenticatedUser;
      if (!actor) throw new AuthenticationError();
      const found = await operations.get(eventId, key, actor);
      return reply.code(200).send(found.status === "completed"
        ? { status: "completed", receipt: serialize(found.receipt) } : { status: "not_observed" });
    });
  });
}
