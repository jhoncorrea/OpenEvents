export type RegistrationQueryErrorKind = "configuration" | "authentication" | "interaction_required" |
  "validation" | "unauthorized" | "forbidden" | "not_found" | "unavailable" | "invalid_response" | "cancelled";
const messages: Record<RegistrationQueryErrorKind, string> = {
  configuration: "Revisa la configuración de acceso a la API.",
  authentication: "No pudimos obtener acceso. Vuelve a comprobar la sesión.",
  interaction_required: "Vuelve a comprobar el acceso para renovar la autorización con Microsoft.",
  validation: "Los parámetros de consulta no son válidos. Actualiza el listado.",
  unauthorized: "Tu acceso ya no es válido. Vuelve a comprobar la sesión.",
  forbidden: "No tienes permiso para consultar estas inscripciones.",
  not_found: "La inscripción o el evento no están disponibles, o ya no tienes acceso.",
  unavailable: "No pudimos consultar las inscripciones. Inténtalo nuevamente.",
  invalid_response: "La API devolvió una respuesta inesperada. Inténtalo nuevamente.",
  cancelled: "Consulta cancelada.",
};
export class RegistrationQueryError extends Error {
  constructor(readonly kind: RegistrationQueryErrorKind) {
    super(messages[kind]); this.name = "RegistrationQueryError";
  }
}
