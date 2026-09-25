// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RegistrationBrowser, { type RegistrationBrowserProps } from "./RegistrationBrowser";
import { RegistrationQueryError, type QueriedRegistration, type RegistrationPage } from "./api-registration-queries";

const event = { id: "a4444444-4444-4444-8444-444444444444", name: "Evento de prueba", timezone: "America/Lima" };
const registration: QueriedRegistration = { id: "b4444444-4444-4444-8444-444444444444", eventId: event.id,
  status: "confirmed", source: "manual", createdAt: "2026-09-20T15:00:00.000Z", checkedInAt: null,
  attendee: { id: "c4444444-4444-4444-8444-444444444444", fullName: "Ana Prueba", email: "ana@example.com" } };
const other: QueriedRegistration = { ...registration, id: "d4444444-4444-4444-8444-444444444444", status: "cancelled",
  attendee: { ...registration.attendee, fullName: "Luis Prueba", email: "luis@example.com" } };
function setup() {
  return { accountKey: "account-a", enabled: true, event,
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

describe("RegistrationBrowser", () => {
  it.each(["confirmed", "cancelled"] as const)("shows attendance independently of %s and refreshes from detail", async status => {
    const props = setup(); props.loadPage.mockResolvedValue({ items: [{ ...registration, status }], nextCursor: null });
    props.loadDetail.mockResolvedValue({ ...registration, status, checkedInAt: "2026-09-25T19:52:00.000Z" });
    render(<RegistrationBrowser {...props} />); await load(); expect(screen.getByText("Pendiente de ingreso")).toBeTruthy();
    open(); await screen.findByText("Ya ingresó");
    expect(screen.getByText(status === "confirmed" ? "Confirmada" : "Cancelada")).toBeTruthy();
    expect(document.querySelector("time")?.getAttribute("datetime")).toBe("2026-09-25T19:52:00.000Z");
    expect(document.querySelector("time")?.textContent).toContain("14:52");
    fireEvent.click(screen.getByText("Volver a inscripciones")); expect(screen.getByText("Ya ingresó")).toBeTruthy();
  });
  it("refresh failure removes old attendance instead of inventing a pending result", async () => {
    const props = setup(); props.loadPage.mockResolvedValueOnce({ items: [{ ...registration, checkedInAt: "2026-09-25T19:52:00.000Z" }], nextCursor: null }).mockRejectedValueOnce(new RegistrationQueryError("unavailable"));
    render(<RegistrationBrowser {...props} />); await load(); expect(screen.getByText("Ya ingresó")).toBeTruthy();
    fireEvent.click(screen.getByText("Actualizar inscripciones")); await screen.findByRole("alert");
    expect(screen.queryByText("Ya ingresó")).toBeNull(); expect(screen.queryByText("Pendiente de ingreso")).toBeNull();
  });

  it("does not query or display data when disabled", () => {
    const props = setup(); render(<RegistrationBrowser {...props} enabled={false} />);
    expect(screen.queryByRole("region")).toBeNull(); expect(props.loadPage).not.toHaveBeenCalled();
  });
  it("loads on request with event and signal, shows only a loaded count", async () => {
    const props = setup(); render(<RegistrationBrowser {...props} />);
    expect(props.loadPage).not.toHaveBeenCalled(); await load();
    expect(props.loadPage).toHaveBeenCalledExactlyOnceWith(event.id, undefined, expect.any(AbortSignal));
    expect(screen.getByText("ana@example.com")).toBeTruthy(); expect(screen.getByText("Confirmada")).toBeTruthy();
    expect(screen.getByText("1 inscripción cargada.")).toBeTruthy(); expect(screen.getByText("Fin del listado.")).toBeTruthy();
  });
  it("shows an empty page", async () => {
    const props = setup(); props.loadPage.mockResolvedValue({ items: [], nextCursor: null });
    render(<RegistrationBrowser {...props} />); fireEvent.click(screen.getByText("Cargar inscripciones"));
    expect(await screen.findByText("Este evento todavía no tiene inscripciones.")).toBeTruthy();
    expect(screen.queryByText("Cargar más inscripciones")).toBeNull();
  });
  it("paginates, deduplicates repeated entries and shows cancelled registrations", async () => {
    const props = setup(); props.loadPage.mockResolvedValueOnce({ items: [registration], nextCursor: "next" })
      .mockResolvedValueOnce({ items: [registration, other], nextCursor: null });
    render(<RegistrationBrowser {...props} />); await load(); fireEvent.click(screen.getByText("Cargar más inscripciones"));
    await screen.findByText("2 inscripciones cargadas.");
    expect(props.loadPage.mock.calls[1].slice(0, 2)).toEqual([event.id, "next"]);
    expect(screen.getAllByText("Ana Prueba")).toHaveLength(1); expect(screen.getByText("Cancelada")).toBeTruthy();
    expect(screen.queryByText("Cargar más inscripciones")).toBeNull();
  });
  it("refreshes from the first page and removes previous data", async () => {
    const props = setup(); render(<RegistrationBrowser {...props} />); await load();
    props.loadPage.mockResolvedValue({ items: [], nextCursor: null });
    fireEvent.click(screen.getByText("Actualizar inscripciones")); await screen.findByText("Este evento todavía no tiene inscripciones.");
    expect(props.loadPage.mock.calls[1][1]).toBeUndefined(); expect(screen.queryByText("Ana Prueba")).toBeNull();
  });
  it("prevents double submissions while loading", async () => {
    const props = setup(); const request = pending<RegistrationPage>(); props.loadPage.mockReturnValue(request.promise);
    render(<RegistrationBrowser {...props} />); const button = screen.getByText("Cargar inscripciones");
    fireEvent.click(button); fireEvent.click(button); expect(props.loadPage).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toBe("Cargando inscripciones…");
    await act(async () => request.resolve({ items: [], nextCursor: null }));
  });
  it("opens fresh detail, formats local time and restores focus without reloading the page", async () => {
    const props = setup(); props.loadDetail.mockResolvedValue({ ...registration, status: "cancelled", source: "csv" });
    render(<RegistrationBrowser {...props} />); await load(); open(); await screen.findByText("csv");
    expect(props.loadDetail).toHaveBeenCalledExactlyOnceWith(event.id, registration.id, expect.any(AbortSignal));
    expect(screen.getByText(/10:00/).textContent).toContain("America/Lima"); expect(screen.getByText("Cancelada")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Detalle de inscripción" }));
    fireEvent.click(screen.getByText("Volver a inscripciones"));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Ver inscripción de Ana Prueba" }));
    expect(props.loadPage).toHaveBeenCalledTimes(1); expect(screen.getByText("Cancelada")).toBeTruthy();
  });
  it("renders attendee text safely", async () => {
    const props = setup(); props.loadPage.mockResolvedValue({ items: [{ ...registration, attendee: { ...registration.attendee, fullName: "<img src=x onerror=alert(1)>" } }], nextCursor: null });
    const view = render(<RegistrationBrowser {...props} />); fireEvent.click(screen.getByText("Cargar inscripciones"));
    await screen.findByText("<img src=x onerror=alert(1)>"); expect(view.container.querySelector("img")).toBeNull();
  });
  it("allows retry after a first-page failure without revealing raw errors", async () => {
    const props = setup(); props.loadPage.mockRejectedValueOnce(new Error("private-server-data"));
    render(<RegistrationBrowser {...props} />); fireEvent.click(screen.getByText("Cargar inscripciones")); await screen.findByRole("alert");
    expect(screen.queryByText("private-server-data")).toBeNull(); await load();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("keeps the loaded page and retries the same cursor after a network failure", async () => {
    const props = setup(); props.loadPage.mockResolvedValueOnce({ items: [registration], nextCursor: "next" })
      .mockRejectedValueOnce(new RegistrationQueryError("unavailable"))
      .mockResolvedValueOnce({ items: [other], nextCursor: null });
    render(<RegistrationBrowser {...props} />); await load(); fireEvent.click(screen.getByText("Cargar más inscripciones"));
    await screen.findByRole("alert"); expect(screen.getByText("Ana Prueba")).toBeTruthy();
    fireEvent.click(screen.getByText("Cargar más inscripciones")); await screen.findByText("Luis Prueba");
    expect(props.loadPage.mock.calls[2][1]).toBe("next");
  });
  it("retries a detail read", async () => {
    const props = setup(); props.loadDetail.mockRejectedValueOnce(new RegistrationQueryError("unavailable"));
    render(<RegistrationBrowser {...props} />); await load(); open(); await screen.findByRole("alert");
    fireEvent.click(screen.getByText("Reintentar inscripción")); await screen.findByText("Registro manual");
    expect(props.loadDetail).toHaveBeenCalledTimes(2);
  });
  it.each(["unauthorized", "forbidden", "authentication", "interaction_required"] as const)("clears all data and blocks queries on %s", async kind => {
    const props = setup(); props.loadDetail.mockRejectedValue(new RegistrationQueryError(kind));
    render(<RegistrationBrowser {...props} />); await load(); open(); await screen.findByRole("alert");
    expect(props.onAccessInvalidated).toHaveBeenCalledTimes(1); expect(props.onUnavailable).not.toHaveBeenCalled();
    expect(screen.queryByText("ana@example.com")).toBeNull(); expect(screen.queryByText("Reintentar inscripción")).toBeNull();
    expect(screen.queryByText("Volver a inscripciones")).toBeNull();
  });
  it.each(["page", "detail"])("clears event data conservatively on 404 during %s", async read => {
    const props = setup(); render(<RegistrationBrowser {...props} />); await load();
    if (read === "detail") { props.loadDetail.mockRejectedValue(new RegistrationQueryError("not_found")); open(); }
    else { props.loadPage.mockRejectedValue(new RegistrationQueryError("not_found")); fireEvent.click(screen.getByText("Actualizar inscripciones")); }
    await screen.findByRole("alert"); expect(props.onUnavailable).toHaveBeenCalledTimes(1);
    expect(props.onAccessInvalidated).not.toHaveBeenCalled(); expect(screen.queryByText("Ana Prueba")).toBeNull();
  });
  it.each(["validation", "invalid_response"] as const)("requires a fresh list after %s rather than continuing a bad cursor", async kind => {
    const props = setup(); props.loadPage.mockResolvedValueOnce({ items: [registration], nextCursor: "next" })
      .mockRejectedValueOnce(new RegistrationQueryError(kind));
    render(<RegistrationBrowser {...props} />); await load(); fireEvent.click(screen.getByText("Cargar más inscripciones"));
    await screen.findByRole("alert"); expect(screen.queryByText("Cargar más inscripciones")).toBeNull();
    expect(screen.queryByText("Fin del listado.")).toBeNull(); expect(screen.getByText("Actualizar inscripciones")).toBeTruthy();
  });
  it("detects cursor cycles across more than one page", async () => {
    const props = setup(); props.loadPage.mockResolvedValueOnce({ items: [registration], nextCursor: "a" })
      .mockResolvedValueOnce({ items: [other], nextCursor: "b" })
      .mockResolvedValueOnce({ items: [], nextCursor: "a" });
    render(<RegistrationBrowser {...props} />); await load(); fireEvent.click(screen.getByText("Cargar más inscripciones"));
    await screen.findByText("Luis Prueba"); fireEvent.click(screen.getByText("Cargar más inscripciones"));
    await screen.findByRole("alert"); expect(screen.queryByText("Cargar más inscripciones")).toBeNull();
  });
  it("does not claim the end after an invalid page followed by a detail round trip", async () => {
    const props = setup(); props.loadPage.mockResolvedValueOnce({ items: [registration], nextCursor: "next" })
      .mockRejectedValueOnce(new RegistrationQueryError("invalid_response"));
    render(<RegistrationBrowser {...props} />); await load(); fireEvent.click(screen.getByText("Cargar más inscripciones"));
    await screen.findByRole("alert"); open(); await screen.findByText("Registro manual");
    fireEvent.click(screen.getByText("Volver a inscripciones"));
    expect(screen.queryByText("Fin del listado.")).toBeNull();
    expect(screen.getByText("Actualiza las inscripciones para reiniciar el listado.")).toBeTruthy();
    fireEvent.click(screen.getByText("Actualizar inscripciones")); await screen.findByText("Fin del listado.");
  });
  it("rejects a page from another event", async () => {
    const props = setup(); props.loadPage.mockResolvedValue({ items: [{ ...registration, eventId: "other" }], nextCursor: null });
    render(<RegistrationBrowser {...props} />); fireEvent.click(screen.getByText("Cargar inscripciones"));
    await screen.findByRole("alert"); expect(screen.queryByText("Ana Prueba")).toBeNull();
  });
  it.each([{ eventId: "other" }, { id: other.id }])("rejects a mismatched detail: %j", async changes => {
    const props = setup(); props.loadDetail.mockResolvedValue({ ...registration, ...changes });
    render(<RegistrationBrowser {...props} />); await load(); open(); await screen.findByRole("alert");
    expect(screen.queryByText("ana@example.com")).toBeNull();
  });
  it.each(["account", "event", "disabled"])("aborts reads and discards late results on %s change", async change => {
    const props = setup(); const request = pending<RegistrationPage>(); props.loadPage.mockReturnValue(request.promise);
    const view = render(<RegistrationBrowser {...props} />); fireEvent.click(screen.getByText("Cargar inscripciones"));
    const signal = props.loadPage.mock.calls[0][2];
    view.rerender(<RegistrationBrowser {...props} accountKey={change === "account" ? "account-b" : props.accountKey}
      event={change === "event" ? { ...event, id: "another-event", name: "Otro evento" } : event} enabled={change !== "disabled"} />);
    expect(signal.aborted).toBe(true); await act(async () => request.resolve({ items: [registration], nextCursor: null }));
    expect(screen.queryByText("Ana Prueba")).toBeNull(); expect(props.loadPage).toHaveBeenCalledTimes(1);
  });
  it("clears already displayed data on account change", async () => {
    const props = setup(); const view = render(<RegistrationBrowser {...props} />); await load();
    view.rerender(<RegistrationBrowser {...props} accountKey="account-b" />);
    expect(screen.queryByText("Ana Prueba")).toBeNull(); expect(screen.getByText("Cargar inscripciones")).toBeTruthy();
  });
  it("aborts a detail when returning to the list and ignores its late result", async () => {
    const props = setup(); const request = pending<QueriedRegistration>(); props.loadDetail.mockReturnValue(request.promise);
    render(<RegistrationBrowser {...props} />); await load(); open(); fireEvent.click(screen.getByText("Volver a inscripciones"));
    expect(props.loadDetail.mock.calls[0][2].aborted).toBe(true);
    await act(async () => request.resolve(other)); expect(screen.queryByText("Luis Prueba")).toBeNull();
    expect(screen.getByText("Ana Prueba")).toBeTruthy();
  });
  it("aborts when returning to the event", async () => {
    const props = setup(); const request = pending<RegistrationPage>(); props.loadPage.mockReturnValue(request.promise);
    render(<RegistrationBrowser {...props} />); fireEvent.click(screen.getByText("Cargar inscripciones"));
    fireEvent.click(screen.getByText("Volver al evento")); expect(props.onBack).toHaveBeenCalledTimes(1);
    expect(props.loadPage.mock.calls[0][2].aborted).toBe(true);
    await act(async () => request.resolve({ items: [registration], nextCursor: null })); expect(screen.queryByText("Ana Prueba")).toBeNull();
  });
  it("aborts when unmounted", async () => {
    const props = setup(); const request = pending<RegistrationPage>(); props.loadPage.mockReturnValue(request.promise);
    const view = render(<RegistrationBrowser {...props} />); fireEvent.click(screen.getByText("Cargar inscripciones")); view.unmount();
    expect(props.loadPage.mock.calls[0][2].aborted).toBe(true);
    await act(async () => request.resolve({ items: [registration], nextCursor: null }));
  });
  it("does not expose a late failed request from the previous account", async () => {
    const props = setup(); let reject!: (cause: unknown) => void;
    props.loadPage.mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
    const view = render(<RegistrationBrowser {...props} />); fireEvent.click(screen.getByText("Cargar inscripciones"));
    view.rerender(<RegistrationBrowser {...props} accountKey="account-b" />);
    await act(async () => reject(new RegistrationQueryError("unauthorized")));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull()); expect(props.onAccessInvalidated).not.toHaveBeenCalled();
  });
});
