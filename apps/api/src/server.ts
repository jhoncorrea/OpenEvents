import { buildApp } from "./app.js";
import { parseAuthConfig } from "./auth-config.js";
import { createAccessTokenVerifier } from "./auth/verify-access-token.js";
import {
  parseApiConfig,
  parseDatabaseConfig,
} from "./config.js";
import { createDatabaseConnection } from "./db/connection.js";
import { createEventForOrganizer } from "./modules/events/create-event-for-organizer.js";

const { port, host } = parseApiConfig(process.env);
const authConfig = parseAuthConfig(process.env);
const { databaseUrl } = parseDatabaseConfig(process.env);

const verifyAccessToken = createAccessTokenVerifier(authConfig);

const database = createDatabaseConnection({
  databaseUrl,
  onIdleError: () => {
    app.log.error(
      { code: "DATABASE_IDLE_CONNECTION_ERROR" },
      "Se perdió una conexión inactiva con PostgreSQL.",
    );
  },
});

const app = buildApp({
  logger: true,
  verifyAccessToken,
  createEvent: (input, actor) =>
    createEventForOrganizer(database.db, input, actor),
});

app.addHook("onClose", async () => {
  await database.close();
});

let shuttingDown = false;

async function shutdown(): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  try {
    await app.close();
  } catch {
    app.log.error(
      { code: "SERVER_SHUTDOWN_FAILED" },
      "No se pudo completar correctamente el cierre de la API.",
    );
    process.exitCode = 1;
  }
}

function handleShutdownSignal(): void {
  void shutdown();
}

process.on("SIGINT", handleShutdownSignal);
process.on("SIGTERM", handleShutdownSignal);

try {
  await database.checkConnection();

  if (!shuttingDown) {
    await app.listen({ port, host });
  }
} catch {
  app.log.error(
    { code: "SERVER_STARTUP_FAILED" },
    "No se pudo iniciar la API. Comprueba PostgreSQL y el puerto configurado.",
  );

  process.exitCode = 1;
  await shutdown();
}
