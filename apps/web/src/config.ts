const DEFAULT_API_URL = "http://localhost:3001";

type WebEnvironment = Record<string, string | undefined>;

export function parseWebConfig(environment: WebEnvironment) {
  const value = environment.VITE_API_URL?.trim() || DEFAULT_API_URL;

  let apiUrl: URL;

  try {
    apiUrl = new URL(value);
  } catch {
    throw new Error(
      "Invalid VITE_API_URL: the value must be an absolute HTTP or HTTPS URL.",
    );
  }

  if (apiUrl.protocol !== "http:" && apiUrl.protocol !== "https:") {
    throw new Error(
      "Invalid VITE_API_URL: only HTTP and HTTPS protocols are allowed.",
    );
  }

  return {
    apiUrl: apiUrl.toString().replace(/\/+$/, ""),
  };
}

export const webConfig = parseWebConfig(import.meta.env);