// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MyEvents from "./MyEvents";
import { EventQueryError, type ApiEvent, type ApiEventPage } from "./api-event-queries";

const event: ApiEvent = { id: "a4444444-4444-4444-8444-444444444444", name: "Evento Lima", slug: "evento-lima",
  startsAt: "2027-08-27T14:00:00Z", endsAt: "2027-08-27T22:00:00Z", createdAt: "2026-09-19T12:00:00Z",
  timezone: "America/Lima", location: "San Borja", status: "draft" };
function setup() {
  return { accountKey: "account-a", enabled: true,
    loadPage: vi.fn<(cursor: string | undefined, signal: AbortSignal) => Promise<ApiEventPage>>()
      .mockResolvedValue({ items: [event], nextCursor: null }),
    loadDetail: vi.fn<(id: string, signal: AbortSignal) => Promise<ApiEvent>>().mockResolvedValue(event),
    onAccessInvalidated: vi.fn() };
}
function pending<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
async function load() { fireEvent.click(screen.getByRole("button", { name: "Cargar eventos" })); await screen.findByRole("button", { name: "Ver detalle de Evento Lima" }); }
afterEach(cleanup);

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
    expect(screen.getByRole("button", { name: "Ver detalle de Evento Lima" })).toBeTruthy();
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
