import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z, ZodError } from "zod";
import { createAuthGuard, type AccessTokenVerifier } from "../../auth/http-auth.js";
import { AuthenticationError, AuthorizationError, type AuthenticatedUser } from "../../auth/verify-access-token.js";
import { parseEventId, parseEventListInput } from "./event-query-input.js";
import { EventNotFoundError, type OperatorEventPage, type OperatorEvent } from "./query-events-for-operator.js";

export interface OperatorEventQueryOperations {
  list: (input: unknown, actor: AuthenticatedUser) => Promise<OperatorEventPage>;
  get: (eventId: string, actor: AuthenticatedUser) => Promise<OperatorEvent>;
}

function serialize(event: OperatorEvent) {
  return {
    id: event.id, name: event.name,
    startsAt: event.startsAt.toISOString(), endsAt: event.endsAt.toISOString(),
    timezone: event.timezone, location: event.location, status: event.status,
  };
}

function queryError(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof AuthenticationError) {
    return reply.header("WWW-Authenticate", "Bearer").code(401).send({
      code: "UNAUTHORIZED", message: "Se requiere un token de acceso válido.",
    });
  }
  if (error instanceof AuthorizationError) {
    return reply.code(403).send({
      code: "FORBIDDEN", message: "No tienes los permisos necesarios para esta operación.",
    });
  }
  if (error instanceof ZodError) {
    return reply.code(400).send({
      code: "INVALID_EVENT_QUERY", message: "Los parámetros de consulta no son válidos.",
    });
  }
  if (error instanceof EventNotFoundError) {
    return reply.code(404).send({ code: "EVENT_NOT_FOUND", message: "No se encontró el evento." });
  }
  request.log.error({ code: "OPERATOR_EVENT_QUERY_FAILED" }, "No se pudieron consultar los eventos.");
  return reply.code(500).send({
    code: "INTERNAL_SERVER_ERROR", message: "No se pudieron consultar los eventos. Inténtalo más tarde.",
  });
}

export function registerOperatorEventQueryRoutes(
  app: FastifyInstance,
  verifyAccessToken: AccessTokenVerifier,
  operations: OperatorEventQueryOperations,
): void {
  app.get("/api/v1/operator/events", {
    exposeHeadRoute: false,
    onRequest: createAuthGuard(verifyAccessToken, ["checkin_operator"]),
  }, async (request, reply) => {
    try {
      if (request.headers["transfer-encoding"] !== undefined ||
          (request.headers["content-length"] !== undefined && request.headers["content-length"] !== "0")) {
        return reply.code(400).send({ code: "INVALID_EVENT_QUERY", message: "Los parámetros de consulta no son válidos." });
      }
      const actor = request.authenticatedUser;
      if (!actor) throw new AuthenticationError();
      parseEventListInput(request.query);
      const page = await operations.list(request.query, actor);
      return reply.code(200).send({ items: page.items.map(serialize), nextCursor: page.nextCursor });
    } catch (error) { return queryError(error, request, reply); }
  });

  app.get<{ Params: { eventId: string } }>("/api/v1/operator/events/:eventId", {
    exposeHeadRoute: false,
    onRequest: createAuthGuard(verifyAccessToken, ["checkin_operator"]),
  }, async (request, reply) => {
    try {
      if (request.headers["transfer-encoding"] !== undefined ||
          (request.headers["content-length"] !== undefined && request.headers["content-length"] !== "0")) {
        return reply.code(400).send({ code: "INVALID_EVENT_QUERY", message: "Los parámetros de consulta no son válidos." });
      }
      const actor = request.authenticatedUser;
      if (!actor) throw new AuthenticationError();
      z.strictObject({}).parse(request.query);
      const id = parseEventId(request.params.eventId);
      return reply.code(200).send(serialize(await operations.get(id, actor)));
    } catch (error) { return queryError(error, request, reply); }
  });
}
