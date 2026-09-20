import type { FastifyInstance } from "fastify";
import { z, ZodError } from "zod";
import { createAuthGuard, type AccessTokenVerifier } from "../../auth/http-auth.js";
import { AuthenticationError, AuthorizationError, type AuthenticatedUser } from "../../auth/verify-access-token.js";
import { parseEventId } from "../events/event-query-input.js";
import { EventNotFoundError } from "../events/query-events-for-organizer.js";
import { parseRegisterAttendeeInput } from "./register-attendee-input.js";
import { EventRegistrationNotAllowedError, RegistrationEmailConflictError, type RegisteredAttendee } from "./register-attendee-for-organizer.js";

export type RegisterAttendeeOperation = (id: string, input: unknown, actor: AuthenticatedUser) => Promise<RegisteredAttendee>;

export function registerAttendeeRoutes(app: FastifyInstance, verify: AccessTokenVerifier, register: RegisterAttendeeOperation): void {
  app.post<{ Params: { eventId: string } }>("/api/v1/events/:eventId/registrations", {
    onRequest: createAuthGuard(verify, ["organizer"]),
    bodyLimit: 4096,
    // Los errores del parser pueden incluir fragmentos del cuerpo con datos personales.
    errorHandler(error, request, reply) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 400 || status === 413 || status === 415) {
        return reply.code(status).send({ code: status === 413 ? "PAYLOAD_TOO_LARGE" : status === 415 ? "UNSUPPORTED_MEDIA_TYPE" : "INVALID_REGISTRATION_INPUT",
          message: "La solicitud de inscripción no es válida." });
      }
      request.log.error({ code: "REGISTRATION_FAILED" }, "No se pudo registrar al asistente.");
      return reply.code(500).send({ code: "INTERNAL_SERVER_ERROR", message: "No se pudo registrar al asistente. Inténtalo más tarde." });
    },
  }, async (request, reply) => {
    try {
      const actor = request.authenticatedUser;
      if (!actor) throw new AuthenticationError();
      z.strictObject({}).parse(request.query);
      const id = parseEventId(request.params.eventId);
      const input = parseRegisterAttendeeInput(request.body);
      const result = await register(id, input, actor);
      return reply.code(201).send({ id: result.id, eventId: result.eventId, status: result.status,
        source: result.source, createdAt: result.createdAt.toISOString(),
        attendee: { id: result.attendee.id, fullName: result.attendee.fullName, email: result.attendee.email } });
    } catch (error) {
      if (error instanceof AuthenticationError) return reply.header("WWW-Authenticate", "Bearer").code(401).send({
        code: "UNAUTHORIZED", message: "Se requiere un token de acceso válido." });
      if (error instanceof AuthorizationError) return reply.code(403).send({
        code: "FORBIDDEN", message: "No tienes los permisos necesarios para esta operación." });
      if (error instanceof ZodError) return reply.code(400).send({
        code: "INVALID_REGISTRATION_INPUT", message: "Los datos de inscripción no son válidos." });
      if (error instanceof EventNotFoundError) return reply.code(404).send({
        code: "EVENT_NOT_FOUND", message: "No se encontró el evento." });
      if (error instanceof RegistrationEmailConflictError) return reply.code(409).send({
        code: "REGISTRATION_EMAIL_CONFLICT", message: "Ya existe una inscripción con ese correo en el evento." });
      if (error instanceof EventRegistrationNotAllowedError) return reply.code(409).send({
        code: "EVENT_REGISTRATION_NOT_ALLOWED", message: "El evento no admite nuevas inscripciones." });
      throw error;
    }
  });
}
