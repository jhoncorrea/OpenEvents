import CameraQrScanner from "./CameraQrScanner";
import { useEffect, useId, useRef, useState } from "react";
import type { CheckInResult } from "./api-check-in";
import { CheckInError } from "./check-in-error";
export type SubmitCheckIn = (eventId: string, code: string, signal: AbortSignal, source?: "manual" | "qr") => Promise<CheckInResult>;
interface Props { eventId: string; timezone: string; submit: SubmitCheckIn; onFailure: (error: CheckInError) => void }
export default function OperatorCheckIn({ eventId, timezone, submit, onFailure }: Props) {
  const [scanning, setScanning] = useState(false);
  const [source, setSource] = useState<"manual" | "qr">("manual");
  const [code, setCode] = useState(""); const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckInResult | null>(null); const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null); const input = useRef<HTMLInputElement>(null); const id = useId();
  const focusAfterSend = useRef(false);
  useEffect(() => { if (!busy && focusAfterSend.current) { focusAfterSend.current = false; input.current?.focus(); } }, [busy]);
  useEffect(() => () => { request.current?.abort(); request.current = null; }, []);
  async function send() {
    if (request.current || scanning) return;
    if (!code.length || code.length > 256) { setError(new CheckInError("validation").message); input.current?.focus(); return; }
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(""); setResult(null);
    try {
      const value = await submit(eventId, code, controller.signal, source);
      if (controller.signal.aborted) return;
      setResult(value); setCode(""); setSource("manual");
    } catch (cause) {
      if (controller.signal.aborted) return;
      const failure = cause instanceof CheckInError ? cause : new CheckInError("uncertain");
      setError(failure.message);
      if (["authentication", "interaction_required", "unauthorized", "forbidden", "not_found", "not_active"].includes(failure.kind)) { setCode(""); onFailure(failure); }
    } finally {
      if (!controller.signal.aborted) { request.current = null; focusAfterSend.current = true; setBusy(false); }
    }
  }
  return <section aria-label="Registrar ingreso">
    <h3>Registrar ingreso</h3><p>Pega el código de la credencial del asistente. La búsqueda por nombre no registra un ingreso.</p>
    <CameraQrScanner disabled={busy} onActiveChange={setScanning} onRead={value => {
      setCode(value); setSource("qr"); setResult(null); setError("");
      // El campo se habilita en el siguiente render al finalizar la captura.
    }} />
    {source === "qr" && <p role="status">QR leído. Pulsa Registrar ingreso para confirmar.</p>}
    <form onSubmit={e => { e.preventDefault(); void send(); }}>
      <label htmlFor={id}>Código de la credencial</label>
      <input ref={input} id={id} type="password" autoComplete="off" spellCheck={false} maxLength={256} value={code} disabled={busy || scanning}
        onChange={e => { setCode(e.target.value); setSource("manual"); setResult(null); setError(""); }} />
      <button type="submit" disabled={busy || scanning}>{busy ? "Registrando ingreso…" : "Registrar ingreso"}</button>
      <button type="button" disabled={busy || scanning} onClick={() => { setCode(""); setSource("manual"); setResult(null); setError(""); input.current?.focus(); }}>Limpiar código</button>
    </form>
    {busy && <p role="status">Esperando confirmación del ingreso…</p>}
    {error && <p role="alert">{error}</p>}
    {result && <div role="status">
      <p>{result.status === "accepted" ? "Ingreso registrado correctamente." : result.status === "duplicate" ? "Esta credencial ya tiene un ingreso registrado. No se creó otro ingreso." : "Código no válido para este evento."}</p>
      {result.status !== "invalid" && <p>Fecha del ingreso: {new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(result.checkIn.checkedInAt))} ({timezone}).</p>}
    </div>}
  </section>;
}
