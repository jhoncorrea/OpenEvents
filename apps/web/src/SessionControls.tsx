import { useRef, useState } from "react";
import { InteractionStatus } from "@azure/msal-browser";
import { useMsal } from "@azure/msal-react";

export default function SessionControls() {
  const { instance, accounts, inProgress } = useMsal();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const interactionLock = useRef(false);

  const account =
    instance.getActiveAccount() ??
    (accounts.length === 1 ? accounts[0] : null);

  const busy = pending || inProgress !== InteractionStatus.None;

  async function handleSession() {
    if (interactionLock.current || busy) {
      return;
    }

    interactionLock.current = true;
    setPending(true);
    setError(null);

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
      setPending(false);
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
            {busy
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
          {busy
            ? "Espera…"
            : account
              ? "Cerrar sesión"
              : "Iniciar sesión"}
        </button>
      </div>

      {error && <p role="alert">{error}</p>}
    </section>
  );
}