import { useEffect, useId, useRef, useState } from "react";
import { createCredentialQrPng, startCredentialQrDownload } from "./credential-qr-download";

export default function RegistrationCredentialQrDownload({ token }: { token: string }) {
  return <Download key={token} token={token} />;
}

function Download({ token }: { token: string }) {
  const alive = useRef(false);
  const active = useRef(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"requested" | "failed" | null>(null);
  const description = useId();
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  async function download() {
    if (active.current) return;
    active.current = true; setBusy(true); setStatus(null);
    try {
      const png = await createCredentialQrPng(token);
      if (!alive.current) return;
      startCredentialQrDownload(png);
      setStatus("requested");
    } catch {
      if (alive.current) setStatus("failed");
    } finally {
      if (alive.current) { active.current = false; setBusy(false); }
    }
  }

  return <div className="registration-credential-download">
    <p id={description}>El archivo contiene tu credencial. Una vez descargado queda bajo tu control; salir de esta vista no lo borra.</p>
    <button type="button" disabled={busy} aria-describedby={description} onClick={() => void download()}>
      {busy ? "Preparando PNG…" : "Descargar QR (PNG)"}
    </button>
    {busy && <p role="status">Preparando el archivo de la credencial.</p>}
    {status === "requested" && <p role="status">Descarga solicitada. Comprueba las descargas del navegador para confirmar que se guardó el archivo.</p>}
    {status === "failed" && <p role="alert">No se pudo descargar el QR. Puedes intentarlo otra vez o copiar el código; no se emitirá otra credencial.</p>}
  </div>;
}
