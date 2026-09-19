import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

interface DatabaseConnectionOptions {
  databaseUrl: string;
  onIdleError: () => void;
}

export function createDatabaseConnection({
  databaseUrl,
  onIdleError,
}: DatabaseConnectionOptions) {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    query_timeout: 5000,
    statement_timeout: 5000,
  });

  pool.on("error", () => {
    // No transmitir el error original ni la configuración:
    // podrían contener información sensible.
    onIdleError();
  });

  const db = drizzle(pool);
  let closing: Promise<void> | undefined;

  async function checkConnection(): Promise<void> {
    await pool.query("SELECT 1");
  }

  function close(): Promise<void> {
    // Reutilizar el mismo cierre si se solicita varias veces.
    closing ??= pool.end();
    return closing;
  }

  return {
    db,
    checkConnection,
    close,
  };
}
