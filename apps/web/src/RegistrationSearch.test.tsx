// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RegistrationBrowser, { type RegistrationBrowserProps } from "./RegistrationBrowser";
import { RegistrationQueryError, type QueriedRegistration, type RegistrationPage } from "./api-registration-queries";

const event = { id: "a4444444-4444-4444-8444-444444444444", name: "Evento de prueba", timezone: "America/Lima" };
const registration: QueriedRegistration = { id: "b4444444-4444-4444-8444-444444444444", eventId: event.id,
  status: "confirmed", source: "manual", createdAt: "2026-09-20T15:00:00.000Z",
  attendee: { id: "c4444444-4444-4444-8444-444444444444", fullName: "Ana Prueba", email: "ana@example.com" } };
const other: QueriedRegistration = { ...registration, id: "d4444444-4444-4444-8444-444444444444", status: "cancelled",
  attendee: { ...registration.attendee, fullName: "Luis Prueba", email: "luis@example.com" } };
function setup() {
  return { searchPage: vi.fn<NonNullable<RegistrationBrowserProps["searchPage"]>>().mockResolvedValue({ items: [registration], nextCursor: null }), accountKey: "account-a", enabled: true, event,
    loadPage: vi.fn<RegistrationBrowserProps["loadPage"]>().mockResolvedValue({ items: [registration], nextCursor: null }),
    loadDetail: vi.fn<RegistrationBrowserProps["loadDetail"]>().mockResolvedValue(registration),
    onBack: vi.fn(), onAccessInvalidated: vi.fn(), onUnavailable: vi.fn() };
}
function pending<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
async function load() {
  fireEvent.click(screen.getByRole("button", { name: "Cargar inscripciones" }));
  await screen.findByRole("button", { name: "Ver inscripción de Ana Prueba" });
}
function open() { fireEvent.click(screen.getByRole("button", { name: "Ver inscripción de Ana Prueba" })); }
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function submit(value: string) {
  fireEvent.change(screen.getByLabelText("Nombre o correo"), { target: { value } });
  fireEvent.submit(screen.getByRole("form", { name: "Buscar inscripciones" }));
}
describe("RegistrationBrowser search", () => {
  it("submits explicitly and retains the executed term when paging an edited draft", async () => {
    const props = setup(); props.searchPage.mockResolvedValueOnce({ items: [registration], nextCursor: "next" })
      .mockResolvedValueOnce({ items: [other], nextCursor: null }); render(<RegistrationBrowser {...props} />);
    fireEvent.change(screen.getByLabelText("Nombre o correo"), { target: { value: "  Prueba  " } });
    expect(props.searchPage).not.toHaveBeenCalled();
    fireEvent.submit(screen.getByRole("form", { name: "Buscar inscripciones" }));
    await screen.findByText("Ana Prueba");
    expect(props.searchPage).toHaveBeenLastCalledWith(event.id, "Prueba", undefined, expect.any(AbortSignal));
    fireEvent.change(screen.getByLabelText("Nombre o correo"), { target: { value: "otro" } });
    fireEvent.click(screen.getByText("Cargar más inscripciones")); await screen.findByText("Luis Prueba");
    expect(props.searchPage).toHaveBeenLastCalledWith(event.id, "Prueba", "next", expect.any(AbortSignal));
    expect(screen.getByText("Ana Prueba")).toBeTruthy(); expect(props.loadPage).not.toHaveBeenCalled();
  });
  it.each(["", "   ", "a".repeat(101)])("rejects invalid text before searching: %j", value => {
    const props = setup(); render(<RegistrationBrowser {...props} />); submit(value);
    expect(screen.getByRole("alert").textContent).toContain("1 y 100"); expect(props.searchPage).not.toHaveBeenCalled();
  });
  it("replaces old results and cursor for a new search, and clears back to normal listing", async () => {
    const props = setup(); props.searchPage.mockResolvedValueOnce({ items: [registration], nextCursor: "next" })
      .mockResolvedValueOnce({ items: [other], nextCursor: null }); render(<RegistrationBrowser {...props} />);
    submit("Ana"); await screen.findByText("Ana Prueba"); submit("Luis"); await screen.findByText("Luis Prueba");
    expect(screen.queryByText("Ana Prueba")).toBeNull();
    expect(props.searchPage).toHaveBeenLastCalledWith(event.id, "Luis", undefined, expect.any(AbortSignal));
    fireEvent.click(screen.getByText("Limpiar búsqueda")); await screen.findByText("Ana Prueba");
    expect(props.loadPage).toHaveBeenCalledExactlyOnceWith(event.id, undefined, expect.any(AbortSignal));
    expect(screen.queryByText(/Resultados para/)).toBeNull(); expect(screen.getByLabelText("Nombre o correo")).toHaveProperty("value", "");
  });
  it.each(["new search", "clear"])("aborts and ignores an old response after %s", async change => {
    const props = setup(); const slow = pending<RegistrationPage>(); props.searchPage.mockReturnValueOnce(slow.promise)
      .mockResolvedValue({ items: [other], nextCursor: null }); props.loadPage.mockResolvedValue({ items: [other], nextCursor: null });
    render(<RegistrationBrowser {...props} />); submit("Ana"); const signal = props.searchPage.mock.calls[0][3];
    if (change === "clear") fireEvent.click(screen.getByText("Limpiar búsqueda")); else submit("Luis");
    await screen.findByText("Luis Prueba"); expect(signal.aborted).toBe(true);
    await act(async () => slow.resolve({ items: [registration], nextCursor: "stale" }));
    expect(screen.queryByText("Ana Prueba")).toBeNull(); expect(screen.queryByText("Cargar más inscripciones")).toBeNull();
  });
  it.each(["account", "event", "disabled", "unmount"])("discards pending search on %s", async change => {
    const props = setup(); const slow = pending<RegistrationPage>(); props.searchPage.mockReturnValue(slow.promise);
    const view = render(<RegistrationBrowser {...props} />); submit("Ana"); const signal = props.searchPage.mock.calls[0][3];
    if (change === "unmount") view.unmount(); else view.rerender(<RegistrationBrowser {...props}
      accountKey={change === "account" ? "other" : props.accountKey} enabled={change !== "disabled"}
      event={change === "event" ? { ...event, id: "other-event" } : event} />);
    expect(signal.aborted).toBe(true); await act(async () => slow.resolve({ items: [registration], nextCursor: null }));
    expect(screen.queryByText("ana@example.com")).toBeNull(); expect(screen.queryByText(/Resultados para/)).toBeNull();
  });
  it.each(["unauthorized", "forbidden", "not_found"] as const)("removes data after %s", async kind => {
    const props = setup(); render(<RegistrationBrowser {...props} />); await load();
    props.searchPage.mockRejectedValue(new RegistrationQueryError(kind)); submit("Ana"); await screen.findByRole("alert");
    expect(screen.queryByText("ana@example.com")).toBeNull(); expect(screen.queryByLabelText("Nombre o correo")).toBeNull();
    expect(kind === "not_found" ? props.onUnavailable : props.onAccessInvalidated).toHaveBeenCalledOnce();
  });
  it("shows search-specific empty state", async () => {
    const props = setup(); props.searchPage.mockResolvedValue({ items: [], nextCursor: null }); render(<RegistrationBrowser {...props} />);
    submit("Nobody"); await screen.findByText("No se encontraron coincidencias.");
    expect(screen.queryByText("Este evento todavía no tiene inscripciones.")).toBeNull();
  });
  it("retries the executed term after a failure while preserving the draft", async () => {
    const props = setup(); props.searchPage.mockRejectedValueOnce(new Error("private information")); render(<RegistrationBrowser {...props} />);
    submit("Ana"); await screen.findByRole("alert"); expect(screen.queryByText(/private information/)).toBeNull();
    fireEvent.change(screen.getByLabelText("Nombre o correo"), { target: { value: "Luis" } });
    fireEvent.click(screen.getByText("Repetir búsqueda")); await screen.findByText("Ana Prueba");
    expect(props.searchPage).toHaveBeenLastCalledWith(event.id, "Ana", undefined, expect.any(AbortSignal));
  });
  it("rejects repeated cursors and restarts the executed query", async () => {
    const props = setup(); props.searchPage.mockResolvedValue({ items: [registration], nextCursor: "loop" });
    render(<RegistrationBrowser {...props} />); submit("Ana"); await screen.findByText("Ana Prueba");
    fireEvent.click(screen.getByText("Cargar más inscripciones")); await screen.findByText("Repite la consulta para reiniciar el listado.");
    expect(screen.queryByText("Cargar más inscripciones")).toBeNull(); fireEvent.click(screen.getByText("Repetir búsqueda"));
    await waitFor(() => expect(props.searchPage).toHaveBeenCalledTimes(3));
    expect(props.searchPage).toHaveBeenLastCalledWith(event.id, "Ana", undefined, expect.any(AbortSignal));
  });
  it("preserves query and focus when returning from detail", async () => {
    const props = setup(); render(<RegistrationBrowser {...props} />); submit("Ana"); await screen.findByText("Ana Prueba");
    open(); await screen.findByText("Registro manual"); fireEvent.click(screen.getByText("Volver a inscripciones"));
    expect(screen.getByLabelText("Nombre o correo")).toHaveProperty("value", "Ana");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Ver inscripción de Ana Prueba" }));
    expect(props.searchPage).toHaveBeenCalledOnce(); expect(props.loadDetail).toHaveBeenCalledOnce();
  });
  it("deduplicates repeated submit while the same query is pending", async () => {
    const props = setup(); const slow = pending<RegistrationPage>(); props.searchPage.mockReturnValue(slow.promise);
    render(<RegistrationBrowser {...props} />); submit("Ana"); submit(" Ana "); expect(props.searchPage).toHaveBeenCalledOnce();
    await act(async () => slow.resolve({ items: [registration], nextCursor: null }));
  });
});
