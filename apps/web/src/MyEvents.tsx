import { useEffect, useRef, useState } from "react";
import { EventQueryError, type ApiEvent, type ApiEventPage } from "./api-event-queries";
import "./my-events.css";

interface Props {
  accountKey: string;
  enabled: boolean;
  loadPage: (cursor: string | undefined, signal: AbortSignal) => Promise<ApiEventPage>;
  loadDetail: (id: string, signal: AbortSignal) => Promise<ApiEvent>;
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

function EventBrowser({ loadPage, loadDetail, onAccessInvalidated }: Props) {
  const [items, setItems] = useState<ApiEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ApiEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const active = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const usedCursors = useRef(new Set<string>());
  const heading = useRef<HTMLHeadingElement>(null);
  const returnButton = useRef<HTMLButtonElement | null>(null);

  useEffect(() => () => { sequence.current++; active.current?.abort(); }, []);
  useEffect(() => { if (selected) heading.current?.focus(); }, [selected]);

  function begin() {
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    const version = ++sequence.current;
    setBusy(true); setError(null);
    return { signal: controller.signal, current: () => sequence.current === version && !controller.signal.aborted };
  }
  function failed(cause: unknown) {
    const failure = cause instanceof EventQueryError ? cause : new EventQueryError("unavailable");
    if (failure.kind === "cancelled") return;
    if (["authentication", "interaction_required", "unauthorized", "forbidden"].includes(failure.kind)) {
      setItems([]); setDetail(null); setCursor(null); setBlocked(true);
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
  async function open(id: string, button?: HTMLButtonElement) {
    if (active.current || blocked) return;
    if (button) returnButton.current = button;
    setSelected(id); setDetail(null);
    const request = begin();
    try {
      const event = await loadDetail(id, request.signal);
      if (request.current()) setDetail(event);
    } catch (cause) {
      if (request.current()) {
        if (cause instanceof EventQueryError && cause.kind === "not_found") setItems(previous => previous.filter(event => event.id !== id));
        failed(cause);
      }
    } finally { if (request.current()) { active.current = null; setBusy(false); } }
  }
  function back() {
    sequence.current++; active.current?.abort(); active.current = null;
    setSelected(null); setDetail(null); setBusy(false); setError(null);
    requestAnimationFrame(() => returnButton.current?.focus());
  }

  return <section className="my-events" aria-label="Mis eventos">
    <div className="my-events-header">
      <h2 ref={heading} tabIndex={-1}>{selected ? "Detalle del evento" : "Mis eventos"}</h2>
      {selected
        ? <button type="button" onClick={back}>Volver al listado</button>
        : <button type="button" disabled={busy || blocked} onClick={() => void page()}>{loaded ? "Actualizar listado" : "Cargar eventos"}</button>}
    </div>
    {busy && <p role="status">{selected ? "Cargando detalle…" : "Cargando eventos…"}</p>}
    {error && <p role="alert" className="my-events-error">{error}</p>}
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
    {selected && detail && !blocked && <dl className="my-events-detail">
      <dt>Nombre</dt><dd>{detail.name}</dd>
      <dt>Estado</dt><dd>{statusLabels[detail.status]}</dd>
      <dt>Ubicación</dt><dd>{detail.location}</dd>
      <dt>Inicio</dt><dd>{date(detail.startsAt, detail.timezone)}</dd>
      <dt>Fin</dt><dd>{date(detail.endsAt, detail.timezone)}</dd>
      <dt>Zona horaria</dt><dd>{detail.timezone}</dd>
      <dt>Slug</dt><dd>{detail.slug}</dd>
      <dt>Identificador</dt><dd>{detail.id}</dd>
    </dl>}
  </section>;
}
