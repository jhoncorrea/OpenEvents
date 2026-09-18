import { z } from "zod";

const httpsUrl = z
  .string()
  .trim()
  .refine(
    (value) => {
      try {
        const url = new URL(value);

        return (
          url.protocol === "https:" &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash
        );
      } catch {
        return false;
      }
    },
    "Expected an HTTPS URL without credentials, query or fragment.",
  );

const authEnvironmentSchema = z.object({
  ENTRA_TENANT_ID: z.string().trim().uuid(),
  ENTRA_API_CLIENT_ID: z.string().trim().uuid(),
  ENTRA_WEB_CLIENT_ID: z.string().trim().uuid(),
  ENTRA_ISSUER: httpsUrl,
  ENTRA_JWKS_URI: httpsUrl,
});

type Environment = Record<string, string | undefined>;

export function parseAuthConfig(environment: Environment) {
  const result = authEnvironmentSchema.safeParse(environment);

  if (!result.success) {
    const fields = [
      ...new Set(
        result.error.issues.map((issue) => issue.path.join(".")),
      ),
    ];

    throw new Error(
      `Invalid authentication configuration: check ${fields.join(", ")}.`,
    );
  }

  return {
    tenantId: result.data.ENTRA_TENANT_ID,
    audience: result.data.ENTRA_API_CLIENT_ID,
    allowedClientId: result.data.ENTRA_WEB_CLIENT_ID,
    issuer: result.data.ENTRA_ISSUER,
    jwksUri: result.data.ENTRA_JWKS_URI,
    requiredScope: "access_as_user",
  };
}

export type AuthConfig = ReturnType<typeof parseAuthConfig>;