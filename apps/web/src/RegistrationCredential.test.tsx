// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RegistrationBrowser from "./RegistrationBrowser";
import { CredentialError, type CredentialErrorKind } from "./credential-error";
import type { IssueCredential } from "./RegistrationCredential";
import * as qr from "./credential-qr";
const id = "a4444444-4444-4444-8444-444444444444", reg = "b4444444-4444-4444-8444-444444444444";
const event = { id, name: "Evento", timezone: "America/Lima", status: "active" as const };
const registration = { id: reg, eventId: id, status: "confirmed" as const, source: "manual", createdAt: "2026-09-22T23:00:00.000Z", attendee: { id, fullName: "Ana", email: "test@example.invalid" } };
const result = { id, eventId: id, registrationId: reg, status: "active" as const, issuedAt: registration.createdAt, token: "oe1_" + "A".repeat(43) };
function setup() { return { accountKey: "a", enabled: true, event, loadPage: vi.fn().mockResolvedValue({ items: [registration], nextCursor: null }), loadDetail: vi.fn().mockResolvedValue(registration),
  issueCredential: vi.fn<IssueCredential>().mockResolvedValue(result), onCredentialSensitiveChange: vi.fn(), onBack: vi.fn(), onAccessInvalidated: vi.fn(), onUnavailable: vi.fn() }; }
