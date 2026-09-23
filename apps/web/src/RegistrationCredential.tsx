import { useEffect, useRef, useState } from "react";
import { parseIssuedCredential, type IssuedCredential } from "./api-registration-credentials";
import { CredentialError } from "./credential-error";
import RegistrationCredentialQr from "./RegistrationCredentialQr";
export type IssueCredential = (eventId: string, registrationId: string, signal: AbortSignal) => Promise<IssuedCredential>;
export interface CredentialProps {
  eventId: string; registrationId: string; issue: IssueCredential;
  onSensitiveChange: (value: boolean) => void;
  onAccessInvalidated: () => void; onEventUnavailable: () => void; onRegistrationUnavailable: () => void;
}
export default function RegistrationCredential({ eventId, registrationId, issue, onSensitiveChange, onAccessInvalidated, onEventUnavailable, onRegistrationUnavailable }: CredentialProps) {
  const [result, setResult] = useState<IssuedCredential | null>(null);
  const [pending, setPending] = useState(false); const [locked, setLocked] = useState(false);
  const [message, setMessage] = useState<string | null>(null); const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null); const mounted = useRef(false); const done = useRef(false);
  const sensitive = useRef(false); const copying = useRef(false); const input = useRef<HTMLTextAreaElement>(null);
  const protect = useRef(onSensitiveChange); protect.current = onSensitiveChange;
  useEffect(() => {
    mounted.current = true;
    const beforeUnload = (e: BeforeUnloadEvent) => { if (sensitive.current) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload);
    return () => { mounted.current = false; active.current?.abort(); protect.current(false); window.removeEventListener("beforeunload", beforeUnload); };
  }, []);
  function protection(value: boolean) { sensitive.current = value; protect.current(value); }
  async function emit() {
    if (active.current || done.current) return;
    const controller = new AbortController(); active.current = controller; setPending(true); setMessage(null); protection(true);
    try {
      const value = await issue(eventId, registrationId, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      const parsed = parseIssuedCredential(value, eventId, registrationId);
      done.current = true; setLocked(true); setResult(parsed);
    } catch (cause) {
      if (!mounted.current || controller.signal.aborted) return;
      const error = cause instanceof CredentialError ? cause : new CredentialError("uncertain");
      done.current = error.kind !== "cancelled_before_send"; setLocked(done.current); setResult(null); setMessage(error.message); protection(false);
      if (["authentication", "interaction_required", "unauthorized", "forbidden"].includes(error.kind)) onAccessInvalidated();
      else if (error.kind === "event_not_found") onEventUnavailable();
      else if (error.kind === "registration_not_found") onRegistrationUnavailable();
    } finally { if (mounted.current && !controller.signal.aborted) { active.current = null; setPending(false); } }
  }
  async function copy() {
    if (!result || copying.current) return;
    copying.current = true; setCopyMessage(null);
    try {
      if (!navigator.clipboard?.writeText) throw new Error();
      await navigator.clipboard.writeText(result.token);
      if (mounted.current) setCopyMessage("Código copiado. El portapapeles queda bajo tu control.");
    } catch { if (mounted.current) { setCopyMessage("No se pudo copiar. Selecciona el código y usa la copia manual."); input.current?.focus(); input.current?.select(); } }
    finally { copying.current = false; }
  }
  return <section aria-label="Credencial de inscripción" className="registration-credential">
    <h4>Credencial de inscripción</h4>
    <p>El código se muestra al recibir esta emisión. Al salir o recargar no podrás recuperarlo. Una credencial existente no se reemplaza.</p>
    {!result && <button type="button" disabled={pending || locked} onClick={() => void emit()}>{pending ? "Emitiendo credencial…" : "Emitir credencial"}</button>}
    {pending && <p role="status">Esperando el resultado. Salir no cancela necesariamente la emisión en el servidor.</p>}
    {message && <p role="alert">{message}</p>}
    {result && <>
      <p role="status">Credencial emitida. Guarda el código antes de salir.</p>
      <RegistrationCredentialQr token={result.token} />
      <label>Código de credencial<textarea ref={input} readOnly value={result.token} autoComplete="off" spellCheck={false} /></label>
      <p>Identificador: {result.id}</p><p>Emitida: {result.issuedAt} (UTC)</p>
      <button type="button" onClick={() => void copy()}>Copiar código</button>
      <p>La copia es voluntaria. No podemos borrar el código del portapapeles ni recuperar uno perdido.</p>
      {copyMessage && <p role="status">{copyMessage}</p>}
    </>}
  </section>;
}
