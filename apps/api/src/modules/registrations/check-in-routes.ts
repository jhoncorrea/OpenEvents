import type { FastifyInstance } from "fastify";
import { z, ZodError } from "zod";
import { createAuthGuard, type AccessTokenVerifier } from "../../auth/http-auth.js";
import { AuthenticationError, AuthorizationError, type AuthenticatedUser } from "../../auth/verify-access-token.js";
import { EventNotFoundError } from "../events/query-events-for-organizer.js";
import { parseRegistrationEventId } from "./registration-query-input.js";
import { checkInSourceSchema } from "./check-in-input.js";
import { CheckInNotAllowedError, type PersistedCheckInResult } from "./register-check-in-for-operator.js";

export type CheckInOperation = (eventId: string, code: string, source: "manual" | "qr", actor: AuthenticatedUser) => Promise<PersistedCheckInResult>;
const bodySchema = z.strictObject({ code: z.string().max(256), source: checkInSourceSchema });
const jsonType = /^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i;

export function registerCheckInRoutes(app: FastifyInstance, verify: AccessTokenVerifier, checkIn: CheckInOperation): void {
  app.post<{ Params: { eventId: string } }>("/api/v1/events/:eventId/check-ins", {
    onRequest: createAuthGuard(verify, ["checkin_operator"]),
    bodyLimit: 1024,
    async preParsing(request, reply, payload) {
      if (!jsonType.test(request.headers["content-type"] ?? "")) {
        return reply.code(415).send({ code: "UNSUPPORTED_MEDIA_TYPE", message: "Envía JSON con codificación UTF-8." });
      }
      return payload;
    },
    errorHandler(error, request, reply) {
      reply.header("Cache-Control", "no-store");
      if (error instanceof AuthenticationError) return reply.header("WWW-Authenticate", "Bearer").code(401)
        .send({ code: "UNAUTHORIZED", message: "Se requiere un token de acceso válido." });
      if (error instanceof AuthorizationError) return reply.code(403)
        .send({ code: "FORBIDDEN", message: "No tienes los permisos necesarios para esta operación." });
      if (error instanceof EventNotFoundError) return reply.code(404)
        .send({ code: "EVENT_NOT_FOUND", message: "No se encontró el evento." });
      if (error instanceof CheckInNotAllowedError) return reply.code(409)
        .send({ code: "CHECK_IN_NOT_ALLOWED", message: "El evento no está activo para registrar ingresos." });
      const parserCode = (error as { code?: string }).code;
      if (error instanceof ZodError || ["FST_ERR_CTP_INVALID_CONTENT_LENGTH", "FST_ERR_CTP_EMPTY_JSON_BODY", "FST_ERR_CTP_INVALID_JSON_BODY"].includes(parserCode ?? "")) return reply.code(400)
        .send({ code: "INVALID_CHECK_IN_INPUT", message: "La solicitud de ingreso no es válida." });
      if (parserCode === "FST_ERR_CTP_BODY_TOO_LARGE") return reply.code(413)
        .send({ code: "PAYLOAD_TOO_LARGE", message: "La solicitud de ingreso excede el tamaño permitido." });
      if (parserCode === "FST_ERR_CTP_INVALID_MEDIA_TYPE") return reply.code(415)
        .send({ code: "UNSUPPORTED_MEDIA_TYPE", message: "Envía JSON con codificación UTF-8." });
      request.log.error({ code: "CHECK_IN_FAILED" }, "No se pudo confirmar el ingreso.");
      return reply.code(500).send({ code: "INTERNAL_SERVER_ERROR", message: "No se pudo confirmar el ingreso." });
    },
  }, async (request, reply) => {
    const actor = request.authenticatedUser;
    if (!actor) throw new AuthenticationError();
    z.strictObject({}).parse(request.query);
    const eventId = parseRegistrationEventId(request.params.eventId);
    const { code, source } = bodySchema.parse(request.body);
    const result = await checkIn(eventId, code, source, actor);
    if (result.status === "invalid") return reply.code(404).send({ status: "invalid" });
    const saved = result.checkIn;
    return reply.code(result.status === "accepted" ? 201 : 409).send({ status: result.status,
      checkIn: { id: saved.id, registrationId: saved.registrationId, checkedInAt: saved.checkedInAt.toISOString(), source: saved.source } });
  });
}
