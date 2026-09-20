import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z, ZodError } from "zod";
import { createAuthGuard, type AccessTokenVerifier } from "../../auth/http-auth.js";
import { AuthenticationError, AuthorizationError, type AuthenticatedUser } from "../../auth/verify-access-token.js";
import { EventNotFoundError } from "../events/query-events-for-organizer.js";
import { parseRegistrationEventId, parseRegistrationId, parseRegistrationListInput } from "./registration-query-input.js";
import { RegistrationNotFoundError, type QueriedRegistration, type RegistrationPage } from "./query-registrations-for-organizer.js";

export interface RegistrationQueryOperations {
  list: (eventId: string, input: unknown, actor: AuthenticatedUser) => Promise<RegistrationPage>;
  get: (eventId: string, registrationId: string, actor: AuthenticatedUser) => Promise<QueriedRegistration>;
}

function serialize(value: QueriedRegistration) {
  return { id: value.id, eventId: value.eventId, status: value.status, source: value.source,
    createdAt: value.createdAt.toISOString(),
    attendee: { id: value.attendee.id, fullName: value.attendee.fullName, email: value.attendee.email } };
}

function queryError(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof AuthenticationError) return reply.header("WWW-Authenticate", "Bearer").code(401).send({
    code: "UNAUTHORIZED", message: "Se requiere un token de acceso válido.",
  });
  if (error instanceof AuthorizationError) return reply.code(403).send({
    code: "FORBIDDEN", message: "No tienes los permisos necesarios para esta operación.",
  });
  if (error instanceof ZodError) return reply.code(400).send({
    code: "INVALID_REGISTRATION_QUERY", message: "Los parámetros de consulta no son válidos.",
  });
  if (error instanceof EventNotFoundError) return reply.code(404).send({
    code: "EVENT_NOT_FOUND", message: "No se encontró el evento.",
  });
  if (error instanceof RegistrationNotFoundError) return reply.code(404).send({
    code: "REGISTRATION_NOT_FOUND", message: "No se encontró la inscripción.",
  });
  request.log.error({ code: "REGISTRATION_QUERY_FAILED" }, "No se pudieron consultar las inscripciones.");
  return reply.code(500).send({ code: "INTERNAL_SERVER_ERROR", message: "No se pudieron consultar las inscripciones. Inténtalo más tarde." });
}

export function registerRegistrationQueryRoutes(app: FastifyInstance, verifyAccessToken: AccessTokenVerifier,
  operations: RegistrationQueryOperations): void {
  app.get<{ Params: { eventId: string } }>("/api/v1/events/:eventId/registrations", {
    onRequest: createAuthGuard(verifyAccessToken, ["organizer"]),
  }, async (request, reply) => {
    try {
      const actor = request.authenticatedUser;
      if (!actor) throw new AuthenticationError();
      const eventId = parseRegistrationEventId(request.params.eventId);
      parseRegistrationListInput(eventId, request.query);
      const page = await operations.list(eventId, request.query, actor);
      return reply.code(200).send({ items: page.items.map(serialize), nextCursor: page.nextCursor });
    } catch (error) { return queryError(error, request, reply); }
  });
  app.get<{ Params: { eventId: string; registrationId: string } }>("/api/v1/events/:eventId/registrations/:registrationId", {
    onRequest: createAuthGuard(verifyAccessToken, ["organizer"]),
  }, async (request, reply) => {
    try {
      const actor = request.authenticatedUser;
      if (!actor) throw new AuthenticationError();
      z.strictObject({}).parse(request.query);
      const eventId = parseRegistrationEventId(request.params.eventId);
      const id = parseRegistrationId(request.params.registrationId);
      return reply.code(200).send(serialize(await operations.get(eventId, id, actor)));
    } catch (error) { return queryError(error, request, reply); }
  });
}
