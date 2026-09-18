import { buildApp } from "./app.js";
import { parseAuthConfig } from "./auth-config.js";
import { createAccessTokenVerifier } from "./auth/verify-access-token.js";
import { parseApiConfig } from "./config.js";

const { port, host } = parseApiConfig(process.env);
const authConfig = parseAuthConfig(process.env);
const verifyAccessToken = createAccessTokenVerifier(authConfig);

const app = buildApp({
  logger: true,
  verifyAccessToken,
});

await app.listen({ port, host });