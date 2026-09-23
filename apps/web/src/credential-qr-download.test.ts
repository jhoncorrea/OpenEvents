import { afterEach, describe, expect, it, vi } from "vitest";
import QRCode from "qrcode";
import { PNG } from "pngjs";
import jsQR from "jsqr";
import { createCredentialQrPng } from "./credential-qr-download";

afterEach(() => vi.restoreAllMocks());

describe("credential PNG payload", () => {
  it.each(["oe1_" + "A".repeat(43), "oe1_" + "aZ09_-".repeat(7) + "8", "oe1_" + "z".repeat(42) + "M"])("decodes the generated PNG exactly: %s", async token => {
    const file = await createCredentialQrPng(token);
    expect(file.type).toBe("image/png");
    const bytes = Buffer.from(await file.arrayBuffer());
    const png = PNG.sync.read(bytes);
    expect(png.width).toBe(328); expect(png.height).toBe(328);
    expect(jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data).toBe(token);
    // Márgenes de 4 módulos a 8 píxeles y colores opacos, sin texto superpuesto.
    for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      const [r, g, b, a] = png.data.subarray(i, i + 4);
      if (a !== 255 || r !== g || g !== b || (r !== 0 && r !== 255)) throw new Error("Color PNG inesperado");
      if ((x < 32 || y < 32 || x >= png.width - 32 || y >= png.height - 32) && r !== 255) throw new Error("Margen incompleto");
    }
    // El PNG no transporta chunks de texto con el secreto o datos adicionales.
    let offset = 8; const chunks: string[] = [];
    while (offset < bytes.length) { chunks.push(bytes.toString("ascii", offset + 4, offset + 8)); offset += bytes.readUInt32BE(offset) + 12; }
    expect(chunks.every(c => ["IHDR", "IDAT", "IEND"].includes(c))).toBe(true);
  });
  it.each(["", "oe1_invalid", "oe1_" + "A".repeat(42) + "B"])("does not encode malformed content: %s", async token => {
    const encode = vi.spyOn(QRCode, "toDataURL");
    await expect(createCredentialQrPng(token)).rejects.toThrow("No se pudo preparar el PNG");
    expect(encode).not.toHaveBeenCalled();
  });
  it("does not expose an encoder error containing the secret", async () => {
    vi.spyOn(QRCode, "toDataURL").mockRejectedValue(new Error("secret error"));
    await expect(createCredentialQrPng("oe1_" + "A".repeat(43))).rejects.toThrow("No se pudo preparar el PNG de la credencial.");
  });
  it.each(["data:text/html;base64,AA==", "data:image/png;base64,AA==", "data:image/png;base64,!"])("rejects an unexpected encoder response: %s", async data => {
    vi.spyOn(QRCode, "toDataURL").mockImplementation(() => Promise.resolve(data));
    await expect(createCredentialQrPng("oe1_" + "A".repeat(43))).rejects.toThrow("No se pudo preparar el PNG");
  });
});
