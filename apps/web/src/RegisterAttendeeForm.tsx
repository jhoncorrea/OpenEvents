import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { ApiEvent } from "./api-event-queries";
import { parseRegistrationInput, type ApiRegistration, type RegistrationPayload } from "./api-registrations";
import { RegistrationError } from "./registration-error";
import "./event-form.css";
import "./registration-form.css";

export interface RegisterAttendeeFormProps {
  enabled: boolean;
  accountKey: string;
  event: ApiEvent;
  onRegister: (input: RegistrationPayload, signal: AbortSignal) => Promise<ApiRegistration>;
  onCancel: () => void;
  onAccessInvalidated: () => void;
  onUnavailable: () => void;
  onUncertain: () => void;
}
export default function RegisterAttendeeForm(props: RegisterAttendeeFormProps) {
  if (!props.enabled) return null;
  if (props.event.status !== "draft" && props.event.status !== "active") {
    return <p role="alert">El evento no admite nuevas inscripciones.</p>;
  }
  return <RegistrationForm key={JSON.stringify([props.accountKey, props.event.id])} {...props} />;
}

function RegistrationForm({ event, onRegister, onCancel, onAccessInvalidated, onUnavailable, onUncertain }: RegisterAttendeeFormProps) {
  const [values, setValues] = useState<RegistrationPayload>({ fullName: "", email: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof RegistrationPayload, string>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [result, setResult] = useState<ApiRegistration | null>(null);
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const title = useRef<HTMLHeadingElement>(null);
  const alert = useRef<HTMLParagraphElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const id = useId();
  const dirty = Boolean(values.fullName || values.email);
  useEffect(() => {
    mounted.current = true; title.current?.focus();
    return () => { mounted.current = false; active.current?.abort(); active.current = null; };
  }, []);
  useEffect(() => { if (message) alert.current?.focus(); }, [message]);
  useEffect(() => { if (result) title.current?.focus(); }, [result]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (active.current || blocked || hidden || result) return;
    const nextErrors: typeof errors = {};
    try { parseRegistrationInput({ fullName: values.fullName, email: "valid@example.com" }); }
    catch { nextErrors.fullName = "Ingresa un nombre de hasta 200 caracteres, sin caracteres de control."; }
    try { parseRegistrationInput({ fullName: "Nombre", email: values.email }); }
    catch { nextErrors.email = "Ingresa un correo válido en caracteres ASCII, de hasta 254 caracteres."; }
    setErrors(nextErrors); setMessage(null);
    const invalid = nextErrors.fullName ? "fullName" : nextErrors.email ? "email" : null;
    if (invalid) { (form.current?.elements.namedItem(invalid) as HTMLInputElement | null)?.focus(); return; }
    const input = parseRegistrationInput(values);
    const controller = new AbortController(); active.current = controller; setPending(true);
    const current = () => mounted.current && active.current === controller && !controller.signal.aborted;
    try {
      const saved = await onRegister(input, controller.signal);
      if (!current()) return;
      setResult(saved); setValues({ fullName: "", email: "" });
    } catch (error) {
      if (!current()) return;
      const failure = error instanceof RegistrationError ? error : new RegistrationError("uncertain");
      if (["authentication", "interaction_required", "unauthorized", "forbidden"].includes(failure.kind)) {
        setValues({ fullName: "", email: "" }); setHidden(true); setBlocked(true); onAccessInvalidated();
      } else if (failure.kind === "not_found") {
        setValues({ fullName: "", email: "" }); setHidden(true); setBlocked(true); onUnavailable();
      } else if (["uncertain", "cancelled"].includes(failure.kind)) {
        setBlocked(true); onUncertain();
      } else if (["not_allowed", "configuration"].includes(failure.kind)) setBlocked(true);
      setMessage(failure.message);
    } finally {
      if (current()) { active.current = null; setPending(false); }
    }
  }
  function cancel() {
    if (active.current) return;
    if (dirty && !window.confirm("¿Descartar los datos del asistente y volver al evento?")) return;
    setValues({ fullName: "", email: "" }); setHidden(true); onCancel();
  }
  function another() {
    if (!result) return;
    setResult(null); setValues({ fullName: "", email: "" }); setErrors({}); setMessage(null);
    // El formulario se vuelve a montar en el siguiente render; enfocar el título estable.
    title.current?.focus();
  }
  return <section className="event-creation-panel registration-panel" aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`} ref={title} tabIndex={-1}>{result ? "Inscripción confirmada" : "Registrar asistente"}</h2>
    <p>Evento: <strong>{event.name}</strong></p>
    {message && <p className="registration-error" role="alert" ref={alert} tabIndex={-1}>{message}</p>}
    {result ? <>
      <p role="status">Asistente registrado correctamente.</p>
      <dl className="registration-result">
        <dt>Nombre</dt><dd>{result.attendee.fullName}</dd>
        <dt>Correo</dt><dd>{result.attendee.email}</dd>
        <dt>Inscripción</dt><dd>{result.id}</dd>
        <dt>Estado</dt><dd>Confirmada (confirmed)</dd>
        <dt>Origen</dt><dd>Manual (manual)</dd>
      </dl>
      <div className="registration-actions"><button type="button" onClick={another}>Registrar otro asistente</button>
        <button type="button" onClick={cancel}>Volver al evento</button></div>
    </> : <>
      {!hidden && <form ref={form} onSubmit={submit} noValidate aria-busy={pending}>
        <p id={`${id}-privacy`}>Los datos permanecen solo en esta pantalla. Cambiar de cuenta o cerrar sesión los descarta.</p>
        <fieldset disabled={pending || blocked} aria-describedby={`${id}-privacy`}>
          <legend>Datos del asistente</legend>
          <div className="event-form-grid">
            {(["fullName", "email"] as const).map(field => <div className="event-form-field" key={field}>
              <label htmlFor={`${id}-${field}`}>{field === "fullName" ? "Nombre completo" : "Correo electrónico"}</label>
              <input id={`${id}-${field}`} name={field} type={field === "email" ? "email" : "text"}
                autoComplete="off" required maxLength={field === "fullName" ? 200 : 254} value={values[field]}
                aria-invalid={Boolean(errors[field])} aria-describedby={errors[field] ? `${id}-${field}-error` : undefined}
                onChange={e => { if (blocked || active.current) return; setValues(prev => ({ ...prev, [field]: e.target.value }));
                  setErrors(prev => ({ ...prev, [field]: undefined })); setMessage(null); }} />
              {errors[field] && <span id={`${id}-${field}-error`} className="registration-field-error">{errors[field]}</span>}
            </div>)}
          </div>
          <button type="submit">{pending ? "Registrando…" : "Confirmar inscripción"}</button>
        </fieldset>
        {pending && <p role="status">Esperando confirmación. No vuelvas a enviar la inscripción.</p>}
        {blocked && <p>No se puede reenviar desde este formulario. Volver al evento no revierte una inscripción enviada.</p>}
      </form>}
      <button className="registration-cancel" type="button" disabled={pending} onClick={cancel}>Volver al evento</button>
    </>}
  </section>;
}
