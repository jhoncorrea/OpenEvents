import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserCacheLocation,
  PublicClientApplication,
} from "@azure/msal-browser";
import { MsalProvider } from "@azure/msal-react";
import App from "./App";
import { parseAuthConfig } from "./auth-config";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("The application root element was not found.");
}

const root = createRoot(rootElement);

function showStartupError(message: string) {
  root.render(
    <main role="alert">
      <h1>No pudimos preparar el inicio de sesión</h1>
      <p>{message}</p>
      <p>
        Si modificaste el archivo .env, reinicia el servidor de desarrollo.
      </p>
      <button type="button" onClick={() => window.location.reload()}>
        Reintentar
      </button>
    </main>,
  );
}

async function bootstrap() {
  root.render(
    <main role="status">
      <p>Preparando OpenEvents…</p>
    </main>,
  );

  let authConfig: ReturnType<typeof parseAuthConfig>;

  try {
    authConfig = parseAuthConfig(import.meta.env);
  } catch (error) {
    showStartupError(
      error instanceof Error
        ? error.message
        : "Revisa las variables VITE_ENTRA de la configuración.",
    );
    return;
  }

  try {
    if (new URL(authConfig.redirectUri).origin !== window.location.origin) {
      showStartupError(
        "Abre la web desde la misma dirección y puerto configurados en VITE_ENTRA_REDIRECT_URI.",
      );
      return;
    }

    const msalInstance = new PublicClientApplication({
      auth: {
        clientId: authConfig.clientId,
        authority: authConfig.authority,
        knownAuthorities: authConfig.knownAuthorities,
        redirectUri: authConfig.redirectUri,
        postLogoutRedirectUri: authConfig.redirectUri,
      },
      cache: {
        cacheLocation: BrowserCacheLocation.SessionStorage,
      },
    });

    await msalInstance.initialize();

    const redirectResult = await msalInstance.handleRedirectPromise();

    if (redirectResult?.account) {
      msalInstance.setActiveAccount(redirectResult.account);
    } else if (!msalInstance.getActiveAccount()) {
      const accounts = msalInstance.getAllAccounts();

      if (accounts.length === 1) {
        msalInstance.setActiveAccount(accounts[0]);
      }
    }

    root.render(
      <StrictMode>
        <MsalProvider instance={msalInstance}>
          <App />
        </MsalProvider>
      </StrictMode>,
    );
  } catch {
    showStartupError(
      "No se pudo inicializar la autenticación o procesar el regreso desde Microsoft Entra. Comprueba tu conexión e inténtalo nuevamente.",
    );
  }
}

void bootstrap();