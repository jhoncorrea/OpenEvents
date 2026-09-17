import { z } from "zod";

const apiEnvironmentSchema = z.object({
  PORT: z.coerce
    .number()
    .int("PORT must be an integer.")
    .min(1, "PORT must be greater than or equal to 1.")
    .max(65535, "PORT must be less than or equal to 65535.")
    .default(3001),

  HOST: z.string().trim().min(1, "HOST must not be empty.").default("127.0.0.1"),
});

type Environment = Record<string, string | undefined>;

export function parseApiConfig(environment: Environment) {
  const result = apiEnvironmentSchema.safeParse(environment);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");

    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return {
    port: result.data.PORT,
    host: result.data.HOST,
  };
}

export function parseDatabaseConfig(environment: Environment) {
  const databaseUrl = environment.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error(
      "Invalid database configuration: DATABASE_URL is required.",
    );
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error(
      "Invalid database configuration: DATABASE_URL must be a valid PostgreSQL URL.",
    );
  }

  const validProtocol =
    parsedUrl.protocol === "postgres:" ||
    parsedUrl.protocol === "postgresql:";

  const hasDatabase = parsedUrl.pathname.length > 1;

  if (
    !validProtocol ||
    !parsedUrl.hostname ||
    !hasDatabase ||
    parsedUrl.hash
  ) {
    throw new Error(
      "Invalid database configuration: DATABASE_URL must include a PostgreSQL protocol, host and database name, without a URL fragment.",
    );
  }

  return { databaseUrl };
}