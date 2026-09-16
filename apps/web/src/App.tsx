import { FormEvent, useState } from "react";
import {
  CalendarDays,
  Check,
  CircleAlert,
  Clock3,
  MapPin,
  QrCode,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { webConfig } from "./config";

type ResultStatus = "idle" | "loading" | "accepted" | "duplicate" | "invalid" | "error";

interface CheckInResult {
  status: Exclude<ResultStatus, "idle" | "loading" | "error">;
  message: string;
  attendeeName?: string;
  checkedInAt?: string;
}

const API_URL = webConfig.apiUrl;

const activity = [
  { initials: "AM", name: "Ana María Torres", time: "09:41", lane: "Ingreso 2" },
  { initials: "JR", name: "José Ramírez", time: "09:40", lane: "Ingreso 1" },
  { initials: "LC", name: "Lucía Campos", time: "09:39", lane: "Ingreso 2" },
];

export default function App() {
  const [code, setCode] = useState("OE-2027-001");
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [status, setStatus] = useState<ResultStatus>("idle");

  async function submitCheckIn(event: FormEvent) {
    event.preventDefault();
    setStatus("loading");
    setResult(null);

    try {
      const response = await fetch(`${API_URL}/api/check-ins`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await response.json()) as CheckInResult;
      setResult(data);
      setStatus(data.status);
    } catch {
      setStatus("error");
      setResult({
        status: "invalid",
        message: "No pudimos conectar con la API. Verifica que esté ejecutándose.",
      });
    }
  }

  const resultIcon = status === "accepted" ? <Check size={28} /> : <CircleAlert size={26} />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#top" aria-label="OpenEvents, inicio">
          <span className="brand-mark"><QrCode size={21} strokeWidth={2.4} /></span>
          <span>OpenEvents</span>
        </a>

        <nav aria-label="Navegación principal">
          <p className="nav-label">OPERACIÓN</p>
          <a className="nav-item active" href="#check-in"><QrCode size={18} /> Check-in</a>
          <a className="nav-item" href="#activity"><Clock3 size={18} /> Actividad</a>
          <a className="nav-item" href="#attendees"><Users size={18} /> Asistentes</a>
        </nav>

        <div className="event-status">
          <span className="status-dot" />
          <div><strong>Evento activo</strong><span>Puertas abiertas</span></div>
        </div>
      </aside>

      <main id="top" className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">CENTRO DE CONTROL</p>
            <h1>DevOpsDays Lima 2027</h1>
          </div>
          <div className="event-meta">
            <span><CalendarDays size={17} /> 27 ago 2027</span>
            <span><MapPin size={17} /> San Borja, Lima</span>
          </div>
        </header>

        <section className="stats-grid" aria-label="Resumen de asistencia">
          <article className="stat-card">
            <span>Registrados</span><strong>240</strong><small>Lista confirmada</small>
          </article>
          <article className="stat-card featured">
            <span>Ingresaron</span><strong>168</strong><small>70% de asistencia</small>
          </article>
          <article className="stat-card">
            <span>Pendientes</span><strong>72</strong><small>30% por ingresar</small>
          </article>
        </section>

        <div className="workspace-grid">
          <section id="check-in" className="checkin-panel">
            <div className="section-heading">
              <div className="icon-box"><QrCode size={25} /></div>
              <div><p className="eyebrow">INGRESO RÁPIDO</p><h2>Validar código QR</h2></div>
            </div>
            <p className="supporting-copy">Escanea el QR del asistente o escribe el código para registrar su ingreso.</p>

            <form onSubmit={submitCheckIn}>
              <label htmlFor="qr-code">Código de inscripción</label>
              <div className="input-row">
                <div className="input-wrap"><Search size={20} /><input id="qr-code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="OE-2027-001" autoComplete="off" /></div>
                <button type="submit" disabled={status === "loading"}>{status === "loading" ? "Validando…" : "Registrar ingreso"}</button>
              </div>
              <p className="hint">Código de prueba: <button type="button" className="code-link" onClick={() => setCode("OE-2027-001")}>OE-2027-001</button></p>
            </form>

            {result && (
              <div className={`result-card ${status}`} role="status" aria-live="polite">
                <span className="result-icon">{resultIcon}</span>
                <div>
                  <strong>{result.attendeeName ?? (status === "error" ? "API no disponible" : "Código no válido")}</strong>
                  <p>{result.message}</p>
                  {result.checkedInAt && <small>{new Date(result.checkedInAt).toLocaleString("es-PE")}</small>}
                </div>
              </div>
            )}

            <div className="security-note"><ShieldCheck size={19} /><span>La API valida el código y evita ingresos duplicados.</span></div>
          </section>

          <section id="activity" className="activity-panel">
            <div className="activity-header"><div><p className="eyebrow">EN VIVO</p><h2>Últimos ingresos</h2></div><span className="live-pill">Actualizado</span></div>
            <div className="activity-list">
              {activity.map((item) => (
                <article key={item.name}>
                  <span className="avatar">{item.initials}</span>
                  <div><strong>{item.name}</strong><span>{item.lane}</span></div>
                  <time>{item.time}</time>
                </article>
              ))}
            </div>
            <a className="secondary-action" href="#attendees">Ver todos los asistentes <span aria-hidden="true">→</span></a>
          </section>
        </div>

        <footer><span>OpenEvents · Iteración 0.1</span><span>API + Web en TypeScript</span></footer>
      </main>
    </div>
  );
}
