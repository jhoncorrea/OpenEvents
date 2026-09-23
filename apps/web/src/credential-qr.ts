import QRCode from "qrcode";

export interface CredentialQrDrawing { extent: number; path: string }

export function credentialQrSegments(token: string) {
  if (!/^oe1_[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(token)) {
    throw new Error("Código de credencial inválido.");
  }
  return [{ data: new TextEncoder().encode(token), mode: "byte" as const }];
}

// Solo geometría en memoria: sin imágenes remotas, HTML interpolado ni URLs de datos.
export function createCredentialQr(token: string): CredentialQrDrawing {
  const { modules } = QRCode.create(credentialQrSegments(token), { errorCorrectionLevel: "M" });
  const margin = 4;
  const cells: string[] = [];
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) {
      if (modules.get(row, col)) cells.push(`M${col + margin} ${row + margin}h1v1h-1z`);
    }
  }
  return { extent: modules.size + margin * 2, path: cells.join("") };
}
