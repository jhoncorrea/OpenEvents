import type { FastifyReply, FastifyRequest } from "fastify";
import {
  AuthenticationError,
  AuthorizationError,
  requireAnyRole,
  type AppRole,
  type AuthenticatedUser,
} from "./verify-access-token.js";

export type AccessTokenVerifier = (
  token: string,
) => Promise<AuthenticatedUser>;

declare module "fastify" {
  interface FastifyRequest {
    authenticatedUser: AuthenticatedUser | null;
  }
}

export function createAuthGuard(
  verifyAccessToken: AccessTokenVerifier,
  allowedRoles?: readonly AppRole[],
) {
  return async function authGuard(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    request.authenticatedUser = null;
    reply.header("Cache-Control", "no-store");

    try {
      const authorization = request.headers.authorization;
      const match =
        typeof authorization === "string"
          ? /^Bearer +(\S+)$/i.exec(authorization)
          : null;
      const token = match?.[1];

      if (!token) {
        throw new AuthenticationError();
      }

      const user = await verifyAccessToken(token);

      if (allowedRoles !== undefined) {
        requireAnyRole(user, allowedRoles);
      }

      request.authenticatedUser = user;
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

      // No registrar el token ni el error original:
      // este podría contener información sensible.
      request.log.error(
        { code: "AUTHENTICATION_SERVICE_ERROR" },
        "No se pudo completar la verificación de acceso.",
      );

      return reply.code(500).send({
        code: "INTERNAL_SERVER_ERROR",
        message: "No se pudo completar la verificación de acceso.",
      });
    }
  };
}
