// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EditEventPayload } from "./api-event-edits";
import { EventEditError } from "./event-edit-error";
import MyEvents from "./MyEvents";
import { EventQueryError, type ApiEvent, type ApiEventPage } from "./api-event-queries";
import { RegistrationQueryError, type QueriedRegistration } from "./api-registration-queries";
import type { RegistrationBrowserProps } from "./RegistrationBrowser";
import { writeCsvRecovery } from "./csv-import-recovery";

const event: ApiEvent = { id: "a4444444-4444-4444-8444-444444444444", name: "Evento Lima", slug: "evento-lima",
  startsAt: "2027-08-27T14:00:00Z", endsAt: "2027-08-27T22:00:00Z", createdAt: "2026-09-19T12:00:00Z",
  timezone: "America/Lima", location: "San Borja", status: "draft", version: 1 };
function setup() {
  return { accountKey: "account-a", enabled: true,
    loadPage: vi.fn<(cursor: string | undefined, signal: AbortSignal) => Promise<ApiEventPage>>()
      .mockResolvedValue({ items: [event], nextCursor: null }),
    loadDetail: vi.fn<(id: string, signal: AbortSignal) => Promise<ApiEvent>>().mockResolvedValue(event),
    saveEvent: vi.fn<(id: string, input: EditEventPayload, signal: AbortSignal) => Promise<ApiEvent>>().mockResolvedValue({ ...event, name: "Nombre editado", version: 2 }),
    onEditingChange: vi.fn(),
    onAccessInvalidated: vi.fn() };
}
function pending<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
async function load() { fireEvent.click(screen.getByRole("button", { name: "Cargar eventos" })); await screen.findByRole("button", { name: "Ver detalle de Evento Lima" }); }
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("MyEvents CSV navigation", () => {
  it("refreshes event on opening CSV and returning; hides competing actions", async () => {
    const props = { ...setup(), sendCsv: vi.fn(), lookupCsv: vi.fn() };
    render(<MyEvents {...props} />); await load(); fireEvent.click(screen.getByRole("button", { name: "Ver detalle de Evento Lima" }));
    fireEvent.click(await screen.findByRole("button", { name: "Importar CSV" })); await screen.findByRole("region", { name: "Importación CSV" });
    expect(props.loadDetail).toHaveBeenCalledTimes(2); expect(screen.queryByText("Editar evento")).toBeNull(); expect(props.onEditingChange).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByText("Volver al evento")); await screen.findByRole("button", { name: "Importar CSV" }); expect(props.loadDetail).toHaveBeenCalledTimes(3);
  });
  it("offers recovery for a closed event with a saved key", async () => {
    sessionStorage.clear(); writeCsvRecovery("account-a", event.id, { key: event.id, hash: "a".repeat(64) });
    const props = { ...setup(), sendCsv: vi.fn(), lookupCsv: vi.fn().mockResolvedValue({ status: "not_observed" }) };
    props.loadDetail.mockResolvedValue({ ...event, status: "closed" }); render(<MyEvents {...props} />); await load();
    fireEvent.click(screen.getByRole("button", { name: "Ver detalle de Evento Lima" })); fireEvent.click(await screen.findByText("Recuperar importación CSV"));
    fireEvent.click(await screen.findByText("Consultar comprobante")); await screen.findByText(/Todavía no se observa/);
    expect(props.lookupCsv).toHaveBeenCalledWith(event.id, event.id, expect.any(AbortSignal)); sessionStorage.clear();
  });
});

