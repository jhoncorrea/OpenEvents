import { activateEventForOrganizer, closeEventForOrganizer } from "./modules/events/change-event-state-for-organizer.js";
import { registerCheckInForOperator } from "./modules/registrations/register-check-in-for-operator.js";
import { listEventsForOperator, getEventForOperator } from "./modules/events/query-events-for-operator.js";
import { searchRegistrationsForStaff } from "./modules/registrations/search-registrations-for-staff.js";
import { importRegistrationCsvIdempotently, queryRegistrationCsvImport } from "./modules/registrations/registration-csv-idempotency.js";
import { listRegistrationsForOrganizer, getRegistrationForOrganizer } from "./modules/registrations/query-registrations-for-organizer.js";
import { registerAttendeeForOrganizer } from "./modules/registrations/register-attendee-for-organizer.js";
import { editEventForOrganizer } from "./modules/events/edit-event-for-organizer.js";
import { listEventsForOrganizer, getEventForOrganizer } from "./modules/events/query-events-for-organizer.js";
import { buildApp } from "./app.js";
import { parseAuthConfig } from "./auth-config.js";
import { createAccessTokenVerifier } from "./auth/verify-access-token.js";
import {
  parseApiConfig,
  parseDatabaseConfig,
} from "./config.js";
import { createDatabaseConnection } from "./db/connection.js";
import { createEventForOrganizer } from "./modules/events/create-event-for-organizer.js";
import { issueRegistrationCredentialForOrganizer } from "./modules/registrations/issue-registration-credential-for-organizer.js";

const { port, host } = parseApiConfig(process.env);
const authConfig = parseAuthConfig(process.env);
const { databaseUrl } = parseDatabaseConfig(process.env);

const verifyAccessToken = createAccessTokenVerifier(authConfig);

const database = createDatabaseConnection({
  databaseUrl,
  onIdleError: () => {
    app.log.error(
      { code: "DATABASE_IDLE_CONNECTION_ERROR" },
      "Se perdiÃ³ una conexiÃ³n inactiva con PostgreSQL.",
    );
  },
});

const app = buildApp({
  logger: true,
  eventLifecycle: {
    activate: (id, input, actor) => activateEventForOrganizer(database.db, id, input, actor),
    close: (id, input, actor) => closeEventForOrganizer(database.db, id, input, actor),
  },
  checkIn: (id, code, source, actor) => registerCheckInForOperator(database.db, id, code, source, actor),
  issueRegistrationCredential: (id, registrationId, actor) => issueRegistrationCredentialForOrganizer(database.db, id, registrationId, actor),
  registrationSearch: (id, input, actor) => searchRegistrationsForStaff(database.db, id, input, actor),
  registrationCsv: {
    import: (id, key, bytes, actor) => importRegistrationCsvIdempotently(database.db, id, key, bytes, actor),
    get: (id, key, actor) => queryRegistrationCsvImport(database.db, id, key, actor),
  },
  registerAttendee: (id, input, actor) => registerAttendeeForOrganizer(database.db, id, input, actor),
  editEvent: (id, input, actor) => editEventForOrganizer(database.db, id, input, actor),
  registrationQueries: {
    list: (id, input, actor) => listRegistrationsForOrganizer(database.db, id, input, actor),
    get: (id, registrationId, actor) => getRegistrationForOrganizer(database.db, id, registrationId, actor),
  },
  operatorEventQueries: {
    list: (input, actor) => listEventsForOperator(database.db, input, actor),
    get: (id, actor) => getEventForOperator(database.db, id, actor),
  },
  eventQueries: {
    list: (input, actor) => listEventsForOrganizer(database.db, input, actor),
    get: (id, actor) => getEventForOrganizer(database.db, id, actor),
  },
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
