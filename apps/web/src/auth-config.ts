type AuthEnvironment = Record<string, string | undefined>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requiredValue(environment: AuthEnvironment, name: string): string {
  const value = environment[name]?.trim();

  if (!value) {
    throw new Error(`Missing authentication configuration: ${name}.`);
  }

  return value;
}

export function parseAuthConfig(environment: AuthEnvironment) {
  const clientId = requiredValue(environment, "VITE_ENTRA_CLIENT_ID");
  const tenantId = requiredValue(environment, "VITE_ENTRA_TENANT_ID");
  const tenantSubdomain = requiredValue(
    environment,
    "VITE_ENTRA_TENANT_SUBDOMAIN",
  );
  const redirectValue = requiredValue(
    environment,
    "VITE_ENTRA_REDIRECT_URI",
  );

  if (!UUID_PATTERN.test(clientId)) {
    throw new Error("Invalid VITE_ENTRA_CLIENT_ID: expected a UUID.");
  }

  if (!UUID_PATTERN.test(tenantId)) {
    throw new Error("Invalid VITE_ENTRA_TENANT_ID: expected a UUID.");
  }

  if (!/^[a-z0-9]+$/i.test(tenantSubdomain)) {
    throw new Error(
      "Invalid VITE_ENTRA_TENANT_SUBDOMAIN: use only letters and numbers.",
    );
  }

  let redirectUrl: URL;

  try {
    redirectUrl = new URL(redirectValue);
  } catch {
    throw new Error(
      "Invalid VITE_ENTRA_REDIRECT_URI: expected an absolute URL.",
    );
  }

  const isLocalHttp =
    redirectUrl.protocol === "http:" &&
    redirectUrl.hostname === "localhost";

  if (redirectUrl.protocol !== "https:" && !isLocalHttp) {
    throw new Error(
      "Invalid VITE_ENTRA_REDIRECT_URI: use HTTPS or HTTP on localhost.",
    );
  }

  if (
    redirectUrl.username ||
    redirectUrl.password ||
    redirectUrl.search ||
    redirectUrl.hash
  ) {
    throw new Error(
      "Invalid VITE_ENTRA_REDIRECT_URI: credentials, query and fragment are not allowed.",
    );
  }

  const authorityHost =
    `${tenantSubdomain.toLowerCase()}.ciamlogin.com`;

  return {
    clientId,
    authority: `https://${authorityHost}/${tenantId}`,
    knownAuthorities: [authorityHost],
    redirectUri: redirectUrl.toString(),
  };
}