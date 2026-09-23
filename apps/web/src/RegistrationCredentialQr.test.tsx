// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import jsQR from "jsqr";
import RegistrationCredentialQr from "./RegistrationCredentialQr";
import * as generator from "./credential-qr";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// Rasteriza el SVG que recibe el usuario, no la matriz interna del codificador.
function decodeSvg(svg: Element, scale: number) {
  const extent = Number(svg.getAttribute("viewBox")!.split(" ")[2]);
  const size = extent * scale;
  const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
  expect(svg.querySelector("rect")?.getAttribute("fill")).toBe("#fff");
  expect(svg.querySelector("path")?.getAttribute("fill")).toBe("#000");
  const path = svg.querySelector("path")!.getAttribute("d")!;
  const commands = [...path.matchAll(/M(\d+) (\d+)h1v1h-1z/g)];
  expect(commands.map(m => m[0]).join("")).toBe(path);
  for (const [, x, y] of commands) {
    expect(Number(x)).toBeGreaterThanOrEqual(4); expect(Number(y)).toBeGreaterThanOrEqual(4);
    expect(Number(x)).toBeLessThan(extent - 4); expect(Number(y)).toBeLessThan(extent - 4);
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const offset = ((Number(y) * scale + dy) * size + Number(x) * scale + dx) * 4;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
    }
  }
  return jsQR(pixels, size, size)?.data;
}

describe("local credential QR", () => {
  const tokens = ["oe1_" + "A".repeat(43), "oe1_" + "aZ09_-".repeat(7) + "8", "oe1_" + "z".repeat(42) + "M"];
  it.each(tokens)("decodes exactly the synthetic credential at two display sizes: %s", token => {
    render(<RegistrationCredentialQr token={token} />);
    const svg = screen.getByRole("img", { name: "QR de la credencial de inscripción" });
    expect(decodeSvg(svg, 8)).toBe(token); expect(decodeSvg(svg, 4)).toBe(token);
    expect(svg.outerHTML).not.toContain(token);
    expect(svg.querySelector("image, script, foreignObject, a")).toBeNull();
    expect(svg.getAttribute("width")).toBe(svg.getAttribute("height"));
  });
  it("replaces geometry for a new token and removes it on unmount without persistent or network side effects", () => {
    const fetch = vi.spyOn(globalThis, "fetch"); const storage = vi.spyOn(Storage.prototype, "setItem");
    const view = render(<RegistrationCredentialQr token={tokens[0]} />);
    view.rerender(<RegistrationCredentialQr token={tokens[1]} />);
    expect(decodeSvg(screen.getByRole("img"), 4)).toBe(tokens[1]);
    view.unmount(); expect(screen.queryByRole("img")).toBeNull();
    expect(fetch).not.toHaveBeenCalled(); expect(storage).not.toHaveBeenCalled();
  });
  it.each(["", "oe1_bad", "https://example.invalid", "oe1_" + "A".repeat(42) + "B"])("rejects invalid content without drawing: %s", token => {
    render(<RegistrationCredentialQr token={token} />);
    expect(screen.queryByRole("img")).toBeNull(); expect(screen.getByRole("alert").textContent).toContain("Puedes copiar");
  });
  it("sanitizes a generator failure and removes previous geometry", () => {
    const view = render(<RegistrationCredentialQr token={tokens[0]} />);
    vi.spyOn(generator, "createCredentialQr").mockImplementation(() => { throw new Error(tokens[1]); });
    view.rerender(<RegistrationCredentialQr token={tokens[1]} />);
    expect(screen.queryByRole("img")).toBeNull(); expect(screen.getByRole("alert").textContent).not.toContain(tokens[1]);
  });
});
