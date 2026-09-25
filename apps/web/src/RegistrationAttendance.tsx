import "./registration-attendance.css";

export default function RegistrationAttendance({ checkedInAt, timezone }: { checkedInAt: string | null; timezone: string }) {
  return <div className="registration-attendance">
    <span className={`registration-attendance-badge ${checkedInAt === null ? "attendance-pending" : "attendance-entered"}`}>
      {checkedInAt === null ? "Pendiente de ingreso" : "Ya ingresó"}
    </span>
    {checkedInAt !== null && <p>Fecha del ingreso: <time dateTime={checkedInAt}>
      {new Intl.DateTimeFormat("es-PE", { timeZone: timezone, year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(checkedInAt))}
    </time> ({timezone})</p>}
  </div>;
}
