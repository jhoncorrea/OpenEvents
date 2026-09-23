import RegistrationCsvForm, { type RegistrationCsvFormProps } from "./RegistrationCsvForm";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { EventQueryError, type ApiEvent, type ApiEventPage } from "./api-event-queries";
import type { EditEventPayload } from "./api-event-edits";
import type { EditEventFormProps } from "./EditEventForm";
import type { ApiRegistration, RegistrationPayload } from "./api-registrations";
import type { RegisterAttendeeFormProps } from "./RegisterAttendeeForm";
import type { RegistrationBrowserProps } from "./RegistrationBrowser";
import "./my-events.css";

const RegistrationBrowser = lazy(() => import("./RegistrationBrowser").catch(() => ({
  default: function RegistrationBrowserLoadError({ onBack }: RegistrationBrowserProps) {
    return <div role="alert"><p>No pudimos cargar las inscripciones. Vuelve al evento y recarga la página.</p>
      <button type="button" onClick={onBack}>Volver al evento</button></div>;
  },
})));

const RegisterAttendeeForm = lazy(() => import("./RegisterAttendeeForm").catch(() => ({
  default: function RegistrationLoadError({ onCancel }: RegisterAttendeeFormProps) {
    return <div role="alert"><p>No pudimos cargar el formulario de inscripción. Vuelve al evento y recarga la página.</p>
      <button type="button" onClick={onCancel}>Volver al evento</button></div>;
  },
})));

const EditEventForm = lazy(() => import("./EditEventForm").catch(() => ({
  default: function EditorLoadError({ onCancel }: EditEventFormProps) {
    return <div role="alert"><p>No pudimos cargar el editor. Vuelve al detalle y recarga la página para intentarlo de nuevo.</p>
      <button type="button" onClick={onCancel}>Volver al detalle</button></div>;
  },
})));

interface Props {
  sendCsv?: RegistrationCsvFormProps["send"];
  lookupCsv?: RegistrationCsvFormProps["lookup"];
  accountKey: string;
  enabled: boolean;
  loadPage: (cursor: string | undefined, signal: AbortSignal) => Promise<ApiEventPage>;
  loadDetail: (id: string, signal: AbortSignal) => Promise<ApiEvent>;
  saveEvent: (id: string, input: EditEventPayload, signal: AbortSignal) => Promise<ApiEvent>;
  registerAttendee?: (id: string, input: RegistrationPayload, signal: AbortSignal) => Promise<ApiRegistration>;
  issueCredential?: RegistrationBrowserProps["issueCredential"];
  onCredentialSensitiveChange?: (value: boolean) => void;
  searchRegistrations?: RegistrationBrowserProps["searchPage"];
  loadRegistrations?: RegistrationBrowserProps["loadPage"];
  loadRegistrationDetail?: RegistrationBrowserProps["loadDetail"];
  uncertainRegistrationIds?: ReadonlySet<string>;
  onRegistrationUncertain?: (id: string) => void;
  onEditingChange?: (editing: boolean) => void;
  onAccessInvalidated: () => void;
}
const statusLabels: Record<ApiEvent["status"], string> = {
  draft: "Borrador", active: "Activo", closed: "Cerrado", cancelled: "Cancelado",
};
function date(value: string, timezone: string) {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: timezone, year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(value));
}

export default function MyEvents(props: Props) {
  // Desmontar elimina los datos de la cuenta y cancela sus lecturas.
  return props.enabled ? <EventBrowser key={props.accountKey} {...props} /> : null;
}

