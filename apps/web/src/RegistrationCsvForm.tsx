import { useEffect, useRef, useState } from "react";
import type { ApiEvent } from "./api-event-queries";
import type { CsvLookup, CsvReceipt } from "./api-registration-csv";
import { CsvImportError, csvDiagnosticLabels } from "./csv-import-error";
import { clearCsvRecovery, csvHash, readCsvRecovery, writeCsvRecovery, type CsvRecovery } from "./csv-import-recovery";
import "./registration-csv.css";

export interface RegistrationCsvFormProps {
  accountKey: string; enabled: boolean; event: Pick<ApiEvent, "id" | "name" | "status">;
  send: (id: string, key: string, bytes: Uint8Array, signal: AbortSignal) => Promise<CsvLookup>;
  lookup: (id: string, key: string, signal: AbortSignal) => Promise<CsvLookup>;
  onBack: () => void; onAccessInvalidated: () => void; onUnavailable: () => void;
}
export default function RegistrationCsvForm(props: RegistrationCsvFormProps) {
  return props.enabled ? <CsvForm key={JSON.stringify([props.accountKey, props.event.id])} {...props} /> : null;
}
function CsvForm({ accountKey, event, send, lookup, onBack, onAccessInvalidated, onUnavailable }: RegistrationCsvFormProps) {
  const [initial] = useState(() => {
    try { return { recovery: readCsvRecovery(accountKey, event.id), blocked: false }; }
    catch { return { recovery: null, blocked: true }; }
  });
  const [recovery, setRecovery] = useState<CsvRecovery | null>(initial.recovery);
  const [blocked, setBlocked] = useState(initial.blocked);
  const [file, setFile] = useState<{ bytes: Uint8Array; hash: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CsvImportError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<CsvReceipt | null>(null);
  const active = useRef<AbortController | null>(null), sequence = useRef(0), heading = useRef<HTMLHeadingElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const allowsNew = event.status === "draft" || event.status === "active";
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => () => { sequence.current++; active.current?.abort(); }, []);
  useEffect(() => {
    if (!busy && (!recovery || result)) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [busy, recovery, result]);
  function begin() {
    const controller = new AbortController(); active.current = controller;
    const version = ++sequence.current; setBusy(true); setError(null); setNotice(null);
    return { signal: controller.signal, current: () => sequence.current === version && !controller.signal.aborted };
  }
  function storageFailed() { setBlocked(true); setNotice("No podemos conservar o leer la recuperación en esta pestaña. No se iniciarán nuevas importaciones. Conserva la clave y el archivo; no borres los datos del navegador para resolver una operación incierta."); }
  async function select(selected: File | undefined) {
    if (active.current || blocked || result) return;
    setFile(null); setError(null); setNotice(null);
    if (!selected) return;
    if (!selected.size || selected.size > 1048576) { setNotice("Selecciona un archivo no vacío de hasta 1 MiB."); return; }
    const task = begin();
    try {
      const bytes = new Uint8Array(await selected.arrayBuffer());
      if (!task.current()) return;
      if (!bytes.length || bytes.length > 1048576) throw new Error();
      const hash = await csvHash(bytes);
      if (!task.current()) return;
      if (recovery && hash !== recovery.hash) { setNotice("El archivo no coincide con la operación pendiente. Selecciona el archivo original sin modificarlo."); return; }
      setFile({ bytes, hash, name: selected.name });
    } catch { if (task.current()) setNotice("No pudimos leer o verificar el archivo. Selecciónalo de nuevo."); }
    finally { if (task.current()) { active.current = null; setBusy(false); } }
  }
  async function run(mode: "send" | "lookup") {
    if (active.current || blocked || result || (mode === "send" && (!file || (!recovery && !allowsNew))) || (mode === "lookup" && !recovery)) return;
    // Una entrada anterior mantiene la incertidumbre, incluso si otro intento falla antes de escribir.
    const wasPending = recovery !== null;
    let operation = recovery;
    if (!operation) {
      if (!file) return;
      try {
        operation = { key: crypto.randomUUID(), hash: file.hash };
        writeCsvRecovery(accountKey, event.id, operation); setRecovery(operation);
      } catch { storageFailed(); return; }
    }
    const task = begin();
    try {
      const value = mode === "lookup" ? await lookup(event.id, operation.key, task.signal)
        : await send(event.id, operation.key, file!.bytes, task.signal);
      if (!task.current()) return;
      if (value.status === "completed") { setResult(value.receipt); setFile(null); }
      else setNotice("Todavía no se observa un comprobante. Esto no significa que la importación haya fallado. Consulta de nuevo o reenvía el mismo archivo con la misma clave.");
    } catch (cause) {
      if (!task.current()) return;
      const failure = cause instanceof CsvImportError ? cause : new CsvImportError("uncertain"); setError(failure);
      if (!wasPending && ["validation", "duplicate", "not_allowed"].includes(failure.kind)) {
        try { clearCsvRecovery(accountKey, event.id); setRecovery(null); } catch { storageFailed(); }
      }
      if (["authentication", "interaction_required", "unauthorized", "forbidden"].includes(failure.kind)) onAccessInvalidated();
      if (failure.kind === "not_found") onUnavailable();
    } finally { if (task.current()) { active.current = null; setBusy(false); } }
  }
  function next() {
    if (!result || active.current || blocked) return;
    try { clearCsvRecovery(accountKey, event.id); setRecovery(null); setResult(null); setFile(null); setError(null); setNotice(null); if (input.current) input.current.value = ""; }
    catch { storageFailed(); }
  }
  return <section className="registration-csv" aria-label="Importación CSV">
    <h3 ref={heading} tabIndex={-1}>Importar CSV</h3>
    <p><strong>Evento:</strong> {event.name}</p>
    <p>Archivo UTF-8 con encabezado <code>fullName,email</code>, separado por comas. Hasta 1 MiB y 500 registros. La API valida el archivo completo.</p>
    <p>Para recuperar tras recargar o autorizarte de nuevo, vuelve con la misma cuenta y evento en esta pestaña. Conservamos solo la clave y la huella; tendrás que seleccionar el archivo original para reenviar. Al cerrar la pestaña o borrar sus datos se pierde esta recuperación local.</p>
    {initial.blocked && <p role="alert">No se pudo leer la recuperación guardada. No importes de nuevo hasta verificar la operación anterior.</p>}
    {!allowsNew && !recovery && <p>Este evento no admite nuevas importaciones.</p>}
    {recovery && <div className="csv-recovery"><p><strong>Clave de recuperación:</strong> <code>{recovery.key}</code></p>
      {!result && <p>Hay una operación pendiente de verificar. Se conserva su clave y no se habilita una importación diferente.</p>}</div>}
    {!result && <>
      <label htmlFor="registration-csv-file">{recovery ? "Seleccionar el archivo original" : "Archivo CSV"}</label>
      <input ref={input} id="registration-csv-file" type="file" accept=".csv,text/csv" disabled={busy || blocked || (!allowsNew && !recovery)}
        onChange={e => void select(e.target.files?.[0])} />
      {file && <p>Archivo preparado: {file.name}</p>}
      <div className="csv-actions">
        <button type="button" disabled={busy || blocked || !file || (!recovery && !allowsNew)} onClick={() => void run("send")}>{recovery ? "Reenviar mismo archivo y clave" : "Importar archivo"}</button>
        {recovery && <button type="button" disabled={busy || blocked} onClick={() => void run("lookup")}>Consultar comprobante</button>}
      </div>
    </>}
    {busy && <p role="status">Procesando archivo u operación…</p>}
    {notice && <p role="status">{notice}</p>}
    {error && <div role="alert"><p>{error.message}</p>
      {error.diagnostics.length > 0 && <ul>{error.diagnostics.map((d, i) => <li key={i}>{csvDiagnosticLabels[d.code]}
        {d.record !== undefined && ` · Registro ${d.record}`}{d.line !== undefined && ` · Línea ${d.line}`}
        {d.field && ` · Campo ${d.field}`}{d.firstRecord !== undefined && ` · Primera aparición: registro ${d.firstRecord}`}</li>)}</ul>}
      {error.truncated && <p>Se muestran como máximo 100 diagnósticos; hay errores adicionales.</p>}</div>}
    {result && <div role="status"><h4>Importación confirmada</h4><p>{result.result.count} inscripciones en el comprobante.</p>
      <p>Identificador: <code>{result.importId}</code></p><p>Fecha del comprobante: {result.completedAt}</p>
      <p>Este es el resultado histórico. Vuelve al evento y consulta las inscripciones para ver su estado actual.</p>
      {allowsNew && <button type="button" disabled={blocked} onClick={next}>Nueva importación</button>}</div>}
    <button type="button" disabled={busy} onClick={onBack}>Volver al evento</button>
  </section>;
}
