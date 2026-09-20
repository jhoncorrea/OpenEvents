// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  InteractionStatus,
  type AccountInfo,
  type IPublicClientApplication,
} from "@azure/msal-browser";
import { useMsal } from "@azure/msal-react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { registerApiAttendee, type ApiRegistration } from "./api-registrations";
import { listApiRegistrations, getApiRegistration, type RegistrationPage } from "./api-registration-queries";
import { RegistrationQueryError } from "./registration-query-error";
import { RegistrationError } from "./registration-error";
import SessionControls from "./SessionControls";
import { fetchApiIdentity } from "./api-auth";
import { listApiEvents, getApiEvent, EventQueryError, type ApiEventPage } from "./api-event-queries";
import { editApiEvent } from "./api-event-edits";
import { EventEditError } from "./event-edit-error";
import type { ApiEvent } from "./api-event-queries";
import { createApiEvent } from "./api-events";
import {
  readEventDraft,
  saveEventDraft,
} from "./event-draft";

vi.mock("@azure/msal-react", () => ({
  useMsal: vi.fn(),
}));

vi.mock("./api-auth", () => ({
  fetchApiIdentity: vi.fn(),
}));

vi.mock("./api-events", async (importOriginal) => {
  const original = await importOriginal<typeof import("./api-events")>();

  return {
    ...original,
    createApiEvent: vi.fn(),
  };
});

vi.mock("./api-event-queries", async (importOriginal) => {
  const original = await importOriginal<typeof import("./api-event-queries")>();
  return { ...original, listApiEvents: vi.fn(), getApiEvent: vi.fn() };
});
vi.mock("./api-event-edits", async (importOriginal) => {
  const original = await importOriginal<typeof import("./api-event-edits")>();
  return { ...original, editApiEvent: vi.fn() };
});
vi.mock("./api-registrations", async (importOriginal) => {
  const original = await importOriginal<typeof import("./api-registrations")>();
  return { ...original, registerApiAttendee: vi.fn() };
});
vi.mock("./api-registration-queries", async (importOriginal) => {
  const original = await importOriginal<typeof import("./api-registration-queries")>();
  return { ...original, listApiRegistrations: vi.fn(), getApiRegistration: vi.fn() };
});
const account: AccountInfo = {
  homeAccountId: "test-home",
  localAccountId: "11111111-1111-4111-8111-111111111111",
  environment: "test.ciamlogin.com",
  tenantId: "22222222-2222-4222-8222-222222222222",
  username: "organizer@example.com",
  name: "Organizador de prueba",
};

const identity = {
  tenantId: account.tenantId,
  objectId: account.localAccountId,
  subject: "test-subject",
  roles: ["organizer"],
};

const values = {
  name: "Evento de prueba",
  slug: "evento-de-prueba",
  startsAt: "2027-08-27T09:00",
  endsAt: "2027-08-27T17:00",
  timezone: "America/Lima",
  location: "Lima",
};

function draftKey(value: AccountInfo): string {
  return JSON.stringify([
    value.homeAccountId,
    value.localAccountId,
    value.tenantId,
    value.environment,
  ]);
}

