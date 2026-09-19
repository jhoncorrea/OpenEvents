import type { FastifyInstance } from "fastify";
import { z, ZodError } from "zod";
import { createAuthGuard, type AccessTokenVerifier } from "../../auth/http-auth.js";
import { AuthenticationError, AuthorizationError, type AuthenticatedUser } from "../../auth/verify-access-token.js";
import { EventSlugConflictError } from "./create-event.js";
import { parseEditEventInput } from "./edit-event-input.js";
import { EventNotEditableError, EventVersionConflictError } from "./edit-event-for-organizer.js";
import { parseEventId } from "./event-query-input.js";
import { EventNotFoundError, type QueriedEvent } from "./query-events-for-organizer.js";

export type EditEventOperation = (id: string, input: unknown, actor: AuthenticatedUser) => Promise<QueriedEvent>;

export function registerEventEditRoutes(
  app: FastifyInstance, verify: AccessTokenVerifier, edit: EditEventOperation,
): void {
  app.patch<{ Params: { eventId: string } }>("/api/v1/events/:eventId", {
    onRequest: createAuthGuard(verify, ["organizer"]),
  }, async (request, reply) => {
    try {
      const actor = request.authenticatedUser;
      if (!actor) throw new AuthenticationError();
      z.strictObject({}).parse(request.query);
      const id = parseEventId(request.params.eventId);
      parseEditEventInput(request.body);
      const event = await edit(id, request.body, actor);
      return reply.code(200).send({
        id: event.id, name: event.name, slug: event.slug,
        startsAt: event.startsAt.toISOString(), endsAt: event.endsAt.toISOString(),
        timezone: event.timezone, location: event.location, status: event.status,
        createdAt: event.createdAt.toISOString(), version: event.version,
      });
    } catch (error) {
      if (error instanceof AuthenticationError) {
        return reply.header("WWW-Authenticate", "Bearer").code(401).send({
          code: "UNAUTHORIZED", message: "Se requiere un token de acceso válido.",
        });
      }
      if (error instanceof AuthorizationError) {
        return reply.code(403).send({ code: "FORBIDDEN", message: "No tienes los permisos necesarios para esta operación." });
      }
      if (error instanceof ZodError) {
        return reply.code(400).send({ code: "INVALID_EVENT_INPUT", message: "Los datos de edición del evento no son válidos." });
      }
      if (error instanceof EventNotFoundError) {
        return reply.code(404).send({ code: "EVENT_NOT_FOUND", message: "No se encontró el evento." });
      }
      if (error instanceof EventSlugConflictError) {
        return reply.code(409).send({ code: "EVENT_SLUG_CONFLICT", message: "Ya existe un evento con ese slug." });
      }
      if (error instanceof EventVersionConflictError) {
        return reply.code(409).send({ code: "EVENT_VERSION_CONFLICT", message: "El evento cambió. Consulta su versión actual antes de editar." });
      }
      if (error instanceof EventNotEditableError) {
        return reply.code(409).send({ code: "EVENT_NOT_EDITABLE", message: "Solo se pueden editar eventos en borrador." });
      }
      request.log.error({ code: "EVENT_EDIT_FAILED" }, "No se pudo editar el evento.");
      return reply.code(500).send({ code: "INTERNAL_SERVER_ERROR", message: "No se pudo editar el evento. Inténtalo más tarde." });
    }
  });
}
