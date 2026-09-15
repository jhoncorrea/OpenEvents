export type CheckInStatus = "accepted" | "duplicate" | "invalid";

export interface Registration {
  code: string;
  attendeeName: string;
  checkedInAt: string | null;
}

export interface CheckInResult {
  status: CheckInStatus;
  message: string;
  attendeeName?: string;
  checkedInAt?: string;
}

const registrations = new Map<string, Registration>([
  [
    "OE-2027-001",
    {
      code: "OE-2027-001",
      attendeeName: "María Fernández",
      checkedInAt: null,
    },
  ],
  [
    "OE-2027-002",
    {
      code: "OE-2027-002",
      attendeeName: "Carlos Mendoza",
      checkedInAt: "2027-08-27T08:42:00.000Z",
    },
  ],
]);

export function registerCheckIn(code: string, now = new Date()): CheckInResult {
  const normalizedCode = code.trim().toUpperCase();
  const registration = registrations.get(normalizedCode);

  if (!registration) {
    return {
      status: "invalid",
      message: "El código no pertenece a este evento.",
    };
  }

  if (registration.checkedInAt) {
    return {
      status: "duplicate",
      message: "Este asistente ya registró su ingreso.",
      attendeeName: registration.attendeeName,
      checkedInAt: registration.checkedInAt,
    };
  }

  registration.checkedInAt = now.toISOString();

  return {
    status: "accepted",
    message: "Ingreso registrado correctamente.",
    attendeeName: registration.attendeeName,
    checkedInAt: registration.checkedInAt,
  };
}
