import RegistrationAttendance from "./RegistrationAttendance";
import RegistrationCredential, { type IssueCredential } from "./RegistrationCredential";
import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeRegistrationSearch, RegistrationQueryError, type QueriedRegistration, type RegistrationPage } from "./api-registration-queries";
import type { ApiEvent } from "./api-event-queries";
import "./registration-browser.css";

export interface RegistrationBrowserProps {
  accountKey: string;
  enabled: boolean;
  event: Pick<ApiEvent, "id" | "name" | "timezone"> & Partial<Pick<ApiEvent, "status">>;
  issueCredential?: IssueCredential;
  onCredentialSensitiveChange?: (value: boolean) => void;
  loadPage: (eventId: string, cursor: string | undefined, signal: AbortSignal) => Promise<RegistrationPage>;
  searchPage?: (eventId: string, q: string, cursor: string | undefined, signal: AbortSignal) => Promise<RegistrationPage>;
  loadDetail: (eventId: string, registrationId: string, signal: AbortSignal) => Promise<QueriedRegistration>;
  onBack: () => void;
  onAccessInvalidated: () => void;
  onUnavailable: () => void;
}

export default function RegistrationBrowser(props: RegistrationBrowserProps) {
  // Cada cuenta y evento tienen un ciclo de vida independiente, sin caché persistente.
  return props.enabled ? <Browser key={JSON.stringify([props.accountKey, props.event.id])} {...props} /> : null;
}