async function open() { fireEvent.click(screen.getByText("Cargar inscripciones")); fireEvent.click(await screen.findByText("Ver inscripción")); await screen.findByText("Emitir credencial"); }
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { resolve, promise }; }
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("credential issuance in registration detail", () => {
  it("emits only on click and copies explicitly without another emission or storage", async () => {
    const storage = vi.spyOn(Storage.prototype, "setItem"); const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } }); const f = setup(); render(<RegistrationBrowser {...f} />); await open();
    expect(f.issueCredential).not.toHaveBeenCalled(); fireEvent.click(screen.getByText("Emitir credencial"));
    expect(await screen.findByLabelText("Código de credencial")).toBeTruthy(); expect(writeText).not.toHaveBeenCalled();
    expect(screen.getByRole("img", { name: "QR de la credencial de inscripción" })).toBeTruthy();
    expect(f.issueCredential).toHaveBeenCalledExactlyOnceWith(id, reg, expect.any(AbortSignal));
    fireEvent.click(screen.getByText("Copiar código")); await screen.findByText(/Código copiado/);
    expect(writeText).toHaveBeenCalledExactlyOnceWith(result.token); expect(f.issueCredential).toHaveBeenCalledTimes(1); expect(storage).not.toHaveBeenCalled();
  });
  it.each(["absent", "rejected"])("offers manual copy when clipboard is %s", async mode => {
    vi.stubGlobal("navigator", mode === "absent" ? {} : { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("secret")) } });
    const f = setup(); render(<RegistrationBrowser {...f} />); await open(); fireEvent.click(screen.getByText("Emitir credencial"));
    fireEvent.click(await screen.findByText("Copiar código")); await screen.findByText(/No se pudo copiar/);
    const field = screen.getByLabelText("Código de credencial") as HTMLTextAreaElement;
    expect(field.selectionEnd - field.selectionStart).toBe(result.token.length); expect(f.issueCredential).toHaveBeenCalledTimes(1);
  });
  it("prevents repeated submissions and warns before leaving a pending emission", async () => {
    const f = setup(); const pending = deferred<typeof result>(); f.issueCredential.mockReturnValue(pending.promise); const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const view = render(<RegistrationBrowser {...f} />); await open(); fireEvent.click(screen.getByText("Emitir credencial"));
    fireEvent.click(screen.getByText("Emitiendo credencial…")); fireEvent.click(screen.getByText("Volver a inscripciones")); expect(confirm).toHaveBeenCalledTimes(1);
    expect(f.issueCredential).toHaveBeenCalledTimes(1); confirm.mockReturnValue(true); fireEvent.click(screen.getByText("Volver a inscripciones"));
    expect(f.issueCredential.mock.calls[0][2].aborted).toBe(true); await act(async () => pending.resolve(result));
    expect(screen.queryByLabelText("Código de credencial")).toBeNull(); view.unmount();
  });
  it("warns on leaving a visible token, clears it and preserves the list", async () => {
    const f = setup(); const confirm = vi.spyOn(window, "confirm").mockReturnValue(false); render(<RegistrationBrowser {...f} />); await open();
    fireEvent.click(screen.getByText("Emitir credencial")); await screen.findByLabelText("Código de credencial");
    fireEvent.click(screen.getByText("Volver al evento")); expect(f.onBack).not.toHaveBeenCalled();
    expect(screen.getByRole("img", { name: "QR de la credencial de inscripción" })).toBeTruthy();
    const unload = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true);
    confirm.mockReturnValue(true); fireEvent.click(screen.getByText("Volver a inscripciones")); expect(screen.queryByLabelText("Código de credencial")).toBeNull();
    expect(screen.queryByRole("img", { name: "QR de la credencial de inscripción" })).toBeNull();
    expect(screen.getByText("Ver inscripción")).toBeTruthy(); expect(f.onCredentialSensitiveChange).toHaveBeenLastCalledWith(false);
  });
  it.each(["exists", "not_allowed", "uncertain", "validation", "configuration"] as CredentialErrorKind[])("blocks direct repetition after %s", async kind => {
    const f = setup(); f.issueCredential.mockRejectedValue(new CredentialError(kind)); render(<RegistrationBrowser {...f} />); await open(); fireEvent.click(screen.getByText("Emitir credencial"));
    await screen.findByRole("alert"); expect((screen.getByText("Emitir credencial") as HTMLButtonElement).disabled).toBe(true); expect(screen.queryByLabelText("Código de credencial")).toBeNull();
  });
  it.each(["authentication", "interaction_required", "unauthorized", "forbidden"] as CredentialErrorKind[])("clears protected detail after %s without confirmation", async kind => {
    const f = setup(); f.issueCredential.mockRejectedValue(new CredentialError(kind)); const confirm = vi.spyOn(window, "confirm"); render(<RegistrationBrowser {...f} />); await open(); fireEvent.click(screen.getByText("Emitir credencial"));
    await waitFor(() => expect(f.onAccessInvalidated).toHaveBeenCalledTimes(1)); expect(screen.queryByText("test@example.invalid")).toBeNull(); expect(confirm).not.toHaveBeenCalled();
  });
  it.each(["event_not_found", "registration_not_found"] as CredentialErrorKind[])("removes the affected resource after %s", async kind => {
    const f = setup(); f.issueCredential.mockRejectedValue(new CredentialError(kind)); render(<RegistrationBrowser {...f} />); await open(); fireEvent.click(screen.getByText("Emitir credencial"));
    await screen.findByRole("alert"); expect(screen.queryByLabelText("Código de credencial")).toBeNull();
    if (kind === "event_not_found") expect(f.onUnavailable).toHaveBeenCalledTimes(1); else { expect(f.onUnavailable).not.toHaveBeenCalled(); expect(screen.queryByText("Ver inscripción")).toBeNull(); }
  });
  it.each(["account", "event", "disabled"])("aborts and ignores late secrets on %s change", async mode => {
    const f = setup(); const pending = deferred<typeof result>(); f.issueCredential.mockReturnValue(pending.promise); const view = render(<RegistrationBrowser {...f} />);
    await open(); fireEvent.click(screen.getByText("Emitir credencial"));
    view.rerender(<RegistrationBrowser {...f} accountKey={mode === "account" ? "b" : "a"} event={mode === "event" ? { ...event, id: reg } : event} enabled={mode !== "disabled"} />);
    expect(f.issueCredential.mock.calls[0][2].aborted).toBe(true); await act(async () => pending.resolve(result)); expect(screen.queryByLabelText("Código de credencial")).toBeNull();
    expect(screen.queryByRole("img", { name: "QR de la credencial de inscripción" })).toBeNull();
  });
  it.each(["closed", "cancelled"] as const)("does not offer issuance for event %s", async status => {
    const f = setup(); render(<RegistrationBrowser {...f} event={{ ...event, status }} />);
    fireEvent.click(screen.getByText("Cargar inscripciones")); fireEvent.click(await screen.findByText("Ver inscripción")); await screen.findByText("Identificador");
    expect(screen.queryByText("Emitir credencial")).toBeNull();
  });
  it("does not offer issuance for a cancelled registration", async () => {
    const f = setup(); f.loadDetail.mockResolvedValue({ ...registration, status: "cancelled" }); render(<RegistrationBrowser {...f} />);
    fireEvent.click(screen.getByText("Cargar inscripciones")); fireEvent.click(await screen.findByText("Ver inscripción")); await screen.findByText("Identificador"); expect(screen.queryByText("Emitir credencial")).toBeNull();
  });
  it("never displays an invalid or foreign credential response", async () => {
    const f = setup(); f.issueCredential.mockResolvedValue({ ...result, registrationId: id }); render(<RegistrationBrowser {...f} />); await open(); fireEvent.click(screen.getByText("Emitir credencial"));
    await screen.findByText(/No podemos confirmar el resultado/); expect(screen.queryByLabelText("Código de credencial")).toBeNull();
  });
  it("keeps copy and navigation protection when QR generation fails without another issuance", async () => {
    vi.spyOn(qr, "createCredentialQr").mockImplementation(() => { throw new Error(result.token); });
    const writeText = vi.fn().mockResolvedValue(undefined); vi.stubGlobal("navigator", { clipboard: { writeText } });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const f = setup(); render(<RegistrationBrowser {...f} />); await open(); fireEvent.click(screen.getByText("Emitir credencial"));
    await screen.findByText(/No se pudo mostrar el QR/); expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByRole("alert").textContent).not.toContain(result.token);
    fireEvent.click(screen.getByText("Copiar código")); await screen.findByText(/Código copiado/);
    expect(writeText).toHaveBeenCalledWith(result.token); expect(f.issueCredential).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("Volver a inscripciones")); expect(confirm).toHaveBeenCalled();
    expect(screen.getByLabelText("Código de credencial")).toBeTruthy();
  });
  it.each(["account", "event", "disabled"])("removes a displayed QR immediately on %s change", async mode => {
    const f = setup(); const view = render(<RegistrationBrowser {...f} />); await open();
    fireEvent.click(screen.getByText("Emitir credencial")); await screen.findByRole("img", { name: "QR de la credencial de inscripción" });
    const confirm = vi.spyOn(window, "confirm");
    view.rerender(<RegistrationBrowser {...f} accountKey={mode === "account" ? "b" : "a"} event={mode === "event" ? { ...event, id: reg } : event} enabled={mode !== "disabled"} />);
    expect(screen.queryByRole("img", { name: "QR de la credencial de inscripción" })).toBeNull();
    expect(screen.queryByLabelText("Código de credencial")).toBeNull(); expect(confirm).not.toHaveBeenCalled();
  });
  it("does not recover a QR on reopening a detail and receiving an existing-credential conflict", async () => {
    const f = setup(); vi.spyOn(window, "confirm").mockReturnValue(true); render(<RegistrationBrowser {...f} />); await open();
    fireEvent.click(screen.getByText("Emitir credencial")); await screen.findByRole("img", { name: "QR de la credencial de inscripción" });
    fireEvent.click(screen.getByText("Volver a inscripciones")); fireEvent.click(screen.getByText("Ver inscripción"));
    await screen.findByText("Emitir credencial"); expect(screen.queryByRole("img")).toBeNull();
    f.issueCredential.mockRejectedValue(new CredentialError("exists")); fireEvent.click(screen.getByText("Emitir credencial"));
    await screen.findByRole("alert"); expect(screen.queryByRole("img")).toBeNull(); expect(screen.queryByLabelText("Código de credencial")).toBeNull();
  });
});