function deferred<T>() {
  let resolve!: (value: T) => void;

  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

function setup(
  initialAccount: AccountInfo | null = account,
  initialProgress = InteractionStatus.None,
) {
  let currentAccount = initialAccount;
  let progress: InteractionStatus = initialProgress;

  const loginRedirect = vi.fn(async () => {});
  const logoutRedirect = vi.fn(async () => {});

  const instance = {
    getActiveAccount: vi.fn(() => currentAccount),
    getAllAccounts: vi.fn(() =>
      currentAccount ? [currentAccount] : [],
    ),
    loginRedirect,
    logoutRedirect,
  } as unknown as IPublicClientApplication;

  vi.mocked(useMsal).mockImplementation(
    () =>
      ({
        instance,
        accounts: currentAccount ? [currentAccount] : [],
        inProgress: progress,
      }) as unknown as ReturnType<typeof useMsal>,
  );

  const view = render(<SessionControls />);

  return {
    ...view,
    instance,
    loginRedirect,
    logoutRedirect,
    switchAccount(next: AccountInfo | null) {
      currentAccount = next;
      view.rerender(<SessionControls />);
    },
    setProgress(next: InteractionStatus) {
      progress = next;
      view.rerender(<SessionControls />);
    },
  };
}

function checkAccess() {
  fireEvent.click(
    screen.getByRole("button", { name: "Comprobar acceso" }),
  );
}

async function expectCreationEnabled() {
  await waitFor(() => {
    const button = screen.getByRole("button", {
      name: "Crear evento",
    });

    expect(button.matches(":disabled")).toBe(false);
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  window.sessionStorage.clear();

  vi.stubEnv(
    "VITE_ENTRA_CLIENT_ID",
    "33333333-3333-4333-8333-333333333333",
  );
  vi.stubEnv("VITE_ENTRA_TENANT_ID", account.tenantId);
  vi.stubEnv("VITE_ENTRA_TENANT_SUBDOMAIN", "openeventstest");
  vi.stubEnv("VITE_ENTRA_REDIRECT_URI", "http://localhost:5173/");
  vi.stubEnv(
    "VITE_ENTRA_API_SCOPE",
    "api://44444444-4444-4444-8444-444444444444/access_as_user",
  );
  vi.stubEnv("VITE_API_URL", "http://localhost:3001");

  vi.mocked(fetchApiIdentity).mockResolvedValue(identity);

  vi.mocked(createApiEvent).mockResolvedValue({
    ...values,
    startsAt: "2027-08-27T14:00:00.000Z",
    endsAt: "2027-08-27T22:00:00.000Z",
    id: "55555555-5555-4555-8555-555555555555",
    status: "draft",
    createdAt: "2026-09-18T23:00:00.000Z",
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  window.sessionStorage.clear();
});

describe("SessionControls", () => {
  it("requires sign-in before exposing event creation", () => {
    setup(null);

    expect(
      screen.getByRole("button", { name: "Iniciar sesión" }),
    ).toBeTruthy();

    expect(
      screen.queryByRole("button", { name: "Crear evento" }),
    ).toBeNull();

    expect(fetchApiIdentity).not.toHaveBeenCalled();
    expect(createApiEvent).not.toHaveBeenCalled();
  });

  it("starts sign-in when requested", async () => {
    const { loginRedirect } = setup(null);

    fireEvent.click(
      screen.getByRole("button", { name: "Iniciar sesión" }),
    );

    await waitFor(() => {
      expect(loginRedirect).toHaveBeenCalledExactlyOnceWith({
        scopes: ["openid", "profile"],
        extraQueryParameters: { ui_locales: "es" },
      });
    });
  });

  it("does not expose creation before checking API permissions", () => {
    setup();

    expect(
      screen.queryByRole("button", { name: "Crear evento" }),
    ).toBeNull();

    expect(createApiEvent).not.toHaveBeenCalled();
  });

  it("enables creation after organizer is confirmed", async () => {
    const { instance } = setup();

    checkAccess();
    await expectCreationEnabled();

    expect(fetchApiIdentity).toHaveBeenCalledExactlyOnceWith({
      instance,
      account,
      apiScope:
        "api://44444444-4444-4444-8444-444444444444/access_as_user",
      apiUrl: "http://localhost:3001",
    });
  });

  it.each([
    ["without roles", []],
    ["admin only", ["admin"]],
    ["operator only", ["checkin_operator"]],
  ])("denies creation for a user %s", async (_label, roles) => {
    vi.mocked(fetchApiIdentity).mockResolvedValue({
      ...identity,
      roles,
    });

    setup();
    checkAccess();

    await screen.findByText(
      /Tu cuenta no tiene el rol organizer/,
    );

    expect(
      screen.queryByRole("button", { name: "Crear evento" }),
    ).toBeNull();

    expect(createApiEvent).not.toHaveBeenCalled();
  });

  it("keeps creation unavailable while permissions are pending", async () => {
    const pending = deferred<typeof identity>();

    vi.mocked(fetchApiIdentity).mockReturnValue(pending.promise);

    setup();
    checkAccess();

    expect(
      screen.queryByRole("button", { name: "Crear evento" }),
    ).toBeNull();

    expect(
      screen.getByRole("button", { name: "Comprobando…" })
        .matches(":disabled"),
    ).toBe(true);

    pending.resolve(identity);
    await expectCreationEnabled();
  });

  it("keeps creation unavailable after a permission check failure", async () => {
    vi.mocked(fetchApiIdentity).mockRejectedValue(
      new Error("PRIVATE_DETAIL"),
    );

    setup();
    checkAccess();

    await screen.findByText(
      /No pudimos comprobar el acceso a la API/,
    );

    expect(screen.queryByText(/PRIVATE_DETAIL/)).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Crear evento" }),
    ).toBeNull();
  });

  it("requires checking access again after an authorization redirect", async () => {
    vi.mocked(fetchApiIdentity).mockResolvedValue(null);

    setup();
    checkAccess();

    await screen.findByText(
      /Completa la autorización con Microsoft/,
    );

    expect(
      screen.queryByRole("button", { name: "Crear evento" }),
    ).toBeNull();
  });

  it("discards displayed permissions when the account changes", async () => {
    const view = setup();

    checkAccess();
    await expectCreationEnabled();

    view.switchAccount({
      ...account,
      homeAccountId: "another-home",
      localAccountId: "66666666-6666-4666-8666-666666666666",
      name: "Otra cuenta",
    });

    expect(screen.getByText("Otra cuenta")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Crear evento" }),
    ).toBeNull();
    expect(screen.queryByText("Roles: organizer.")).toBeNull();
  });

  it("ignores a permission response from a previous account", async () => {
    const pending = deferred<typeof identity>();

    vi.mocked(fetchApiIdentity).mockReturnValue(pending.promise);

    const view = setup();
    checkAccess();

    view.switchAccount({
      ...account,
      homeAccountId: "another-home",
      localAccountId: "66666666-6666-4666-8666-666666666666",
      name: "Otra cuenta",
    });

    pending.resolve(identity);

    await waitFor(() => {
      expect(screen.getByText("Otra cuenta")).toBeTruthy();
      expect(
        screen.queryByRole("button", { name: "Crear evento" }),
      ).toBeNull();
    });

    expect(screen.queryByText("Roles: organizer.")).toBeNull();
  });

  it("disables creation during an MSAL interaction", async () => {
    const view = setup();

    checkAccess();
    await expectCreationEnabled();

    view.setProgress(InteractionStatus.AcquireToken);

    expect(
      screen.getByRole("button", { name: "Crear evento" })
        .matches(":disabled"),
    ).toBe(true);
  });

  it("creates an event using the restored form and current account", async () => {
    saveEventDraft(draftKey(account), {
      values,
      outcomeUncertain: false,
    });

    const { instance } = setup();

    checkAccess();
    await expectCreationEnabled();

    fireEvent.click(
      screen.getByRole("button", { name: "Crear evento" }),
    );

    await screen.findByText("Evento creado correctamente");

    expect(createApiEvent).toHaveBeenCalledExactlyOnceWith({
      instance,
      account,
      apiScope:
        "api://44444444-4444-4444-8444-444444444444/access_as_user",
      apiUrl: "http://localhost:3001",
      input: {
        ...values,
        startsAt: "2027-08-27T14:00:00.000Z",
        endsAt: "2027-08-27T22:00:00.000Z",
      },
    });

    expect(readEventDraft(draftKey(account))).toBeNull();
  });

  it("clears the current account draft before logout", async () => {
    saveEventDraft(draftKey(account), {
      values,
      outcomeUncertain: false,
    });

    const { logoutRedirect } = setup();

    logoutRedirect.mockImplementation(async () => {
      expect(readEventDraft(draftKey(account))).toBeNull();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Cerrar sesión" }),
    );

    await waitFor(() => {
      expect(logoutRedirect).toHaveBeenCalledExactlyOnceWith({
        account,
      });
    });
  });

  it("blocks a redirecting permission check if draft saving failed", async () => {
    setup();

    checkAccess();
    await expectCreationEnabled();

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });

    fireEvent.change(screen.getByLabelText("Nombre del evento"), {
      target: { value: "Borrador sin guardar" },
    });

    expect(
      screen.getByRole("button", { name: "Comprobar acceso" })
        .matches(":disabled"),
    ).toBe(true);

    expect(fetchApiIdentity).toHaveBeenCalledTimes(1);
  });
});
const queriedEvent = {
  id: "a5555555-5555-4555-8555-555555555555", name: "Evento consultado", slug: "evento-consultado",
  startsAt: "2027-08-27T14:00:00Z", endsAt: "2027-08-27T22:00:00Z", createdAt: "2026-09-19T12:00:00Z",
  timezone: "America/Lima", location: "Lugar consultado", version: 1, status: "draft" as const,
};

describe("SessionControls event editing", () => {
  beforeEach(() => {
    vi.mocked(listApiEvents).mockResolvedValue({ items: [queriedEvent], nextCursor: null });
    vi.mocked(getApiEvent).mockResolvedValue(queriedEvent);
    vi.mocked(editApiEvent).mockResolvedValue({ ...queriedEvent, name: "Cambio guardado", version: 2 });
  });
  async function openEditor() {
    checkAccess(); fireEvent.click(await screen.findByRole("button", { name: "Cargar eventos" }));
    fireEvent.click(await screen.findByRole("button", { name: "Ver detalle de Evento consultado" }));
    fireEvent.click(await screen.findByRole("button", { name: "Editar evento" }));
    return await screen.findByRole("region", { name: "Editar evento" });
  }
  function saveEdit(editor: HTMLElement) {
    fireEvent.change(within(editor).getByLabelText("Nombre del evento"), { target: { value: "Cambio guardado" } });
    fireEvent.click(within(editor).getByText("Guardar cambios"));
  }
  it("sends a PATCH with the current account, scope, version and event ID", async () => {
    const view = setup(); const editor = await openEditor(); saveEdit(editor);
    await screen.findByText("Evento actualizado correctamente.");
    expect(editApiEvent).toHaveBeenCalledExactlyOnceWith({
      instance: view.instance, account, apiScope: "api://44444444-4444-4444-8444-444444444444/access_as_user", apiUrl: "http://localhost:3001",
      eventId: queriedEvent.id, input: { expectedVersion: 1, name: "Cambio guardado" }, signal: expect.any(AbortSignal),
    });
    expect(screen.getByText("Cambio guardado")).toBeTruthy();
  });
  it("prevents creation and access checks from discarding an open editor", async () => {
    setup(); const editor = await openEditor();
    expect(screen.getByRole("button", { name: "Comprobar acceso" }).matches(":disabled")).toBe(true);
    expect(screen.queryByRole("button", { name: "Crear evento" })).toBeNull();
    fireEvent.click(screen.getByText("Comprobar acceso")); expect(fetchApiIdentity).toHaveBeenCalledTimes(1);
    expect(createApiEvent).not.toHaveBeenCalled(); expect(within(editor).getByLabelText("Nombre del evento")).toBeTruthy();
    fireEvent.click(within(editor).getByText("Cancelar edición")); await screen.findByRole("button", { name: "Editar evento" });
    await expectCreationEnabled(); expect(screen.getByText("Comprobar acceso").matches(":disabled")).toBe(false);
  });
  it("preserves an existing creation draft while the editor is open", async () => {
    saveEventDraft(draftKey(account), { values, outcomeUncertain: false }); setup(); const editor = await openEditor();
    fireEvent.click(within(editor).getByText("Cancelar edición")); await expectCreationEnabled();
    expect((screen.getByLabelText("Nombre del evento") as HTMLInputElement).value).toBe(values.name);
  });
  it("aborts a pending PATCH when logout begins and ignores its result", async () => {
    const request = deferred<ApiEvent>(); vi.mocked(editApiEvent).mockReturnValue(request.promise);
    const view = setup(); saveEdit(await openEditor()); await waitFor(() => expect(editApiEvent).toHaveBeenCalledTimes(1));
    const signal = vi.mocked(editApiEvent).mock.calls[0][0].signal;
    fireEvent.click(screen.getByText("Cerrar sesión")); await waitFor(() => expect(view.logoutRedirect).toHaveBeenCalled());
    expect(signal?.aborted).toBe(true); expect(screen.queryByRole("region", { name: "Editar evento" })).toBeNull();
    await act(async () => request.resolve({ ...queriedEvent, name: "Late save", version: 2 }));
    expect(screen.queryByText("Late save")).toBeNull(); expect(screen.queryByText("Evento actualizado correctamente.")).toBeNull();
  });
  it("clears editing when the selected account changes", async () => {
    const request = deferred<ApiEvent>(); vi.mocked(editApiEvent).mockReturnValue(request.promise);
    const view = setup(); saveEdit(await openEditor()); await waitFor(() => expect(editApiEvent).toHaveBeenCalledTimes(1));
    const signal = vi.mocked(editApiEvent).mock.calls[0][0].signal;
    view.switchAccount({ ...account, homeAccountId: "different" }); expect(signal?.aborted).toBe(true);
    await act(async () => request.resolve({ ...queriedEvent, name: "Other account data", version: 2 }));
    expect(screen.queryByText("Other account data")).toBeNull(); expect(screen.queryByRole("region", { name: "Editar evento" })).toBeNull();
  });
  it("discards editing on an MSAL interaction without accepting late responses", async () => {
    const request = deferred<ApiEvent>(); vi.mocked(editApiEvent).mockReturnValue(request.promise);
    const view = setup(); saveEdit(await openEditor()); await waitFor(() => expect(editApiEvent).toHaveBeenCalledTimes(1));
    const signal = vi.mocked(editApiEvent).mock.calls[0][0].signal;
    view.setProgress(InteractionStatus.AcquireToken); expect(signal?.aborted).toBe(true);
    await act(async () => request.resolve({ ...queriedEvent, version: 2 }));
    expect(screen.queryByText("Evento actualizado correctamente.")).toBeNull();
  });
  it("invalidates access after forbidden editing and explains that edited data was cleared", async () => {
    vi.mocked(editApiEvent).mockRejectedValue(new EventEditError("forbidden")); setup(); saveEdit(await openEditor());
    await screen.findByText(/Los datos de consulta y edición se han retirado/);
    expect(screen.queryByRole("region", { name: "Mis eventos" })).toBeNull();
    checkAccess(); await expectCreationEnabled();
    expect(screen.queryByRole("region", { name: "Editar evento" })).toBeNull();
  });
  it("keeps the editor available for conflict recovery rather than invalidating the session", async () => {
    vi.mocked(editApiEvent).mockRejectedValue(new EventEditError("version_conflict")); setup(); saveEdit(await openEditor());
    expect(await screen.findByText("Consultar estado actual")).toBeTruthy();
    expect(screen.getByText("Acceso a la API verificado.")).toBeTruthy(); expect(fetchApiIdentity).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Crear evento" })).toBeNull();
  });
});

describe("SessionControls event queries", () => {
  beforeEach(() => {
    vi.mocked(listApiEvents).mockResolvedValue({ items: [queriedEvent], nextCursor: null });
    vi.mocked(getApiEvent).mockResolvedValue(queriedEvent);
  });
  async function showEvents() {
    checkAccess();
    fireEvent.click(await screen.findByRole("button", { name: "Cargar eventos" }));
    await screen.findByRole("button", { name: "Ver detalle de Evento consultado" });
  }
  it("requires verified organizer access before showing queries", async () => {
    setup();
    expect(screen.queryByRole("region", { name: "Mis eventos" })).toBeNull();
    vi.mocked(fetchApiIdentity).mockResolvedValue({ ...identity, roles: ["admin"] });
    checkAccess(); await screen.findByText(/Tu cuenta no tiene el rol organizer/);
    expect(screen.queryByRole("region", { name: "Mis eventos" })).toBeNull();
    expect(listApiEvents).not.toHaveBeenCalled();
  });
  it("uses the current account and scope for list and detail", async () => {
    const view = setup(); await showEvents();
    expect(listApiEvents).toHaveBeenCalledExactlyOnceWith({
      instance: view.instance, account, apiScope: "api://44444444-4444-4444-8444-444444444444/access_as_user",
      apiUrl: "http://localhost:3001", cursor: undefined, signal: expect.any(AbortSignal),
    });
    fireEvent.click(screen.getByRole("button", { name: "Ver detalle de Evento consultado" }));
    await screen.findByText(queriedEvent.id);
    expect(getApiEvent).toHaveBeenCalledWith(expect.objectContaining({ account, eventId: queriedEvent.id }));
  });
  it("clears displayed events when the account changes", async () => {
    const view = setup(); await showEvents();
    view.switchAccount({ ...account, homeAccountId: "other-account" });
    expect(screen.queryByText("Evento consultado")).toBeNull();
    expect(screen.queryByRole("region", { name: "Mis eventos" })).toBeNull();
  });
  it("aborts and ignores a previous account's pending response", async () => {
    const request = deferred<ApiEventPage>(); vi.mocked(listApiEvents).mockReturnValue(request.promise);
    const view = setup(); checkAccess(); fireEvent.click(await screen.findByText("Cargar eventos"));
    await waitFor(() => expect(listApiEvents).toHaveBeenCalledTimes(1));
    const signal = vi.mocked(listApiEvents).mock.calls[0][0].signal;
    view.switchAccount({ ...account, homeAccountId: "other-account" });
    expect(signal?.aborted).toBe(true);
    await act(async () => request.resolve({ items: [queriedEvent], nextCursor: null }));
    expect(screen.queryByText("Evento consultado")).toBeNull();
  });
  it("clears events when logout starts", async () => {
    const view = setup(); await showEvents();
    fireEvent.click(screen.getByText("Cerrar sesión"));
    expect(screen.queryByText("Evento consultado")).toBeNull();
    await waitFor(() => expect(view.logoutRedirect).toHaveBeenCalled());
  });
  it("aborts queries during an MSAL interaction", async () => {
    const request = deferred<ApiEventPage>(); vi.mocked(listApiEvents).mockReturnValue(request.promise);
    const view = setup(); checkAccess(); fireEvent.click(await screen.findByText("Cargar eventos"));
    await waitFor(() => expect(listApiEvents).toHaveBeenCalledTimes(1));
    const signal = vi.mocked(listApiEvents).mock.calls[0][0].signal;
    view.setProgress(InteractionStatus.AcquireToken);
    expect(signal?.aborted).toBe(true); expect(screen.queryByRole("region", { name: "Mis eventos" })).toBeNull();
    await act(async () => request.resolve({ items: [queriedEvent], nextCursor: null }));
  });
  it("invalidates access after a query rejection while retaining form fields", async () => {
    const view = setup(); await showEvents(); await expectCreationEnabled();
    fireEvent.change(screen.getByLabelText("Nombre del evento"), { target: { value: "Mi borrador" } });
    vi.mocked(getApiEvent).mockRejectedValue(new EventQueryError("forbidden"));
    fireEvent.click(screen.getByRole("button", { name: "Ver detalle de Evento consultado" }));
    await screen.findByText(/Vuelve a comprobar el acceso antes de continuar/);
    expect(screen.queryByRole("region", { name: "Mis eventos" })).toBeNull();
    checkAccess(); await expectCreationEnabled();
    expect((screen.getByLabelText("Nombre del evento") as HTMLInputElement).value).toBe("Mi borrador");
    expect(view.instance).toBeTruthy();
  });
  it("allows reloading the list after creation and retains the confirmation", async () => {
    saveEventDraft(draftKey(account), { values, outcomeUncertain: false });
    setup(); await showEvents(); await expectCreationEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Crear evento" }));
    await screen.findByText("Evento creado correctamente");
    expect(screen.queryByText("Evento consultado")).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Cargar eventos" }));
    await screen.findByRole("button", { name: "Ver detalle de Evento consultado" });
    expect(screen.getByText("Evento creado correctamente")).toBeTruthy();
    expect(listApiEvents).toHaveBeenCalledTimes(2);
  });
});


describe("SessionControls attendee registration", () => {
  const registration: ApiRegistration = { id: "b4444444-4444-4444-8444-444444444444", eventId: queriedEvent.id,
    status: "confirmed", source: "manual", createdAt: "2026-09-20T12:00:00.000Z",
    attendee: { id: "c4444444-4444-4444-8444-444444444444", fullName: "Persona prueba", email: "persona@example.com" } };
  beforeEach(() => {
    vi.mocked(listApiEvents).mockResolvedValue({ items: [queriedEvent], nextCursor: null });
    vi.mocked(getApiEvent).mockResolvedValue(queriedEvent);
    vi.mocked(registerApiAttendee).mockResolvedValue(registration);
  });
  async function showDetail() {
    fireEvent.click(await screen.findByRole("button", { name: "Cargar eventos" }));
    fireEvent.click(await screen.findByRole("button", { name: "Ver detalle de Evento consultado" }));
    await screen.findByRole("button", { name: "Registrar asistente" });
  }
  async function openRegistration() {
    checkAccess(); await showDetail(); fireEvent.click(screen.getByRole("button", { name: "Registrar asistente" }));
    await screen.findByLabelText("Nombre completo");
  }
  function submitRegistration() {
    fireEvent.change(screen.getByLabelText("Nombre completo"), { target: { value: " Persona prueba " } });
    fireEvent.change(screen.getByLabelText("Correo electrónico"), { target: { value: "Persona@Example.COM" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar inscripción" }));
  }
  it("sends normalized data with the selected account, scope and event", async () => {
    const view = setup(); await openRegistration();
    expect(screen.queryByRole("button", { name: "Crear evento" })).toBeNull();
    expect((screen.getByRole("button", { name: "Comprobar acceso" }) as HTMLButtonElement).disabled).toBe(true);
    submitRegistration(); await screen.findByText("Asistente registrado correctamente.");
    expect(registerApiAttendee).toHaveBeenCalledExactlyOnceWith({ instance: view.instance, account,
      apiScope: "api://44444444-4444-4444-8444-444444444444/access_as_user", apiUrl: "http://localhost:3001",
      eventId: queriedEvent.id, input: { fullName: "Persona prueba", email: "persona@example.com" }, signal: expect.any(AbortSignal) });
    fireEvent.click(screen.getByText("Registrar otro asistente"));
    expect((screen.getByLabelText("Nombre completo") as HTMLInputElement).value).toBe("");
    expect(registerApiAttendee).toHaveBeenCalledTimes(1);
  });
  it("keeps uncertainty blocked after navigation and a new access check", async () => {
    vi.mocked(registerApiAttendee).mockRejectedValue(new RegistrationError("uncertain"));
    vi.spyOn(window, "confirm").mockReturnValue(true); setup(); await openRegistration(); submitRegistration();
    await screen.findByText(/No pudimos confirmar la inscripción/); fireEvent.click(screen.getByText("Volver al evento"));
    await screen.findByText(/resultado pendiente de verificar/);
    checkAccess(); await showDetail();
    expect((screen.getByRole("button", { name: "Registrar asistente" }) as HTMLButtonElement).disabled).toBe(true);
    expect(registerApiAttendee).toHaveBeenCalledTimes(1);
  });
  it("invalidates access and clears attendee data after forbidden", async () => {
    vi.mocked(registerApiAttendee).mockRejectedValue(new RegistrationError("forbidden"));
    setup(); await openRegistration(); submitRegistration(); await screen.findByText(/Vuelve a comprobar el acceso antes de continuar/);
    expect(screen.queryByLabelText("Nombre completo")).toBeNull(); expect(screen.queryByText("persona@example.com")).toBeNull();
  });
  it.each(["account", "logout", "interaction"])("aborts registration on %s and ignores late success", async change => {
    const request = deferred<ApiRegistration>(); vi.mocked(registerApiAttendee).mockReturnValue(request.promise);
    const view = setup(); await openRegistration(); submitRegistration(); await waitFor(() => expect(registerApiAttendee).toHaveBeenCalledTimes(1));
    const signal = vi.mocked(registerApiAttendee).mock.calls[0][0].signal;
    if (change === "account") view.switchAccount({ ...account, homeAccountId: "other" });
    else if (change === "logout") fireEvent.click(screen.getByText("Cerrar sesión"));
    else view.setProgress(InteractionStatus.AcquireToken);
    expect(signal?.aborted).toBe(true);
    await act(async () => request.resolve(registration));
    expect(screen.queryByText("Asistente registrado correctamente.")).toBeNull(); expect(screen.queryByLabelText("Nombre completo")).toBeNull();
    if (change === "interaction") {
      view.setProgress(InteractionStatus.None); await showDetail();
      expect((screen.getByRole("button", { name: "Registrar asistente" }) as HTMLButtonElement).disabled).toBe(true);
    }
  });
});

describe("SessionControls registration queries", () => {
  const registration: ApiRegistration = { id: "b4444444-4444-4444-8444-444444444444", eventId: queriedEvent.id,
    status: "confirmed", source: "manual", createdAt: "2026-09-20T12:00:00.000Z",
    attendee: { id: "c4444444-4444-4444-8444-444444444444", fullName: "Persona consulta", email: "consulta@example.com" } };
  beforeEach(() => {
    vi.mocked(listApiEvents).mockResolvedValue({ items: [queriedEvent], nextCursor: null });
    vi.mocked(getApiEvent).mockResolvedValue(queriedEvent);
    vi.mocked(listApiRegistrations).mockResolvedValue({ items: [registration], nextCursor: null });
    vi.mocked(getApiRegistration).mockResolvedValue(registration);
  });
  async function browse() {
    checkAccess(); fireEvent.click(await screen.findByRole("button", { name: "Cargar eventos" }));
    fireEvent.click(await screen.findByRole("button", { name: "Ver detalle de Evento consultado" }));
    fireEvent.click(await screen.findByRole("button", { name: "Ver inscripciones" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cargar inscripciones" }));
  }
  it("uses the verified account and API scope for both registration reads", async () => {
    const view = setup(); await browse(); await screen.findByText("Persona consulta");
    const common = { instance: view.instance, account, apiScope: "api://44444444-4444-4444-8444-444444444444/access_as_user",
      apiUrl: "http://localhost:3001", eventId: queriedEvent.id, signal: expect.any(AbortSignal) };
    expect(listApiRegistrations).toHaveBeenCalledExactlyOnceWith({ ...common, cursor: undefined });
    fireEvent.click(screen.getByText("Ver inscripción")); await screen.findByText("Registro manual");
    expect(getApiRegistration).toHaveBeenCalledExactlyOnceWith({ ...common, registrationId: registration.id });
  });
  it.each(["account", "logout", "interaction", "recheck"])("aborts a registration page on %s and discards its late result", async change => {
    const request = deferred<RegistrationPage>(); vi.mocked(listApiRegistrations).mockReturnValue(request.promise);
    const view = setup(); await browse(); await waitFor(() => expect(listApiRegistrations).toHaveBeenCalledTimes(1));
    const signal = vi.mocked(listApiRegistrations).mock.calls[0][0].signal;
    if (change === "account") view.switchAccount({ ...account, homeAccountId: "other" });
    else if (change === "logout") fireEvent.click(screen.getByText("Cerrar sesión"));
    else if (change === "interaction") view.setProgress(InteractionStatus.AcquireToken);
    else checkAccess();
    expect(signal?.aborted).toBe(true);
    await act(async () => request.resolve({ items: [registration], nextCursor: null }));
    expect(screen.queryByText("consulta@example.com")).toBeNull();
  });
  it("aborts registration detail on account change", async () => {
    const request = deferred<ApiRegistration>(); vi.mocked(getApiRegistration).mockReturnValue(request.promise);
    const view = setup(); await browse(); await screen.findByText("Persona consulta");
    fireEvent.click(screen.getByText("Ver inscripción")); await waitFor(() => expect(getApiRegistration).toHaveBeenCalledTimes(1));
    const signal = vi.mocked(getApiRegistration).mock.calls[0][0].signal;
    view.switchAccount({ ...account, homeAccountId: "other" }); expect(signal?.aborted).toBe(true);
    await act(async () => request.resolve(registration)); expect(screen.queryByText("consulta@example.com")).toBeNull();
  });
  it.each(["unauthorized", "forbidden"] as const)("invalidates session access after %s without displaying attendee data", async kind => {
    vi.mocked(listApiRegistrations).mockRejectedValue(new RegistrationQueryError(kind)); setup(); await browse();
    await screen.findByText(/Vuelve a comprobar el acceso antes de continuar/);
    expect(screen.queryByRole("region", { name: "Mis eventos" })).toBeNull();
    expect(screen.queryByText("consulta@example.com")).toBeNull();
  });
  it("removes an inaccessible event without invalidating the whole session on 404", async () => {
    vi.mocked(listApiRegistrations).mockRejectedValue(new RegistrationQueryError("not_found")); setup(); await browse();
    await screen.findByText(/El evento o la inscripción ya no están disponibles/);
    expect(screen.getByText("Acceso a la API verificado.")).toBeTruthy();
    expect(screen.queryByText("consulta@example.com")).toBeNull();
  });
});
