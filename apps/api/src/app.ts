import cors from "@fastify/cors";
import Fastify from "fastify";
import { z } from "zod";
import {
  createAuthGuard,
  type AccessTokenVerifier,
} from "./auth/http-auth.js";
import { registerCheckIn } from "./check-in.js";
import {
  registerEventRoutes,
  type CreateEventOperation,
} from "./modules/events/event-routes.js";

import { registerEventQueryRoutes, type EventQueryOperations } from "./modules/events/event-query-routes.js";

interface BuildAppOptions {
  logger?: boolean;
  verifyAccessToken: AccessTokenVerifier;
  createEvent: CreateEventOperation;
  eventQueries?: EventQueryOperations;
}

export function buildApp({
  logger = false,
  verifyAccessToken,
  createEvent,
  eventQueries,
}: BuildAppOptions) {
  const app = Fastify({
    logger: logger
      ? {
          redact: ["req.headers.authorization"],
        }
      : false,
  });

  app.decorateRequest("authenticatedUser", null);

  app.register(cors, {
    origin: ["http://localhost:5173"],
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "openevents-api",
    timestamp: new Date().toISOString(),
  }));

  app.get(
    "/api/v1/auth/me",
    {
      onRequest: createAuthGuard(verifyAccessToken),
    },
    async (request) => {
      return request.authenticatedUser;
    },
  );

  registerEventRoutes(app, {
    verifyAccessToken,
    createEvent,
  });

  if (eventQueries) {
    registerEventQueryRoutes(app, verifyAccessToken, eventQueries);
  }

  app.get("/api/events/current", async () => ({
    id: "devopsdays-lima-2027",
    name: "DevOpsDays Lima 2027",
    venue: "Centro de Convenciones de Lima",
    date: "27 de agosto de 2027",
    stats: {
      registered: 240,
      checkedIn: 168,
    },
  }));

  const checkInBody = z.object({
    code: z.string().min(1).max(120),
  });

  app.post("/api/check-ins", async (request, reply) => {
    const parsed = checkInBody.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        status: "invalid",
        message: "Ingresa un código QR válido.",
      });
    }

    const result = registerCheckIn(parsed.data.code);
    return reply.code(result.status === "invalid" ? 404 : 200).send(result);
  });

  return app;
}
