import { registerRegistrationSearchRoutes, type RegistrationSearchOperation } from "./modules/registrations/registration-search-routes.js";
import { registerRegistrationCsvRoutes, type RegistrationCsvOperations } from "./modules/registrations/registration-csv-routes.js";
import { registerRegistrationQueryRoutes, type RegistrationQueryOperations } from "./modules/registrations/registration-query-routes.js";
import { registerAttendeeRoutes, type RegisterAttendeeOperation } from "./modules/registrations/registration-routes.js";
import cors from "@fastify/cors";
import Fastify, { LogController } from "fastify";
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

import { registerEventEditRoutes, type EditEventOperation } from "./modules/events/event-edit-routes.js";

interface BuildAppOptions {
  logger?: boolean;
  verifyAccessToken: AccessTokenVerifier;
  createEvent: CreateEventOperation;
  eventQueries?: EventQueryOperations;
  registrationQueries?: RegistrationQueryOperations;
  registrationCsv?: RegistrationCsvOperations;
  registrationSearch?: RegistrationSearchOperation;
  editEvent?: EditEventOperation;
  registerAttendee?: RegisterAttendeeOperation;
}

export function buildApp({
  logger = false,
  verifyAccessToken,
  createEvent,
  eventQueries,
  registrationQueries,
  registrationCsv,
  registrationSearch,
  editEvent,
  registerAttendee,
}: BuildAppOptions) {
  const app = Fastify({
    // Las URL de búsqueda pueden contener PII. Mantener logs explícitos de códigos, sin URL automática.
    logController: new LogController({ disableRequestLogging: true }),
    logger: logger
      ? {
          redact: ["req.headers.authorization"],
        }
      : false,
  });

  app.decorateRequest("authenticatedUser", null);

  app.register(cors, {
    origin: ["http://localhost:5173"],
    methods: ["GET", "HEAD", "POST", "PATCH"],
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

  if (registrationSearch) registerRegistrationSearchRoutes(app, verifyAccessToken, registrationSearch);

  if (registrationCsv) registerRegistrationCsvRoutes(app, verifyAccessToken, registrationCsv);

  if (registrationQueries) registerRegistrationQueryRoutes(app, verifyAccessToken, registrationQueries);

  if (registerAttendee) registerAttendeeRoutes(app, verifyAccessToken, registerAttendee);

  if (editEvent) registerEventEditRoutes(app, verifyAccessToken, editEvent);

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
        message: "Ingresa un cÃ³digo QR vÃ¡lido.",
      });
    }

    const result = registerCheckIn(parsed.data.code);
    return reply.code(result.status === "invalid" ? 404 : 200).send(result);
  });

  return app;
}
