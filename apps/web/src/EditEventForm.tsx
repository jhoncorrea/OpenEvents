import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { ApiEvent } from "./api-event-queries";
import { EventQueryError } from "./event-query-error";
import type { EditEventPayload } from "./api-event-edits";
import { EventEditError } from "./event-edit-error";
import { applyEditTimezone, buildEventEdit, editFields, editLabels, eventEditValues, rebaseEventEdit, type EditField } from "./edit-event-form";
import type { EventFormErrors } from "./event-form";
import "./event-form.css";
import "./event-edit-form.css";

export interface EditEventFormProps {
  accountKey: string;
  enabled: boolean;
  event: ApiEvent;
  onSave: (input: EditEventPayload, signal: AbortSignal) => Promise<ApiEvent>;
  loadLatest: (signal: AbortSignal) => Promise<ApiEvent>;
  onSaved: (event: ApiEvent) => void;
  onCancel: () => void;
  onAccessInvalidated: () => void;
  onUnavailable: () => void;
}
export default function EditEventForm(props: EditEventFormProps) {
  if (!props.enabled) return null;
  if (props.event.status !== "draft") return <p role="alert">Solo se pueden editar eventos en borrador.</p>;
  return <Editor key={`${props.accountKey}:${props.event.id}`} {...props} />;
}

