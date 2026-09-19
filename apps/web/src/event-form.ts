import { Temporal } from "@js-temporal/polyfill";

export interface EventFormValues {
  name: string;
  slug: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  location: string;
}

export interface CreateEventPayload {
  name: string;
  slug: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  location: string;
}

export type EventFormErrors =
  Partial<Record<keyof EventFormValues, string>>;

export type EventFormResult =
  | { success: true; data: CreateEventPayload }
  | { success: false; errors: EventFormErrors };

function isRecognizedTimezone(value: string): boolean {
  if (!value || value.length > 100 || /^[+-]/.test(value)) {
    return false;
  }

  try {
    new Intl.DateTimeFormat("en-US", {
      timeZone: value,
    }).format();

    return true;
  } catch {
    return false;
  }
}

function toUtc(value: string, timezone: string): string {
  // El formulario captura fecha y hora local con precisión de minutos.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new Error("Invalid local date format.");
  }

  const local = Temporal.PlainDateTime.from(value);

  if (local.year < 1) {
    throw new Error("Invalid year.");
  }

  const instant = local
    .toZonedDateTime(timezone, { disambiguation: "reject" })
    .toInstant();

  const utc = instant.toString({ fractionalSecondDigits: 3 });

  // Mantener el formato de año de cuatro dígitos admitido por la API.
  if (!/^\d{4}-/.test(utc)) {
    throw new Error("UTC date outside supported range.");
  }

  return utc;
}

export function validateEventForm(
  values: EventFormValues,
): EventFormResult {
  const errors: EventFormErrors = {};
  const name = values.name.trim();
  const slug = values.slug.trim();
  const timezone = values.timezone.trim();
  const location = values.location.trim();

  if (!name || name.length > 200) {
    errors.name = "Ingresa un nombre de entre 1 y 200 caracteres.";
  }

  if (
    !slug ||
    slug.length > 120 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
  ) {
    errors.slug =
      "Usa hasta 120 caracteres: minúsculas, números y guiones simples entre palabras.";
  }

  if (!location || location.length > 500) {
    errors.location =
      "Ingresa una ubicación de entre 1 y 500 caracteres.";
  }

  const validTimezone = isRecognizedTimezone(timezone);

  if (!validTimezone) {
    errors.timezone =
      "Selecciona una zona horaria válida, como America/Lima.";
  }

  let startsAt: string | undefined;
  let endsAt: string | undefined;

  for (const field of ["startsAt", "endsAt"] as const) {
    if (!values[field]) {
      errors[field] = "Ingresa la fecha y la hora.";
      continue;
    }

    if (!validTimezone) {
      continue;
    }

    try {
      const utc = toUtc(values[field], timezone);

      if (field === "startsAt") {
        startsAt = utc;
      } else {
        endsAt = utc;
      }
    } catch {
      errors[field] =
        "Revisa la fecha y la hora: deben existir y no ser ambiguas en la zona seleccionada.";
    }
  }

  if (
    startsAt &&
    endsAt &&
    Temporal.Instant.compare(endsAt, startsAt) <= 0
  ) {
    errors.endsAt = "El fin debe ser posterior al inicio.";
  }

  if (
    Object.keys(errors).length > 0 ||
    startsAt === undefined ||
    endsAt === undefined
  ) {
    return { success: false, errors };
  }

  // Construir explícitamente el cuerpo evita enviar campos adicionales.
  return {
    success: true,
    data: {
      name,
      slug,
      startsAt,
      endsAt,
      timezone,
      location,
    },
  };
}