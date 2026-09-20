export type RegistrationErrorKind = "configuration" | "validation" | "authentication" |
  "interaction_required" | "unauthorized" | "forbidden" | "not_found" |
  "duplicate" | "not_allowed" | "uncertain" | "cancelled";

const messages: Record<RegistrationErrorKind, string> = {
  configuration: "Revisa la configuración de acceso a la API.",
  validation: "Revisa el nombre y el correo del asistente.",
  authentication: "No pudimos obtener acceso. Vuelve a comprobar la sesión.",
  interaction_required: "Vuelve a comprobar el acceso para renovar la autorización con Microsoft.",
  unauthorized: "Tu acceso ya no es válido. Vuelve a comprobar la sesión.",
  forbidden: "No tienes permiso para registrar asistentes en este evento.",
  not_found: "El evento no está disponible o ya no tienes acceso.",
  duplicate: "Ya existe una inscripción con ese correo en este evento.",
  not_allowed: "El evento ya no admite nuevas inscripciones.",
  uncertain: "No pudimos confirmar la inscripción. Podría haberse guardado. No vuelvas a enviarla sin verificar el resultado con el organizador responsable.",
  cancelled: "Se canceló la espera. Si la solicitud ya se envió, la inscripción podría haberse guardado.",
};

export class RegistrationError extends Error {
  constructor(readonly kind: RegistrationErrorKind) {
    super(messages[kind]); this.name = "RegistrationError";
  }
}
