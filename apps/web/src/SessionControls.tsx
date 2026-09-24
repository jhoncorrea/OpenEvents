import { EventLifecycleError } from "./event-lifecycle-error";
import type { EventLifecycleAction } from "./api-event-lifecycle";
import { CredentialError } from "./credential-error";
import { CsvImportError } from "./csv-import-error";
import { lazy, Suspense, useCallback, useRef, useState } from "react";
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
import type { EditEventPayload } from "./api-event-edits";
import { EventEditError } from "./event-edit-error";
import { EventQueryError } from "./event-query-error";
import type { RegistrationPayload } from "./api-registrations";
import { RegistrationQueryError } from "./registration-query-error";
import { RegistrationError } from "./registration-error";
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

const MyEvents = lazy(() => import("./MyEvents").catch(() => ({
  default: function QueryLoadError() {
    return <section className="session-panel" role="alert">
      <p>No pudimos cargar Mis eventos. Recarga la página e inténtalo nuevamente.</p>
      <button type="button" onClick={() => window.location.reload()}>Recargar página</button>
    </section>;
  },
})));
const OperatorEvents = lazy(() => import("./OperatorEvents").catch(() => ({
  default: function OperatorLoadError() { return <section role="alert"><p>No pudimos cargar los eventos asignados. Recarga la página.</p></section>; },
})));
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
  const [editingOpen, setEditingOpen] = useState(false);

  const uncertainRegistrationIds = useRef(new Set<string>());
  const registrationInFlight = useRef(false);
  const operationLock = useRef(false);

  const busy =
    pending !== null || inProgress !== InteractionStatus.None;

  const canOperate = identity?.roles.includes("checkin_operator") === true;
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

  const credentialSensitive = useRef(false);
  const credentialProtection = useCallback((value: boolean) => {
    credentialSensitive.current = value; setEditingOpen(value);
  }, []);
  function invalidateAccess() {
    credentialSensitive.current = false;
    setIdentity(null);
    setEditingOpen(false);
    setNotice(
      "Vuelve a comprobar el acceso antes de continuar. El borrador de creación se conserva con esta cuenta. Los datos de consulta y edición se han retirado.",
    );
  }

  async function handleSession() {
    if (operationLock.current || busy) {
      return;
    }

    if (credentialSensitive.current && !window.confirm("¿Cerrar sesión? Podrías perder el código o el resultado de una emisión pendiente; no podrás recuperarlo desde esta vista.")) return;
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
      editingOpen ||
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

  function operatorOptions(signal: AbortSignal) {
    if (signal.aborted || !isCurrentAccount()) throw new EventQueryError("cancelled");
    if (!account || !canOperate || busy || operationLock.current) throw new EventQueryError("unauthorized");
    let config;
    try { config = parseAuthConfig(import.meta.env); } catch { throw new EventQueryError("configuration"); }
    return { instance, account, apiScope: config.apiScope, apiUrl: import.meta.env.VITE_API_URL ?? "", signal, isCurrent: isCurrentAccount };
  }
  async function operatorPage(cursor: string | undefined, signal: AbortSignal) {
    const options = operatorOptions(signal);
    const { listOperatorEvents } = await import("./api-operator-events");
    return listOperatorEvents({ ...options, cursor });
  }
  async function operatorDetail(eventId: string, signal: AbortSignal) {
    const options = operatorOptions(signal);
    const { getOperatorEvent } = await import("./api-operator-events");
    return getOperatorEvent({ ...options, eventId });
  }
  async function operatorSearch(eventId: string, q: string, cursor: string | undefined, signal: AbortSignal) {
    const options = operatorOptions(signal);
    const { searchApiRegistrations } = await import("./api-registration-queries");
    return searchApiRegistrations({ ...options, eventId, q, cursor });
  }

  async function queryEvents(cursor: string | undefined, signal: AbortSignal) {
    if (signal.aborted) throw new EventQueryError("cancelled");
    if (!account || !isCurrentAccount() || !canCreate || busy || operationLock.current) {
      throw new EventQueryError("unauthorized");
    }
    const config = parseAuthConfig(import.meta.env);
    try {
      const { listApiEvents } = await import("./api-event-queries");
      const page = await listApiEvents({ instance, account, apiScope: config.apiScope,
        apiUrl: import.meta.env.VITE_API_URL ?? "", cursor, signal });
      if (signal.aborted || !isCurrentAccount()) throw new EventQueryError("cancelled");
      return page;
    } catch (error) {
      if (signal.aborted || !isCurrentAccount()) throw new EventQueryError("cancelled");
      throw error;
    }
  }

  async function queryDetail(eventId: string, signal: AbortSignal) {
    if (signal.aborted) throw new EventQueryError("cancelled");
    if (!account || !isCurrentAccount() || !canCreate || busy || operationLock.current) {
      throw new EventQueryError("unauthorized");
    }
    const config = parseAuthConfig(import.meta.env);
    try {
      const { getApiEvent } = await import("./api-event-queries");
      const event = await getApiEvent({ instance, account, apiScope: config.apiScope,
        apiUrl: import.meta.env.VITE_API_URL ?? "", eventId, signal });
      if (signal.aborted || !isCurrentAccount()) throw new EventQueryError("cancelled");
      return event;
    } catch (error) {
      if (signal.aborted || !isCurrentAccount()) throw new EventQueryError("cancelled");
      throw error;
    }
  }
  async function queryRegistrations(eventId: string, cursor: string | undefined, signal: AbortSignal) {
    const checkCurrent = () => {
      if (signal.aborted || !isCurrentAccount()) throw new RegistrationQueryError("cancelled");
    };
    checkCurrent();
    if (!account || !canCreate || busy || operationLock.current) throw new RegistrationQueryError("unauthorized");
    try {
      let config;
      try { config = parseAuthConfig(import.meta.env); } catch { throw new RegistrationQueryError("configuration"); }
      const { listApiRegistrations } = await import("./api-registration-queries");
      checkCurrent();
      const result = await listApiRegistrations({ instance, account, apiScope: config.apiScope,
        apiUrl: import.meta.env.VITE_API_URL ?? "", eventId, cursor, signal });
      checkCurrent();
      return result;
    } catch (error) {
      checkCurrent();
      throw error;
    }
  }
  async function searchRegistrations(eventId: string, q: string, cursor: string | undefined, signal: AbortSignal) {
    const checkCurrent = () => {
      if (signal.aborted || !isCurrentAccount()) throw new RegistrationQueryError("cancelled");
    };
    checkCurrent();
    if (!account || !canCreate || busy || operationLock.current) throw new RegistrationQueryError("unauthorized");
    try {
      let config;
      try { config = parseAuthConfig(import.meta.env); } catch { throw new RegistrationQueryError("configuration"); }
      const { searchApiRegistrations } = await import("./api-registration-queries");
      checkCurrent();
      const result = await searchApiRegistrations({ instance, account, apiScope: config.apiScope,
        apiUrl: import.meta.env.VITE_API_URL ?? "", eventId, q, cursor, signal, isCurrent: isCurrentAccount });
      checkCurrent();
      return result;
    } catch (error) {
      checkCurrent();
      throw error;
    }
  }
  async function queryRegistrationDetail(eventId: string, registrationId: string, signal: AbortSignal) {
    const checkCurrent = () => {
      if (signal.aborted || !isCurrentAccount()) throw new RegistrationQueryError("cancelled");
    };
    checkCurrent();
    if (!account || !canCreate || busy || operationLock.current) throw new RegistrationQueryError("unauthorized");
    try {
      let config;
      try { config = parseAuthConfig(import.meta.env); } catch { throw new RegistrationQueryError("configuration"); }
      const { getApiRegistration } = await import("./api-registration-queries");
      checkCurrent();
      const result = await getApiRegistration({ instance, account, apiScope: config.apiScope,
        apiUrl: import.meta.env.VITE_API_URL ?? "", eventId, registrationId, signal });
      checkCurrent();
      return result;
    } catch (error) {
      checkCurrent();
      throw error;
    }
  }
  async function csvOperation(eventId: string, key: string, signal: AbortSignal, bytes?: Uint8Array) {
    const current = () => !signal.aborted && isCurrentAccount();
    if (!current()) throw new CsvImportError("cancelled");
    if (!account || !canCreate || busy || operationLock.current) throw new CsvImportError("unauthorized");
    let config;
    try { config = parseAuthConfig(import.meta.env); } catch { throw new CsvImportError("configuration"); }
    const { importApiRegistrationCsv, queryApiRegistrationCsv } = await import("./api-registration-csv");
    if (!current()) throw new CsvImportError("cancelled");
    const options = { instance, account, apiScope: config.apiScope, apiUrl: import.meta.env.VITE_API_URL ?? "",
      eventId, key, signal, isCurrent: current };
    const result = bytes === undefined ? await queryApiRegistrationCsv(options) : await importApiRegistrationCsv({ ...options, bytes });
    if (!current()) throw new CsvImportError("cancelled");
    return result;
  }
  async function handleEdit(eventId: string, input: EditEventPayload, signal: AbortSignal) {
    if (signal.aborted) throw new EventEditError("cancelled");
    if (!account || !isCurrentAccount() || !canCreate || busy || operationLock.current) {
      throw new EventEditError("unauthorized");
    }
    try {
      const config = parseAuthConfig(import.meta.env);
      const { editApiEvent } = await import("./api-event-edits");
      if (signal.aborted || !isCurrentAccount()) throw new EventEditError("cancelled");
      const updated = await editApiEvent({ instance, account, apiScope: config.apiScope,
        apiUrl: import.meta.env.VITE_API_URL ?? "", eventId, input, signal });
      if (signal.aborted || !isCurrentAccount()) throw new EventEditError("cancelled");
      return updated;
    } catch (error) {
      if (signal.aborted || !isCurrentAccount()) throw new EventEditError("cancelled");
      throw error;
    }
  }
  async function handleLifecycle(eventId: string, action: EventLifecycleAction, input: { expectedVersion: number }, signal: AbortSignal) {
    if (signal.aborted) throw new EventLifecycleError("cancelled");
    if (!account || !isCurrentAccount() || !canCreate || busy || operationLock.current) {
      throw new EventLifecycleError("unauthorized");
    }
    try {
      const config = parseAuthConfig(import.meta.env);
      const { changeApiEventState } = await import("./api-event-lifecycle");
      if (signal.aborted || !isCurrentAccount()) throw new EventLifecycleError("cancelled");
      const updated = await changeApiEventState({ instance, account, apiScope: config.apiScope,
        apiUrl: import.meta.env.VITE_API_URL ?? "", eventId, action, input, signal, isCurrent: isCurrentAccount });
      if (signal.aborted || !isCurrentAccount()) throw new EventLifecycleError("cancelled");
      return updated;
    } catch (error) {
      if (signal.aborted || !isCurrentAccount()) throw new EventLifecycleError("cancelled");
      throw error;
    }
  }
  async function handleCredential(eventId: string, registrationId: string, signal: AbortSignal) {
    const current = () => !signal.aborted && isCurrentAccount();
    if (!current()) throw new CredentialError("cancelled_before_send");
    if (!account || !canCreate || busy || operationLock.current) throw new CredentialError("unauthorized");
    let config;
    try { config = parseAuthConfig(import.meta.env); } catch { throw new CredentialError("configuration"); }
    let client;
    try { client = await import("./api-registration-credentials"); } catch { throw new CredentialError("configuration"); }
    if (!current()) throw new CredentialError("cancelled_before_send");
    return client.issueApiRegistrationCredential({ instance, account, apiScope: config.apiScope,
      apiUrl: import.meta.env.VITE_API_URL ?? "", eventId, registrationId, signal, isCurrent: isCurrentAccount });
  }
  async function handleRegistration(eventId: string, input: RegistrationPayload, signal: AbortSignal) {
    if (signal.aborted) throw new RegistrationError("cancelled");
    if (!account || !isCurrentAccount() || !canCreate || busy || operationLock.current) throw new RegistrationError("unauthorized");
    if (registrationInFlight.current || uncertainRegistrationIds.current.has(eventId)) throw new RegistrationError("uncertain");
    registrationInFlight.current = true;
    let started = false;
    try {
      let config;
      try { config = parseAuthConfig(import.meta.env); } catch { throw new RegistrationError("configuration"); }
      const { registerApiAttendee } = await import("./api-registrations");
      if (signal.aborted || !isCurrentAccount()) throw new RegistrationError("cancelled");
      started = true;
      const result = await registerApiAttendee({ instance, account, apiScope: config.apiScope,
        apiUrl: import.meta.env.VITE_API_URL ?? "", eventId, input, signal });
      if (signal.aborted || !isCurrentAccount()) throw new RegistrationError("cancelled");
      return result;
    } catch (error) {
      if (started && (signal.aborted || !(error instanceof RegistrationError) || ["uncertain", "cancelled"].includes(error.kind))) {
        uncertainRegistrationIds.current.add(eventId);
      }
      if (signal.aborted || !isCurrentAccount()) throw new RegistrationError("cancelled");
      throw error;
    } finally { registrationInFlight.current = false; }
  }
  async function handleCreate(input: CreateEventPayload) {
    if (
      !account ||
      !isCurrentAccount() ||
      !canCreate ||
      editingOpen ||
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

      const created = await createApiEvent({
        instance,
        account,
        apiScope: authConfig.apiScope,
        apiUrl: import.meta.env.VITE_API_URL ?? "",
        input,
      });
      if (isCurrentAccount()) setNotice('Evento creado. Pulsa Cargar eventos para consultar el listado actualizado.');
      return created;
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
                      : "Inicia sesión para consultar, crear y editar eventos."}
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
              disabled={busy || !draftStorageAvailable || editingOpen}
            >
              {pending === "api" ? "Comprobando…" : "Comprobar acceso"}
            </button>

            <p>Comprueba tus permisos para consultar, crear y editar eventos, y registrar o consultar asistentes.</p>
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

      {account && canOperate && !busy && (
        <Suspense fallback={<p role="status">Cargando eventos asignados…</p>}>
          <OperatorEvents accountKey={accountKey(account)} enabled={canOperate && !busy}
            loadPage={operatorPage} loadDetail={operatorDetail} searchPage={operatorSearch}
            onAccessInvalidated={() => { if (isCurrentAccount()) invalidateAccess(); }} />
        </Suspense>
      )}
      {account && canCreate && !busy && (
        <Suspense fallback={<p role="status">Cargando Mis eventos…</p>}>
          <MyEvents
            accountKey={accountKey(account)}
            enabled={canCreate && !busy}
            loadPage={queryEvents}
            loadDetail={queryDetail}
            saveEvent={handleEdit}
            changeEventState={handleLifecycle}
            sendCsv={(id, key, bytes, signal) => csvOperation(id, key, signal, bytes)}
            lookupCsv={(id, key, signal) => csvOperation(id, key, signal)}
            registerAttendee={handleRegistration}
            issueCredential={handleCredential}
            onCredentialSensitiveChange={credentialProtection}
            searchRegistrations={searchRegistrations}
            loadRegistrations={queryRegistrations}
            loadRegistrationDetail={queryRegistrationDetail}
            uncertainRegistrationIds={uncertainRegistrationIds.current}
            onRegistrationUncertain={id => uncertainRegistrationIds.current.add(id)}
            onEditingChange={setEditingOpen}
            onAccessInvalidated={() => { if (isCurrentAccount()) invalidateAccess(); }}
          />
        </Suspense>
      )}
      {account && formOpened && (
        <div hidden={!canCreate || editingOpen}>
          <Suspense
            fallback={
              <p role="status" aria-live="polite">
                Cargando formulario de creación…
              </p>
            }
          >
            <CreateEventForm
              accountStorageKey={accountKey(account)}
              disabled={!canCreate || busy || editingOpen}
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
