// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import OperatorEvents from "./OperatorEvents";
import { EventQueryError, type OperatorEvent } from "./api-operator-events";
import { RegistrationQueryError, type RegistrationPage } from "./api-registration-queries";
const event: OperatorEvent = { id: "a4444444-4444-4444-8444-444444444444", name: "Encuentro", startsAt: "2027-08-27T14:00:00.000Z", endsAt: "2027-08-27T22:00:00.000Z", timezone: "America/Lima", location: "Lima", status: "active" };
const page: RegistrationPage = { items: [{ id: "r1", eventId: event.id, status: "confirmed", source: "manual", createdAt: "2026-09-21T12:00:00.000Z", checkedInAt: null, attendee: { id: "a1", fullName: "Ana Pérez", email: "ana@example.com" } }], nextCursor: null };
function pending<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function setup() {
  const props = { accountKey: "one", enabled: true, loadPage: vi.fn().mockResolvedValue({ items: [event], nextCursor: null }), loadDetail: vi.fn().mockResolvedValue(event), searchPage: vi.fn().mockResolvedValue(page), onAccessInvalidated: vi.fn() };
  return { props, ...render(<OperatorEvents {...props} />) };
}
async function select() { fireEvent.click(screen.getByText("Cargar eventos asignados")); fireEvent.click(await screen.findByText("Seleccionar Encuentro")); await screen.findByLabelText("Nombre o correo del inscrito"); }
function search(q = "Ana") { fireEvent.change(screen.getByLabelText("Nombre o correo del inscrito"), { target: { value: q } }); fireEvent.click(screen.getByText("Buscar inscripciones")); }
afterEach(cleanup);
describe("operator event and registration flow", () => {
  it("repeat search loads persisted attendance and preserves cancelled registration status", async () => {
    const { props } = setup(); await select(); search(); await screen.findByText("Pendiente de ingreso");
    props.searchPage.mockResolvedValue({ items: [{ ...page.items[0], status: "cancelled", checkedInAt: "2026-09-25T19:52:00.000Z" }], nextCursor: null });
    fireEvent.click(screen.getByText("Repetir búsqueda")); await screen.findByText("Ya ingresó");
    expect(screen.getByText("Estado: Cancelada")).toBeTruthy(); expect(document.querySelector("time")?.textContent).toContain("14:52");
    props.searchPage.mockRejectedValue(new RegistrationQueryError("unavailable"));
    fireEvent.click(screen.getByText("Repetir búsqueda")); await screen.findByRole("alert");
    expect(screen.queryByText("Ya ingresó")).toBeNull(); expect(screen.queryByText("Pendiente de ingreso")).toBeNull();
  });

  it("requires explicit list and search, shows reduced detail and no organizer actions", async () => {
    const { props } = setup(); expect(props.loadPage).not.toHaveBeenCalled(); await select();
    expect(props.loadDetail).toHaveBeenCalledWith(event.id, expect.any(AbortSignal)); expect(props.searchPage).not.toHaveBeenCalled();
    search(" Ana "); await screen.findByText("ana@example.com");
    expect(props.searchPage).toHaveBeenCalledWith(event.id, "Ana", undefined, expect.any(AbortSignal));
    expect(screen.queryByText("Ver inscripción")).toBeNull(); expect(screen.queryByText("Crear evento")).toBeNull();
  });
  it("pages events and handles no assignments", async () => {
    const { props } = setup(); props.loadPage.mockResolvedValueOnce({ items: [event], nextCursor: "next" }).mockResolvedValueOnce({ items: [{ ...event, id: "b", name: "Segundo" }], nextCursor: null }).mockResolvedValueOnce({ items: [], nextCursor: null });
    fireEvent.click(screen.getByText("Cargar eventos asignados")); fireEvent.click(await screen.findByText("Cargar más eventos asignados"));
    await screen.findByText("Segundo"); expect(props.loadPage).toHaveBeenLastCalledWith("next", expect.any(AbortSignal));
    fireEvent.click(screen.getByText("Cargar eventos asignados")); await screen.findByText("No tienes eventos asignados disponibles.");
  });
  it("pages the executed term despite edits and clears without a request", async () => {
    const { props } = setup(); props.searchPage.mockResolvedValueOnce({ ...page, nextCursor: "next" }); await select(); search();
    await screen.findByText("Cargar más coincidencias"); fireEvent.change(screen.getByLabelText("Nombre o correo del inscrito"), { target: { value: "Pedro" } });
    fireEvent.click(screen.getByText("Cargar más coincidencias")); await waitFor(() => expect(props.searchPage).toHaveBeenCalledTimes(2));
    expect(props.searchPage).toHaveBeenLastCalledWith(event.id, "Ana", "next", expect.any(AbortSignal));
    fireEvent.click(screen.getByText("Limpiar búsqueda")); expect(screen.queryByText("ana@example.com")).toBeNull(); expect(props.searchPage).toHaveBeenCalledTimes(2);
  });
  it("supports Enter, no matches and repeating the executed query", async () => {
    const { props } = setup(); props.searchPage.mockResolvedValue({ items: [], nextCursor: null }); await select();
    const input = screen.getByLabelText("Nombre o correo del inscrito"); fireEvent.change(input, { target: { value: "Nada" } }); fireEvent.submit(input.closest("form")!);
    await screen.findByText("No se encontraron coincidencias."); fireEvent.change(input, { target: { value: "Otro" } }); fireEvent.click(screen.getByText("Repetir búsqueda"));
    await waitFor(() => expect(props.searchPage).toHaveBeenCalledTimes(2)); expect(props.searchPage).toHaveBeenLastCalledWith(event.id, "Nada", undefined, expect.any(AbortSignal));
  });
  it.each(["", " ", "x".repeat(101), "a\u0001b"])("rejects invalid input %j locally", async q => {
    const { props } = setup(); await select(); search(q); expect(props.searchPage).not.toHaveBeenCalled(); expect(screen.getByRole("alert").textContent).toContain("100");
  });
  it.each(["clear", "back", "account", "disabled", "unmount"])("discards a late search after %s", async action => {
    const view = setup(); const late = pending<RegistrationPage>(); view.props.searchPage.mockReturnValue(late.promise); await select(); search();
    const signal = view.props.searchPage.mock.calls[0][3] as AbortSignal;
    if (action === "clear") fireEvent.click(screen.getByText("Limpiar búsqueda"));
    if (action === "back") fireEvent.click(screen.getByText("Volver a eventos asignados"));
    if (action === "account") view.rerender(<OperatorEvents {...view.props} accountKey="two" />);
    if (action === "disabled") view.rerender(<OperatorEvents {...view.props} enabled={false} />);
    if (action === "unmount") view.unmount();
    expect(signal.aborted).toBe(true); await act(async () => late.resolve(page)); expect(screen.queryByText("ana@example.com")).toBeNull();
  });
  it("discards an older query when a newer query finishes first", async () => {
    const { props } = setup(); const late = pending<RegistrationPage>(); props.searchPage.mockReturnValueOnce(late.promise).mockResolvedValueOnce({ items: [], nextCursor: null });
    await select(); search(); search("Pedro"); await screen.findByText("No se encontraron coincidencias."); await act(async () => late.resolve(page)); expect(screen.queryByText("ana@example.com")).toBeNull();
  });
  it.each(["unauthorized", "forbidden", "interaction_required", "authentication"] as const)("invalidates access for %s", async kind => {
    const { props } = setup(); props.searchPage.mockRejectedValue(new RegistrationQueryError(kind)); await select(); search();
    await waitFor(() => expect(props.onAccessInvalidated).toHaveBeenCalledOnce()); expect(screen.queryByLabelText("Nombre o correo del inscrito")).toBeNull();
  });
  it("removes the inaccessible event on a search 404 without invalidating the account", async () => {
    const { props } = setup(); props.searchPage.mockRejectedValue(new RegistrationQueryError("not_found")); await select(); search();
    await screen.findByRole("alert"); expect(screen.queryByText("Seleccionar Encuentro")).toBeNull(); expect(props.onAccessInvalidated).not.toHaveBeenCalled(); expect(screen.getByText("Cargar eventos asignados")).toBeTruthy();
  });
  it("rejects a repeated pagination cursor and allows a fresh search", async () => {
    const { props } = setup(); props.searchPage.mockResolvedValue({ ...page, nextCursor: "same" }); await select(); search();
    fireEvent.click(await screen.findByText("Cargar más coincidencias")); await screen.findByRole("alert"); expect(screen.queryByText("Cargar más coincidencias")).toBeNull();
  });
  it("hides arbitrary failures and permits retry", async () => {
    const { props } = setup(); props.loadPage.mockRejectedValueOnce(new Error("private")); fireEvent.click(screen.getByText("Cargar eventos asignados"));
    expect((await screen.findByRole("alert")).textContent).not.toContain("private"); fireEvent.click(screen.getByText("Cargar eventos asignados")); await screen.findByText("Seleccionar Encuentro");
  });
  it("discards a late event detail after changing account", async () => {
    const view = setup(); const late = pending<OperatorEvent>(); view.props.loadDetail.mockReturnValue(late.promise);
    fireEvent.click(screen.getByText("Cargar eventos asignados")); fireEvent.click(await screen.findByText("Seleccionar Encuentro"));
    view.rerender(<OperatorEvents {...view.props} accountKey="two" />); await act(async () => late.resolve(event)); expect(screen.queryByLabelText("Nombre o correo del inscrito")).toBeNull();
  });
  it("handles revoked event detail without showing search", async () => {
    const { props } = setup(); props.loadDetail.mockRejectedValue(new EventQueryError("not_found")); fireEvent.click(screen.getByText("Cargar eventos asignados")); fireEvent.click(await screen.findByText("Seleccionar Encuentro")); await screen.findByRole("alert"); expect(screen.queryByLabelText("Nombre o correo del inscrito")).toBeNull();
  });
});
