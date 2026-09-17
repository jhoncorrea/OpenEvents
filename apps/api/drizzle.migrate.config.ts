import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { defineConfig } from "drizzle-kit";
import { parseDatabaseConfig } from "./src/config.js";
import baseConfig from "./drizzle.config.js";

if (existsSync(".env")) {
  loadEnvFile(".env");
}

const { databaseUrl } = parseDatabaseConfig(process.env);

export default defineConfig({
  ...baseConfig,
  dbCredentials: {
    url: databaseUrl,
  },
  migrations: {
    schema: "drizzle",
    table: "__drizzle_migrations",
  },
});