describe("MyEvents", () => {
  it("does not expose or query events while disabled", () => {
    const props = setup(); render(<MyEvents {...props} enabled={false} />);
    expect(screen.queryByRole("region", { name: "Mis eventos" })).toBeNull();
    expect(props.loadPage).not.toHaveBeenCalled();
  });
  it("loads on request and shows local dates, timezone and status", async () => {
    const props = setup(); render(<MyEvents {...props} />);
    expect(props.loadPage).not.toHaveBeenCalled(); await load();
    expect(props.loadPage).toHaveBeenCalledExactlyOnceWith(undefined, expect.any(AbortSignal));
    expect(screen.getByText("Borrador")).toBeTruthy();
    expect(screen.getByText("America/Lima")).toBeTruthy();
    expect(screen.getByText(/09:00/)).toBeTruthy(); expect(screen.getByText(/17:00/)).toBeTruthy();
  });
  it("shows an empty state", async () => {
    const props = setup(); props.loadPage.mockResolvedValue({ items: [], nextCursor: null });
    render(<MyEvents {...props} />); fireEvent.click(screen.getByText("Cargar eventos"));
    expect(await screen.findByText("No tienes eventos asignados.")).toBeTruthy();
  });
  it("opens a fresh detail response and returns without losing the list", async () => {
    const props = setup(); props.loadDetail.mockResolvedValue({ ...event, name: "Nombre actualizado", status: "active" });
    render(<MyEvents {...props} />); await load();
    fireEvent.click(screen.getByRole("button", { name: "Ver detalle de Evento Lima" }));
    expect(await screen.findByText("Nombre actualizado")).toBeTruthy();
    expect(screen.getByText("Activo")).toBeTruthy();
    expect(props.loadDetail).toHaveBeenCalledExactlyOnceWith(event.id, expect.any(AbortSignal));
    fireEvent.click(screen.getByText("Volver al listado"));
    expect(screen.getByRole("button", { name: "Ver detalle de Nombre actualizado" })).toBeTruthy();
    expect(props.loadPage).toHaveBeenCalledTimes(1);
  });
  it("appends pages without duplicating repeated events", async () => {
    const props = setup(); const other = { ...event, id: "b4444444-4444-4444-8444-444444444444", name: "Otro evento" };
    props.loadPage.mockResolvedValueOnce({ items: [event], nextCursor: "next" })
      .mockResolvedValueOnce({ items: [event, other], nextCursor: null });
    render(<MyEvents {...props} />); await load(); fireEvent.click(screen.getByText("Cargar más eventos"));
    await screen.findByText("2 eventos cargados.");
    expect(screen.getAllByRole("button", { name: "Ver detalle de Evento Lima" })).toHaveLength(1);
    expect(props.loadPage.mock.calls[1][0]).toBe("next");
    expect(screen.queryByText("Cargar más eventos")).toBeNull();
  });
  it("blocks double clicks while a page is pending", async () => {
    const props = setup(); const request = pending<ApiEventPage>(); props.loadPage.mockReturnValue(request.promise);
    render(<MyEvents {...props} />); const button = screen.getByText("Cargar eventos");
    fireEvent.click(button); fireEvent.click(button);
    expect(props.loadPage).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toBe("Cargando eventos…");
    await act(async () => request.resolve({ items: [], nextCursor: null }));
  });
  it("refreshes from the first page and clears obsolete entries", async () => {
    const props = setup(); render(<MyEvents {...props} />); await load();
    props.loadPage.mockResolvedValue({ items: [], nextCursor: null });
    fireEvent.click(screen.getByText("Actualizar listado")); await screen.findByText("No tienes eventos asignados.");
    expect(props.loadPage.mock.calls[1][0]).toBeUndefined();
    expect(screen.queryByText("Evento Lima")).toBeNull();
  });
  it("preserves the current page after a later-page failure", async () => {
    const props = setup(); props.loadPage.mockResolvedValueOnce({ items: [event], nextCursor: "next" })
      .mockRejectedValueOnce(new EventQueryError("unavailable"));
    render(<MyEvents {...props} />); await load(); fireEvent.click(screen.getByText("Cargar más eventos"));
    await screen.findByRole("alert"); expect(screen.getByText("Evento Lima")).toBeTruthy();
    expect(props.onAccessInvalidated).not.toHaveBeenCalled();
  });
  it.each(["unauthorized", "forbidden", "authentication", "interaction_required"] as const)("clears data on %s", async kind => {
    const props = setup(); render(<MyEvents {...props} />); await load();
    props.loadDetail.mockRejectedValue(new EventQueryError(kind));
    fireEvent.click(screen.getByRole("button", { name: "Ver detalle de Evento Lima" }));
    await screen.findByRole("alert"); expect(props.onAccessInvalidated).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("San Borja")).toBeNull();
    fireEvent.click(screen.getByText("Volver al listado")); expect(screen.queryByText("Evento Lima")).toBeNull();
  });
  it("removes an inaccessible event when detail returns 404", async () => {
    const props = setup(); props.loadDetail.mockRejectedValue(new EventQueryError("not_found"));
    render(<MyEvents {...props} />); await load(); fireEvent.click(screen.getByRole("button", { name: "Ver detalle de Evento Lima" }));
    await screen.findByRole("alert"); expect(props.onAccessInvalidated).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Volver al listado")); expect(screen.queryByText("Evento Lima")).toBeNull();
  });
  it("ignores a previous account's response and aborts its request", async () => {
    const props = setup(); const request = pending<ApiEventPage>(); props.loadPage.mockReturnValueOnce(request.promise);
    const view = render(<MyEvents {...props} />); fireEvent.click(screen.getByText("Cargar eventos"));
    view.rerender(<MyEvents {...props} accountKey="account-b" />);
    expect(props.loadPage.mock.calls[0][1].aborted).toBe(true);
    await act(async () => request.resolve({ items: [event], nextCursor: null }));
    expect(screen.queryByText("Evento Lima")).toBeNull();
  });
  it("clears data when access is disabled and later restored", async () => {
    const props = setup(); const view = render(<MyEvents {...props} />); await load();
    view.rerender(<MyEvents {...props} enabled={false} />); expect(screen.queryByText("Evento Lima")).toBeNull();
    view.rerender(<MyEvents {...props} />); expect(screen.queryByText("Evento Lima")).toBeNull();
    expect(screen.getByText("Cargar eventos")).toBeTruthy();
  });
  it("cancels detail when returning and ignores late completion", async () => {
    const props = setup(); const request = pending<ApiEvent>(); props.loadDetail.mockReturnValue(request.promise);
    render(<MyEvents {...props} />); await load(); fireEvent.click(screen.getByRole("button", { name: "Ver detalle de Evento Lima" }));
    fireEvent.click(screen.getByText("Volver al listado")); expect(props.loadDetail.mock.calls[0][1].aborted).toBe(true);
    await act(async () => request.resolve({ ...event, name: "Stale detail" }));
    expect(screen.queryByText("Stale detail")).toBeNull();
  });
  it("hides unexpected error details and permits retry", async () => {
    const props = setup(); props.loadPage.mockRejectedValueOnce(new Error("secret-information"));
    render(<MyEvents {...props} />); fireEvent.click(screen.getByText("Cargar eventos"));
    expect((await screen.findByRole("alert")).textContent).not.toContain("secret-information");
    await load();
  });
  it("rejects cursor cycles without losing displayed entries", async () => {
    const props = setup(); props.loadPage.mockResolvedValueOnce({ items: [event], nextCursor: "a" })
      .mockResolvedValueOnce({ items: [], nextCursor: "b" }).mockResolvedValueOnce({ items: [], nextCursor: "a" });
    render(<MyEvents {...props} />); await load(); fireEvent.click(screen.getByText("Cargar más eventos"));
    await waitFor(() => expect((screen.getByText("Cargar más eventos") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByText("Cargar más eventos")); await screen.findByRole("alert");
    expect(screen.getByText("Evento Lima")).toBeTruthy();
  });
});

describe("MyEvents editing integration", () => {
  async function detail() {
    await load(); fireEvent.click(screen.getByRole("button", { name: "Ver detalle de Evento Lima" }));
    await screen.findByText(event.id);
  }
  async function edit() {
    await detail(); fireEvent.click(screen.getByRole("button", { name: "Editar evento" }));
    await screen.findByLabelText("Nombre del evento");
  }
  function changeAndSave() {
    fireEvent.change(screen.getByLabelText("Nombre del evento"), { target: { value: "Nombre editado" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
  }
  it("fetches fresh data before opening the editor and uses that version", async () => {
    const props = setup(); props.loadDetail.mockResolvedValueOnce(event).mockResolvedValueOnce({ ...event, version: 5, name: "Más reciente" });
    render(<MyEvents {...props} />); await edit();
    expect((screen.getByLabelText("Nombre del evento") as HTMLInputElement).value).toBe("Más reciente");
    expect(props.loadDetail).toHaveBeenCalledTimes(2); expect(props.onEditingChange).toHaveBeenLastCalledWith(true);
    changeAndSave(); await waitFor(() => expect(props.saveEvent).toHaveBeenCalledWith(event.id, { expectedVersion: 5, name: "Nombre editado" }, expect.any(AbortSignal)));
  });
  it("updates both detail and the existing list after saving", async () => {
    const props = setup(); render(<MyEvents {...props} />); await edit(); changeAndSave();
    await screen.findByText("Evento actualizado correctamente.");
    expect(screen.getByText("Nombre editado")).toBeTruthy(); expect(screen.queryByLabelText("Nombre del evento")).toBeNull();
    expect(props.onEditingChange).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByText("Volver al listado"));
    expect(screen.getByRole("button", { name: "Ver detalle de Nombre editado" })).toBeTruthy();
    expect(props.loadPage).toHaveBeenCalledTimes(1);
  });
  it.each(["active", "closed", "cancelled"] as const)("does not offer editing of %s events", async status => {
    const props = setup(); props.loadDetail.mockResolvedValue({ ...event, status }); render(<MyEvents {...props} />); await detail();
    expect(screen.queryByRole("button", { name: "Editar evento" })).toBeNull(); expect(props.saveEvent).not.toHaveBeenCalled();
  });
  it("does not open an editor if the fresh event left draft", async () => {
    const props = setup(); props.loadDetail.mockResolvedValueOnce(event).mockResolvedValueOnce({ ...event, status: "active", version: 2 });
    render(<MyEvents {...props} />); await detail(); fireEvent.click(screen.getByRole("button", { name: "Editar evento" }));
    await screen.findByText("El evento ya no está en borrador y no se puede editar.");
    expect(screen.queryByLabelText("Nombre del evento")).toBeNull(); expect(screen.getByText("Activo")).toBeTruthy();
  });
  it("refreshes detail after confirmed cancellation to reconcile a possible save", async () => {
    const props = setup(); vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<MyEvents {...props} />); await edit();
    fireEvent.change(screen.getByLabelText("Nombre del evento"), { target: { value: "Local" } });
    props.loadDetail.mockResolvedValue({ ...event, name: "Estado vigente", version: 2 });
    expect(screen.queryByText("Volver al listado")).toBeNull();
    fireEvent.click(screen.getByText("Cancelar edición")); await screen.findByText("Estado vigente");
    fireEvent.click(screen.getByText("Volver al listado")); expect(screen.getByText("Estado vigente")).toBeTruthy();
  });
  it("removes stale protected data when a save returns not found", async () => {
    const props = setup(); props.saveEvent.mockRejectedValue(new EventEditError("not_found"));
    render(<MyEvents {...props} />); await edit(); changeAndSave();
    await screen.findByText("El evento no está disponible o ya no tienes acceso.");
    props.loadDetail.mockRejectedValue(new EventQueryError("not_found")); fireEvent.click(screen.getByText("Volver al detalle"));
    await screen.findByRole("alert"); fireEvent.click(screen.getByText("Volver al listado"));
    expect(screen.queryByText("Evento Lima")).toBeNull(); expect(props.onAccessInvalidated).not.toHaveBeenCalled();
  });
  it("clears the browser and invalidates access after forbidden editing", async () => {
    const props = setup(); props.saveEvent.mockRejectedValue(new EventEditError("forbidden")); render(<MyEvents {...props} />); await edit(); changeAndSave();
    await waitFor(() => expect(props.onAccessInvalidated).toHaveBeenCalledOnce());
    expect(screen.queryByLabelText("Nombre del evento")).toBeNull(); fireEvent.click(screen.getByText("Volver al listado"));
    expect(screen.queryByText("Evento Lima")).toBeNull();
  });
  it("keeps editing state through conflict review without automatic saving", async () => {
    const props = setup(); props.saveEvent.mockRejectedValueOnce(new EventEditError("version_conflict"));
    render(<MyEvents {...props} />); await edit(); changeAndSave();
    props.loadDetail.mockResolvedValue({ ...event, version: 2, location: "Cusco" });
    fireEvent.click(await screen.findByText("Consultar estado actual")); await screen.findByText("Continuar con la selección");
    fireEvent.click(screen.getByRole("checkbox", { name: "Conservar mi cambio: Nombre del evento" }));
    fireEvent.click(screen.getByText("Continuar con la selección"));
    expect(props.saveEvent).toHaveBeenCalledTimes(1); expect(props.onEditingChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByText("Guardar cambios"));
    await waitFor(() => expect(props.saveEvent).toHaveBeenLastCalledWith(event.id, { expectedVersion: 2, name: "Nombre editado" }, expect.any(AbortSignal)));
  });
  it("aborts editing on account change and never puts the old response into the new list", async () => {
    const props = setup(); const request = pending<ApiEvent>(); props.saveEvent.mockReturnValue(request.promise);
    const view = render(<MyEvents {...props} />); await edit(); changeAndSave();
    const signal = props.saveEvent.mock.calls[0][2]; view.rerender(<MyEvents {...props} accountKey="account-b" />);
    expect(signal.aborted).toBe(true); expect(screen.queryByLabelText("Nombre del evento")).toBeNull();
    await act(async () => request.resolve({ ...event, name: "Old account response", version: 2 }));
    expect(screen.queryByText("Old account response")).toBeNull(); expect(screen.getByText("Cargar eventos")).toBeTruthy();
  });
});


describe("MyEvents registration integration", () => {
  function registrationProps() { return { ...setup(), registerAttendee: vi.fn(), onRegistrationUncertain: vi.fn() }; }
  async function detail() { await load(); fireEvent.click(screen.getByRole("button", { name: "Ver detalle de Evento Lima" })); await screen.findByRole("button", { name: "Registrar asistente" }); }
  it("reads fresh state before opening registration and hides other actions", async () => {
    const props = registrationProps(); render(<MyEvents {...props} />); await detail();
    props.loadDetail.mockResolvedValue({ ...event, name: "Actualizado", status: "active" });
    fireEvent.click(screen.getByRole("button", { name: "Registrar asistente" }));
    await screen.findByLabelText("Nombre completo"); expect(props.loadDetail).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Actualizado")).toBeTruthy(); expect(props.onEditingChange).toHaveBeenLastCalledWith(true);
    expect(screen.queryByRole("button", { name: "Editar evento" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Volver al listado" })).toBeNull();
  });
  it.each(["closed", "cancelled"] as const)("does not open when fresh state is %s", async status => {
    const props = registrationProps(); render(<MyEvents {...props} />); await detail();
    props.loadDetail.mockResolvedValue({ ...event, status }); fireEvent.click(screen.getByRole("button", { name: "Registrar asistente" }));
    await screen.findByText("El evento ya no admite inscripciones."); expect(screen.queryByLabelText("Nombre completo")).toBeNull();
    expect(props.registerAttendee).not.toHaveBeenCalled();
  });
  it("removes an event whose fresh read is no longer authorized", async () => {
    const props = registrationProps(); render(<MyEvents {...props} />); await detail();
    props.loadDetail.mockRejectedValue(new EventQueryError("not_found")); fireEvent.click(screen.getByRole("button", { name: "Registrar asistente" }));
    await screen.findByRole("alert"); fireEvent.click(screen.getByText("Volver al listado"));
    expect(screen.queryByText("Evento Lima")).toBeNull(); expect(props.registerAttendee).not.toHaveBeenCalled();
  });
  it("honors the account's uncertain registration block", async () => {
    const props = registrationProps(); render(<MyEvents {...props} uncertainRegistrationIds={new Set([event.id])} />); await detail();
    expect((screen.getByRole("button", { name: "Registrar asistente" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/resultado pendiente de verificar/)).toBeTruthy();
  });
});

describe("MyEvents registration queries", () => {
  const registration: QueriedRegistration = { id: "b4444444-4444-4444-8444-444444444444", eventId: event.id,
    status: "confirmed", source: "manual", createdAt: "2026-09-20T12:00:00.000Z", checkedInAt: null,
    attendee: { id: "c4444444-4444-4444-8444-444444444444", fullName: "Persona consulta", email: "consulta@example.com" } };
  function queries() {
    return { ...setup(),
      loadRegistrations: vi.fn<RegistrationBrowserProps["loadPage"]>().mockResolvedValue({ items: [registration], nextCursor: null }),
      loadRegistrationDetail: vi.fn<RegistrationBrowserProps["loadDetail"]>().mockResolvedValue(registration) };
  }
  async function browse() {
    await load(); fireEvent.click(screen.getByRole("button", { name: "Ver detalle de Evento Lima" }));
    fireEvent.click(await screen.findByRole("button", { name: "Ver inscripciones" }));
    await screen.findByRole("button", { name: "Cargar inscripciones" });
  }
  it.each(["draft", "active", "closed", "cancelled"] as const)("opens queries for an event in %s and refreshes its detail on return", async status => {
    const props = queries(); props.loadDetail.mockResolvedValue({ ...event, status });
    render(<MyEvents {...props} />); await browse();
    expect(props.loadDetail).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("button", { name: "Editar evento" })).toBeNull();
    fireEvent.click(screen.getByText("Cargar inscripciones")); await screen.findByText("Persona consulta");
    expect(props.loadRegistrations).toHaveBeenCalledExactlyOnceWith(event.id, undefined, expect.any(AbortSignal));
    fireEvent.click(screen.getByText("Ver inscripción")); await screen.findByText("Registro manual");
    expect(props.loadRegistrationDetail).toHaveBeenCalledWith(event.id, registration.id, expect.any(AbortSignal));
    fireEvent.click(screen.getByText("Volver al evento")); await screen.findByText(event.slug);
    expect(props.loadDetail).toHaveBeenCalledTimes(3); expect(screen.queryByText("consulta@example.com")).toBeNull();
  });
  it("keeps uncertain writes blocked after consulting registrations", async () => {
    const props = queries();
    render(<MyEvents {...props} uncertainRegistrationIds={new Set([event.id])} registerAttendee={vi.fn()} />);
    await browse(); fireEvent.click(screen.getByText("Cargar inscripciones")); await screen.findByText("Persona consulta");
    fireEvent.click(screen.getByText("Volver al evento"));
    const button = await screen.findByRole("button", { name: "Registrar asistente" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/resultado pendiente de verificar/)).toBeTruthy();
  });
  it("removes an event from the list after a registration read returns 404", async () => {
    const props = queries(); props.loadRegistrations.mockRejectedValue(new RegistrationQueryError("not_found"));
    render(<MyEvents {...props} />); await browse(); fireEvent.click(screen.getByText("Cargar inscripciones"));
    await screen.findByText(/El evento o la inscripción ya no están disponibles/);
    expect(screen.queryByRole("button", { name: "Ver detalle de Evento Lima" })).toBeNull();
    expect(props.onAccessInvalidated).not.toHaveBeenCalled();
  });
  it("invalidates access on registration authorization failure", async () => {
    const props = queries(); props.loadRegistrations.mockRejectedValue(new RegistrationQueryError("forbidden"));
    render(<MyEvents {...props} />); await browse(); fireEvent.click(screen.getByText("Cargar inscripciones"));
    await waitFor(() => expect(props.onAccessInvalidated).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("region", { name: "Inscripciones de Evento Lima" })).toBeNull();
  });
  it("does not open registration queries if refreshing event access fails", async () => {
    const props = queries(); render(<MyEvents {...props} />); await load();
    fireEvent.click(screen.getByRole("button", { name: "Ver detalle de Evento Lima" }));
    await screen.findByRole("button", { name: "Ver inscripciones" });
    props.loadDetail.mockRejectedValue(new EventQueryError("not_found")); fireEvent.click(screen.getByText("Ver inscripciones"));
    await screen.findByRole("alert"); expect(props.loadRegistrations).not.toHaveBeenCalled();
    expect(screen.queryByText("Cargar inscripciones")).toBeNull();
  });
});
