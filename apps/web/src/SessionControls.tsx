import { lazy, Suspense, useRef, useState } from "react";
import {
  InteractionStatus,
  type AccountInfo,
  type IPublicClientApplication,
} from "@azure/msal-browser";
import { useMsal } from "@azure/msal-react";
import { fetchApiIdentity, type ApiIdentity } from "./api-auth";
import {
  createApiEvent,
  EventCreationError,
} from "./api-events";
import { parseAuthConfig } from "./auth-config";
import { clearEventDraft } from "./event-draft";
import type { CreateEventPayload } from "./event-form";

function FormLoadError() {
  return (
    <section className="session-panel" role="alert">
      <p>
        No pudimos cargar el formulario. Comprueba tu conexión y
        recarga la página.
      </p>
      <button type="button" onClick={() => window.location.reload()}>
        Recargar página
      </button>
    </section>
  );
}

const CreateEventForm = lazy(() =>
  import("./CreateEventForm").catch(() => ({
    default: FormLoadError,
  })),
);

interface AccountControlsProps {
  instance: IPublicClientApplication;
  account: AccountInfo | null;
  inProgress: InteractionStatus;
}

function accountKey(account: AccountInfo): string {
  return JSON.stringify([
    account.homeAccountId,
    account.localAccountId,
    account.tenantId,
    account.environment,
  ]);
}

export default function SessionControls() {
  const { instance, accounts, inProgress } = useMsal();

  const account =
    instance.getActiveAccount() ??
    (accounts.length === 1 ? accounts[0] : null);

  return (
    <AccountControls
      key={account ? accountKey(account) : "signed-out"}
      instance={instance}
      account={account}
      inProgress={inProgress}
    />
  );
}

function AccountControls({
  instance,
  account,
  inProgress,
}: AccountControlsProps) {
  const [pending, setPending] =
    useState<"session" | "api" | "creation" | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [identity, setIdentity] = useState<ApiIdentity | null>(null);
  const [draftStorageAvailable, setDraftStorageAvailable] =
    useState(true);

  // Una vez abierto, conservar el formulario durante nuevas comprobaciones.
  // Este estado se reinicia al cambiar la cuenta mediante la key del padre.
  const [formOpened, setFormOpened] = useState(false);

  const operationLock = useRef(false);

  const busy =
    pending !== null || inProgress !== InteractionStatus.None;

  const canCreate = identity?.roles.includes("organizer") === true;

  function isCurrentAccount(): boolean {
    const accounts = instance.getAllAccounts();
    const current =
      instance.getActiveAccount() ??
      (accounts.length === 1 ? accounts[0] : null);

    return Boolean(
      account &&
      current &&
      accountKey(account) === accountKey(current),
    );
  }

  function invalidateAccess() {
    setIdentity(null);
    setNotice(
      "Vuelve a comprobar el acceso antes de continuar. Los campos se conservan mientras permanezcas en esta pantalla con la misma cuenta.",
    );
  }

  async function handleSession() {
    if (operationLock.current || busy) {
      return;
    }

    operationLock.current = true;
    setPending("session");
    setError(null);
    setNotice(null);
    setIdentity(null);

    try {
      if (account) {
        if (!clearEventDraft(accountKey(account))) {
          setError(
            "No pudimos eliminar el borrador local. El cierre de sesión no se inició; vuelve a intentarlo.",
          );
          return;
        }

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
      operationLock.current = false;
      setPending(null);
    }
  }

  async function handleCheckAccess() {
    if (
      !account ||
      !draftStorageAvailable ||
      operationLock.current ||
      busy ||
      !isCurrentAccount()
    ) {
      return;
    }

    operationLock.current = true;
    setPending("api");
    setError(null);
    setNotice(null);
    setIdentity(null);

    try {
      const authConfig = parseAuthConfig(import.meta.env);

      const result = await fetchApiIdentity({
        instance,
        account,
        apiScope: authConfig.apiScope,
        apiUrl: import.meta.env.VITE_API_URL ?? "",
      });

      if (!isCurrentAccount()) {
        return;
      }

      if (result) {
        setIdentity(result);

        if (result.roles.includes("organizer")) {
          setFormOpened(true);
        }
      } else {
        setNotice(
          "Completa la autorización con Microsoft. Al regresar, pulsa Comprobar acceso.",
        );
      }
    } catch {
      if (isCurrentAccount()) {
        setError(
          "No pudimos comprobar el acceso a la API. Revisa la conexión y la sesión antes de volver a intentarlo.",
        );
      }
    } finally {
      operationLock.current = false;
      setPending(null);
    }
  }

  async function handleCreate(input: CreateEventPayload) {
    if (
      !account ||
      !isCurrentAccount() ||
      !canCreate ||
      busy ||
      operationLock.current
    ) {
      throw new EventCreationError(
        "unauthorized",
        "Comprueba el acceso con tu cuenta antes de crear el evento.",
      );
    }

    operationLock.current = true;
    setPending("creation");

    try {
      const authConfig = parseAuthConfig(import.meta.env);

      return await createApiEvent({
        instance,
        account,
        apiScope: authConfig.apiScope,
        apiUrl: import.meta.env.VITE_API_URL ?? "",
        input,
      });
    } finally {
      operationLock.current = false;
      setPending(null);
    }
  }

  return (
    <>
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
                : pending === "creation"
                  ? "Creando evento…"
                  : busy
                    ? "Procesando sesión…"
                    : account
                      ? "Has iniciado sesión en OpenEvents."
                      : "Inicia sesión para acceder a la creación de eventos."}
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
              disabled={busy || !draftStorageAvailable}
            >
              {pending === "api" ? "Comprobando…" : "Comprobar acceso"}
            </button>

            <p>Comprueba tus permisos para crear eventos.</p>
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

              {!canCreate && (
                <p>
                  Tu cuenta no tiene el rol organizer necesario para
                  crear eventos.
                </p>
              )}
            </div>
          )}

          {notice && <p>{notice}</p>}
        </div>

        {error && <p role="alert">{error}</p>}
      </section>

      {account && formOpened && (
        <div hidden={!canCreate}>
          <Suspense
            fallback={
              <p role="status" aria-live="polite">
                Cargando formulario de creación…
              </p>
            }
          >
            <CreateEventForm
              accountStorageKey={accountKey(account)}
              disabled={!canCreate || busy}
              onCreate={handleCreate}
              onAccessInvalidated={invalidateAccess}
              onDraftStorageChange={setDraftStorageAvailable}
            />
          </Suspense>
        </div>
      )}
    </>
  );
}