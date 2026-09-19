// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import CreateEventForm from "./CreateEventForm";
import {
  EventCreationError,
  type CreatedEvent,
} from "./api-events";
import {
  readEventDraft,
  saveEventDraft,
} from "./event-draft";
import type {
  CreateEventPayload,
  EventFormValues,
} from "./event-form";

const accountStorageKey = "test-account-a";

const values: EventFormValues = {
  name: "DevOpsDays Lima 2027",
  slug: "devopsdays-lima-2027",
  startsAt: "2027-08-27T09:00",
  endsAt: "2027-08-27T17:00",
  timezone: "America/Lima",
  location: "Centro de Convenciones de Lima",
};

const payload: CreateEventPayload = {
  ...values,
  startsAt: "2027-08-27T14:00:00.000Z",
  endsAt: "2027-08-27T22:00:00.000Z",
};

const createdEvent: CreatedEvent = {
  ...payload,
  id: "44444444-4444-4444-8444-444444444444",
  status: "draft",
  createdAt: "2026-09-18T23:00:00.000Z",
};

const labels: Record<keyof EventFormValues, string> = {
  name: "Nombre del evento",
  slug: "Identificador del evento (slug)",
  startsAt: "Fecha y hora de inicio",
  endsAt: "Fecha y hora de fin",
  timezone: "Zona horaria",
  location: "Ubicación",
};

function field(name: keyof EventFormValues): HTMLInputElement {
  return screen.getByLabelText(labels[name]) as HTMLInputElement;
}

function fillForm(nextValues: EventFormValues = values) {
  for (const name of Object.keys(labels) as Array<
    keyof EventFormValues
  >) {
    fireEvent.change(field(name), {
      target: { value: nextValues[name] },
    });
  }
}

function submitForm() {
  const form = field("name").form;

  if (!form) {
    throw new Error("Form was not found.");
  }

  fireEvent.submit(form);
}

function setup(disabled = false) {
  const onCreate = vi
    .fn<(input: CreateEventPayload) => Promise<CreatedEvent>>()
    .mockResolvedValue(createdEvent);

  const props = {
    accountStorageKey,
    disabled,
    onCreate,
    onAccessInvalidated: vi.fn(),
    onDraftStorageChange: vi.fn(),
  };

  const view = render(<CreateEventForm {...props} />);

  return { ...view, props, onCreate };
}

