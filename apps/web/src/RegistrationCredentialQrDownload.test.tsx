// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RegistrationCredentialQrDownload from "./RegistrationCredentialQrDownload";
import * as download from "./credential-qr-download";

const token = "oe1_" + "A".repeat(43);
function deferred() { let resolve!: (v: Blob) => void; let reject!: (e: Error) => void; const promise = new Promise<Blob>((r, j) => { resolve = r; reject = j; }); return { resolve, reject, promise }; }
function setup() {
  const file = new Blob(["synthetic"], { type: "image/png" });
  const encode = vi.spyOn(download, "createCredentialQrPng").mockResolvedValue(file);
  const start = vi.spyOn(download, "startCredentialQrDownload").mockImplementation(() => {});
  return { file, encode, start };
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("explicit credential PNG download", () => {
  it("does nothing on mount and only claims a requested download after click", async () => {
    const f = setup(); const storage = vi.spyOn(Storage.prototype, "setItem"); const fetch = vi.spyOn(globalThis, "fetch");
    render(<RegistrationCredentialQrDownload token={token} />);
    expect(f.encode).not.toHaveBeenCalled(); expect(f.start).not.toHaveBeenCalled();
    const button = screen.getByRole("button", { name: "Descargar QR (PNG)" });
    expect(document.getElementById(button.getAttribute("aria-describedby")!)?.textContent).toContain("no lo borra");
    fireEvent.click(button); await screen.findByText(/Descarga solicitada/);
    expect(f.encode).toHaveBeenCalledExactlyOnceWith(token); expect(f.start).toHaveBeenCalledExactlyOnceWith(f.file);
    expect(storage).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it("blocks rapid repeated clicks until preparation finishes", async () => {
    const f = setup(); const pending = deferred(); f.encode.mockReturnValue(pending.promise);
    render(<RegistrationCredentialQrDownload token={token} />); const button = screen.getByRole("button");
    fireEvent.click(button); fireEvent.click(button); expect(f.encode).toHaveBeenCalledTimes(1);
    expect((button as HTMLButtonElement).disabled).toBe(true); await act(async () => pending.resolve(f.file));
    expect(f.start).toHaveBeenCalledTimes(1); expect((button as HTMLButtonElement).disabled).toBe(false);
  });
  it.each(["encode", "start"] as const)("offers an explicit retry after %s failure without exposing the error", async step => {
    const f = setup();
    if (step === "encode") f.encode.mockRejectedValueOnce(new Error(token)); else f.start.mockImplementationOnce(() => { throw new Error(token); });
    render(<RegistrationCredentialQrDownload token={token} />); fireEvent.click(screen.getByRole("button"));
    const alert = await screen.findByRole("alert"); expect(alert.textContent).not.toContain(token);
    fireEvent.click(screen.getByRole("button")); await screen.findByText(/Descarga solicitada/); expect(screen.queryByRole("alert")).toBeNull();
    expect(f.encode).toHaveBeenCalledTimes(2);
  });
  it.each(["resolve", "reject"] as const)("discards late %s after unmount", async outcome => {
    const f = setup(); const pending = deferred(); f.encode.mockReturnValue(pending.promise);
    const view = render(<RegistrationCredentialQrDownload token={token} />); fireEvent.click(screen.getByRole("button")); view.unmount();
    await act(async () => { if (outcome === "resolve") pending.resolve(f.file); else pending.reject(new Error(token)); });
    expect(f.start).not.toHaveBeenCalled(); expect(screen.queryByRole("alert")).toBeNull();
  });
  it("discards an old token's file when the token changes and allows the new token", async () => {
    const f = setup(); const pending = deferred(); f.encode.mockReturnValueOnce(pending.promise);
    const view = render(<RegistrationCredentialQrDownload token={token} />); fireEvent.click(screen.getByRole("button"));
    const next = "oe1_" + "z".repeat(42) + "M"; view.rerender(<RegistrationCredentialQrDownload token={next} />);
    await act(async () => pending.resolve(f.file)); expect(f.start).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button")); await screen.findByText(/Descarga solicitada/);
    expect(f.encode).toHaveBeenLastCalledWith(next); expect(f.start).toHaveBeenCalledTimes(1);
  });
});

describe("browser download resources", () => {
  function browser() {
    const create = vi.fn().mockReturnValue("blob:synthetic"); const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
    vi.useFakeTimers();
    return { create, revoke, file: new Blob(["synthetic"], { type: "image/png" }) };
  }
  it("uses a generic filename and releases the temporary URL after allowing consumption", () => {
    const f = browser();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.isConnected).toBe(true); expect(this.download).toBe("openevents-credencial.png"); expect(this.getAttribute("href")).toBe("blob:synthetic");
    });
    download.startCredentialQrDownload(f.file);
    expect(click).toHaveBeenCalledTimes(1); expect(document.querySelector("a[download]")).toBeNull(); expect(f.revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000); expect(f.revoke).toHaveBeenCalledExactlyOnceWith("blob:synthetic");
  });
  it("removes the anchor and revokes the URL immediately if initiation fails", () => {
    const f = browser(); vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => { throw new Error(token); });
    expect(() => download.startCredentialQrDownload(f.file)).toThrow("No se pudo iniciar la descarga.");
    expect(document.querySelector("a[download]")).toBeNull(); expect(f.revoke).toHaveBeenCalledExactlyOnceWith("blob:synthetic");
    expect(vi.getTimerCount()).toBe(0);
  });
});
