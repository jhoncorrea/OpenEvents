import {
  createRemoteJWKSet,
  errors,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose";
import { z } from "zod";
import type { AuthConfig } from "../auth-config.js";

export type AppRole = "admin" | "organizer" | "checkin_operator";

export interface AuthenticatedUser {
  tenantId: string;
  objectId: string;
  subject: string;
  roles: AppRole[];
}

export class AuthenticationError extends Error {
  readonly code = "UNAUTHORIZED";

  constructor() {
    super("Se requiere un token de acceso válido.");
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends Error {
  readonly code = "FORBIDDEN";

  constructor() {
    super("No tienes los permisos necesarios para esta operación.");
    this.name = "AuthorizationError";
  }
}

const identityClaimsSchema = z.object({
  ver: z.literal("2.0"),
  tid: z.string().uuid(),
  oid: z.string().uuid(),
  sub: z.string().min(1),
  azp: z.string().uuid(),
  roles: z.array(z.string()).optional(),
});

function isAppRole(value: string): value is AppRole {
  return (
    value === "admin" ||
    value === "organizer" ||
    value === "checkin_operator"
  );
}

function isInvalidTokenError(error: unknown): boolean {
  return (
    error instanceof errors.JWTExpired ||
    error instanceof errors.JWTClaimValidationFailed ||
    error instanceof errors.JWTInvalid ||
    error instanceof errors.JWSInvalid ||
    error instanceof errors.JWSSignatureVerificationFailed ||
    error instanceof errors.JOSEAlgNotAllowed ||
    error instanceof errors.JOSENotSupported ||
    error instanceof errors.JWKSNoMatchingKey
  );
}

export function createAccessTokenVerifier(
  config: AuthConfig,
  getKey: JWTVerifyGetKey = createRemoteJWKSet(
    new URL(config.jwksUri),
    {
      timeoutDuration: 5000,
      cooldownDuration: 30000,
      cacheMaxAge: 600000,
    },
  ),
) {
  return async function verifyAccessToken(
    token: string,
  ): Promise<AuthenticatedUser> {
    let verified;

    try {
      verified = await jwtVerify(token, getKey, {
        algorithms: ["RS256"],
        issuer: config.issuer,
        audience: config.audience,
        requiredClaims: [
          "exp",
          "iat",
          "nbf",
          "sub",
          "oid",
          "tid",
          "azp",
          "ver",
        ],
        clockTolerance: 5,
      });
    } catch (error) {
      if (isInvalidTokenError(error)) {
        throw new AuthenticationError();
      }

      // Los fallos de red o del servicio de claves no se
      // presentan como si el usuario tuviera un token inválido.
      throw error;
    }

    const { payload } = verified;
    const identity = identityClaimsSchema.safeParse(payload);

    if (!identity.success) {
      throw new AuthenticationError();
    }

    if (identity.data.tid !== config.tenantId) {
      throw new AuthenticationError();
    }

    if (identity.data.azp !== config.allowedClientId) {
      throw new AuthorizationError();
    }

    const scopes =
      typeof payload.scp === "string"
        ? payload.scp.split(" ").filter(Boolean)
        : [];

    if (!scopes.includes(config.requiredScope)) {
      throw new AuthorizationError();
    }

    return {
      tenantId: identity.data.tid,
      objectId: identity.data.oid,
      subject: identity.data.sub,
      roles: [...new Set((identity.data.roles ?? []).filter(isAppRole))],
    };
  };
}

export function requireAnyRole(
  user: AuthenticatedUser,
  allowedRoles: readonly AppRole[],
): void {
  if (!allowedRoles.some((role) => user.roles.includes(role))) {
    throw new AuthorizationError();
  }
}