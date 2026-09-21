// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RegistrationCsvForm, { type RegistrationCsvFormProps } from "./RegistrationCsvForm";
import { CsvImportError } from "./csv-import-error";
import * as recovery from "./csv-import-recovery";
import type { CsvLookup } from "./api-registration-csv";
const event = { id: "a4444444-4444-4444-8444-444444444444", name: "Evento CSV", status: "draft" as const };
const key = "b4444444-4444-4444-8444-444444444444", hash = "a".repeat(64);
const completed: CsvLookup = { status: "completed", receipt: { importId: key, completedAt: "2026-09-21T12:00:00.000Z", result: { eventId: event.id, count: 2, items: [] } } };
function setup(): RegistrationCsvFormProps {
  return { accountKey: "account-a", enabled: true, event, send: vi.fn().mockResolvedValue(completed), lookup: vi.fn().mockResolvedValue(completed), onBack: vi.fn(), onAccessInvalidated: vi.fn(), onUnavailable: vi.fn() };
}
function file(bytes = [65, 66], name = "personas.csv") { const f = new File([new Uint8Array(bytes)], name); Object.defineProperty(f, "arrayBuffer", { value: async () => new Uint8Array(bytes).buffer }); return f; }
async function choose(f = file()) {
  fireEvent.change(screen.getByLabelText(/Archivo CSV|Seleccionar el archivo original/), { target: { files: [f] } });
  await screen.findByText(`Archivo preparado: ${f.name}`);
}
function send() { fireEvent.click(screen.getByRole("button", { name: "Importar archivo" })); }
beforeEach(() => { sessionStorage.clear(); vi.spyOn(recovery, "csvHash").mockResolvedValue(hash); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("CSV form", () => {
  it("does not render when disabled", () => { render(<RegistrationCsvForm {...setup()} enabled={false} />); expect(screen.queryByRole("region")).toBeNull(); });
  it("stores only key/hash before POST and shows a historical confirmation", async () => {
    const props = setup(); vi.mocked(props.send).mockImplementation(async (_id, usedKey, bytes) => {
      expect(recovery.readCsvRecovery("account-a", event.id)).toEqual({ key: usedKey, hash });
      expect(bytes).toEqual(new Uint8Array([65, 66])); expect(JSON.stringify(sessionStorage)).not.toContain("personas.csv"); return completed;
    });
    render(<RegistrationCsvForm {...props} />); await choose(); send(); await screen.findByText("Importación confirmada");
    expect(screen.getByText("2 inscripciones en el comprobante.")).toBeTruthy(); expect(screen.getByText(/resultado histórico/)).toBeTruthy();
  });
  it.each([0, 1048577])("rejects size %s before reading or sending", async size => {
    const props = setup(); render(<RegistrationCsvForm {...props} />);
    const f = file(); Object.defineProperty(f, "size", { value: size });
    fireEvent.change(screen.getByLabelText("Archivo CSV"), { target: { files: [f] } });
    expect(screen.getByText(/archivo no vacío/)).toBeTruthy(); expect(props.send).not.toHaveBeenCalled();
  });
  it("survives remount with metadata, queries without a file, and requires an identical file for retry", async () => {
    const props = setup(); vi.mocked(props.send).mockRejectedValue(new CsvImportError("uncertain"));
    vi.mocked(props.lookup).mockResolvedValue({ status: "not_observed" });
    const view = render(<RegistrationCsvForm {...props} />); await choose(); send(); await screen.findByText(/No pudimos confirmar/);
    const original = recovery.readCsvRecovery("account-a", event.id)!; view.unmount(); render(<RegistrationCsvForm {...props} />);
    expect((screen.getByText("Reenviar mismo archivo y clave") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText("Consultar comprobante")); await screen.findByText(/Todavía no se observa/);
    expect(props.lookup).toHaveBeenCalledWith(event.id, original.key, expect.any(AbortSignal));
    vi.mocked(recovery.csvHash).mockResolvedValueOnce("b".repeat(64));
    fireEvent.change(screen.getByLabelText("Seleccionar el archivo original"), { target: { files: [file()] } });
    await screen.findByText(/no coincide/); expect((screen.getByText("Reenviar mismo archivo y clave") as HTMLButtonElement).disabled).toBe(true);
    await choose(); fireEvent.click(screen.getByText("Reenviar mismo archivo y clave"));
    await waitFor(() => expect(props.send).toHaveBeenCalledTimes(2)); expect(vi.mocked(props.send).mock.calls[1][1]).toBe(original.key);
  });
  it("does not clear prior uncertainty on a later validation failure", async () => {
    recovery.writeCsvRecovery("account-a", event.id, { key, hash }); const props = setup();
    vi.mocked(props.send).mockRejectedValue(new CsvImportError("validation")); render(<RegistrationCsvForm {...props} />);
    await choose(); fireEvent.click(screen.getByText("Reenviar mismo archivo y clave")); await screen.findByRole("alert");
    expect(recovery.readCsvRecovery("account-a", event.id)).toEqual({ key, hash }); expect(screen.queryByText("Nueva importación")).toBeNull();
  });
  it("allows correction after an initial definitive validation rejection", async () => {
    const props = setup(); vi.mocked(props.send).mockRejectedValue(new CsvImportError("validation", [{ code: "INVALID_EMAIL", record: 1, line: 2, field: "email" }], true));
    render(<RegistrationCsvForm {...props} />); await choose(); send(); await screen.findByRole("alert");
    expect(recovery.readCsvRecovery("account-a", event.id)).toBeNull(); expect(screen.getByText(/Registro 1/)).toBeTruthy(); expect(screen.getByText(/100 diagnósticos/)).toBeTruthy();
  });
  it.each(["unauthorized", "forbidden", "interaction_required"] as const)("retains recovery and invalidates access for %s", async kind => {
    const props = setup(); vi.mocked(props.send).mockRejectedValue(new CsvImportError(kind)); render(<RegistrationCsvForm {...props} />);
    await choose(); send(); await waitFor(() => expect(props.onAccessInvalidated).toHaveBeenCalled()); expect(recovery.readCsvRecovery("account-a", event.id)).not.toBeNull();
  });
  it("removes inaccessible event through callback", async () => {
    const props = setup(); vi.mocked(props.send).mockRejectedValue(new CsvImportError("not_found")); render(<RegistrationCsvForm {...props} />);
    await choose(); send(); await waitFor(() => expect(props.onUnavailable).toHaveBeenCalled());
  });
  it("blocks duplicate clicks and aborts on unmount while retaining metadata", async () => {
    const props = setup(); let resolve!: (v: CsvLookup) => void; vi.mocked(props.send).mockReturnValue(new Promise(r => { resolve = r; }));
    const view = render(<RegistrationCsvForm {...props} />); await choose(); send();
    fireEvent.click(screen.getByText("Reenviar mismo archivo y clave")); expect(props.send).toHaveBeenCalledTimes(1);
    expect((screen.getByText("Volver al evento") as HTMLButtonElement).disabled).toBe(true);
    const signal = vi.mocked(props.send).mock.calls[0][3]; view.unmount(); expect(signal.aborted).toBe(true);
    await act(async () => resolve(completed)); expect(recovery.readCsvRecovery("account-a", event.id)).not.toBeNull();
  });
  it("isolates account and event changes and discards file data", async () => {
    const props = setup(); recovery.writeCsvRecovery("account-a", event.id, { key, hash });
    const view = render(<RegistrationCsvForm {...props} />); await choose(); view.rerender(<RegistrationCsvForm {...props} accountKey="other" />);
    expect(screen.queryByText(key)).toBeNull(); expect(screen.queryByText(/Archivo preparado/)).toBeNull();
    view.rerender(<RegistrationCsvForm {...props} event={{ ...event, id: key }} />); expect(screen.queryByText(key)).toBeNull();
  });
  it("blocks a send if metadata cannot be persisted", async () => {
    const props = setup(); render(<RegistrationCsvForm {...props} />); await choose();
    vi.spyOn(recovery, "writeCsvRecovery").mockImplementation(() => { throw new Error(); }); send();
    expect(props.send).not.toHaveBeenCalled(); expect(screen.getByText(/No podemos conservar/)).toBeTruthy();
  });
  it("fails closed on corrupt recovery metadata", () => {
    recovery.writeCsvRecovery("account-a", event.id, { key, hash }); sessionStorage.setItem(sessionStorage.key(0)!, "bad");
    render(<RegistrationCsvForm {...setup()} />); expect(screen.getByRole("alert")).toBeTruthy(); expect((screen.getByText("Importar archivo") as HTMLButtonElement).disabled).toBe(true);
  });
  it("permits recovery in a closed event without permitting new import", async () => {
    recovery.writeCsvRecovery("account-a", event.id, { key, hash }); render(<RegistrationCsvForm {...setup()} event={{ ...event, status: "closed" }} />);
    fireEvent.click(screen.getByText("Consultar comprobante")); await screen.findByText("Importación confirmada"); expect(screen.queryByText("Nueva importación")).toBeNull();
  });
  it("only clears the receipt for a new import after explicit confirmation action", async () => {
    render(<RegistrationCsvForm {...setup()} />); await choose(); send(); await screen.findByText("Importación confirmada");
    expect(recovery.readCsvRecovery("account-a", event.id)).not.toBeNull(); fireEvent.click(screen.getByText("Nueva importación"));
    expect(recovery.readCsvRecovery("account-a", event.id)).toBeNull(); expect(screen.queryByText("Importación confirmada")).toBeNull();
  });
});
