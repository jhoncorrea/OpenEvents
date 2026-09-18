import { useRef, useState } from "react";
import { InteractionStatus } from "@azure/msal-browser";
import { useMsal } from "@azure/msal-react";
import { fetchApiIdentity, type ApiIdentity } from "./api-auth";
import { parseAuthConfig } from "./auth-config";

interface IdentityResult {
  accountId: string;
  identity: ApiIdentity;
}

export default function SessionControls() {
  const { instance, accounts, inProgress } = useMsal();
  const [pending, setPending] = useState<"session" | "api" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [identityResult, setIdentityResult] =
    useState<IdentityResult | null>(null);
  const interactionLock = useRef(false);

  const account =
    instance.getActiveAccount() ??
    (accounts.length === 1 ? accounts[0] : null);

  const busy = pending !== null || inProgress !== InteractionStatus.None;

  const identity =
    account && identityResult?.accountId === account.homeAccountId
      ? identityResult.identity
      : null;

  async function handleSession() {
    if (interactionLock.current || busy) {
      return;
    }

    interactionLock.current = true;
    setPending("session");
    setError(null);
    setNotice(null);
    setIdentityResult(null);

    try {
      if (account) {
        await instance.logoutRedirect({ account });
      } else {
        await instance.loginRedirect({
          scopes: ["openid", "profile"],
          extraQueryParameters: {
            ui_locales: "es",
          },
        });
      }
    } catch {
      setError(
        account
          ? "No pudimos completar el cierre de sesión. Inténtalo nuevamente."
          : "No pudimos iniciar sesión. Comprueba tu conexión e inténtalo nuevamente.",
      );
    } finally {
      interactionLock.current = false;
      setPending(null);
    }
  }

  async function handleCheckAccess() {
    if (!account || interactionLock.current || busy) {
      return;
    }

    interactionLock.current = true;
    setPending("api");
    setError(null);
    setNotice(null);
    setIdentityResult(null);

    try {
      const authConfig = parseAuthConfig(import.meta.env);
      const apiUrl =
        typeof import.meta.env.VITE_API_URL === "string"
          ? import.meta.env.VITE_API_URL
          : "";

      const result = await fetchApiIdentity({
        instance,
        account,
        apiScope: authConfig.apiScope,
        apiUrl,
      });

      if (result) {
        setIdentityResult({
          accountId: account.homeAccountId,
          identity: result,
        });
      } else {
        setNotice(
          "Completa la autorización con Microsoft. Al regresar, pulsa Comprobar acceso.",
        );
      }
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "No pudimos comprobar el acceso. Inténtalo nuevamente.",
      );
    } finally {
      interactionLock.current = false;
      setPending(null);
    }
  }

  return (
    <section className="session-panel" aria-label="Sesión de usuario">
      <div className="session-panel-row">
        <div aria-live="polite">
          <strong>
            {account
              ? account.name || account.username || "Usuario"
              : "Sesión no iniciada"}
          </strong>
          <p>
            {pending === "api"
              ? "Comprobando acceso a OpenEvents…"
              : busy
                ? "Procesando sesión…"
                : account
                  ? "Has iniciado sesión en OpenEvents."
                  : "Inicia sesión con tu cuenta de OpenEvents."}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleSession()}
          disabled={busy}
        >
          {pending === "session"
            ? "Espera…"
            : account
              ? "Cerrar sesión"
              : "Iniciar sesión"}
        </button>
      </div>

      {account && (
        <div>
          <button
            type="button"
            onClick={() => void handleCheckAccess()}
            disabled={busy}
          >
            {pending === "api" ? "Comprobando…" : "Comprobar acceso"}
          </button>

          <p>
            Comprueba tu acceso y los roles asignados en OpenEvents.
          </p>
        </div>
      )}

      <div aria-live="polite">
        {identity && (
          <div>
            <p>Acceso a la API verificado.</p>
            <p>
              {identity.roles.length > 0
                ? `Roles: ${identity.roles.join(", ")}.`
                : "No tienes roles asignados en la API."}
            </p>
          </div>
        )}

        {notice && <p>{notice}</p>}
      </div>

      {error && <p role="alert">{error}</p>}
    </section>
  );
}