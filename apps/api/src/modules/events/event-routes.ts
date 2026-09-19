import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import {
  createAuthGuard,
  type AccessTokenVerifier,
} from "../../auth/http-auth.js";
import {
  EventSlugConflictError,
  type createEvent,
} from "./create-event.js";

import {
  AuthenticationError,
  AuthorizationError,
  type AuthenticatedUser,
} from "../../auth/verify-access-token.js";

export type CreateEventOperation = (
  input: unknown,
  authenticatedUser: AuthenticatedUser,
) => ReturnType<typeof createEvent>;

interface EventRouteOptions {
  verifyAccessToken: AccessTokenVerifier;
  createEvent: CreateEventOperation;
}

export function registerEventRoutes(
  app: FastifyInstance,
  {
    verifyAccessToken,
    createEvent: executeCreateEvent,
  }: EventRouteOptions,
): void {
  app.post(
    "/api/v1/events",
    {
      onRequest: createAuthGuard(verifyAccessToken, ["organizer"]),
    },
    async (request, reply) => {
      try {
        const actor = request.authenticatedUser;
        if (!actor) {
          throw new AuthenticationError();
        }

        // La identidad procede del control de autenticación, nunca del cuerpo.
        const event = await executeCreateEvent(request.body, actor);

        return reply.code(201).send({
          id: event.id,
          name: event.name,
          slug: event.slug,
          startsAt: event.startsAt.toISOString(),
          endsAt: event.endsAt.toISOString(),
          timezone: event.timezone,
          location: event.location,
          status: event.status,
          createdAt: event.createdAt.toISOString(), version: event.version,
        });
      } catch (error) {
        if (error instanceof AuthenticationError) {
          return reply
            .header("WWW-Authenticate", "Bearer")
            .code(401)
            .send({
              code: "UNAUTHORIZED",
              message: "Se requiere un token de acceso válido.",
            });
        }

        if (error instanceof AuthorizationError) {
          return reply.code(403).send({
            code: "FORBIDDEN",
            message: "No tienes los permisos necesarios para esta operación.",
          });
        }

        if (error instanceof ZodError) {
          return reply.code(400).send({
            code: "INVALID_EVENT_INPUT",
            message: "Los datos del evento no son válidos.",
          });
        }

        if (error instanceof EventSlugConflictError) {
          return reply.code(409).send({
            code: "EVENT_SLUG_CONFLICT",
            message: "Ya existe un evento con ese slug.",
          });
        }

        // No registrar el error original: puede contener SQL,
        // datos de entrada o información de conexión.
        request.log.error(
          { code: "EVENT_CREATION_FAILED" },
          "No se pudo crear el evento.",
        );

        return reply.code(500).send({
          code: "INTERNAL_SERVER_ERROR",
          message: "No se pudo crear el evento. Inténtalo más tarde.",
        });
      }
    },
  );
}
