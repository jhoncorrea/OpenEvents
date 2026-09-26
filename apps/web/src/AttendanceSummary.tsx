import { useEffect, useRef, useState } from "react";
import { parseAttendanceSummary, type AttendanceSummary as Summary } from "./api-attendance-summary";
import { EventQueryError } from "./event-query-error";
export type LoadAttendanceSummary = (eventId: string, signal: AbortSignal) => Promise<Summary>;
interface Props { eventId: string; timezone: string; load: LoadAttendanceSummary; onFailure: (error: EventQueryError) => void }
export default function AttendanceSummary(props: Props) {
  return <SummaryView key={props.eventId} {...props} />;
}
function SummaryView({ eventId, timezone, load, onFailure }: Props) {
  const [data, setData] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);
  const request = useRef<AbortController | null>(null);
  const latest = useRef({ load, onFailure }); latest.current = { load, onFailure };
  async function refresh() {
    if (request.current) return;
    const controller = new AbortController(); request.current = controller;
    setData(null); setError(""); setBusy(true);
    try {
      const result = await latest.current.load(eventId, controller.signal);
      if (!controller.signal.aborted) setData(parseAttendanceSummary(result, eventId));
    } catch (cause) {
      if (controller.signal.aborted) return;
      const failure = cause instanceof EventQueryError ? cause : new EventQueryError("unavailable");
      if (failure.kind === "cancelled") return;
      const access = ["authentication", "interaction_required", "unauthorized", "forbidden", "not_found"].includes(failure.kind);
      setError(access ? failure.message : "No pudimos consultar las métricas. Inténtalo nuevamente.");
      if (access) { setBlocked(true); latest.current.onFailure(failure); }
    } finally { if (!controller.signal.aborted) { request.current = null; setBusy(false); } }
  }
  useEffect(() => {
    void refresh();
    return () => { request.current?.abort(); request.current = null; };
    // The view is keyed by eventId; callback changes must not trigger polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <section aria-label="Resumen de asistencia" className="attendance-summary">
    <h3>Resumen de asistencia</h3>
    <p>Consulta del evento seleccionado. Después de registrar ingresos o inscripciones, pulsa Actualizar métricas.</p>
    <button type="button" disabled={busy || blocked} onClick={() => void refresh()}>Actualizar métricas</button>
    {busy && <p role="status">Consultando métricas…</p>}
    {error && <p role="alert">{error}</p>}
    {data && <>
      <div className="stats-grid">
        <article className="stat-card"><span>Registrados</span><strong>{data.registered}</strong><small>{data.confirmed} confirmadas · {data.cancelled} canceladas</small></article>
        <article className="stat-card featured"><span>Ingresaron</span><strong>{data.checkedIn}</strong><small>{data.cancelledCheckedIn} con inscripción cancelada; se conserva su ingreso</small></article>
        <article className="stat-card"><span>Pendientes</span><strong>{data.pending}</strong><small>Inscripciones confirmadas sin ingreso</small></article>
      </div>
      <p>Consulta realizada: {new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "medium", hourCycle: "h23", timeZone: timezone }).format(new Date(data.observedAt))} ({timezone}).</p>
    </>}
  </section>;
}