function Editor({ event, onSave, loadLatest, onSaved, onCancel, onAccessInvalidated, onUnavailable }: EditEventFormProps) {
  const [base, setBase] = useState(event);
  const [values, setValues] = useState(() => eventEditValues(event));
  const [zoneInput, setZoneInput] = useState(event.timezone);
  const [errors, setErrors] = useState<EventFormErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<"save" | "read" | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [recovery, setRecovery] = useState<EditEventPayload | null>(null);
  const [latest, setLatest] = useState<ApiEvent | null>(null);
  const [keep, setKeep] = useState<EditField[]>([]);
  const [finished, setFinished] = useState(false);
  const active = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const form = useRef<HTMLFormElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const reviewTitle = useRef<HTMLHeadingElement>(null);
  const id = useId();
  const initial = eventEditValues(base);
  const dirty = zoneInput !== base.timezone || editFields.some(field => values[field] !== initial[field]);

  useEffect(() => { title.current?.focus(); }, []);
  useEffect(() => () => { sequence.current++; active.current?.abort(); }, []);
  useEffect(() => { if (latest) reviewTitle.current?.focus(); }, [latest]);
  useEffect(() => {
    if (blocked || finished || (!dirty && !pending && !recovery)) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending, recovery, blocked, finished]);
  function begin(kind: "save" | "read") {
    const controller = new AbortController(); active.current = controller;
    const version = ++sequence.current; setPending(kind); setMessage(null);
    return { signal: controller.signal, current: () => sequence.current === version && !controller.signal.aborted };
  }
  function deny(kind: string) {
    if (["authentication", "interaction_required", "unauthorized", "forbidden"].includes(kind)) {
      setBlocked(true); setRecovery(null); setLatest(null); onAccessInvalidated(); return true;
    }
    if (kind === "not_found") { setBlocked(true); setRecovery(null); setLatest(null); onUnavailable(); return true; }
    return false;
  }
  function update(field: EditField, value: string) {
    setValues(previous => ({ ...previous, [field]: value }));
    setErrors(previous => ({ ...previous, [field]: undefined })); setMessage(null);
  }
  function applyZone() {
    const changed = applyEditTimezone(values, zoneInput, base);
    if (!changed) { setErrors(previous => ({ ...previous, timezone: "Revisa la zona y las fechas antes de aplicar el cambio." })); return; }
    setValues(changed); setZoneInput(changed.timezone); setErrors({}); setMessage("Zona aplicada. Los instantes de inicio y fin se conservan.");
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (active.current || blocked || recovery || finished) return;
    setErrors({}); setMessage(null);
    if (zoneInput.trim() !== values.timezone) {
      setErrors({ timezone: "Aplica la zona horaria antes de guardar." });
      (form.current?.elements.namedItem("timezone") as HTMLInputElement | null)?.focus(); return;
    }
    const result = buildEventEdit(base, values);
    if (!result.success) {
      setErrors(result.errors); setMessage(result.message);
      const field = editFields.find(key => result.errors[key]);
      if (field) (form.current?.elements.namedItem(field) as HTMLInputElement | null)?.focus();
      return;
    }
    if (!result.changed.length) { setMessage("No hay cambios para guardar."); return; }
    const request = begin("save");
    try {
      const updated = await onSave(result.data, request.signal);
      if (!request.current()) return;
      setFinished(true); setMessage("Evento actualizado correctamente."); onSaved(updated);
    } catch (cause) {
      if (!request.current()) return;
      const error = cause instanceof EventEditError ? cause : new EventEditError("uncertain");
      setMessage(error.message);
      if (deny(error.kind)) return;
      if (error.kind === "not_editable") { setBlocked(true); onUnavailable(); return; }
      if (error.kind === "slug_conflict") setErrors({ slug: "Este identificador ya está utilizado." });
      if (["version_conflict", "uncertain", "cancelled"].includes(error.kind)) setRecovery(result.data);
    } finally { if (request.current()) { active.current = null; setPending(null); } }
  }
  async function refresh() {
    if (active.current || blocked || !recovery) return;
    const request = begin("read");
    try {
      const current = await loadLatest(request.signal);
      if (!request.current()) return;
      if (current.id !== base.id || current.version < base.version) throw new EventQueryError("invalid_response");
      if (current.status !== "draft") { setBlocked(true); setRecovery(null); setMessage("El evento ya no está en borrador y no se puede editar."); onUnavailable(); return; }
      setLatest(current); setKeep([]);
    } catch (cause) {
      if (!request.current()) return;
      const error = cause instanceof EventQueryError ? cause : new EventQueryError("unavailable");
      setMessage(error.message); deny(error.kind);
    } finally { if (request.current()) { active.current = null; setPending(null); } }
  }
  function review() {
    if (!latest || !recovery || active.current) return;
    const next = rebaseEventEdit(latest, recovery, keep);
    setBase(latest); setValues(next); setZoneInput(next.timezone); setLatest(null); setRecovery(null); setErrors({});
    setMessage("Selección aplicada al formulario. Revisa los datos y pulsa Guardar cambios cuando estés listo."); title.current?.focus();
  }
  function cancel() {
    if (!blocked && !finished && (dirty || pending || recovery) && !window.confirm(pending || recovery
      ? "¿Salir de la edición? Se descartarán los cambios del formulario. Si hubo un envío, podría haberse guardado; consulta el evento al volver."
      : "¿Descartar los cambios del formulario y salir de la edición?")) return;
    sequence.current++; active.current?.abort(); active.current = null; onCancel();
  }
  return <section className="event-creation-panel event-edit-panel" aria-labelledby={`${id}-title`}>
    <h2 ref={title} tabIndex={-1} id={`${id}-title`}>Editar evento</h2>
    {message && <p role={finished ? "status" : "alert"}>{message}</p>}
    {pending && <p role="status">{pending === "save" ? "Guardando cambios…" : "Consultando el estado actual…"}</p>}
    {!blocked && !finished && <>
      <p>Los cambios se conservan solo en esta pantalla. Cambiar de cuenta o cerrar sesión los descarta.</p>
      <form ref={form} noValidate onSubmit={e => void save(e)} aria-busy={pending !== null}>
        <fieldset disabled={pending !== null || recovery !== null}>
          <legend>Datos del borrador</legend>
          <p id={`${id}-zone-help`}>Horas en {values.timezone}. Aplica una nueva zona para mostrar los mismos instantes en ella; después puedes ajustar las horas.</p>
          <div className="event-form-grid">{editFields.map(field => {
            const date = field === "startsAt" || field === "endsAt";
            return <div className="event-form-field" key={field}>
              <label htmlFor={`${id}-${field}`}>{editLabels[field]}</label>
              <input id={`${id}-${field}`} name={field} type={date ? "datetime-local" : "text"} step={date ? "0.001" : undefined}
                value={field === "timezone" ? zoneInput : values[field]} autoComplete="off" required
                maxLength={date ? undefined : field === "name" ? 200 : field === "location" ? 500 : field === "slug" ? 120 : 100}
                aria-invalid={Boolean(errors[field])} aria-describedby={[errors[field] ? `${id}-${field}-error` : "", date || field === "timezone" ? `${id}-zone-help` : ""].filter(Boolean).join(" ") || undefined}
                onChange={e => field === "timezone" ? setZoneInput(e.target.value) : update(field, e.target.value)} />
              {errors[field] && <p id={`${id}-${field}-error`} className="event-field-error">{errors[field]}</p>}
              {field === "timezone" && <button type="button" onClick={applyZone}>Aplicar zona horaria</button>}
            </div>;
          })}</div>
          <button type="submit">Guardar cambios</button>
        </fieldset>
      </form>
      {recovery && <section className="event-edit-review" aria-label="Revisión de cambios">
        <p>El guardado está bloqueado hasta revisar el estado actual. Tus cambios permanecen en el formulario.</p>
        {!latest && <button type="button" disabled={pending !== null} onClick={() => void refresh()}>Consultar estado actual</button>}
        {latest && <>
          <h3 ref={reviewTitle} tabIndex={-1}>Compara antes de continuar</h3>
          <p>Selecciona únicamente los cambios tuyos que quieras conservar. Los demás campos usarán los datos actuales. Esto no guarda el evento.</p>
          <p>Las fechas de esta comparación están en UTC (Z).</p>
          <div className="event-edit-table"><table><caption>Versión consultada: {latest.version}</caption>
            <thead><tr><th scope="col">Campo</th><th scope="col">Antes</th><th scope="col">Tu propuesta</th><th scope="col">Actual</th><th scope="col">Conservar</th></tr></thead>
            <tbody>{editFields.map(field => <tr key={field}><th scope="row">{editLabels[field]}</th><td>{base[field]}</td><td>{recovery[field] ?? base[field]}</td><td>{latest[field]}</td><td>
              {recovery[field] !== undefined ? <input type="checkbox" aria-label={`Conservar mi cambio: ${editLabels[field]}`} checked={keep.includes(field)} onChange={e => setKeep(previous => e.target.checked ? [...previous, field] : previous.filter(item => item !== field))} /> : "Sin cambio"}
            </td></tr>)}</tbody>
          </table></div>
          <button type="button" onClick={review}>Continuar con la selección</button>
        </>}
      </section>}
    </>}
    <button className="event-edit-cancel" type="button" onClick={cancel}>{blocked || finished ? "Volver al detalle" : "Cancelar edición"}</button>
  </section>;
}
