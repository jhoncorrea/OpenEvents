export type EventQueryErrorKind = "configuration" | "authentication" | "interaction_required" |
  "validation" | "unauthorized" | "forbidden" | "not_found" | "unavailable" | "invalid_response" | "cancelled";
const messages: Record<EventQueryErrorKind, string> = {
  configuration: "Revisa la configuración de acceso a la API.",
  authentication: "No pudimos obtener acceso. Vuelve a comprobar la sesión.",
  interaction_required: "Vuelve a comprobar el acceso para renovar la autorización con Microsoft.",
  validation: "Los parámetros de consulta no son válidos. Actualiza el listado.",
  unauthorized: "Tu acceso ya no es válido. Vuelve a comprobar la sesión.",
  forbidden: "No tienes permiso para consultar estos eventos.",
  not_found: "El evento no está disponible o ya no tienes acceso.",
  unavailable: "No pudimos consultar los eventos. Inténtalo nuevamente.",
  invalid_response: "La API devolvió una respuesta inesperada. Inténtalo nuevamente.",
  cancelled: "Consulta cancelada.",
};
export class EventQueryError extends Error {
  constructor(readonly kind: EventQueryErrorKind) {
    super(messages[kind]); this.name = "EventQueryError";
  }
}
