import AttendanceSummary, { type LoadAttendanceSummary } from "./AttendanceSummary";
import RegistrationAttendance from "./RegistrationAttendance";
import OperatorCheckIn, { type SubmitCheckIn } from "./OperatorCheckIn";
import { CheckInError } from "./check-in-error";
import { useEffect, useId, useRef, useState } from "react";
import type { OperatorEvent, OperatorEventPage } from "./api-operator-events";
import { normalizeRegistrationSearch, type RegistrationPage } from "./api-registration-queries";
import { EventQueryError } from "./event-query-error";
import { RegistrationQueryError } from "./registration-query-error";
import "./operator-events.css";

interface Props {
  loadSummary?: LoadAttendanceSummary;
  submitCheckIn?: SubmitCheckIn;
  accountKey: string; enabled: boolean;
  loadPage: (cursor: string | undefined, signal: AbortSignal) => Promise<OperatorEventPage>;
  loadDetail: (eventId: string, signal: AbortSignal) => Promise<OperatorEvent>;
  searchPage: (eventId: string, q: string, cursor: string | undefined, signal: AbortSignal) => Promise<RegistrationPage>;
  onAccessInvalidated: () => void;
}
const statuses = { draft: "Borrador", active: "Activo", closed: "Cerrado", cancelled: "Cancelado" };
export default function OperatorEvents(props: Props) {
  return props.enabled ? <Browser key={props.accountKey} {...props} /> : null;
}
function Browser({ loadSummary, submitCheckIn, loadPage, loadDetail, searchPage, onAccessInvalidated }: Props) {
  const [checkInBlocked, setCheckInBlocked] = useState(false);
  const [events, setEvents] = useState<OperatorEvent[]>([]);
  const [eventCursor, setEventCursor] = useState<string | null>(null);
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const [event, setEvent] = useState<OperatorEvent | null>(null);
  const [draft, setDraft] = useState(""); const [term, setTerm] = useState("");
  const [results, setResults] = useState<RegistrationPage>({ items: [], nextCursor: null });
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);
  const request = useRef<AbortController | null>(null); const serial = useRef(0);
  const eventCursors = useRef(new Set<string>()); const searchCursors = useRef(new Set<string>());
  const heading = useRef<HTMLHeadingElement>(null); const inputId = useId();
  useEffect(() => () => { serial.current++; request.current?.abort(); }, []);
  useEffect(() => { if (event) heading.current?.focus(); }, [event]);
  function cancel() { serial.current++; request.current?.abort(); request.current = null; setBusy(false); }
  function resetSearch() {
    setDraft(""); setTerm(""); setResults({ items: [], nextCursor: null }); setSearched(false); searchCursors.current.clear();
  }
  function failed(cause: unknown) {
    const safe = cause instanceof CheckInError || cause instanceof EventQueryError || cause instanceof RegistrationQueryError ? cause : new EventQueryError("unavailable");
    if (safe.kind === "cancelled") return;
    setError(safe.message);
    if (["authentication", "interaction_required", "unauthorized", "forbidden"].includes(safe.kind)) {
      setBlocked(true); setEvents([]); setEvent(null); resetSearch(); onAccessInvalidated();
    } else if (safe.kind === "not_active") {
      setCheckInBlocked(true);
    } else if (safe.kind === "not_found") {
      setEvent(null); setEvents([]); setEventCursor(null); setEventsLoaded(false); resetSearch();
    }
  }
  async function run<T>(work: (signal: AbortSignal) => Promise<T>, apply: (value: T) => void) {
    cancel(); const sequence = serial.current; const controller = new AbortController(); request.current = controller;
    setBusy(true); setError("");
    try { const value = await work(controller.signal); if (sequence === serial.current && !controller.signal.aborted) apply(value); }
    catch (cause) { if (sequence === serial.current && !controller.signal.aborted) failed(cause); }
    finally { if (sequence === serial.current) { setBusy(false); request.current = null; } }
  }
  function list(more = false) {
    const cursor = more ? eventCursor ?? undefined : undefined;
    if (!more) { setEvents([]); setEventsLoaded(false); eventCursors.current.clear(); }
    setEventCursor(null);
    void run(signal => loadPage(cursor, signal), page => {
      if (page.nextCursor && (page.nextCursor === cursor || eventCursors.current.has(page.nextCursor))) throw new EventQueryError("invalid_response");
      if (page.nextCursor) eventCursors.current.add(page.nextCursor);
      setEvents(previous => more ? [...previous, ...page.items.filter(item => !previous.some(old => old.id === item.id))] : page.items);
      setEventCursor(page.nextCursor); setEventsLoaded(true);
    });
  }
  function select(id: string) {
    resetSearch(); setEvent(null); setCheckInBlocked(false);
    void run(signal => loadDetail(id, signal), detail => { setEvent(detail); });
  }
  function search(more = false, repeat = false) {
    if (!event) return;
    let q: string;
    try { q = normalizeRegistrationSearch(more || repeat ? term : draft); }
    catch { cancel(); setError("Escribe entre 1 y 100 caracteres válidos para buscar."); return; }
    const cursor = more ? results.nextCursor ?? undefined : undefined;
    if (!more) { setResults({ items: [], nextCursor: null }); setSearched(false); searchCursors.current.clear(); }
    else setResults(previous => ({ ...previous, nextCursor: null }));
    setTerm(q);
    void run(signal => searchPage(event.id, q, cursor, signal), page => {
      if (page.nextCursor && (page.nextCursor === cursor || searchCursors.current.has(page.nextCursor))) throw new RegistrationQueryError("invalid_response");
      if (page.nextCursor) searchCursors.current.add(page.nextCursor);
      setResults(previous => ({ items: more ? [...previous.items, ...page.items.filter(item => !previous.items.some(old => old.id === item.id))] : page.items, nextCursor: page.nextCursor }));
      setSearched(true);
    });
  }
  return <section className="operator-events" aria-label="Eventos asignados al operador">
    <h2 ref={heading} tabIndex={-1}>{event ? "Buscar inscripciones del evento asignado" : "Eventos asignados al operador"}</h2>
    {error && <p role="alert">{error}</p>}
    {busy && <p role="status">Consultando…</p>}
    {!blocked && (!event ? <>
      <p>Consulta los eventos en los que tienes una asignación de operador.</p>
      <button type="button" disabled={busy} onClick={() => list()}>Cargar eventos asignados</button>
      <ul>{events.map(item => <li key={item.id}><strong>{item.name}</strong> — {statuses[item.status]} <button type="button" disabled={busy} onClick={() => select(item.id)}>Seleccionar {item.name}</button></li>)}</ul>
      {eventsLoaded && events.length === 0 && <p>No tienes eventos asignados disponibles.</p>}
      {eventCursor && <button type="button" disabled={busy} onClick={() => list(true)}>Cargar más eventos asignados</button>}
    </> : <>
      <button type="button" onClick={() => { cancel(); setEvent(null); resetSearch(); setError(""); }}>Volver a eventos asignados</button>
      <h3>{event.name}</h3><p>{event.location} · {statuses[event.status]}</p>
      <p>{new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short", timeZone: event.timezone }).format(new Date(event.startsAt))} – {new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short", timeZone: event.timezone }).format(new Date(event.endsAt))} ({event.timezone})</p>
      {loadSummary && <AttendanceSummary eventId={event.id} timezone={event.timezone} load={loadSummary} onFailure={failed} />}
      {submitCheckIn && event.status === "active" && !checkInBlocked && <OperatorCheckIn key={event.id} eventId={event.id} timezone={event.timezone} submit={submitCheckIn} onFailure={failed} />}
      {checkInBlocked && <button type="button" disabled={busy} onClick={() => select(event.id)}>Consultar estado actual</button>}
      <form onSubmit={e => { e.preventDefault(); search(); }}>
        <label htmlFor={inputId}>Nombre o correo del inscrito</label>
        <input id={inputId} type="search" maxLength={200} autoComplete="off" value={draft} onChange={e => setDraft(e.target.value)} />
        <p>Busca por parte del nombre o correo. Se conservan los acentos.</p>
        <button type="submit">Buscar inscripciones</button>
        <button type="button" onClick={() => { cancel(); resetSearch(); setError(""); }}>Limpiar búsqueda</button>
      </form>
      {term && <><p>Resultados para: <strong>{term}</strong></p><button type="button" disabled={busy} onClick={() => search(false, true)}>Repetir búsqueda</button></>}
      {results.items.length > 0 && <><p>Incluye inscripciones canceladas. El listado no está ordenado por fecha. Después de registrar un ingreso, pulsa Repetir búsqueda para actualizar la asistencia.</p><ul>{results.items.map(item => <li key={item.id}><strong>{item.attendee.fullName}</strong><p>{item.attendee.email}</p><p>Estado: {item.status === "confirmed" ? "Confirmada" : "Cancelada"}</p><RegistrationAttendance checkedInAt={item.checkedInAt} timezone={event.timezone} /></li>)}</ul></>}
      {searched && !busy && <p role="status">{results.items.length ? `${results.items.length} inscripciones cargadas.` : "No se encontraron coincidencias."}</p>}
      {results.nextCursor && <button type="button" disabled={busy} onClick={() => search(true)}>Cargar más coincidencias</button>}
    </>)}
  </section>;
}
