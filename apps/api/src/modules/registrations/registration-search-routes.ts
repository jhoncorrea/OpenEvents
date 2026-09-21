import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { createAuthGuard, type AccessTokenVerifier } from "../../auth/http-auth.js";
import { AuthenticationError, AuthorizationError, type AuthenticatedUser } from "../../auth/verify-access-token.js";
import { EventNotFoundError } from "../events/query-events-for-organizer.js";
import type { RegistrationPage } from "./query-registrations-for-organizer.js";
import { parseRegistrationEventId } from "./registration-query-input.js";
import { parseRegistrationSearchInput } from "./registration-search-input.js";

export type RegistrationSearchOperation = (eventId: string, input: unknown, actor: AuthenticatedUser) => Promise<RegistrationPage>;

export function registerRegistrationSearchRoutes(app: FastifyInstance, verify: AccessTokenVerifier,
  search: RegistrationSearchOperation): void {
  app.get<{ Params: { eventId: string } }>("/api/v1/events/:eventId/registrations/search", {
    exposeHeadRoute: false,
    onRequest: createAuthGuard(verify, ["organizer", "checkin_operator"]),
    errorHandler(error, request, reply) {
      reply.header("Cache-Control", "no-store");
      if (error instanceof AuthenticationError) return reply.header("WWW-Authenticate", "Bearer").code(401)
        .send({ code: "UNAUTHORIZED", message: "Se requiere un token de acceso válido." });
      if (error instanceof AuthorizationError) return reply.code(403)
        .send({ code: "FORBIDDEN", message: "No tienes los permisos necesarios para esta operación." });
      if (error instanceof EventNotFoundError) return reply.code(404)
        .send({ code: "EVENT_NOT_FOUND", message: "No se encontró el evento." });
      if (error instanceof ZodError) return reply.code(400)
        .send({ code: "INVALID_REGISTRATION_SEARCH", message: "Los parámetros de búsqueda no son válidos." });
      request.log.error({ code: "REGISTRATION_SEARCH_FAILED" }, "No se pudo completar la búsqueda.");
      return reply.code(500).send({ code: "INTERNAL_SERVER_ERROR", message: "No se pudo completar la búsqueda." });
    },
  }, async (request, reply) => {
    const actor = request.authenticatedUser;
    if (!actor) throw new AuthenticationError();
    // GET no acepta cuerpo, ni siquiera si Fastify no lo analiza.
    if (request.headers["transfer-encoding"] !== undefined ||
      (request.headers["content-length"] !== undefined && request.headers["content-length"] !== "0")) {
      return reply.code(400).send({ code: "INVALID_REGISTRATION_SEARCH", message: "La búsqueda no admite cuerpo." });
    }
    const eventId = parseRegistrationEventId(request.params.eventId);
    parseRegistrationSearchInput(eventId, request.query);
    const page = await search(eventId, request.query, actor);
    return reply.code(200).send({ items: page.items.map(item => ({
      id: item.id, eventId: item.eventId, status: item.status, source: item.source,
      createdAt: item.createdAt.toISOString(),
      attendee: { id: item.attendee.id, fullName: item.attendee.fullName, email: item.attendee.email },
    })), nextCursor: page.nextCursor });
  });
}