function Browser({ issueCredential, onCredentialSensitiveChange, event, loadPage, searchPage, loadDetail, onBack, onAccessInvalidated, onUnavailable }: RegistrationBrowserProps) {
  const credentialSensitive = useRef(false);
  const credentialProtection = useCallback((value: boolean) => {
    credentialSensitive.current = value; onCredentialSensitiveChange?.(value);
  }, [onCredentialSensitiveChange]);
  function canLeave() {
    return !credentialSensitive.current || window.confirm("¿Salir del detalle? Podrías perder el código o el resultado de una emisión pendiente. No podrá recuperarse desde esta vista.");
  }
  const [draft, setDraft] = useState("");
  const [executed, setExecuted] = useState<string | null>(null);
  const activeTerm = useRef<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [items, setItems] = useState<QueriedRegistration[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [restartRequired, setRestartRequired] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<QueriedRegistration | null>(null);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const usedCursors = useRef(new Set<string>());
  const heading = useRef<HTMLHeadingElement>(null);
  const returnId = useRef<string | null>(null);
  const restoreFocus = useRef(false);
  const buttons = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => () => { sequence.current++; active.current?.abort(); }, []);
  useEffect(() => {
    if (!selected && restoreFocus.current) {
      restoreFocus.current = false;
      const button = returnId.current ? buttons.current.get(returnId.current) : undefined;
      (button ?? heading.current)?.focus();
    } else heading.current?.focus();
  }, [selected]);

  function cancel() {
    sequence.current++; active.current?.abort(); active.current = null; setBusy(false);
  }
  function begin() {
    const controller = new AbortController(); active.current = controller;
    const version = ++sequence.current; setBusy(true); setError(null);
    return { signal: controller.signal, current: () => sequence.current === version && !controller.signal.aborted };
  }
  function failed(cause: unknown) {
    const failure = cause instanceof RegistrationQueryError ? cause : new RegistrationQueryError("unavailable");
    if (failure.kind === "cancelled") return;
    setError(failure.message);
    if (["authentication", "interaction_required", "unauthorized", "forbidden", "not_found"].includes(failure.kind)) {
      // Un 404 del detalle puede significar pérdida de acceso al evento: no conservar su listado.
      setDraft(""); setExecuted(null); setInputError(null); setItems([]); setDetail(null); setCursor(null); setLoaded(false); setBlocked(true); usedCursors.current.clear();
      if (failure.kind === "not_found") onUnavailable();
      else onAccessInvalidated();
    }
    if (failure.kind === "validation" || failure.kind === "invalid_response") { setCursor(null); setRestartRequired(true); }
  }
  async function page(more = false, term: string | null = executed) {
    if (active.current || blocked || (more && !cursor)) return;
    const next = more ? cursor! : undefined;
    activeTerm.current = term;
    const request = begin();
    if (!more) { setItems([]); setCursor(null); setLoaded(false); usedCursors.current.clear(); }
    try {
      const result = term !== null && searchPage
        ? await searchPage(event.id, term, next, request.signal)
        : await loadPage(event.id, next, request.signal);
      if (!request.current()) return;
      if (result.items.some(item => item.eventId !== event.id) ||
          (result.nextCursor && (result.nextCursor === next || usedCursors.current.has(result.nextCursor)))) {
        throw new RegistrationQueryError("invalid_response");
      }
      if (next) usedCursors.current.add(next);
      setItems(previous => [...new Map([...previous, ...result.items].map(item => [item.id, item])).values()]);
      setCursor(result.nextCursor); setLoaded(true); setRestartRequired(false);
    } catch (cause) { if (request.current()) failed(cause); }
    finally { if (request.current()) { active.current = null; setBusy(false); } }
  }
  function search() {
    if (blocked || !searchPage) return;
    let term: string;
    try { term = normalizeRegistrationSearch(draft); }
    catch { setInputError("Escribe entre 1 y 100 caracteres, sin saltos de línea ni tabulaciones."); return; }
    if (active.current && activeTerm.current === term) return;
    cancel(); setInputError(null); setExecuted(term); setRestartRequired(false); void page(false, term);
  }
  function clearSearch() {
    if (blocked) return;
    cancel(); setDraft(""); setExecuted(null); setInputError(null); setRestartRequired(false); void page(false, null);
  }
  async function open(id: string) {
    if (active.current || blocked) return;
    returnId.current = id; setSelected(id); setDetail(null);
    const request = begin();
    try {
      const result = await loadDetail(event.id, id, request.signal);
      if (!request.current()) return;
      if (result.eventId !== event.id || result.id !== id) throw new RegistrationQueryError("invalid_response");
      setDetail(result);
      setItems(previous => previous.map(item => item.id === result.id ? result : item));
    } catch (cause) { if (request.current()) failed(cause); }
    finally { if (request.current()) { active.current = null; setBusy(false); } }
  }
  function backToList() {
    if (!canLeave()) return;
    cancel(); restoreFocus.current = true; setSelected(null); setDetail(null); setError(null);
  }
  function createdAt(value: string) {
    return new Intl.DateTimeFormat("es-PE", { timeZone: event.timezone, year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
  }

  return <section className="registration-browser" aria-label={`Inscripciones de ${event.name}`}>
    <header>
      <h3 ref={heading} tabIndex={-1}>{selected ? "Detalle de inscripción" : "Inscripciones"}</h3>
      <button type="button" onClick={() => { if (canLeave()) { cancel(); onBack(); } }}>Volver al evento</button>
    </header>
    <p><strong>Evento:</strong> {event.name}</p>
    {busy && <p role="status">{selected ? "Cargando inscripción…" : "Cargando inscripciones…"}</p>}
    {error && <p role="alert" className="registration-browser-error">{error}</p>}
    {blocked && <p>Vuelve al evento y comprueba el acceso antes de continuar.</p>}
    {!blocked && !selected && <>
      {searchPage && <form onSubmit={e => { e.preventDefault(); search(); }} aria-label="Buscar inscripciones">
        <label htmlFor="registration-search">Nombre o correo</label>
        <input id="registration-search" type="search" value={draft} maxLength={200} autoComplete="off"
          aria-describedby="registration-search-help" aria-invalid={inputError ? true : undefined}
          onChange={e => { setDraft(e.target.value); setInputError(null); }} />
        <p id="registration-search-help">Busca por parte del nombre o correo. Se conservan los acentos.</p>
        <button type="submit">Buscar</button>
        <button type="button" onClick={clearSearch}>Limpiar búsqueda</button>
        {inputError && <p role="alert">{inputError}</p>}
      </form>}
      {executed !== null && <p role="status">Resultados para: <strong>{executed}</strong></p>}
      <button type="button" disabled={busy} onClick={() => void page()}>{executed !== null ? "Repetir búsqueda" : loaded ? "Actualizar inscripciones" : "Cargar inscripciones"}</button>
      {!loaded && !busy && !error && <p>Carga las inscripciones de este evento.</p>}
      {loaded && items.length === 0 && !busy && <p>{executed !== null ? "No se encontraron coincidencias." : "Este evento todavía no tiene inscripciones."}</p>}
      {items.length > 0 && <>
        <p>El listado no está ordenado por fecha. Incluye inscripciones canceladas.</p>
        <ul className="registration-browser-list">{items.map(item => <li key={item.id}>
          <h4>{item.attendee.fullName}</h4><p>{item.attendee.email}</p>
          <p><strong>Estado:</strong> {item.status === "confirmed" ? "Confirmada" : "Cancelada"}</p>
          <RegistrationAttendance checkedInAt={item.checkedInAt} timezone={event.timezone} />
          <button type="button" disabled={busy} aria-label={`Ver inscripción de ${item.attendee.fullName}`}
            ref={node => { if (node) buttons.current.set(item.id, node); else buttons.current.delete(item.id); }}
            onClick={() => void open(item.id)}>Ver inscripción</button>
        </li>)}</ul>
        <p aria-live="polite">{items.length} {items.length === 1 ? "inscripción cargada" : "inscripciones cargadas"}.</p>
      </>}
      {cursor && <button type="button" disabled={busy} onClick={() => void page(true)}>Cargar más inscripciones</button>}
      {restartRequired && <p>{executed !== null ? "Repite la consulta para reiniciar el listado." : "Actualiza las inscripciones para reiniciar el listado."}</p>}
      {loaded && !cursor && !error && !restartRequired && items.length > 0 && <p>Fin del listado.</p>}
    </>}
    {!blocked && selected && <>
      <button type="button" onClick={backToList}>Volver a inscripciones</button>
      {!busy && error && <button type="button" onClick={() => void open(selected)}>Reintentar inscripción</button>}
      {detail && <dl>
        <dt>Nombre</dt><dd>{detail.attendee.fullName}</dd>
        <dt>Correo</dt><dd>{detail.attendee.email}</dd>
        <dt>Estado</dt><dd>{detail.status === "confirmed" ? "Confirmada" : "Cancelada"}</dd>
        <dt>Ingreso</dt><dd><RegistrationAttendance checkedInAt={detail.checkedInAt} timezone={event.timezone} /></dd>
        <dt>Origen</dt><dd>{detail.source === "manual" ? "Registro manual" : detail.source}</dd>
        <dt>Fecha de inscripción</dt><dd>{createdAt(detail.createdAt)} ({event.timezone})</dd>
        <dt>Identificador</dt><dd>{detail.id}</dd>
      </dl>}
      {detail && issueCredential && detail.status === "confirmed" && (event.status === "draft" || event.status === "active") &&
        <RegistrationCredential key={JSON.stringify([event.id, detail.id, event.status, detail.status])}
          eventId={event.id} registrationId={detail.id} issue={issueCredential} onSensitiveChange={credentialProtection}
          onAccessInvalidated={() => failed(new RegistrationQueryError("unauthorized"))}
          onEventUnavailable={() => failed(new RegistrationQueryError("not_found"))}
          onRegistrationUnavailable={() => {
            cancel(); const id = detail.id; setDetail(null); setSelected(null);
            setItems(previous => previous.filter(item => item.id !== id));
            setError("La inscripción ya no está disponible. Actualiza el listado.");
          }} />}
    </>}
  </section>;
}