function EventBrowser({ issueCredential, onCredentialSensitiveChange, searchRegistrations, sendCsv, lookupCsv, accountKey, loadPage, loadDetail, saveEvent, registerAttendee, loadRegistrations, loadRegistrationDetail, uncertainRegistrationIds, onRegistrationUncertain, onEditingChange, onAccessInvalidated }: Props) {
  const [items, setItems] = useState<ApiEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ApiEvent | null>(null);
  const [csvEvent, setCsvEvent] = useState<ApiEvent | null>(null);
  const [editing, setEditing] = useState<ApiEvent | null>(null);
  const [registering, setRegistering] = useState<ApiEvent | null>(null);
  const [browsingRegistrations, setBrowsingRegistrations] = useState<ApiEvent | null>(null);
  const uncertainIds = useRef(new Set<string>());
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const active = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const usedCursors = useRef(new Set<string>());
  const heading = useRef<HTMLHeadingElement>(null);
  const returnButton = useRef<HTMLButtonElement | null>(null);

  useEffect(() => () => { sequence.current++; active.current?.abort(); }, []);
  useEffect(() => { if (selected && !csvEvent && !editing && !registering && !browsingRegistrations) heading.current?.focus(); }, [selected, csvEvent, editing, registering, browsingRegistrations]);
  useEffect(() => () => { onEditingChange?.(false); }, [onEditingChange]);

  function changeEditing(event: ApiEvent | null) {
    setEditing(event);
    onEditingChange?.(event !== null);
  }

  function changeRegistering(event: ApiEvent | null) {
    setRegistering(event);
    onEditingChange?.(event !== null);
  }
  function registrationBlocked(id: string) {
    return uncertainIds.current.has(id) || uncertainRegistrationIds?.has(id) === true;
  }
  function begin() {
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    const version = ++sequence.current;
    setBusy(true); setError(null); setNotice(null);
    return { signal: controller.signal, current: () => sequence.current === version && !controller.signal.aborted };
  }
  function failed(cause: unknown) {
    const failure = cause instanceof EventQueryError ? cause : new EventQueryError("unavailable");
    if (failure.kind === "cancelled") return;
    if (["authentication", "interaction_required", "unauthorized", "forbidden"].includes(failure.kind)) {
      setItems([]); setDetail(null); setCsvEvent(null); setBrowsingRegistrations(null); changeEditing(null); changeRegistering(null); setCursor(null); setBlocked(true);
      onAccessInvalidated();
    }
    setError(failure.message);
  }
  async function page(more = false) {
    if (active.current || blocked || (more && !cursor)) return;
    const next = more ? cursor! : undefined;
    const request = begin();
    if (!more) { setItems([]); setCursor(null); setLoaded(false); usedCursors.current.clear(); }
    try {
      const result = await loadPage(next, request.signal);
      if (!request.current()) return;
      if (result.nextCursor && (result.nextCursor === next || usedCursors.current.has(result.nextCursor))) {
        throw new EventQueryError("invalid_response");
      }
      if (next) usedCursors.current.add(next);
      setItems(previous => [...new Map([...previous, ...result.items].map(event => [event.id, event])).values()]);
      setCursor(result.nextCursor); setLoaded(true);
    } catch (cause) { if (request.current()) failed(cause); }
    finally { if (request.current()) { active.current = null; setBusy(false); } }
  }
  async function open(id: string, button?: HTMLButtonElement, mode: "view" | "edit" | "register" | "registrations" | "csv" = "view") {
    if (active.current || blocked) return;
    if (button) returnButton.current = button;
    setSelected(id); setDetail(null);
    const request = begin();
    try {
      const event = await loadDetail(id, request.signal);
      if (request.current()) {
        setDetail(event);
        setItems(previous => previous.map(item => item.id === event.id ? event : item));
        if (mode === "csv") { setCsvEvent(event); onEditingChange?.(true); }
        if (mode === "registrations") setBrowsingRegistrations(event);
        if (mode === "register" && !registrationBlocked(id)) {
          if (event.status === "draft" || event.status === "active") changeRegistering(event);
          else setNotice("El evento ya no admite inscripciones.");
        }
        if (mode === "edit") {
          if (event.status === "draft") changeEditing(event);
          else setNotice("El evento ya no está en borrador y no se puede editar.");
        }
      }
    } catch (cause) {
      if (request.current()) {
        if (cause instanceof EventQueryError && cause.kind === "not_found") setItems(previous => previous.filter(event => event.id !== id));
        failed(cause);
      }
    } finally { if (request.current()) { active.current = null; setBusy(false); } }
  }
  function back() {
    sequence.current++; active.current?.abort(); active.current = null;
    setSelected(null); setDetail(null); setBrowsingRegistrations(null); changeEditing(null); changeRegistering(null); setBusy(false); setError(null); setNotice(null);
    requestAnimationFrame(() => returnButton.current?.focus());
  }

  return <section className="my-events" aria-label="Mis eventos">
    <div className="my-events-header">
      <h2 ref={heading} tabIndex={-1}>{selected ? "Detalle del evento" : "Mis eventos"}</h2>
      {!csvEvent && !editing && !registering && !browsingRegistrations && (selected
        ? <button type="button" onClick={back}>Volver al listado</button>
        : <button type="button" disabled={busy || blocked} onClick={() => void page()}>{loaded ? "Actualizar listado" : "Cargar eventos"}</button>)}
    </div>
    {busy && <p role="status">{selected ? "Cargando detalle…" : "Cargando eventos…"}</p>}
    {error && <p role="alert" className="my-events-error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {blocked && <p>Vuelve a comprobar el acceso con tu cuenta.</p>}
    {!blocked && selected && !busy && error && <button type="button" onClick={() => void open(selected)}>Reintentar detalle</button>}
    {!selected && !blocked && <>
      {!loaded && !busy && !error && <p>Carga los eventos que tienes asignados como organizador.</p>}
      {loaded && items.length === 0 && !busy && <p>No tienes eventos asignados.</p>}
      {items.length > 0 && <>
        <p>Fechas en la zona horaria de cada evento. El listado no está ordenado por fecha.</p>
        <ul className="my-events-list">{items.map(event => <li key={event.id}>
          <div className="my-events-card-heading"><h3>{event.name}</h3><span className="my-events-status">{statusLabels[event.status]}</span></div>
          <p>{event.location}</p>
          <p><strong>Inicio:</strong> {date(event.startsAt, event.timezone)}<br />
            <strong>Fin:</strong> {date(event.endsAt, event.timezone)}<br /><span>{event.timezone}</span></p>
          <button type="button" disabled={busy} aria-label={`Ver detalle de ${event.name}`}
            onClick={e => void open(event.id, e.currentTarget)}>Ver detalle</button>
        </li>)}</ul>
        <p aria-live="polite">{items.length} {items.length === 1 ? "evento cargado" : "eventos cargados"}.</p>
      </>}
      {cursor && <button type="button" disabled={busy} onClick={() => void page(true)}>Cargar más eventos</button>}
    </>}
    {selected && detail && !blocked && !csvEvent && !editing && !registering && !browsingRegistrations && <><dl className="my-events-detail">
      <dt>Nombre</dt><dd>{detail.name}</dd>
      <dt>Estado</dt><dd>{statusLabels[detail.status]}</dd>
      <dt>Ubicación</dt><dd>{detail.location}</dd>
      <dt>Inicio</dt><dd>{date(detail.startsAt, detail.timezone)}</dd>
      <dt>Fin</dt><dd>{date(detail.endsAt, detail.timezone)}</dd>
      <dt>Zona horaria</dt><dd>{detail.timezone}</dd>
      <dt>Slug</dt><dd>{detail.slug}</dd>
      <dt>Identificador</dt><dd>{detail.id}</dd>
    </dl>
      {sendCsv && lookupCsv && <button type="button" disabled={busy} onClick={() => void open(detail.id, undefined, "csv")}>{detail.status === "draft" || detail.status === "active" ? "Importar CSV" : "Recuperar importación CSV"}</button>}
      {loadRegistrations && loadRegistrationDetail && <button type="button" disabled={busy}
        onClick={() => void open(detail.id, undefined, "registrations")}>Ver inscripciones</button>}
      {detail.status === "draft" && <button type="button" disabled={busy} onClick={() => void open(detail.id, undefined, "edit")}>Editar evento</button>}
      {registerAttendee && (detail.status === "draft" || detail.status === "active") && <button type="button"
        disabled={busy || registrationBlocked(detail.id)} onClick={() => void open(detail.id, undefined, "register")}>Registrar asistente</button>}
      {registrationBlocked(detail.id) && <p role="alert">Hay una inscripción con resultado pendiente de verificar. Podría haberse guardado. No vuelvas a enviarla; consulta con el organizador responsable antes de continuar.</p>}
    </>}
    {csvEvent && sendCsv && lookupCsv && !blocked && <RegistrationCsvForm accountKey={accountKey} enabled={!blocked} event={csvEvent}
      send={sendCsv} lookup={lookupCsv}
      onBack={() => { const id = csvEvent.id; setCsvEvent(null); onEditingChange?.(false); void open(id); }}
      onAccessInvalidated={() => failed(new EventQueryError("unauthorized"))}
      onUnavailable={() => { const id = csvEvent.id; setCsvEvent(null); onEditingChange?.(false); setDetail(null); setSelected(null);
        setItems(previous => previous.filter(item => item.id !== id)); setNotice("El evento ya no está disponible para tu cuenta."); }}
    />}
    {browsingRegistrations && loadRegistrations && loadRegistrationDetail && !blocked && <Suspense fallback={<p role="status">Cargando inscripciones…</p>}>
      <RegistrationBrowser issueCredential={issueCredential} onCredentialSensitiveChange={onCredentialSensitiveChange} accountKey={accountKey} enabled={!blocked} event={browsingRegistrations}
        loadPage={loadRegistrations} searchPage={searchRegistrations} loadDetail={loadRegistrationDetail}
        onBack={() => { const id = browsingRegistrations.id; setBrowsingRegistrations(null); setDetail(null); void open(id); }}
        onAccessInvalidated={() => failed(new EventQueryError("unauthorized"))}
        onUnavailable={() => {
          const id = browsingRegistrations.id; setBrowsingRegistrations(null); setDetail(null); setSelected(null);
          setItems(previous => previous.filter(item => item.id !== id));
          setNotice("El evento o la inscripción ya no están disponibles. Actualiza los eventos para comprobar el acceso.");
        }}
      />
    </Suspense>}
    {registering && registerAttendee && !blocked && <Suspense fallback={<p role="status">Cargando inscripción…</p>}>
      <RegisterAttendeeForm accountKey={accountKey} enabled={!blocked} event={registering}
        onRegister={(input, signal) => registerAttendee(registering.id, input, signal)}
        onCancel={() => { const id = registering.id; changeRegistering(null); void open(id); }}
        onAccessInvalidated={() => failed(new EventQueryError("unauthorized"))}
        onUnavailable={() => {
          const id = registering.id; changeRegistering(null); setDetail(null);
          setItems(previous => previous.filter(item => item.id !== id)); setSelected(null);
          setNotice("El evento ya no está disponible para tu cuenta.");
        }}
        onUncertain={() => { uncertainIds.current.add(registering.id); onRegistrationUncertain?.(registering.id); }}
      />
    </Suspense>}
    {editing && !blocked && <Suspense fallback={<p role="status">Cargando editor…</p>}>
      <EditEventForm accountKey={accountKey} enabled={!blocked} event={editing}
        onSave={(input, signal) => saveEvent(editing.id, input, signal)}
        loadLatest={signal => loadDetail(editing.id, signal)}
        onSaved={updated => {
          setDetail(updated); setItems(previous => previous.map(item => item.id === updated.id ? updated : item));
          changeEditing(null); setNotice("Evento actualizado correctamente.");
        }}
        onCancel={() => { const id = editing.id; changeEditing(null); void open(id); }}
        onAccessInvalidated={() => failed(new EventQueryError("unauthorized"))}
        onUnavailable={() => { setDetail(null); setItems(previous => previous.filter(item => item.id !== editing.id)); }}
      />
    </Suspense>}
  </section>;
}
