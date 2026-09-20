export type EventEditErrorKind = "configuration" | "validation" | "authentication" |
  "interaction_required" | "unauthorized" | "forbidden" | "not_found" |
  "version_conflict" | "slug_conflict" | "not_editable" | "uncertain" | "cancelled";

const messages: Record<EventEditErrorKind, string> = {
  configuration: "Revisa la configuración de acceso a la API.",
  validation: "Revisa los datos de edición del evento.",
  authentication: "No pudimos obtener acceso. Vuelve a comprobar la sesión.",
  interaction_required: "Vuelve a comprobar el acceso para renovar la autorización con Microsoft.",
  unauthorized: "Tu acceso ya no es válido. Vuelve a comprobar la sesión.",
  forbidden: "No tienes permiso para editar este evento.",
  not_found: "El evento no está disponible o ya no tienes acceso.",
  version_conflict: "El evento cambió. Consulta los datos actuales y revisa tus cambios antes de guardar.",
  slug_conflict: "Ya existe un evento con ese slug. Elige otro identificador.",
  not_editable: "El evento ya no está en borrador y no se puede editar.",
  uncertain: "No pudimos confirmar el guardado. El evento podría haberse actualizado. Consulta su estado antes de volver a guardar.",
  cancelled: "Se canceló la espera. Si el guardado ya se envió, podría haberse completado.",
};

export class EventEditError extends Error {
  constructor(readonly kind: EventEditErrorKind) {
    super(messages[kind]); this.name = "EventEditError";
  }
}
