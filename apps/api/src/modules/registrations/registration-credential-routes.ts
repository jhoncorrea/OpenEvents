import type { FastifyInstance } from "fastify";
import { z, ZodError } from "zod";
import { createAuthGuard, type AccessTokenVerifier } from "../../auth/http-auth.js";
import { AuthenticationError, AuthorizationError, type AuthenticatedUser } from "../../auth/verify-access-token.js";
import { EventNotFoundError } from "../events/query-events-for-organizer.js";
import { RegistrationNotFoundError } from "./query-registrations-for-organizer.js";
import { parseRegistrationEventId, parseRegistrationId } from "./registration-query-input.js";
import { CredentialIssuanceNotAllowedError, RegistrationCredentialExistsError, type IssuedRegistrationCredential } from "./issue-registration-credential-for-organizer.js";

export type IssueRegistrationCredentialOperation = (eventId: string, registrationId: string, actor: AuthenticatedUser) => Promise<IssuedRegistrationCredential>;

export function registerRegistrationCredentialRoutes(app: FastifyInstance, verify: AccessTokenVerifier,
  issue: IssueRegistrationCredentialOperation): void {
  app.post<{ Params: { eventId: string; registrationId: string } }>("/api/v1/events/:eventId/registrations/:registrationId/qr", {
    onRequest: createAuthGuard(verify, ["organizer"]),
    bodyLimit: 1024,
    // Autenticar antes de rechazar cuerpo, sin analizar ni reflejar su contenido.
    async preParsing(request, reply, payload) {
      if (request.headers["transfer-encoding"] !== undefined ||
        (request.headers["content-length"] !== undefined && request.headers["content-length"] !== "0")) {
        return reply.code(400).send({ code: "INVALID_CREDENTIAL_INPUT", message: "La emisión no admite cuerpo." });
      }
      if (request.headers["content-type"] !== undefined) {
        return reply.code(415).send({ code: "UNSUPPORTED_MEDIA_TYPE", message: "Envía la solicitud sin cuerpo ni Content-Type." });
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
      if (error instanceof RegistrationNotFoundError) return reply.code(404)
        .send({ code: "REGISTRATION_NOT_FOUND", message: "No se encontró la inscripción." });
      if (error instanceof CredentialIssuanceNotAllowedError) return reply.code(409)
        .send({ code: "CREDENTIAL_ISSUANCE_NOT_ALLOWED", message: "El estado del evento o de la inscripción no permite emitir la credencial." });
      if (error instanceof RegistrationCredentialExistsError) return reply.code(409)
        .send({ code: "REGISTRATION_CREDENTIAL_EXISTS", message: "La inscripción ya tiene una credencial; no se reemplazó." });
      // Solo errores conocidos del parser se tratan como entrada: no confiar en statusCode de la operación.
      const parserCode = (error as { code?: string }).code;
      if (error instanceof ZodError || ["FST_ERR_CTP_INVALID_CONTENT_LENGTH", "FST_ERR_CTP_EMPTY_JSON_BODY", "FST_ERR_CTP_INVALID_JSON_BODY"].includes(parserCode ?? "")) {
        return reply.code(400).send({ code: "INVALID_CREDENTIAL_INPUT", message: "La solicitud de emisión no es válida." });
      }
      if (parserCode === "FST_ERR_CTP_BODY_TOO_LARGE") return reply.code(413)
        .send({ code: "PAYLOAD_TOO_LARGE", message: "La solicitud de emisión no es válida." });
      if (parserCode === "FST_ERR_CTP_INVALID_MEDIA_TYPE") return reply.code(415)
        .send({ code: "UNSUPPORTED_MEDIA_TYPE", message: "La solicitud de emisión no es válida." });
      request.log.error({ code: "CREDENTIAL_ISSUANCE_FAILED" }, "No se pudo emitir la credencial.");
      return reply.code(500).send({ code: "INTERNAL_SERVER_ERROR", message: "No se pudo emitir la credencial." });
    },
  }, async (request, reply) => {
    const actor = request.authenticatedUser;
    if (!actor) throw new AuthenticationError();
    z.strictObject({}).parse(request.query);
    z.undefined().parse(request.body);
    const eventId = parseRegistrationEventId(request.params.eventId);
    const registrationId = parseRegistrationId(request.params.registrationId);
    const result = await issue(eventId, registrationId, actor);
    return reply.code(201).send({ id: result.id, eventId: result.eventId, registrationId: result.registrationId,
      status: result.status, issuedAt: result.issuedAt.toISOString(), token: result.token });
  });
}
