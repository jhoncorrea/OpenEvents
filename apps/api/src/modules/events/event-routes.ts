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

export type CreateEventOperation = (
  input: unknown,
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
        // La operación existente valida la entrada antes de insertar.
        const event = await executeCreateEvent(request.body);

        return reply.code(201).send({
          id: event.id,
          name: event.name,
          slug: event.slug,
          startsAt: event.startsAt.toISOString(),
          endsAt: event.endsAt.toISOString(),
          timezone: event.timezone,
          location: event.location,
          status: event.status,
          createdAt: event.createdAt.toISOString(),
        });
      } catch (error) {
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
