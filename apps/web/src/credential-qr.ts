import QRCode from "qrcode";

export interface CredentialQrDrawing { extent: number; path: string }

// Solo geometría en memoria: sin imágenes remotas, HTML interpolado ni URLs de datos.
export function createCredentialQr(token: string): CredentialQrDrawing {
  if (!/^oe1_[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(token)) {
    throw new Error("Código de credencial inválido.");
  }
  const { modules } = QRCode.create([{ data: new TextEncoder().encode(token), mode: "byte" }], { errorCorrectionLevel: "M" });
  const margin = 4;
  const cells: string[] = [];
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) {
      if (modules.get(row, col)) cells.push(`M${col + margin} ${row + margin}h1v1h-1z`);
    }
  }
  return { extent: modules.size + margin * 2, path: cells.join("") };
}
