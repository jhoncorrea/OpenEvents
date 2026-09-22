// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import EditEventForm, { type EditEventFormProps } from "./EditEventForm";
import { EventEditError, type EventEditErrorKind } from "./event-edit-error";
import { EventQueryError } from "./event-query-error";
import type { ApiEvent } from "./api-event-queries";

const event: ApiEvent = { id: "a4444444-4444-4444-8444-444444444444", name: "Evento", slug: "evento", location: "Lima",
  timezone: "America/Lima", startsAt: "2027-08-27T14:00:25.123Z", endsAt: "2027-08-27T22:00:45.456Z",
  createdAt: "2026-09-19T12:00:00Z", status: "draft", version: 1 };
function setup() {
  return { accountKey: "one", enabled: true, event, onSave: vi.fn<EditEventFormProps["onSave"]>().mockResolvedValue({ ...event, name: "Mi cambio", version: 2 }),
    loadLatest: vi.fn<EditEventFormProps["loadLatest"]>().mockResolvedValue({ ...event, name: "Otra edición", location: "Cusco", version: 2 }),
    onSaved: vi.fn(), onCancel: vi.fn(), onAccessInvalidated: vi.fn(), onUnavailable: vi.fn() };
}
function field(label: string) { return screen.getByLabelText(label) as HTMLInputElement; }
function changeName() { fireEvent.change(field("Nombre del evento"), { target: { value: "Mi cambio" } }); }
function save() { fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" })); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("EditEventForm", () => {
  it("does not expose data when disabled or offer editing for a non-draft", () => {
    const props = setup(); const view = render(<EditEventForm {...props} enabled={false} />);
    expect(screen.queryByLabelText("Nombre del evento")).toBeNull();
    view.rerender(<EditEventForm {...props} event={{ ...event, status: "active" }} />);
    expect(screen.queryByRole("button", { name: "Guardar cambios" })).toBeNull(); expect(props.onSave).not.toHaveBeenCalled();
  });
  it("shows local dates with precision and does not save an unchanged form", () => {
    const props = setup(); render(<EditEventForm {...props} />);
    expect(field("Fecha y hora de inicio").value).toBe("2027-08-27T09:00:25.123"); save();
    expect(screen.getByText("No hay cambios para guardar.")).toBeTruthy(); expect(props.onSave).not.toHaveBeenCalled();
  });
  it("saves only changed fields with the displayed version", async () => {
    const props = setup(); render(<EditEventForm {...props} />); changeName(); save();
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledWith(expect.objectContaining({ version: 2 })));
    expect(props.onSave).toHaveBeenCalledExactlyOnceWith({ expectedVersion: 1, name: "Mi cambio" }, expect.any(AbortSignal));
    expect(screen.queryByLabelText("Nombre del evento")).toBeNull();
  });
  it("focuses invalid input without sending", () => {
    const props = setup(); render(<EditEventForm {...props} />);
    fireEvent.change(field("Nombre del evento"), { target: { value: " " } }); save();
    expect(field("Nombre del evento").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(field("Nombre del evento")); expect(props.onSave).not.toHaveBeenCalled();
  });
  it("requires applying a timezone and preserves instants in the submitted patch", async () => {
    const props = setup(); render(<EditEventForm {...props} />);
    fireEvent.change(field("Zona horaria"), { target: { value: "Europe/Madrid" } }); save();
    expect(props.onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar zona horaria" }));
    expect(field("Fecha y hora de inicio").value).toBe("2027-08-27T16:00:25.123"); save();
    await waitFor(() => expect(props.onSave).toHaveBeenCalledWith({ expectedVersion: 1, timezone: "Europe/Madrid" }, expect.any(AbortSignal)));
  });
  it("keeps current values when timezone application fails", () => {
    render(<EditEventForm {...setup()} />);
    fireEvent.change(field("Zona horaria"), { target: { value: "Invalid/Zone" } });
    fireEvent.click(screen.getByText("Aplicar zona horaria"));
    expect(field("Fecha y hora de inicio").value).toBe("2027-08-27T09:00:25.123");
    expect(field("Zona horaria").getAttribute("aria-invalid")).toBe("true");
  });
  it("prevents repeated submissions and field changes while pending", async () => {
    const props = setup(); const pending = deferred<ApiEvent>(); props.onSave.mockReturnValue(pending.promise);
    render(<EditEventForm {...props} />); changeName(); save(); save();
    expect(props.onSave).toHaveBeenCalledTimes(1); expect(field("Nombre del evento").closest("fieldset")?.disabled).toBe(true);
    await act(async () => pending.resolve({ ...event, version: 2 }));
  });
  it.each(["validation", "slug_conflict"] as EventEditErrorKind[])("preserves fields after %s and allows correction", async kind => {
    const props = setup(); props.onSave.mockRejectedValue(new EventEditError(kind)); render(<EditEventForm {...props} />);
    changeName(); save(); await screen.findByRole("alert");
    expect(field("Nombre del evento").value).toBe("Mi cambio");
    expect(field("Nombre del evento").closest("fieldset")?.disabled).toBe(false);
    expect(screen.queryByText("Consultar estado actual")).toBeNull();
  });
  it.each(["version_conflict", "uncertain"] as EventEditErrorKind[])("requires explicit review after %s and keeps only selected edits", async kind => {
    const props = setup(); props.onSave.mockRejectedValueOnce(new EventEditError(kind));
    render(<EditEventForm {...props} />); changeName(); save();
    fireEvent.click(await screen.findByText("Consultar estado actual"));
    await screen.findByRole("heading", { name: "Compara antes de continuar" });
    expect(field("Nombre del evento").value).toBe("Mi cambio"); expect(props.onSave).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("checkbox", { name: "Conservar mi cambio: Nombre del evento" }).hasAttribute("checked")).toBe(false);
    fireEvent.click(screen.getByRole("checkbox", { name: "Conservar mi cambio: Nombre del evento" }));
    expect((screen.getByRole("checkbox", { name: "Conservar mi cambio: Nombre del evento" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Conservar mi cambio: Nombre del evento" }));
    expect((screen.getByRole("checkbox", { name: "Conservar mi cambio: Nombre del evento" }) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole("checkbox", { name: "Conservar mi cambio: Nombre del evento" }));
    expect((screen.getByRole("checkbox", { name: "Conservar mi cambio: Nombre del evento" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByText("Continuar con la selección"));
    expect(field("Ubicación").value).toBe("Cusco"); expect(field("Nombre del evento").value).toBe("Mi cambio");
    expect(props.onSave).toHaveBeenCalledTimes(1); save();
    await waitFor(() => expect(props.onSave).toHaveBeenLastCalledWith({ expectedVersion: 2, name: "Mi cambio" }, expect.any(AbortSignal)));
  });
  it("accepts current data when no proposed changes are selected", async () => {
    const props = setup(); props.onSave.mockRejectedValue(new EventEditError("version_conflict"));
    render(<EditEventForm {...props} />); changeName(); save();
    fireEvent.click(await screen.findByText("Consultar estado actual")); await screen.findByText("Continuar con la selección");
    fireEvent.click(screen.getByText("Continuar con la selección")); save();
    expect(field("Nombre del evento").value).toBe("Otra edición"); expect(props.onSave).toHaveBeenCalledTimes(1);
    expect(screen.getByText("No hay cambios para guardar.")).toBeTruthy();
  });
  it("keeps recovery and allows retry after a failed read", async () => {
    const props = setup(); props.onSave.mockRejectedValue(new EventEditError("uncertain")); props.loadLatest.mockRejectedValueOnce(new Error("private"));
    render(<EditEventForm {...props} />); changeName(); save();
    fireEvent.click(await screen.findByText("Consultar estado actual")); await screen.findByText("No pudimos consultar los eventos. Inténtalo nuevamente.");
    expect(screen.queryByText("private")).toBeNull(); expect(field("Nombre del evento").value).toBe("Mi cambio");
    fireEvent.click(screen.getByText("Consultar estado actual")); await screen.findByText("Continuar con la selección");
    expect(props.onSave).toHaveBeenCalledTimes(1);
  });
  it.each(["unauthorized", "forbidden", "authentication", "interaction_required"] as EventEditErrorKind[])("clears protected controls and invalidates access for %s", async kind => {
    const props = setup(); props.onSave.mockRejectedValue(new EventEditError(kind)); render(<EditEventForm {...props} />); changeName(); save();
    await waitFor(() => expect(props.onAccessInvalidated).toHaveBeenCalledTimes(1));
    expect(screen.queryByLabelText("Nombre del evento")).toBeNull(); expect(screen.queryByText("Consultar estado actual")).toBeNull();
  });
  it.each(["not_found", "not_editable"] as EventEditErrorKind[])("removes editing after %s", async kind => {
    const props = setup(); props.onSave.mockRejectedValue(new EventEditError(kind)); render(<EditEventForm {...props} />); changeName(); save();
    await waitFor(() => expect(props.onUnavailable).toHaveBeenCalledTimes(1)); expect(screen.queryByLabelText("Nombre del evento")).toBeNull();
  });
  it("invalidates access if permission is lost during recovery", async () => {
    const props = setup(); props.onSave.mockRejectedValue(new EventEditError("version_conflict")); props.loadLatest.mockRejectedValue(new EventQueryError("forbidden"));
    render(<EditEventForm {...props} />); changeName(); save(); fireEvent.click(await screen.findByText("Consultar estado actual"));
    await waitFor(() => expect(props.onAccessInvalidated).toHaveBeenCalled()); expect(screen.queryByLabelText("Nombre del evento")).toBeNull();
  });
  it("stops recovery if the event is no longer a draft", async () => {
    const props = setup(); props.onSave.mockRejectedValue(new EventEditError("version_conflict")); props.loadLatest.mockResolvedValue({ ...event, status: "active", version: 2 });
    render(<EditEventForm {...props} />); changeName(); save(); fireEvent.click(await screen.findByText("Consultar estado actual"));
    await waitFor(() => expect(props.onUnavailable).toHaveBeenCalled()); expect(screen.queryByLabelText("Nombre del evento")).toBeNull();
  });
  it("does not accept a response for another event in recovery", async () => {
    const props = setup(); props.onSave.mockRejectedValue(new EventEditError("uncertain")); props.loadLatest.mockResolvedValue({ ...event, id: "other" });
    render(<EditEventForm {...props} />); changeName(); save(); fireEvent.click(await screen.findByText("Consultar estado actual"));
    await screen.findByText("La API devolvió una respuesta inesperada. Inténtalo nuevamente."); expect(screen.queryByText("Continuar con la selección")).toBeNull();
  });
  it("confirms discarding edits and permits staying", () => {
    const props = setup(); const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<EditEventForm {...props} />); changeName(); fireEvent.click(screen.getByText("Cancelar edición"));
    expect(props.onCancel).not.toHaveBeenCalled(); expect(field("Nombre del evento").value).toBe("Mi cambio");
    fireEvent.click(screen.getByText("Cancelar edición")); expect(props.onCancel).toHaveBeenCalledOnce(); expect(confirm).toHaveBeenCalledTimes(2);
  });
  it("cancels an unchanged form without confirmation", () => {
    const props = setup(); const confirm = vi.spyOn(window, "confirm"); render(<EditEventForm {...props} />);
    fireEvent.click(screen.getByText("Cancelar edición")); expect(props.onCancel).toHaveBeenCalledOnce(); expect(confirm).not.toHaveBeenCalled();
  });
  it("aborts pending saving when cancelling and ignores late completion", async () => {
    const props = setup(); const pending = deferred<ApiEvent>(); props.onSave.mockReturnValue(pending.promise); vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<EditEventForm {...props} />); changeName(); save(); const signal = props.onSave.mock.calls[0][1];
    fireEvent.click(screen.getByText("Cancelar edición")); expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve({ ...event, version: 2 })); expect(props.onSaved).not.toHaveBeenCalled();
  });
  it("aborts and clears old edits on account change", async () => {
    const props = setup(); const pending = deferred<ApiEvent>(); props.onSave.mockReturnValue(pending.promise);
    const view = render(<EditEventForm {...props} />); changeName(); save(); const signal = props.onSave.mock.calls[0][1];
    view.rerender(<EditEventForm {...props} accountKey="two" />); expect(signal.aborted).toBe(true);
    expect(field("Nombre del evento").value).toBe("Evento"); await act(async () => pending.resolve({ ...event, version: 2 })); expect(props.onSaved).not.toHaveBeenCalled();
  });
  it("aborts recovery when disabled and ignores a late response", async () => {
    const props = setup(); const pending = deferred<ApiEvent>(); props.onSave.mockRejectedValue(new EventEditError("uncertain")); props.loadLatest.mockReturnValue(pending.promise);
    const view = render(<EditEventForm {...props} />); changeName(); save(); fireEvent.click(await screen.findByText("Consultar estado actual"));
    const signal = props.loadLatest.mock.calls[0][0]; view.rerender(<EditEventForm {...props} enabled={false} />);
    expect(signal.aborted).toBe(true); await act(async () => pending.resolve({ ...event, version: 2 }));
    expect(screen.queryByText("Continuar con la selección")).toBeNull(); view.rerender(<EditEventForm {...props} />);
    expect(field("Nombre del evento").value).toBe("Evento");
  });
  it("warns before leaving a dirty form without persisting it", () => {
    const store = vi.spyOn(Storage.prototype, "setItem"); const props = setup(); const view = render(<EditEventForm {...props} />); changeName();
    const e = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(e); expect(e.defaultPrevented).toBe(true);
    expect(store).not.toHaveBeenCalled(); view.unmount();
    const later = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(later); expect(later.defaultPrevented).toBe(false);
  });
});
