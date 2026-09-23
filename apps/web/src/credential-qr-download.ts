import QRCode from "qrcode";
import { credentialQrSegments } from "./credential-qr";

export async function createCredentialQrPng(token: string): Promise<Blob> {
  try {
    const data = await QRCode.toDataURL(credentialQrSegments(token), {
      type: "image/png", errorCorrectionLevel: "M", margin: 4, scale: 8,
      color: { dark: "#000000ff", light: "#ffffffff" },
    });
    const prefix = "data:image/png;base64,";
    if (!data.startsWith(prefix)) throw new Error();
    const bytes = Uint8Array.from(atob(data.slice(prefix.length)), c => c.charCodeAt(0));
    if (![137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)) throw new Error();
    return new Blob([bytes], { type: "image/png" });
  } catch { throw new Error("No se pudo preparar el PNG de la credencial."); }
}

// El navegador necesita consumir la URL después del clic. La salida de la vista
// no la revoca inmediatamente; el plazo limita su vida sin cancelar esa entrega.
export function startCredentialQrDownload(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  let link: HTMLAnchorElement | undefined;
  try {
    link = document.createElement("a");
    link.href = url;
    link.download = "openevents-credencial.png";
    link.hidden = true;
    document.body.append(link);
    link.click();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("No se pudo iniciar la descarga.");
  } finally { link?.remove(); }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
