export type EventLifecycleErrorKind = "configuration" | "validation" | "authentication" |
  "interaction_required" | "unauthorized" | "forbidden" | "not_found" |
  "version_conflict" | "transition_conflict" | "uncertain" | "cancelled";

const messages: Record<EventLifecycleErrorKind, string> = {
  configuration: "Revisa la configuración de acceso a la API.",
  validation: "No se puede enviar este cambio de estado. Consulta el evento.",
  authentication: "No pudimos obtener acceso. Vuelve a comprobar la sesión.",
  interaction_required: "Vuelve a comprobar el acceso para renovar la autorización con Microsoft.",
  unauthorized: "Tu acceso ya no es válido. Vuelve a comprobar la sesión.",
  forbidden: "No tienes permiso para cambiar el estado de este evento.",
  not_found: "El evento no está disponible o ya no tienes acceso.",
  version_conflict: "El evento cambió. Consulta el estado actual antes de continuar.",
  transition_conflict: "El estado del evento no permite esta acción. Consulta el estado actual.",
  uncertain: "No pudimos confirmar el cambio. Podría haberse completado. Consulta el estado actual antes de continuar.",
  cancelled: "Se canceló la espera. Si el guardado ya se envió, podría haberse completado.",
};

export class EventLifecycleError extends Error {
  constructor(readonly kind: EventLifecycleErrorKind) {
    super(messages[kind]); this.name = "EventLifecycleError";
  }
}
