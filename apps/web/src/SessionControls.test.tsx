// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
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
import SessionControls from "./SessionControls";
import { fetchApiIdentity } from "./api-auth";
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