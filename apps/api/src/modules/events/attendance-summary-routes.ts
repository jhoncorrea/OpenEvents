import type { FastifyInstance } from "fastify";
import { z, ZodError } from "zod";
import { createAuthGuard, type AccessTokenVerifier } from "../../auth/http-auth.js";
import { AuthenticationError, AuthorizationError, type AuthenticatedUser } from "../../auth/verify-access-token.js";
import { parseEventId } from "./event-query-input.js";
import { EventNotFoundError } from "./query-events-for-organizer.js";
import { serializeAttendanceSummary, type AttendanceSummary } from "./attendance-summary.js";

export type AttendanceSummaryOperation = (eventId: string, actor: AuthenticatedUser) => Promise<AttendanceSummary>;

export function registerAttendanceSummaryRoute(app: FastifyInstance, verify: AccessTokenVerifier,
  summarize: AttendanceSummaryOperation): void {
  app.get<{ Params: { eventId: string } }>("/api/v1/events/:eventId/attendance-summary", {
    exposeHeadRoute: false,
    onRequest: createAuthGuard(verify, ["organizer", "checkin_operator"]),
    onSend: async (_request, reply, payload) => { reply.header("Cache-Control", "no-store"); return payload; },
    errorHandler(error, request, reply) {
      reply.header("Cache-Control", "no-store");
      if (error instanceof AuthenticationError) return reply.header("WWW-Authenticate", "Bearer").code(401)
        .send({ code: "UNAUTHORIZED", message: "Se requiere un token de acceso válido." });
      if (error instanceof AuthorizationError) return reply.code(403)
        .send({ code: "FORBIDDEN", message: "No tienes los permisos necesarios para esta operación." });
      if (error instanceof EventNotFoundError) return reply.code(404)
        .send({ code: "EVENT_NOT_FOUND", message: "No se encontró el evento." });
      if (error instanceof ZodError) return reply.code(400)
        .send({ code: "INVALID_ATTENDANCE_SUMMARY_QUERY", message: "Los parámetros de consulta no son válidos." });
      request.log.error({ code: "ATTENDANCE_SUMMARY_FAILED" }, "No se pudo consultar el resumen de asistencia.");
      return reply.code(500).send({ code: "INTERNAL_SERVER_ERROR", message: "No se pudo consultar el resumen de asistencia." });
    },
  }, async (request, reply) => {
    const actor = request.authenticatedUser;
    if (!actor) throw new AuthenticationError();
    z.strictObject({}).parse(request.query);
    const eventId = parseEventId(request.params.eventId);
    if (request.headers["transfer-encoding"] !== undefined ||
      (request.headers["content-length"] !== undefined && request.headers["content-length"] !== "0")) {
      return reply.code(400).send({ code: "INVALID_ATTENDANCE_SUMMARY_QUERY", message: "La consulta no admite cuerpo." });
    }
    return reply.code(200).send(serializeAttendanceSummary(await summarize(eventId, actor), eventId));
  });
}
