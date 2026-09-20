import { Temporal } from "@js-temporal/polyfill";
import type { ApiEvent } from "./api-event-queries";
import type { EditEventPayload } from "./api-event-edits";
import type { EventFormErrors, EventFormValues } from "./event-form";

export const editFields = ["name", "slug", "startsAt", "endsAt", "timezone", "location"] as const;
export type EditField = typeof editFields[number];
export const editLabels: Record<EditField, string> = {
  name: "Nombre del evento", slug: "Identificador del evento (slug)", startsAt: "Fecha y hora de inicio",
  endsAt: "Fecha y hora de fin", timezone: "Zona horaria", location: "Ubicación",
};
function validZone(value: string): boolean {
  if (!value || value.length > 100 || /^[+-]/.test(value)) return false;
  try { new Intl.DateTimeFormat("es-PE", { timeZone: value }).format(); return true; } catch { return false; }
}
function local(instant: string, zone: string): string {
  return Temporal.Instant.from(instant).toZonedDateTimeISO(zone).toPlainDateTime().toString({ smallestUnit: "millisecond" });
}
function utc(value: string, zone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(value)) throw new Error("Invalid local date");
  const date = Temporal.PlainDateTime.from(value);
  if (date.year < 1) throw new Error("Invalid year");
  const result = date.toZonedDateTime(zone, { disambiguation: "reject" }).toInstant().toString({ fractionalSecondDigits: 3 });
  if (!/^\d{4}-/.test(result)) throw new Error("Invalid UTC year");
  return result;
}
export function eventEditValues(event: ApiEvent): EventFormValues {
  return { name: event.name, slug: event.slug, location: event.location, timezone: event.timezone,
    startsAt: local(event.startsAt, event.timezone), endsAt: local(event.endsAt, event.timezone) };
}
// La aplicación explícita de zona evita reinterpretar silenciosamente las horas existentes.
export function applyEditTimezone(values: EventFormValues, zoneInput: string, base: ApiEvent): EventFormValues | null {
  const zone = zoneInput.trim();
  if (!validZone(zone)) return null;
  try {
    const instant = (field: "startsAt" | "endsAt") => values[field] === local(base[field], values.timezone) ? base[field] : utc(values[field], values.timezone);
    return { ...values, timezone: zone, startsAt: local(instant("startsAt"), zone),
      endsAt: local(instant("endsAt"), zone) };
  } catch { return null; }
}
export type EditFormResult = { success: false; errors: EventFormErrors; message: string } |
  { success: true; data: EditEventPayload; changed: EditField[] };

export function buildEventEdit(base: ApiEvent, values: EventFormValues): EditFormResult {
  const errors: EventFormErrors = {};
  const normalized = { ...values, name: values.name.trim(), slug: values.slug.trim(), location: values.location.trim(), timezone: values.timezone.trim() };
  if (!normalized.name || normalized.name.length > 200) errors.name = "Ingresa un nombre de entre 1 y 200 caracteres.";
  if (!normalized.location || normalized.location.length > 500) errors.location = "Ingresa una ubicación de entre 1 y 500 caracteres.";
  if (normalized.slug.length > 120 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized.slug)) errors.slug = "Usa minúsculas, números y guiones simples, hasta 120 caracteres.";
  if (!validZone(normalized.timezone)) errors.timezone = "Ingresa una zona horaria válida.";
  for (const field of ["startsAt", "endsAt"] as const) {
    if (errors.timezone) continue;
    // Conservar exactamente un instante original evita perder precisión o rechazar
    // una hora ambigua que ya estaba resuelta en los datos persistidos.
    if (values[field] === local(base[field], normalized.timezone)) normalized[field] = base[field];
    else {
      try { normalized[field] = utc(values[field], normalized.timezone); }
      catch { errors[field] = "La fecha y hora deben existir y no ser ambiguas en la zona aplicada."; }
    }
  }
  if (!errors.timezone && !errors.startsAt && !errors.endsAt && Date.parse(normalized.endsAt) <= Date.parse(normalized.startsAt)) errors.endsAt = "El fin debe ser posterior al inicio.";
  if (Object.keys(errors).length) return { success: false, errors, message: "Revisa los campos señalados." };
  if (!Number.isInteger(base.version) || base.version < 1 || base.version > 2147483646) return { success: false, errors: {}, message: "No se puede editar esta versión del evento." };
  const data: EditEventPayload = { expectedVersion: base.version };
  const changed: EditField[] = [];
  for (const field of editFields) {
    const same = field === "startsAt" || field === "endsAt" ? Date.parse(normalized[field]) === Date.parse(base[field]) : normalized[field] === base[field];
    if (!same) { data[field] = normalized[field]; changed.push(field); }
  }
  return { success: true, data, changed };
}

export function rebaseEventEdit(latest: ApiEvent, proposed: EditEventPayload, keep: EditField[]): EventFormValues {
  const merged = { ...latest };
  for (const field of keep) if (proposed[field] !== undefined) merged[field] = proposed[field];
  return eventEditValues(merged);
}