function deferred<T>() {
  let resolve!: (value: T) => void;

  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe("CreateEventForm", () => {
  it("renders labeled fields with Lima as the initial timezone", () => {
    setup();

    for (const name of Object.keys(labels) as Array<
      keyof EventFormValues
    >) {
      expect(field(name)).toBeInstanceOf(HTMLInputElement);
    }

    expect(field("timezone").value).toBe("America/Lima");
  });

  it("rejects an empty form and focuses the first invalid field", () => {
    const { onCreate } = setup();

    submitForm();

    expect(onCreate).not.toHaveBeenCalled();
    expect(field("name").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(field("name"));
    expect(
      screen.getByText(
        "Revisa los campos señalados antes de continuar.",
      ),
    ).toBeTruthy();
  });

  it("sends validated UTC values and shows the returned event", async () => {
    const { onCreate } = setup();

    fillForm();
    submitForm();

    await screen.findByText("Evento creado correctamente");

    expect(onCreate).toHaveBeenCalledExactlyOnceWith(payload);
    expect(screen.getByText(createdEvent.id)).toBeTruthy();
    expect(screen.getByText("Borrador (draft)")).toBeTruthy();
    expect(screen.getByText(createdEvent.startsAt)).toBeTruthy();
    expect(readEventDraft(accountStorageKey)).toBeNull();
  });

  it("does not submit while access is disabled", () => {
    saveEventDraft(accountStorageKey, {
      values,
      outcomeUncertain: false,
    });

    const { onCreate } = setup(true);

    expect(field("name").matches(":disabled")).toBe(true);

    // Incluso un evento submit disparado directamente debe ser rechazado.
    submitForm();

    expect(onCreate).not.toHaveBeenCalled();
  });

  it("blocks duplicate submissions while creation is pending", async () => {
    const { onCreate } = setup();
    const pending = deferred<CreatedEvent>();

    onCreate.mockReturnValue(pending.promise);

    fillForm();
    submitForm();
    submitForm();

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(field("name").matches(":disabled")).toBe(true);
    expect(field("name").form?.getAttribute("aria-busy")).toBe("true");

    pending.resolve(createdEvent);

    await screen.findByText("Evento creado correctamente");
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("saves an uncertain marker before waiting for creation", async () => {
    const { onCreate } = setup();
    const pending = deferred<CreatedEvent>();

    onCreate.mockReturnValue(pending.promise);

    fillForm();
    submitForm();

    expect(readEventDraft(accountStorageKey)).toEqual({
      values,
      outcomeUncertain: true,
    });

    pending.resolve(createdEvent);

    await screen.findByText("Evento creado correctamente");
    expect(readEventDraft(accountStorageKey)).toBeNull();
  });

  it("preserves fields and marks the slug after a conflict", async () => {
    const { onCreate, props } = setup();

    onCreate.mockRejectedValue(
      new EventCreationError(
        "conflict",
        "Ya existe un evento con ese slug.",
      ),
    );

    fillForm();
    submitForm();

    await screen.findByText("Ya existe un evento con ese slug.");

    expect(field("name").value).toBe(values.name);
    expect(field("slug").value).toBe(values.slug);
    expect(field("location").value).toBe(values.location);
    expect(field("slug").getAttribute("aria-invalid")).toBe("true");
    expect(props.onAccessInvalidated).not.toHaveBeenCalled();

    expect(readEventDraft(accountStorageKey)).toEqual({
      values,
      outcomeUncertain: false,
    });
  });

  it.each([
    "interaction_required",
    "authentication",
    "unauthorized",
    "forbidden",
  ] as const)(
    "invalidates access after an authentication error: %s",
    async (kind) => {
      const { onCreate, props } = setup();

      onCreate.mockRejectedValue(
        new EventCreationError(kind, "Comprueba tu acceso."),
      );

      fillForm();
      submitForm();

      await screen.findByText("Comprueba tu acceso.");

      expect(props.onAccessInvalidated).toHaveBeenCalledTimes(1);
      expect(field("name").value).toBe(values.name);
      expect(readEventDraft(accountStorageKey)).toEqual({
        values,
        outcomeUncertain: false,
      });
    },
  );

  it("preserves a validation rejection without invalidating access", async () => {
    const { onCreate, props } = setup();

    onCreate.mockRejectedValue(
      new EventCreationError("validation", "Revisa los datos."),
    );

    fillForm();
    submitForm();

    await screen.findByText("Revisa los datos.");

    expect(props.onAccessInvalidated).not.toHaveBeenCalled();
    expect(field("name").value).toBe(values.name);
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("persists an uncertain result without retrying automatically", async () => {
    const { onCreate } = setup();

    onCreate.mockRejectedValue(
      new EventCreationError(
        "uncertain",
        "No pudimos confirmar el resultado.",
      ),
    );

    fillForm();
    submitForm();

    await screen.findByText("No pudimos confirmar el resultado.");

    expect(readEventDraft(accountStorageKey)).toEqual({
      values,
      outcomeUncertain: true,
    });
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("hides unexpected error details and preserves uncertainty", async () => {
    const { onCreate } = setup();

    onCreate.mockRejectedValue(
      new Error("PRIVATE_INTERNAL_DETAIL"),
    );

    fillForm();
    submitForm();

    await screen.findByText(
      "No pudimos confirmar el resultado. El evento podría haberse guardado. Verifica el resultado antes de volver a enviarlo.",
    );

    expect(
      screen.queryByText(/PRIVATE_INTERNAL_DETAIL/),
    ).toBeNull();

    expect(readEventDraft(accountStorageKey)?.outcomeUncertain).toBe(
      true,
    );
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("restores a saved draft without sending it", () => {
    saveEventDraft(accountStorageKey, {
      values,
      outcomeUncertain: false,
    });

    const { onCreate } = setup();

    for (const name of Object.keys(labels) as Array<
      keyof EventFormValues
    >) {
      expect(field(name).value).toBe(values[name]);
    }

    expect(onCreate).not.toHaveBeenCalled();
  });

  it("restores the uncertainty warning without sending the draft", () => {
    saveEventDraft(accountStorageKey, {
      values,
      outcomeUncertain: true,
    });

    const { onCreate } = setup();

    expect(
      screen.getByText(/Hay un envío cuyo resultado no se confirmó/),
    ).toBeTruthy();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("does not restore another account's draft", () => {
    saveEventDraft("another-account", {
      values,
      outcomeUncertain: true,
    });

    setup();

    expect(field("name").value).toBe("");
    expect(
      screen.queryByText(/Hay un envío cuyo resultado no se confirmó/),
    ).toBeNull();
  });

  it("saves field changes for recovery", () => {
    const { props } = setup();

    fillForm();

    expect(readEventDraft(accountStorageKey)).toEqual({
      values,
      outcomeUncertain: false,
    });
    expect(props.onDraftStorageChange).toHaveBeenLastCalledWith(true);
  });

  it("blocks creation when the draft cannot be saved", async () => {
    const { onCreate, props } = setup();

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });

    fillForm();
    submitForm();

    await screen.findByText(
      /No pudimos guardar el borrador en este navegador/,
    );

    expect(onCreate).not.toHaveBeenCalled();
    expect(props.onDraftStorageChange).toHaveBeenLastCalledWith(false);
  });

  it("keeps the success confirmation if draft removal fails", async () => {
    const { props } = setup();

    fillForm();

    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });

    submitForm();

    await screen.findByText("Evento creado correctamente");

    expect(
      screen.getByText(
        /El evento se creó, pero no pudimos eliminar el borrador local/,
      ),
    ).toBeTruthy();
    expect(props.onDraftStorageChange).toHaveBeenLastCalledWith(false);
  });

  it("starts a fresh form only when the user requests another event", async () => {
    const { onCreate } = setup();

    fillForm();
    submitForm();

    await screen.findByText("Evento creado correctamente");

    expect(
      screen.queryByRole("button", { name: "Crear evento" }),
    ).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Crear otro evento" }),
    );

    expect(field("name").value).toBe("");
    expect(field("slug").value).toBe("");
    expect(field("timezone").value).toBe("America/Lima");
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("retains fields when permission is disabled and enabled again", () => {
    const { rerender, props } = setup();

    fillForm();

    rerender(<CreateEventForm {...props} disabled />);

    expect(field("name").matches(":disabled")).toBe(true);
    expect(field("name").value).toBe(values.name);

    rerender(<CreateEventForm {...props} disabled={false} />);

    expect(field("name").matches(":disabled")).toBe(false);
    expect(field("name").value).toBe(values.name);
  });

  it("keeps earlier uncertainty after a later conflict", async () => {
    saveEventDraft(accountStorageKey, {
      values,
      outcomeUncertain: true,
    });

    const { onCreate } = setup();

    onCreate.mockRejectedValue(
      new EventCreationError("conflict", "El slug ya existe."),
    );

    submitForm();

    await screen.findByText("El slug ya existe.");

    await waitFor(() => {
      expect(
        readEventDraft(accountStorageKey)?.outcomeUncertain,
      ).toBe(true);
    });
  });
});