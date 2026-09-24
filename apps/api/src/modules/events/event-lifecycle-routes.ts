import type { FastifyInstance } from "fastify";
import { z, ZodError } from "zod";
import { createAuthGuard, type AccessTokenVerifier } from "../../auth/http-auth.js";
import { AuthenticationError, AuthorizationError, type AuthenticatedUser } from "../../auth/verify-access-token.js";
import { EventNotFoundError, type QueriedEvent } from "./query-events-for-organizer.js";
import { parseEventId } from "./event-query-input.js";
import { parseEventLifecycleInput } from "./event-lifecycle-input.js";
import { EventTransitionNotAllowedError, EventLifecycleVersionConflictError } from "./change-event-state-for-organizer.js";

export type EventLifecycleOperation = (eventId: string, input: { expectedVersion: number }, actor: AuthenticatedUser) => Promise<QueriedEvent>;
export interface EventLifecycleOperations { activate: EventLifecycleOperation; close: EventLifecycleOperation }
const jsonType = /^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i;

export function registerEventLifecycleRoutes(app: FastifyInstance, verify: AccessTokenVerifier, operations: EventLifecycleOperations): void {
  for (const action of ["activate", "close"] as const) {
  app.post<{ Params: { eventId: string } }>(`/api/v1/events/:eventId/${action}`, {
    onRequest: createAuthGuard(verify, ["organizer"]),
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
      if (error instanceof EventTransitionNotAllowedError) return reply.code(409)
        .send({ code: "EVENT_TRANSITION_NOT_ALLOWED", message: "El estado actual no permite esta transición." });
      if (error instanceof EventLifecycleVersionConflictError) return reply.code(409)
        .send({ code: "EVENT_VERSION_CONFLICT", message: "El evento cambió. Consulta su versión actual antes de continuar." });
      const parserCode = (error as { code?: string }).code;
      if (error instanceof ZodError || ["FST_ERR_CTP_INVALID_CONTENT_LENGTH", "FST_ERR_CTP_EMPTY_JSON_BODY", "FST_ERR_CTP_INVALID_JSON_BODY"].includes(parserCode ?? "")) return reply.code(400)
        .send({ code: "INVALID_EVENT_LIFECYCLE_INPUT", message: "La solicitud de cambio de estado no es válida." });
      if (parserCode === "FST_ERR_CTP_BODY_TOO_LARGE") return reply.code(413)
        .send({ code: "PAYLOAD_TOO_LARGE", message: "La solicitud de cambio de estado excede el tamaño permitido." });
      if (parserCode === "FST_ERR_CTP_INVALID_MEDIA_TYPE") return reply.code(415)
        .send({ code: "UNSUPPORTED_MEDIA_TYPE", message: "Envía JSON con codificación UTF-8." });
      request.log.error({ code: "EVENT_LIFECYCLE_FAILED" }, "No se pudo confirmar el cambio de estado del evento.");
      return reply.code(500).send({ code: "INTERNAL_SERVER_ERROR", message: "No se pudo confirmar el cambio de estado del evento." });
    },
  }, async (request, reply) => {
    const actor = request.authenticatedUser;
    if (!actor) throw new AuthenticationError();
    z.strictObject({}).parse(request.query);
    const eventId = parseEventId(request.params.eventId);
    const input = parseEventLifecycleInput(request.body);
    const event = await operations[action](eventId, input, actor);
    return reply.code(200).send({
      id: event.id, name: event.name, slug: event.slug,
      startsAt: event.startsAt.toISOString(), endsAt: event.endsAt.toISOString(),
      timezone: event.timezone, location: event.location, status: event.status,
      createdAt: event.createdAt.toISOString(), version: event.version,
    });
  });
  }
}
