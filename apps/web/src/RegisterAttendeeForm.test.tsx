// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RegisterAttendeeForm, { type RegisterAttendeeFormProps } from "./RegisterAttendeeForm";
import type { ApiEvent } from "./api-event-queries";
import type { ApiRegistration } from "./api-registrations";
import { RegistrationError, type RegistrationErrorKind } from "./registration-error";

const event: ApiEvent = { id: "a4444444-4444-4444-8444-444444444444", name: "Evento Lima", slug: "evento", location: "Lima",
  timezone: "America/Lima", startsAt: "2027-08-27T14:00:00.000Z", endsAt: "2027-08-27T22:00:00.000Z",
  createdAt: "2026-09-19T12:00:00.000Z", status: "draft", version: 1 };
const saved: ApiRegistration = { id: "b4444444-4444-4444-8444-444444444444", eventId: event.id,
  status: "confirmed", source: "manual", createdAt: "2026-09-20T14:00:00.000Z",
  attendee: { id: "c4444444-4444-4444-8444-444444444444", fullName: "Ana Pérez", email: "ana@example.com" } };
function setup() {
  return { enabled: true, accountKey: "account-one", event,
    onRegister: vi.fn<RegisterAttendeeFormProps["onRegister"]>().mockResolvedValue(saved),
    onCancel: vi.fn(), onAccessInvalidated: vi.fn(), onUnavailable: vi.fn(), onUncertain: vi.fn() };
}
const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement;
function fill() {
  fireEvent.change(field("Nombre completo"), { target: { value: " Ana Pérez " } });
  fireEvent.change(field("Correo electrónico"), { target: { value: " ANA@EXAMPLE.COM " } });
}
const send = () => fireEvent.click(screen.getByRole("button", { name: "Confirmar inscripción" }));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("RegisterAttendeeForm", () => {
  it("hides data while disabled", () => {
    const props = setup(); render(<RegisterAttendeeForm {...props} enabled={false} />);
    expect(screen.queryByLabelText("Nombre completo")).toBeNull(); expect(props.onRegister).not.toHaveBeenCalled();
  });
  it.each(["closed", "cancelled"] as const)("rejects event state %s", status => {
    render(<RegisterAttendeeForm {...setup()} event={{ ...event, status }} />);
    expect(screen.queryByRole("button", { name: "Confirmar inscripción" })).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("no admite");
  });
  it.each(["draft", "active"] as const)("registers in %s with normalized fields and accessible confirmation", async status => {
    const props = setup(); render(<RegisterAttendeeForm {...props} event={{ ...event, status }} />); fill(); send();
    await screen.findByText("Asistente registrado correctamente.");
    expect(props.onRegister).toHaveBeenCalledExactlyOnceWith({ fullName: "Ana Pérez", email: "ana@example.com" }, expect.any(AbortSignal));
    expect(screen.getByText(saved.id)).toBeTruthy(); expect(screen.getByText("ana@example.com")).toBeTruthy();
    expect(screen.getByText("Confirmada (confirmed)")).toBeTruthy(); expect(screen.getByText("Manual (manual)")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Inscripción confirmada" }));
    expect(screen.queryByLabelText("Nombre completo")).toBeNull();
  });
  it("focuses the first invalid field without sending", () => {
    const props = setup(); render(<RegisterAttendeeForm {...props} />); send();
    expect(field("Nombre completo").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(field("Nombre completo"));
    fireEvent.change(field("Nombre completo"), { target: { value: "Ana" } }); send();
    expect(document.activeElement).toBe(field("Correo electrónico")); expect(props.onRegister).not.toHaveBeenCalled();
  });
  it("shows field-specific errors and clears them on correction", () => {
    const props = setup(); render(<RegisterAttendeeForm {...props} />); fill();
    fireEvent.change(field("Correo electrónico"), { target: { value: "invalid" } }); send();
    const errorId = field("Correo electrónico").getAttribute("aria-describedby");
    expect(document.getElementById(errorId!)?.textContent).toContain("correo válido");
    expect(props.onRegister).not.toHaveBeenCalled();
    fireEvent.change(field("Correo electrónico"), { target: { value: "ana@example.com" } });
    expect(field("Correo electrónico").getAttribute("aria-invalid")).toBe("false");
  });
  it("prevents repeated submits while a request is pending", async () => {
    const props = setup(); const pending = deferred<ApiRegistration>(); props.onRegister.mockReturnValue(pending.promise);
    render(<RegisterAttendeeForm {...props} />); fill(); send();
    fireEvent.submit(field("Nombre completo").closest("form")!);
    expect(props.onRegister).toHaveBeenCalledTimes(1);
    expect(field("Nombre completo").closest("fieldset")?.disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Volver al evento" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { pending.resolve(saved); });
  });
  it("starts another empty form only on explicit action", async () => {
    const props = setup(); render(<RegisterAttendeeForm {...props} />); fill(); send();
    await screen.findByText("Asistente registrado correctamente.");
    fireEvent.click(screen.getByRole("button", { name: "Registrar otro asistente" }));
    expect(field("Nombre completo").value).toBe(""); expect(field("Correo electrónico").value).toBe("");
    expect(props.onRegister).toHaveBeenCalledTimes(1); expect(screen.queryByText(saved.id)).toBeNull();
  });
  it.each(["validation", "duplicate"] as const)("retains data and permits correction after %s", async kind => {
    const props = setup(); props.onRegister.mockRejectedValueOnce(new RegistrationError(kind));
    render(<RegisterAttendeeForm {...props} />); fill(); send();
    await screen.findByRole("alert");
    expect(field("Nombre completo").value).toBe(" Ana Pérez ");
    expect(field("Correo electrónico").closest("fieldset")?.disabled).toBe(false);
    expect(document.activeElement).toBe(screen.getByRole("alert"));
    fireEvent.change(field("Correo electrónico"), { target: { value: "ana@example.com" } }); send();
    await screen.findByText("Asistente registrado correctamente."); expect(props.onRegister).toHaveBeenCalledTimes(2);
  });
  it.each(["authentication", "interaction_required", "unauthorized", "forbidden"] as const)("clears data and invalidates access after %s", async kind => {
    const props = setup(); props.onRegister.mockRejectedValue(new RegistrationError(kind));
    render(<RegisterAttendeeForm {...props} />); fill(); send();
    await waitFor(() => expect(props.onAccessInvalidated).toHaveBeenCalledTimes(1));
    expect(screen.queryByLabelText("Nombre completo")).toBeNull(); expect(screen.queryByText("ana@example.com")).toBeNull();
  });
  it("removes an unavailable event through its parent callback", async () => {
    const props = setup(); props.onRegister.mockRejectedValue(new RegistrationError("not_found"));
    render(<RegisterAttendeeForm {...props} />); fill(); send();
    await waitFor(() => expect(props.onUnavailable).toHaveBeenCalledTimes(1));
    expect(screen.queryByLabelText("Correo electrónico")).toBeNull();
  });
  it.each(["not_allowed", "configuration", "uncertain", "cancelled"] as RegistrationErrorKind[])("blocks further submissions after %s", async kind => {
    const props = setup(); props.onRegister.mockRejectedValue(new RegistrationError(kind));
    render(<RegisterAttendeeForm {...props} />); fill(); send(); await screen.findByRole("alert");
    expect(field("Nombre completo").closest("fieldset")?.disabled).toBe(true);
    fireEvent.submit(field("Nombre completo").closest("form")!); expect(props.onRegister).toHaveBeenCalledTimes(1);
    expect(props.onUncertain).toHaveBeenCalledTimes(["uncertain", "cancelled"].includes(kind) ? 1 : 0);
  });
  it("hides unexpected details and marks the result uncertain", async () => {
    const props = setup(); props.onRegister.mockRejectedValue(new Error("private SQL"));
    render(<RegisterAttendeeForm {...props} />); fill(); send();
    expect((await screen.findByRole("alert")).textContent).toContain("Podría haberse guardado");
    expect(screen.queryByText(/private SQL/)).toBeNull(); expect(props.onUncertain).toHaveBeenCalledTimes(1);
  });
  it("confirms cancellation of a dirty form and respects refusal", () => {
    const props = setup(); const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<RegisterAttendeeForm {...props} />); fill();
    fireEvent.click(screen.getByRole("button", { name: "Volver al evento" })); expect(props.onCancel).not.toHaveBeenCalled();
    expect(field("Nombre completo").value).toBe(" Ana Pérez ");
    fireEvent.click(screen.getByRole("button", { name: "Volver al evento" })); expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledTimes(2); expect(screen.queryByLabelText("Nombre completo")).toBeNull();
  });
  it("returns without confirmation when empty or already successful", async () => {
    const props = setup(); const confirm = vi.spyOn(window, "confirm"); const view = render(<RegisterAttendeeForm {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Volver al evento" })); expect(confirm).not.toHaveBeenCalled(); view.unmount();
    render(<RegisterAttendeeForm {...props} />); fill(); send(); await screen.findByText("Asistente registrado correctamente.");
    fireEvent.click(screen.getByRole("button", { name: "Volver al evento" })); expect(confirm).not.toHaveBeenCalled();
  });
  it.each(["account", "event", "disabled", "closed"])("aborts and ignores late results after %s changes", async mode => {
    const props = setup(); const pending = deferred<ApiRegistration>(); props.onRegister.mockReturnValue(pending.promise);
    const view = render(<RegisterAttendeeForm {...props} />); fill(); send(); const signal = props.onRegister.mock.calls[0][1];
    const changed = mode === "account" ? { accountKey: "other" } : mode === "event" ? { event: { ...event, id: saved.id } } :
      mode === "disabled" ? { enabled: false } : { event: { ...event, status: "closed" as const } };
    view.rerender(<RegisterAttendeeForm {...props} {...changed} />); expect(signal.aborted).toBe(true);
    await act(async () => { pending.resolve(saved); }); expect(screen.queryByText("Asistente registrado correctamente.")).toBeNull();
    if (mode === "account" || mode === "event") expect(field("Nombre completo").value).toBe("");
    expect(props.onUncertain).not.toHaveBeenCalled();
  });
  it("does not store attendee data in browser storage", async () => {
    const store = vi.spyOn(Storage.prototype, "setItem"); render(<RegisterAttendeeForm {...setup()} />); fill(); send();
    await screen.findByText("Asistente registrado correctamente."); expect(store).not.toHaveBeenCalled();
  });
});
